import type {
  AppiumFrameworkConfig,
  FrameworkConfig,
  FrameworkKind,
  HealthCheckResult,
  ILogger,
  Platform,
  ResolvedRunConfig,
} from '../../contracts/types';
import {
  AdapterNotInitializedError,
  DriverConnectionError,
  ElementNotFoundError,
  ERROR_CODES,
  EXIT_CODES,
  OmniError,
} from '../../contracts/types';
import type { IFrameworkDriver } from '../../contracts/IActions';
import type { NativeSelector } from '../../contracts/IElementLocator';
import { isPackageAvailable, lazyImport } from '../../utils/lazyImport';
import { retry } from '../../utils/retry';
import { pollUntil, withTimeout } from '../../utils/wait';

/**
 * Appium 驱动 —— 工程内**唯一**接触 webdriverio 的地方。
 *
 * 【为什么这里没有 `import ... from 'webdriverio'`】
 * webdriverio 是 optional peerDependency，本机不会安装（D-1）。任何顶层静态 import
 * 都会让 `tsc --noEmit` 与 dry-run 在无依赖机器上直接失败。
 * 解法是两段式：
 *   - **类型侧**：本文件自行声明「最小结构化类型」（`WdioBrowserLike` / `WdioElementLike`），
 *     只描述我们真正调用到的方法形状，不引用第三方 .d.ts；
 *   - **运行时侧**：`connect()` 内用 `lazyImport('webdriverio')` 真动态加载，
 *     未安装时抛语义化的 FrameworkNotInstalledError（exit 6）。
 *
 * 【为什么用 findElement(using, value) 协议命令而不是 `browser.$('~foo')` 字符串前缀】
 * wdio 的字符串选择器前缀（`~` / `android=` / `-ios predicate string:`）是一层「猜策略」的
 * 语法糖，遇到 value 本身以这些字符开头时会误判。而 Resolver 已经明确产出了 W3C 的
 * `using` + `value`，直接下发协议命令是零歧义的，也让 NativeSelector 与实际下发内容一一对应。
 */

/* ═══════════════ 最小结构化类型（不引用 webdriverio 的 .d.ts） ═══════════════ */

/** W3C 元素引用对象，键为 `element-6066-11e4-a52e-4f5aabf95d8d` */
export type WdioElementRef = Record<string, unknown>;

/** W3C 规范定义的元素引用键 */
export const W3C_ELEMENT_KEY = 'element-6066-11e4-a52e-4f5aabf95d8d';

export interface WdioPoint {
  readonly x: number;
  readonly y: number;
}

export interface WdioRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WdioWaitOptions {
  readonly timeout?: number;
  readonly interval?: number;
  readonly reverse?: boolean;
  readonly timeoutMsg?: string;
}

