import { promises as fsPromises } from 'node:fs';

import type {
  DetoxFrameworkConfig,
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
import { withTimeout } from '../../utils/wait';
import type { DetoxMatcherSpec } from './DetoxLocatorResolver';
import { renderDetoxMatcher } from './DetoxLocatorResolver';

/**
 * Detox 驱动 —— 工程内唯一接触 detox 包的地方。
 *
 * 【没有 `import ... from 'detox'`】
 * 与 Appium 同理（D-1）：类型侧用本文件自声明的最小结构化类型，
 * 运行时用 `lazyImport('detox')`。
 *
 * 【两种运行形态，必须都支持】
 * 1. **跑在 Detox 自己的 runner 下**（`detox test`）：detox 已完成 init，
 *    并把 `device` / `element` / `by` / `waitFor` / `expect` 注入到 globalThis。
 *    此时**绝不能再调一次 `detox.init()`** —— 会重复起设备、且第二次 init 通常直接报错。
 * 2. **独立进程调用**（本工程的 CLI / 调试脚本）：全局不存在这些符号，
 *    需要自行 lazyImport 并调用 `detox.init()`。
 * `resolveRuntime()` 就是这个二选一的判定点。
 *
 * 【Detox 没有「元素句柄」这一概念】
 * `element(by.id('x'))` 返回的是一个**惰性求值的查询代理**，不是快照。
 * 每次对它调动作时 Detox 才去原生侧匹配。所以 `findElement()` 不做任何网络往返，
 * 只负责把 matcher 组装好；「元素是否真的存在」由后续动作或显式 waitFor 决定。
 */

/* ═══════════════ 最小结构化类型（不引用 detox 的 .d.ts） ═══════════════ */

export interface DetoxMatcherLike {
  withAncestor(matcher: DetoxMatcherLike): DetoxMatcherLike;
  withDescendant(matcher: DetoxMatcherLike): DetoxMatcherLike;
  and(matcher: DetoxMatcherLike): DetoxMatcherLike;
}

export interface DetoxByLike {
  id(value: string): DetoxMatcherLike;
  text(value: string): DetoxMatcherLike;
  label(value: string): DetoxMatcherLike;
  type(value: string): DetoxMatcherLike;
  traits(values: readonly string[]): DetoxMatcherLike;
}

/** `element(m).getAttributes()` 的单元素返回形状 */
export interface DetoxElementAttributes {
  readonly text?: string;
  readonly label?: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly identifier?: string;
  readonly enabled?: boolean;
  readonly visible?: boolean;
  readonly focused?: boolean;
  readonly hittable?: boolean;
  readonly frame?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly elementFrame?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly [key: string]: unknown;
}

/** 多命中时 getAttributes 返回 `{ elements: [...] }` */
export interface DetoxElementsAttributes {
  readonly elements: readonly DetoxElementAttributes[];
}

export type DetoxAttributesResult = DetoxElementAttributes | DetoxElementsAttributes;

export interface DetoxElementLike {
  atIndex(index: number): DetoxElementLike;
  tap(point?: { x: number; y: number }): Promise<void>;
  multiTap(times: number): Promise<void>;
  longPress(durationMs?: number): Promise<void>;
  tapAtPoint(point: { x: number; y: number }): Promise<void>;
  typeText(text: string): Promise<void>;
  replaceText(text: string): Promise<void>;
  clearText(): Promise<void>;
  tapReturnKey(): Promise<void>;
  tapBackspaceKey(): Promise<void>;
  scroll(
    offset: number,
    direction?: string,
    startPositionX?: number,
    startPositionY?: number,
  ): Promise<void>;
  scrollTo(edge: string): Promise<void>;
  swipe(direction: string, speed?: string, normalizedOffset?: number): Promise<void>;
  getAttributes(): Promise<DetoxAttributesResult>;
  setColumnToValue?(column: number, value: string): Promise<void>;
  performAccessibilityAction?(actionName: string): Promise<void>;
}

export type DetoxElementFn = (matcher: DetoxMatcherLike) => DetoxElementLike;

/** `waitFor(...)` 链尾：`.withTimeout(ms)` 或 `.whileElement(m).scroll(...)` */
export interface DetoxWhileElementLike {
  scroll(
    offset: number,
    direction?: string,
    startPositionX?: number,
    startPositionY?: number,
  ): Promise<void>;
}

export interface DetoxWaitForChainLike {
  withTimeout(timeoutMs: number): Promise<void>;
  whileElement(matcher: DetoxMatcherLike): DetoxWhileElementLike;
}

export interface DetoxWaitForExpectationLike {
  toBeVisible(percent?: number): DetoxWaitForChainLike;
  toBeNotVisible(): DetoxWaitForChainLike;
  toExist(): DetoxWaitForChainLike;
  toNotExist(): DetoxWaitForChainLike;
  toHaveText(text: string): DetoxWaitForChainLike;
  toHaveLabel(label: string): DetoxWaitForChainLike;
  toHaveValue(value: string): DetoxWaitForChainLike;
  readonly not: DetoxWaitForExpectationLike;
}

export type DetoxWaitForFn = (element: DetoxElementLike) => DetoxWaitForExpectationLike;

export interface DetoxExpectLike {
  toBeVisible(percent?: number): Promise<void>;
  toBeNotVisible(): Promise<void>;
  toExist(): Promise<void>;
  toNotExist(): Promise<void>;
  toHaveText(text: string): Promise<void>;
  toHaveLabel(label: string): Promise<void>;
  toHaveId(id: string): Promise<void>;
  toHaveValue(value: string): Promise<void>;
  toHaveToggleValue(value: boolean): Promise<void>;
  readonly not: DetoxExpectLike;
}

export type DetoxExpectFn = (element: DetoxElementLike) => DetoxExpectLike;

export interface DetoxLaunchAppParams {
  readonly newInstance?: boolean;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly url?: string;
  readonly sourceApp?: string;
  readonly launchArgs?: Readonly<Record<string, string | number | boolean>>;
  readonly delete?: boolean;
  readonly languageAndLocale?: { readonly language: string; readonly locale: string };
}

export interface DetoxDeviceLike {
  readonly id?: string;
  readonly name?: string;
  getPlatform(): string;
  launchApp(params?: DetoxLaunchAppParams): Promise<void>;
  terminateApp(bundleId?: string): Promise<void>;
  installApp(binaryPath?: string): Promise<void>;
  uninstallApp(bundleId?: string): Promise<void>;
  reloadReactNative(): Promise<void>;
  sendToHome(): Promise<void>;
  openURL(params: { url: string; sourceApp?: string }): Promise<void>;
  setOrientation(orientation: string): Promise<void>;
  setLocation?(lat: number, lon: number): Promise<void>;
  takeScreenshot(name: string): Promise<string>;
  pressBack?(): Promise<void>;
  disableSynchronization(): Promise<void>;
  enableSynchronization(): Promise<void>;
  setStatusBar?(params: Readonly<Record<string, string>>): Promise<void>;
  generateViewHierarchyXml?(shouldInjectXcuiElements?: boolean): Promise<string>;
  getUiDevice?(): unknown;
}

/** detox 模块 / 全局运行时的最小形状 */
export interface DetoxModuleLike {
  readonly device: DetoxDeviceLike;
  readonly element: DetoxElementFn;
  readonly by: DetoxByLike;
  readonly waitFor: DetoxWaitForFn;
  readonly expect: DetoxExpectFn;
  init?(config?: unknown, options?: Readonly<Record<string, unknown>>): Promise<void>;
  cleanup?(): Promise<void>;
}

export const DETOX_PACKAGE = 'detox';

/** Detox 的方向常量 */
export const DETOX_ORIENTATION = {
  portrait: 'portrait',
  landscape: 'landscape',
} as const;

function asDetoxConfig(config: FrameworkConfig): DetoxFrameworkConfig | undefined {
  return (config as DetoxFrameworkConfig).framework === 'detox'
    ? (config as DetoxFrameworkConfig)
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 判断 getAttributes 的返回是否为多元素形态 */
export function isMultiElementAttributes(
  result: DetoxAttributesResult,
): result is DetoxElementsAttributes {
  return Array.isArray((result as DetoxElementsAttributes).elements);
}

/** 归一化 getAttributes 的两种返回形态为数组 */
export function toAttributeList(result: DetoxAttributesResult): readonly DetoxElementAttributes[] {
  return isMultiElementAttributes(result) ? result.elements : [result];
}

export class DetoxDriver implements IFrameworkDriver<DetoxModuleLike, DetoxElementLike> {
  readonly framework: FrameworkKind = 'detox';
  readonly platform: Platform;

  private readonly runConfig: ResolvedRunConfig;
  private readonly logger: ILogger;
  private readonly config: DetoxFrameworkConfig;
  private runtime: DetoxModuleLike | undefined = undefined;
  /** 只有「本驱动自己调用过 init()」时才允许在 disconnect 里调 cleanup() */
  private ownsLifecycle = false;
  private connecting = false;

  constructor(runConfig: ResolvedRunConfig, logger: ILogger) {
    this.runConfig = runConfig;
    this.platform = runConfig.platform;
    this.logger = logger.child('DetoxDriver');

    const detoxConfig = asDetoxConfig(runConfig.frameworkConfig);
    if (detoxConfig === undefined) {
      throw new DriverConnectionError(
        'detox',
        `frameworkConfig.framework 期望为 'detox'，实际为 '${String(runConfig.frameworkConfig.framework)}'`,
      );
    }
    this.config = detoxConfig;
  }

  /* ─────────── 生命周期 ─────────── */

  isConnected(): boolean {
    return this.runtime !== undefined;
  }

  getSession(): DetoxModuleLike {
    if (this.runtime === undefined) {
      throw new AdapterNotInitializedError('DetoxDriver.getSession');
    }
    return this.runtime;
  }

  /** 便捷访问器：device 对象 */
  getDevice(): DetoxDeviceLike {
    return this.getSession().device;
  }

  async connect(): Promise<void> {
    if (this.runtime !== undefined || this.connecting) {
      return;
    }
    this.connecting = true;
    try {
      const injected = this.readInjectedRuntime();
      if (injected !== undefined) {
        this.runtime = injected;
        this.ownsLifecycle = false;
        this.logger.info('复用 Detox runner 注入的全局运行时（不重复 init）');
        return;
      }

      // Detox 通过环境变量读取配置，必须在 init 之前设置
      this.applyEnvironment();

      const detox = await lazyImport<DetoxModuleLike>(DETOX_PACKAGE, 'detox');
      if (typeof detox.init !== 'function') {
        throw new DriverConnectionError(
          'detox',
          `${DETOX_PACKAGE} 已加载但未导出 init()，请确认 detox 版本 >= 20`,
        );
      }

      this.logger.info('初始化 Detox 会话', {
        configuration: this.config.configurationName,
        configPath: this.config.detoxConfigPath,
        reuse: this.config.reuseSession,
      });

      await withTimeout(
        detox.init(undefined, { reuse: this.config.reuseSession }),
        this.config.startupTimeoutMs,
        'detox.init',
      );

      this.runtime = detox;
      this.ownsLifecycle = true;
      this.logger.info('Detox 会话已建立', { platform: detox.device.getPlatform() });
    } catch (error) {
      if (error instanceof OmniError) {
        throw error;
      }
      throw new DriverConnectionError('detox', errorMessage(error), error);
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const runtime = this.runtime;
    const owns = this.ownsLifecycle;
    this.runtime = undefined;
    this.ownsLifecycle = false;

    if (runtime === undefined || !owns) {
      // 由 detox runner 托管时，cleanup 由 runner 自己负责，这里插手会破坏它的用例间复用
      return;
    }
    try {
      if (typeof runtime.cleanup === 'function') {
        await withTimeout(runtime.cleanup(), 30_000, 'detox.cleanup');
      }
      this.logger.info('Detox 会话已释放');
    } catch (error) {
      this.logger.warn('释放 Detox 会话时出错（已忽略）', { reason: errorMessage(error) });
    }
  }

  /* ─────────── matcher 组装 ─────────── */

  /** 把 Resolver 产出的结构化描述组装成真实的 Detox matcher 链 */
  buildMatcher(spec: DetoxMatcherSpec): DetoxMatcherLike {
    const by = this.getSession().by;

    const nodeToMatcher = (node: DetoxMatcherSpec['base'][number]): DetoxMatcherLike => {
      switch (node.by) {
        case 'id':
          return by.id(node.value);
        case 'text':
          return by.text(node.value);
        case 'label':
          return by.label(node.value);
        case 'type':
          return by.type(node.value);
        case 'traits':
          return by.traits(node.value.split(',').map((trait) => trait.trim()).filter((trait) => trait !== ''));
        default:
          throw new OmniError(
            ERROR_CODES.UNSUPPORTED_LOCATOR,
            `未知的 Detox matcher 维度：${String((node as { by: string }).by)}`,
            { exitCode: EXIT_CODES.GENERIC, details: { node } },
          );
      }
    };

    const first = spec.base[0];
    if (first === undefined) {
      throw new OmniError(
        ERROR_CODES.UNSUPPORTED_LOCATOR,
        'Detox matcher 描述为空，Resolver 未按契约产出至少一个基础匹配器',
        { exitCode: EXIT_CODES.GENERIC, details: { spec } },
      );
    }

    let matcher = nodeToMatcher(first);
    for (let i = 1; i < spec.base.length; i += 1) {
      matcher = matcher.and(nodeToMatcher(spec.base[i]));
    }
    if (spec.ancestor !== undefined) {
      matcher = matcher.withAncestor(this.buildMatcher(spec.ancestor));
    }
    if (spec.descendant !== undefined) {
      matcher = matcher.withDescendant(this.buildMatcher(spec.descendant));
    }
    return matcher;
  }

  /** 从 NativeSelector 取出 matcher 描述（Resolver 把它放在 raw 上） */
  specOf(selector: NativeSelector): DetoxMatcherSpec {
    const spec = selector.raw as DetoxMatcherSpec | undefined;
    if (spec === undefined || !Array.isArray(spec.base)) {
      throw new OmniError(
        ERROR_CODES.UNSUPPORTED_LOCATOR,
        `NativeSelector.raw 不是合法的 DetoxMatcherSpec：${selector.description}`,
        {
          exitCode: EXIT_CODES.GENERIC,
          details: { selector },
          hint: 'Detox 适配器必须搭配 DetoxLocatorResolver 使用，请检查 LocatorResolverFactory 的框架分派',
        },
      );
    }
    return spec;
  }

  /* ─────────── 元素查找 ─────────── */

  /**
   * 构造元素查询代理。
   * ⚠ 不做设备往返：Detox 的 element() 是惰性的。timeoutMs 参数仅在需要「确认存在」时使用，
   * 由调用方通过 `waitForExist()` 显式表达。
   */
  async findElement(selector: NativeSelector, timeoutMs?: number): Promise<DetoxElementLike> {
    const runtime = this.getSession();
    const spec = this.specOf(selector);
    const matcher = this.buildMatcher(spec);
    let element = runtime.element(matcher);

    const index = selector.index ?? spec.index;
    if (index !== undefined) {
      element = element.atIndex(index);
    }

    if (timeoutMs !== undefined && timeoutMs > 0) {
      try {
        await runtime.waitFor(element).toExist().withTimeout(timeoutMs);
      } catch (error) {
        throw new ElementNotFoundError(selector.description, timeoutMs, error);
      }
    }
    return element;
  }

  /**
   * 枚举全部命中元素。
   * Detox 没有 findElements API，但 `getAttributes()` 在多命中时会返回 `{ elements: [...] }`，
   * 由此可推出命中数量，再用 `atIndex(i)` 生成各自的查询代理。
   */
  async findElements(selector: NativeSelector): Promise<DetoxElementLike[]> {
    const runtime = this.getSession();
    const spec = this.specOf(selector);
    const matcher = this.buildMatcher(spec);
    const base = runtime.element(matcher);

    let attributes: DetoxAttributesResult;
    try {
      attributes = await base.getAttributes();
    } catch {
      // 无命中时 Detox 直接抛错，对 findElements 而言等价于空数组
      return [];
    }

    const list = toAttributeList(attributes);
    if (list.length <= 1) {
      return [base];
    }
    return list.map((_attribute, index) => runtime.element(matcher).atIndex(index));
  }

  /* ─────────── 原子命令 ─────────── */

  async execute<TResult = unknown>(
    command: string,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<TResult> {
    const device = this.getDevice();

    switch (command) {
      case 'launchApp':
        await device.launchApp(args as DetoxLaunchAppParams);
        return undefined as TResult;
      case 'terminateApp':
        await device.terminateApp(args['bundleId'] === undefined ? undefined : String(args['bundleId']));
        return undefined as TResult;
      case 'installApp':
        await device.installApp(args['binaryPath'] === undefined ? undefined : String(args['binaryPath']));
        return undefined as TResult;
      case 'uninstallApp':
        await device.uninstallApp(args['bundleId'] === undefined ? undefined : String(args['bundleId']));
        return undefined as TResult;
      case 'reloadReactNative':
        await device.reloadReactNative();
        return undefined as TResult;
      case 'sendToHome':
        await device.sendToHome();
        return undefined as TResult;
      case 'openURL':
        await device.openURL({ url: String(args['url'] ?? '') });
        return undefined as TResult;
      case 'setOrientation':
        await device.setOrientation(String(args['orientation'] ?? 'portrait'));
        return undefined as TResult;
      case 'pressBack':
        if (typeof device.pressBack !== 'function') {
          throw new OmniError(
            ERROR_CODES.NOT_IMPLEMENTED,
            'device.pressBack() 仅在 Android 可用',
            { exitCode: EXIT_CODES.GENERIC, details: { platform: this.platform } },
          );
        }
        await device.pressBack();
        return undefined as TResult;
      case 'takeScreenshot':
        return (await device.takeScreenshot(String(args['name'] ?? 'screenshot'))) as TResult;
      case 'disableSynchronization':
        await device.disableSynchronization();
        return undefined as TResult;
      case 'enableSynchronization':
        await device.enableSynchronization();
        return undefined as TResult;
      case 'generateViewHierarchyXml': {
        if (typeof device.generateViewHierarchyXml !== 'function') {
          throw new OmniError(
            ERROR_CODES.NOT_IMPLEMENTED,
            '当前 detox 版本不支持 device.generateViewHierarchyXml()',
            {
              exitCode: EXIT_CODES.GENERIC,
              hint: '该 API 自 detox 20.14 起提供，请升级 detox 或改用 Appium 导出视图树',
            },
          );
        }
        return (await device.generateViewHierarchyXml(true)) as TResult;
      }
      default:
        throw new OmniError(
          ERROR_CODES.NOT_IMPLEMENTED,
          `DetoxDriver 不认识命令 "${command}"`,
          { exitCode: EXIT_CODES.GENERIC, details: { command, args } },
        );
    }
  }

  /* ─────────── 产物与自检 ─────────── */

  /**
   * 截图。
   * Detox 的 `device.takeScreenshot(name)` 返回的是**产物文件路径**（由 artifacts 插件落盘），
   * 而契约要求返回二进制，因此这里再读一次文件。
   */
  async screenshot(): Promise<Buffer> {
    const device = this.getDevice();
    const name = `omni-${Date.now()}`;
    const filePath = await withTimeout(device.takeScreenshot(name), 30_000, 'detox.takeScreenshot');
    if (typeof filePath !== 'string' || filePath === '') {
      throw new OmniError(
        ERROR_CODES.NOT_IMPLEMENTED,
        'device.takeScreenshot() 未返回文件路径，通常是 detox artifacts 插件被禁用',
        {
          exitCode: EXIT_CODES.GENERIC,
          hint: '请在 .detoxrc 的 artifacts.plugins.screenshot 中启用截图插件',
        },
      );
    }
    try {
      return await fsPromises.readFile(filePath);
    } catch (error) {
      throw new OmniError(
        ERROR_CODES.NOT_IMPLEMENTED,
        `读取 Detox 截图产物失败：${filePath}`,
        { exitCode: EXIT_CODES.GENERIC, cause: error, details: { filePath } },
      );
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const checks: { name: string; ok: boolean; detail?: string }[] = [];

    const packageOk = isPackageAvailable(DETOX_PACKAGE);
    checks.push({
      name: `npm 包 ${DETOX_PACKAGE}`,
      ok: packageOk,
      detail: packageOk ? '已安装' : `未安装，执行 npm install --no-save ${DETOX_PACKAGE}`,
    });

    const connected = this.isConnected();
    checks.push({
      name: 'Detox 运行时可用',
      ok: connected,
      detail: connected
        ? (this.ownsLifecycle ? '由本驱动 init()' : '复用 detox runner 全局运行时')
        : '尚未 connect()',
    });

    if (connected) {
      try {
        const platform = this.getDevice().getPlatform();
        checks.push({ name: '设备连通性', ok: true, detail: `platform=${platform}` });
      } catch (error) {
        checks.push({ name: '设备连通性', ok: false, detail: errorMessage(error) });
      }
    }

    return { ok: checks.every((check) => check.ok), framework: this.framework, checks };
  }

  /* ─────────── 内部 ─────────── */

  /** 读取 detox runner 注入的全局运行时；未在 runner 下运行时返回 undefined */
  private readInjectedRuntime(): DetoxModuleLike | undefined {
    const globals = globalThis as unknown as Record<string, unknown>;
    const device = globals['device'];
    const element = globals['element'];
    const by = globals['by'];
    const waitForFn = globals['waitFor'];
    const expectFn = globals['expect'];

    const looksLikeDetox = typeof device === 'object'
      && device !== null
      && typeof (device as DetoxDeviceLike).getPlatform === 'function'
      && typeof element === 'function'
      && typeof by === 'object'
      && by !== null
      && typeof waitForFn === 'function';

    if (!looksLikeDetox) {
      return undefined;
    }

    return {
      device: device as DetoxDeviceLike,
      element: element as DetoxElementFn,
      by: by as DetoxByLike,
      waitFor: waitForFn as DetoxWaitForFn,
      // jest 也会注入同名的 expect，但 detox 的 expect 才带 toBeVisible；缺失时用 waitFor 兜底路径
      expect: (typeof expectFn === 'function' ? expectFn : undefined) as DetoxExpectFn,
    };
  }

  /**
   * 把配置写进 Detox 约定的环境变量。
   * Detox 的配置发现是「环境变量 > CLI 参数 > 默认查找」，而我们的唯一真理源是 ResolvedRunConfig，
   * 因此在 init 之前把它投影到环境变量上，避免 detox 去读一份与本次运行不一致的 .detoxrc。
   */
  private applyEnvironment(): void {
    process.env['DETOX_CONFIGURATION'] = this.config.configurationName;
    process.env['DETOX_CONFIG_PATH'] = this.config.detoxConfigPath;
    process.env['DETOX_ARTIFACTS_LOCATION'] = this.config.artifactsRootDir;
    if (this.runConfig.device.udid !== undefined) {
      process.env['DETOX_DEVICE_NAME'] = this.runConfig.device.udid;
    } else {
      process.env['DETOX_DEVICE_NAME'] = this.runConfig.device.deviceName;
    }
  }

  /** 供 Actions 层渲染日志用（与 Resolver 的 value 字段一致） */
  describeSelector(selector: NativeSelector): string {
    try {
      return renderDetoxMatcher(this.specOf(selector));
    } catch {
      return selector.description;
    }
  }
}

/** 便捷工厂，供 DriverFactory 使用 */
export function createDetoxDriver(runConfig: ResolvedRunConfig, logger: ILogger): DetoxDriver {
  return new DetoxDriver(runConfig, logger);
}