/** 元素句柄的最小形状 */
export interface WdioElementLike {
  readonly elementId?: string;
  click(options?: Record<string, unknown>): Promise<void>;
  doubleClick(): Promise<void>;
  setValue(value: string): Promise<void>;
  addValue(value: string): Promise<void>;
  clearValue(): Promise<void>;
  getText(): Promise<string>;
  getValue(): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
  getLocation(): Promise<WdioPoint>;
  getSize(): Promise<{ width: number; height: number }>;
  isDisplayed(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  isSelected(): Promise<boolean>;
  isExisting(): Promise<boolean>;
  waitForDisplayed(options?: WdioWaitOptions): Promise<boolean>;
  waitForExist(options?: WdioWaitOptions): Promise<boolean>;
}

/** 会话对象的最小形状 */
export interface WdioBrowserLike {
  readonly sessionId: string;
  readonly capabilities: Record<string, unknown>;
  $(selector: unknown): Promise<WdioElementLike>;
  $$(selector: unknown): Promise<WdioElementLike[]>;
  findElement(using: string, value: string): Promise<WdioElementRef>;
  findElements(using: string, value: string): Promise<WdioElementRef[]>;
  execute<TResult = unknown>(script: string, ...args: readonly unknown[]): Promise<TResult>;
  takeScreenshot(): Promise<string>;
  getPageSource(): Promise<string>;
  getOrientation(): Promise<string>;
  setOrientation(orientation: string): Promise<void>;
  getWindowRect(): Promise<WdioRect>;
  performActions(actions: readonly unknown[]): Promise<void>;
  releaseActions(): Promise<void>;
  activateApp(appId: string): Promise<void>;
  terminateApp(appId: string, options?: Record<string, unknown>): Promise<boolean>;
  installApp(appPath: string): Promise<void>;
  removeApp(appId: string): Promise<void>;
  isAppInstalled(appId: string): Promise<boolean>;
  background(seconds: number): Promise<void>;
  hideKeyboard(strategy?: string, key?: string, keyCode?: number, keyName?: string): Promise<void>;
  isKeyboardShown(): Promise<boolean>;
  pressKeyCode(keycode: number, metastate?: number, flags?: number): Promise<void>;
  deleteSession(): Promise<void>;
  getSession(): Promise<Record<string, unknown>>;
  startRecordingScreen(options?: Record<string, unknown>): Promise<string>;
  stopRecordingScreen(options?: Record<string, unknown>): Promise<string>;
}

export interface WdioRemoteOptions {
  readonly protocol?: string;
  readonly hostname?: string;
  readonly port?: number;
  readonly path?: string;
  readonly logLevel?: string;
  readonly connectionRetryCount?: number;
  readonly connectionRetryTimeout?: number;
  readonly capabilities: Record<string, unknown>;
}

/** webdriverio 模块的最小形状 */
export interface WebdriverIoModuleLike {
  remote(options: WdioRemoteOptions): Promise<WdioBrowserLike>;
}

/** W3C pointer 动作序列中的单个动作 */
export interface W3CPointerAction {
  readonly type: 'pointerMove' | 'pointerDown' | 'pointerUp' | 'pause';
  readonly duration?: number;
  readonly origin?: string;
  readonly x?: number;
  readonly y?: number;
  readonly button?: number;
}

export const APPIUM_PACKAGE = 'webdriverio';

/** 把框架配置窄化为 Appium 配置；非 appium 配置返回 undefined */
function asAppiumConfig(config: FrameworkConfig): AppiumFrameworkConfig | undefined {
  return (config as AppiumFrameworkConfig).framework === 'appium'
    ? (config as AppiumFrameworkConfig)
    : undefined;
}

/** 判断 findElement 的返回值是否为有效元素引用（wdio 在未命中时返回 `{ error: 'no such element' }`） */
function isValidElementRef(ref: unknown): ref is WdioElementRef {
  if (typeof ref !== 'object' || ref === null) {
    return false;
  }
  const record = ref as Record<string, unknown>;
  if (typeof record['error'] === 'string') {
    return false;
  }
  return typeof record[W3C_ELEMENT_KEY] === 'string' || typeof record['ELEMENT'] === 'string';
}

/** 读取异常信息，避免 `String(err)` 得到 `[object Object]` */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AppiumDriver implements IFrameworkDriver<WdioBrowserLike, WdioElementLike> {
  readonly framework: FrameworkKind = 'appium';
  readonly platform: Platform;

  private readonly runConfig: ResolvedRunConfig;
  private readonly logger: ILogger;
  private readonly config: AppiumFrameworkConfig;
  private browser: WdioBrowserLike | undefined = undefined;
  private connecting = false;

  constructor(runConfig: ResolvedRunConfig, logger: ILogger) {
    this.runConfig = runConfig;
    this.platform = runConfig.platform;
    this.logger = logger.child('AppiumDriver');

    const appiumConfig = asAppiumConfig(runConfig.frameworkConfig);
    if (appiumConfig === undefined) {
      throw new DriverConnectionError(
        'appium',
        `frameworkConfig.framework 期望为 'appium'，实际为 '${String(runConfig.frameworkConfig.framework)}'`,
      );
    }
    this.config = appiumConfig;
  }

  /* ─────────── 生命周期 ─────────── */

  isConnected(): boolean {
    return this.browser !== undefined;
  }

  getSession(): WdioBrowserLike {
    if (this.browser === undefined) {
      throw new AdapterNotInitializedError('AppiumDriver.getSession');
    }
    return this.browser;
  }

  async connect(): Promise<void> {
    if (this.browser !== undefined || this.connecting) {
      return;
    }
    this.connecting = true;
    try {
      const wdio = await lazyImport<WebdriverIoModuleLike>(APPIUM_PACKAGE, 'appium');
      if (typeof wdio.remote !== 'function') {
        throw new DriverConnectionError(
          'appium',
          `${APPIUM_PACKAGE} 已加载但未导出 remote()，请确认安装的是 webdriverio 本体而非 @wdio/* 子包`,
        );
      }

      const remoteOptions = this.buildRemoteOptions();
      this.logger.info('建立 Appium 会话', {
        server: this.config.serverUrl,
        automationName: String(this.config.automationName),
        deviceName: this.runConfig.device.deviceName,
      });

      const browser = await retry(
        async () => withTimeout(
          wdio.remote(remoteOptions),
          this.config.startupTimeoutMs,
          'appium.remote(建立会话)',
        ),
        {
          attempts: Math.max(1, this.config.connectionRetries + 1),
          delayMs: 1_000,
          backoff: 'exponential',
          label: 'appium.connect',
          onRetry: (error, attempt, delayMs) => {
            this.logger.warn('Appium 会话建立失败，准备重试', {
              attempt,
              delayMs,
              reason: errorMessage(error),
            });
          },
        },
      );

      this.browser = browser;
      this.logger.info('Appium 会话已建立', { sessionId: browser.sessionId });
    } catch (error) {
      if (error instanceof OmniError) {
        throw error;
      }
      throw new DriverConnectionError('appium', errorMessage(error), error);
    } finally {
      this.connecting = false;
    }
  }

  /** 幂等断开：重复调用与未连接时调用都安全 */
  async disconnect(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    if (browser === undefined) {
      return;
    }
    try {
      await withTimeout(browser.deleteSession(), 15_000, 'appium.deleteSession');
      this.logger.info('Appium 会话已释放');
    } catch (error) {
      // 释放阶段吞错：会话可能已被服务端回收，此时报错只会掩盖用例真正的失败原因
      this.logger.warn('释放 Appium 会话时出错（已忽略）', { reason: errorMessage(error) });
    }
  }

  /* ─────────── 元素查找 ─────────── */

  async findElement(selector: NativeSelector, timeoutMs?: number): Promise<WdioElementLike> {
    const browser = this.getSession();
    const timeout = timeoutMs ?? this.config.waitTimeoutMs;

    if (selector.index !== undefined) {
      const elements = await pollUntil(
        async () => this.findElements(selector),
        (list) => list.length > selector.index!,
        {
          timeoutMs: timeout,
          intervalMs: this.config.waitIntervalMs,
          message: `findElement[index=${selector.index}] ${selector.description}`,
        },
      ).catch((error: unknown) => {
        throw new ElementNotFoundError(selector.description, timeout, error);
      });
      const element = elements[selector.index];
      if (element === undefined) {
        throw new ElementNotFoundError(selector.description, timeout);
      }
      return element;
    }

    const ref = await pollUntil(
      async () => {
        try {
          return await browser.findElement(selector.using, selector.value);
        } catch {
          // 未命中时部分 Appium 驱动直接抛错而非返回 error 对象，统一归一化为「本轮未命中」
          return undefined;
        }
      },
      (candidate) => isValidElementRef(candidate),
      {
        timeoutMs: timeout,
        intervalMs: this.config.waitIntervalMs,
        message: `findElement ${selector.description}`,
      },
    ).catch((error: unknown) => {
      throw new ElementNotFoundError(selector.description, timeout, error);
    });

    return browser.$(ref);
  }

  async findElements(selector: NativeSelector): Promise<WdioElementLike[]> {
    const browser = this.getSession();
    let refs: WdioElementRef[] = [];
    try {
      refs = await browser.findElements(selector.using, selector.value);
    } catch (error) {
      this.logger.debug('findElements 未命中', {
        using: selector.using,
        reason: errorMessage(error),
      });
      return [];
    }
    if (!Array.isArray(refs) || refs.length === 0) {
      return [];
    }
    const valid = refs.filter((ref) => isValidElementRef(ref));
    const elements: WdioElementLike[] = [];
    for (const ref of valid) {
      elements.push(await browser.$(ref));
    }
    return elements;
  }

  /* ─────────── 原子命令 ─────────── */

  /**
   * 下发原子命令。
   * - `mobile: xxx` 前缀 → 直接透传给 Appium 的 mobile 扩展命令（iOS/Android 的手势、滚动、系统能力都在这里）；
   * - 其余为本驱动定义的命名空间，映射到 wdio 的具名协议命令。
   */
  async execute<TResult = unknown>(
    command: string,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<TResult> {
    const browser = this.getSession();

    if (command.startsWith('mobile:')) {
      return browser.execute<TResult>(command, args);
    }

    switch (command) {
      case 'activateApp':
        await browser.activateApp(String(args['appId'] ?? this.runConfig.appId));
        return undefined as TResult;
      case 'terminateApp':
        return (await browser.terminateApp(String(args['appId'] ?? this.runConfig.appId))) as TResult;
      case 'installApp':
        await browser.installApp(String(args['path'] ?? this.runConfig.binaryPath ?? ''));
        return undefined as TResult;
      case 'removeApp':
        await browser.removeApp(String(args['appId'] ?? this.runConfig.appId));
        return undefined as TResult;
      case 'isAppInstalled':
        return (await browser.isAppInstalled(String(args['appId'] ?? this.runConfig.appId))) as TResult;
      case 'background':
        await browser.background(Number(args['seconds'] ?? -1));
        return undefined as TResult;
      case 'getPageSource':
        return (await browser.getPageSource()) as TResult;
      case 'getOrientation':
        return (await browser.getOrientation()) as TResult;
      case 'setOrientation':
        await browser.setOrientation(String(args['orientation'] ?? 'PORTRAIT'));
        return undefined as TResult;
      case 'getWindowRect':
        return (await browser.getWindowRect()) as TResult;
      case 'hideKeyboard':
        await browser.hideKeyboard();
        return undefined as TResult;
      case 'isKeyboardShown':
        return (await browser.isKeyboardShown()) as TResult;
      case 'pressKeyCode':
        await browser.pressKeyCode(Number(args['keycode'] ?? 4));
        return undefined as TResult;
      case 'performActions':
        await browser.performActions((args['actions'] as readonly unknown[]) ?? []);
        return undefined as TResult;
      case 'releaseActions':
        await browser.releaseActions();
        return undefined as TResult;
      case 'startRecordingScreen':
        return (await browser.startRecordingScreen(args as Record<string, unknown>)) as TResult;
      case 'stopRecordingScreen':
        return (await browser.stopRecordingScreen(args as Record<string, unknown>)) as TResult;
      default:
        throw new OmniError(
          ERROR_CODES.NOT_IMPLEMENTED,
          `AppiumDriver 不认识命令 "${command}"`,
          {
            exitCode: EXIT_CODES.GENERIC,
            details: { command, args },
            hint: '设备端扩展命令请使用 `mobile: xxx` 前缀，会原样透传给 Appium Server',
          },
        );
    }
  }

  /* ─────────── W3C 手势原语（供 Actions 层组装高层动作） ─────────── */

  /**
   * 执行一段 pointer 动作序列。
   * 统一走 W3C `performActions`：老的 TouchAction API 在 Appium 2.x 已废弃，
   * 且在 XCUITest / UiAutomator2 上行为不一致，而 W3C 序列两端语义完全相同。
   */
  async performPointerSequence(actions: readonly W3CPointerAction[]): Promise<void> {
    const browser = this.getSession();
    await withTimeout(
      browser.performActions([
        {
          type: 'pointer',
          id: 'omni-finger',
          parameters: { pointerType: 'touch' },
          actions,
        },
      ]),
      this.config.actionTimeoutMs,
      'appium.performActions',
    );
    // 释放动作状态，避免残留的 pointerDown 影响后续手势
    await browser.releaseActions().catch(() => undefined);
  }

  /** 坐标点击 */
  async tapAtPoint(x: number, y: number): Promise<void> {
    await this.performPointerSequence([
      { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(x), y: Math.round(y) },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 60 },
      { type: 'pointerUp', button: 0 },
    ]);
  }

  /** 坐标长按 */
  async longPressAtPoint(x: number, y: number, durationMs: number): Promise<void> {
    await this.performPointerSequence([
      { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(x), y: Math.round(y) },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: Math.max(1, Math.round(durationMs)) },
      { type: 'pointerUp', button: 0 },
    ]);
  }

  /** 两点之间滑动 */
  async swipeBetween(from: WdioPoint, to: WdioPoint, durationMs: number): Promise<void> {
    await this.performPointerSequence([
      { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(from.x), y: Math.round(from.y) },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 50 },
      { type: 'pointerMove', duration: Math.max(1, Math.round(durationMs)), origin: 'viewport', x: Math.round(to.x), y: Math.round(to.y) },
      { type: 'pause', duration: 50 },
      { type: 'pointerUp', button: 0 },
    ]);
  }

  /** 窗口尺寸（全屏手势的参考系） */
  async getWindowRect(): Promise<WdioRect> {
    const browser = this.getSession();
    return withTimeout(browser.getWindowRect(), this.config.actionTimeoutMs, 'appium.getWindowRect');
  }

  /* ─────────── 产物与自检 ─────────── */

  async screenshot(): Promise<Buffer> {
    const browser = this.getSession();
    const base64 = await withTimeout(
      browser.takeScreenshot(),
      this.config.actionTimeoutMs,
      'appium.takeScreenshot',
    );
    return Buffer.from(base64, 'base64');
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const checks: { name: string; ok: boolean; detail?: string }[] = [];

    const packageOk = isPackageAvailable(APPIUM_PACKAGE);
    checks.push({
      name: `npm 包 ${APPIUM_PACKAGE}`,
      ok: packageOk,
      detail: packageOk ? '已安装' : `未安装，执行 npm install --no-save ${APPIUM_PACKAGE}`,
    });

    const connected = this.isConnected();
    checks.push({
      name: '会话已建立',
      ok: connected,
      detail: connected ? `sessionId=${this.browser?.sessionId ?? '-'}` : '尚未 connect()',
    });

    if (connected && this.browser !== undefined) {
      try {
        const session = await withTimeout(this.browser.getSession(), 10_000, 'appium.getSession');
        checks.push({
          name: '会话连通性',
          ok: true,
          detail: `platformName=${String(session['platformName'] ?? '-')}`,
        });
      } catch (error) {
        checks.push({ name: '会话连通性', ok: false, detail: errorMessage(error) });
      }
    }

    return {
      ok: checks.every((check) => check.ok),
      framework: this.framework,
      checks,
    };
  }

  /* ─────────── 内部：capabilities 组装 ─────────── */

  /** 解析 serverUrl 为 wdio 的 protocol/hostname/port/path 四件套 */
  private parseServerUrl(): { protocol: string; hostname: string; port: number; path: string } {
    try {
      const url = new URL(this.config.serverUrl);
      const protocol = url.protocol.replace(':', '') || 'http';
      const defaultPort = protocol === 'https' ? 443 : 80;
      return {
        protocol,
        hostname: url.hostname,
        port: url.port !== '' ? Number(url.port) : defaultPort,
        // Appium 2.x 默认基路径是 '/'；wdio 要求 path 非空
        path: url.pathname === '' ? '/' : url.pathname,
      };
    } catch (error) {
      throw new DriverConnectionError(
        'appium',
        `serverUrl 非法：${this.config.serverUrl}`,
        error,
      );
    }
  }

  /**
   * 组装 W3C capabilities。
   * 除 `platformName` 外的全部 Appium 私有能力必须带 `appium:` 前缀，
   * 否则 Appium 2.x 会以 "Bad parameters" 直接拒绝建会话。这里对用户配置里
   * 未加前缀的键自动补全，避免把这个陷阱暴露给配置作者。
   */
  private buildCapabilities(): Record<string, unknown> {
    const { device, app } = this.runConfig;
    const capabilities: Record<string, unknown> = {
      platformName: this.platform === 'ios' ? 'iOS' : 'Android',
      'appium:automationName': this.config.automationName,
      'appium:deviceName': device.deviceName,
      'appium:newCommandTimeout': device.newCommandTimeoutSec ?? 120,
    };

    if (device.platformVersion !== undefined) {
      capabilities['appium:platformVersion'] = device.platformVersion;
    }
    if (device.udid !== undefined) {
      capabilities['appium:udid'] = device.udid;
    }
    if (device.avdName !== undefined) {
      capabilities['appium:avd'] = device.avdName;
    }
    if (this.runConfig.binaryPath !== undefined) {
      capabilities['appium:app'] = this.runConfig.binaryPath;
    }

    if (this.platform === 'ios') {
      capabilities['appium:bundleId'] = this.runConfig.appId;
    } else {
      capabilities['appium:appPackage'] = this.runConfig.appId;
      const launchActivity = app.android?.launchActivity;
      if (launchActivity !== undefined) {
        capabilities['appium:appActivity'] = launchActivity;
      }
    }

    const merge = (source: Readonly<Record<string, unknown>> | undefined): void => {
      if (source === undefined) {
        return;
      }
      for (const [key, value] of Object.entries(source)) {
        if (value === undefined) {
          continue;
        }
        const needsPrefix = !key.includes(':') && key !== 'platformName' && key !== 'browserName';
        capabilities[needsPrefix ? `appium:${key}` : key] = value;
      }
    };

    merge(this.config.capabilities);
    merge(device.extraCapabilities);

    return capabilities;
  }

  private buildRemoteOptions(): WdioRemoteOptions {
    const { protocol, hostname, port, path } = this.parseServerUrl();
    return {
      protocol,
      hostname,
      port,
      path,
      logLevel: this.config.logLevel,
      // wdio 自身的重连只覆盖 HTTP 层瞬断；会话级重试由本驱动的 retry() 负责，两者不冲突
      connectionRetryCount: 0,
      connectionRetryTimeout: this.config.startupTimeoutMs,
      capabilities: this.buildCapabilities(),
    };
  }
}

/** 便捷工厂，供 DriverFactory 使用 */
export function createAppiumDriver(runConfig: ResolvedRunConfig, logger: ILogger): AppiumDriver {
  return new AppiumDriver(runConfig, logger);
}
