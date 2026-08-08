import { promises as fsPromises } from 'node:fs';
import * as nodePath from 'node:path';

import type {
  AdapterState,
  AppiumFrameworkConfig,
  ArtifactKind,
  ArtifactRef,
  DeviceConfig,
  FrameworkConfig,
  FrameworkKind,
  HealthCheckResult,
  ILogger,
  Orientation,
  Platform,
  ResolvedRunConfig,
  SwipeDirection,
  TextMatchMode,
} from '../../contracts/types';
import {
  AssertionFailedError,
  ElementNotFoundError,
  ERROR_CODES,
  EXIT_CODES,
  OmniError,
} from '../../contracts/types';
import type {
  AdapterInit,
  AssertTextOptions,
  BaseActionOptions,
  CreateAdapterFn,
  DeviceInfo,
  IActions,
  IAdapter,
  IDeviceActions,
  LaunchAppOptions,
  LongPressOptions,
  ScreenshotOptions,
  ScrollOptions,
  ScrollToOptions,
  SwipeOptions,
  TapOptions,
  TypeTextOptions,
  WaitOptions,
} from '../../contracts/IActions';
import type { ILocatorResolver, LocatorLike, NativeSelector } from '../../contracts/IElementLocator';
import { ensureDir, sanitizePathSegment, toRelativePath } from '../../utils/paths';
import { sleep, waitFor, withTimeout } from '../../utils/wait';
import { AppiumLocatorResolver } from './AppiumLocatorResolver';
import type { WdioElementLike, WdioRect } from './AppiumDriver';
import { AppiumDriver } from './AppiumDriver';

/**
 * Appium 适配器 —— IActions / IDeviceActions / IAdapter 的 Appium 实现。
 *
 * 【本文件同样没有第三方 import】
 * 所有 webdriverio 形状都来自 `./AppiumDriver` 导出的结构化类型，
 * 真正的 SDK 加载只发生在 AppiumDriver.connect() 内部（D-1）。
 *
 * 【失败截图为什么用回调注入而不是直接 import utils/screenshot】
 * adapters → utils/screenshot 是一条反向依赖：截图落盘涉及 runId 目录、用例名、报告登记，
 * 这些是 setup/report 层的职责。适配器只负责「拿到二进制」，
 * 落盘策略由上层通过 `setArtifactSink()` 注入。未注入时退化为本文件的默认落盘实现，
 * 保证适配器单独使用（脚本、调试）时依然可用。
 */

/* ═══════════════ 产物落盘回调 ═══════════════ */

/** 上层（setup/report 层）注入的产物落盘策略 */
export type ArtifactSink = (
  kind: ArtifactKind,
  data: Buffer,
  options?: ScreenshotOptions,
) => Promise<ArtifactRef>;

/** iOS 屏幕方向常量（Appium 协议使用全大写） */
const APPIUM_ORIENTATION: Readonly<Record<Orientation, string>> = {
  portrait: 'PORTRAIT',
  landscape: 'LANDSCAPE',
};

/** Android KeyEvent 键码 */
const ANDROID_KEYCODE = {
  BACK: 4,
  HOME: 3,
  ENTER: 66,
} as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 文本匹配判定，供 assertText / waitForText 共用，保证两者语义一致 */
function textMatches(
  actual: string,
  expected: string,
  mode: TextMatchMode = 'exact',
  ignoreCase = false,
): boolean {
  const left = ignoreCase ? actual.toLowerCase() : actual;
  const right = ignoreCase ? expected.toLowerCase() : expected;
  switch (mode) {
    case 'contains':
      return left.includes(right);
    case 'startsWith':
      return left.startsWith(right);
    case 'regex':
      return new RegExp(expected, ignoreCase ? 'i' : '').test(actual);
    case 'exact':
    default:
      return left === right;
  }
}

/** 把框架配置窄化为 Appium 配置 */
function asAppiumConfig(config: FrameworkConfig): AppiumFrameworkConfig | undefined {
  return (config as AppiumFrameworkConfig).framework === 'appium'
    ? (config as AppiumFrameworkConfig)
    : undefined;
}

/** 默认产物落盘：写进 runConfig.paths 下的对应目录并登记 ArtifactRef */
async function writeArtifactToDisk(
  runConfig: ResolvedRunConfig,
  kind: ArtifactKind,
  data: Buffer,
  options: ScreenshotOptions | undefined,
  extension: string,
): Promise<ArtifactRef> {
  const dir = kind === 'video' ? runConfig.paths.videosDir : runConfig.paths.screenshotsDir;
  ensureDir(dir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = sanitizePathSegment(options?.name ?? `${String(runConfig.framework)}-${kind}`);
  const fileName = `${base}-${stamp}.${extension}`;
  const absolute = nodePath.join(dir, fileName);
  await fsPromises.writeFile(absolute, data);
  return {
    kind,
    path: absolute,
    relativePath: toRelativePath(absolute, runConfig.paths.projectRoot),
    createdAt: new Date().toISOString(),
    label: options?.label,
    bytes: data.byteLength,
  };
}

/* ═══════════════ IActions 实现 ═══════════════ */

export class AppiumActions implements IActions {
  private readonly driver: AppiumDriver;
  private readonly resolver: ILocatorResolver;
  private readonly config: AppiumFrameworkConfig;
  private readonly platform: Platform;
  private readonly logger: ILogger;

  constructor(
    driver: AppiumDriver,
    resolver: ILocatorResolver,
    config: AppiumFrameworkConfig,
    platform: Platform,
    logger: ILogger,
  ) {
    this.driver = driver;
    this.resolver = resolver;
    this.config = config;
    this.platform = platform;
    this.logger = logger.child('AppiumActions');
  }

  /* ─────────── 内部工具 ─────────── */

  resolveSelector(locator: LocatorLike): NativeSelector {
    return this.resolver.resolve(locator);
  }

  /** 解析选择器，并让 options.index 覆盖 locator 自带的 index */
  private selectorOf(locator: LocatorLike, options?: BaseActionOptions): NativeSelector {
    const selector = this.resolver.resolve(locator);
    if (options?.index === undefined) {
      return selector;
    }
    return { ...selector, index: options.index };
  }

  private timeoutOf(options?: { readonly timeoutMs?: number }): number {
    return options?.timeoutMs ?? this.config.actionTimeoutMs;
  }

  private waitTimeoutOf(options?: { readonly timeoutMs?: number }): number {
    return options?.timeoutMs ?? this.config.waitTimeoutMs;
  }

  /** 查找元素；默认在动作前等待其可见（waitForVisible 缺省为 true） */
  private async element(locator: LocatorLike, options?: BaseActionOptions): Promise<WdioElementLike> {
    const selector = this.selectorOf(locator, options);
    const timeout = this.waitTimeoutOf(options);
    const element = await this.driver.findElement(selector, timeout);
    if (options?.waitForVisible !== false) {
      const displayed = await element.waitForDisplayed({
        timeout,
        interval: this.config.waitIntervalMs,
        timeoutMsg: `元素未在 ${timeout}ms 内可见：${selector.description}`,
      }).catch(() => false);
      if (displayed === false) {
        throw new ElementNotFoundError(`${selector.description}（存在但不可见）`, timeout);
      }
    }
    return element;
  }

  /** 元素中心点（视口坐标） */
  private async centerOf(element: WdioElementLike): Promise<{ x: number; y: number }> {
    const [location, size] = await Promise.all([element.getLocation(), element.getSize()]);
    return {
      x: Math.round(location.x + size.width / 2),
      y: Math.round(location.y + size.height / 2),
    };
  }

  /** 元素矩形；失败时回落到窗口矩形（全屏手势的参考系） */
  private async rectOf(locator: LocatorLike | null, options?: BaseActionOptions): Promise<WdioRect> {
    if (locator === null) {
      return this.driver.getWindowRect();
    }
    const element = await this.element(locator, options);
    const [location, size] = await Promise.all([element.getLocation(), element.getSize()]);
    return { x: location.x, y: location.y, width: size.width, height: size.height };
  }

  /* ─────────── 交互 ─────────── */

  async tap(locator: LocatorLike, options?: TapOptions): Promise<void> {
    const element = await this.element(locator, options);
    if (options?.offset !== undefined) {
      const location = await element.getLocation();
      await this.driver.tapAtPoint(location.x + options.offset.x, location.y + options.offset.y);
      return;
    }
    await withTimeout(element.click(), this.timeoutOf(options), `tap ${this.resolver.describe(locator)}`);
  }

  async doubleTap(locator: LocatorLike, options?: TapOptions): Promise<void> {
    const element = await this.element(locator, options);
    const elementId = element.elementId;
    if (elementId !== undefined) {
      const command = this.platform === 'ios' ? 'mobile: doubleTap' : 'mobile: doubleClickGesture';
      try {
        await this.driver.execute(command, { elementId });
        return;
      } catch (error) {
        // 部分 Appium 驱动版本未实现该扩展命令，回落到两次点击（语义等价，仅间隔略长）
        this.logger.debug('doubleTap 扩展命令不可用，回落为两次 click', {
          command,
          reason: errorMessage(error),
        });
      }
    }
    await element.click();
    await element.click();
  }

  async longPress(locator: LocatorLike, options?: LongPressOptions): Promise<void> {
    const durationMs = options?.durationMs ?? 1_000;
    const element = await this.element(locator, options);
    const elementId = element.elementId;
    if (elementId !== undefined) {
      try {
        if (this.platform === 'ios') {
          await this.driver.execute('mobile: touchAndHold', { elementId, duration: durationMs / 1_000 });
        } else {
          await this.driver.execute('mobile: longClickGesture', { elementId, duration: durationMs });
        }
        return;
      } catch (error) {
        this.logger.debug('longPress 扩展命令不可用，回落为 W3C pointer 序列', {
          reason: errorMessage(error),
        });
      }
    }
    const center = await this.centerOf(element);
    await this.driver.longPressAtPoint(center.x, center.y, durationMs);
  }

  async tapAt(x: number, y: number, _options?: BaseActionOptions): Promise<void> {
    await this.driver.tapAtPoint(x, y);
  }

  /* ─────────── 输入 ─────────── */

  async typeText(locator: LocatorLike, text: string, options?: TypeTextOptions): Promise<void> {
    const element = await this.element(locator, options);
    if (options?.clearFirst !== false) {
      await element.clearValue().catch(() => undefined);
    }

    const delay = options?.typeDelayMs ?? 0;
    if (delay > 0) {
      // 逐字输入：部分 RN 输入框带受控 onChangeText 节流，整串下发会丢字符
      for (const char of text) {
        await element.addValue(char);
        await sleep(delay);
      }
    } else {
      await withTimeout(
        element.addValue(text),
        this.timeoutOf(options),
        `typeText ${this.resolver.describe(locator)}`,
      );
    }

    if (options?.submit === true) {
      if (this.platform === 'android') {
        await this.driver.execute('pressKeyCode', { keycode: ANDROID_KEYCODE.ENTER });
      } else {
        await element.addValue('\n');
      }
    }
    if (options?.hideKeyboardAfter !== false) {
      await this.dismissKeyboard();
    }
  }

  async clearText(locator: LocatorLike, options?: BaseActionOptions): Promise<void> {
    const element = await this.element(locator, options);
    await withTimeout(
      element.clearValue(),
      this.timeoutOf(options),
      `clearText ${this.resolver.describe(locator)}`,
    );
  }

  async replaceText(locator: LocatorLike, text: string, options?: TypeTextOptions): Promise<void> {
    const element = await this.element(locator, options);
    // wdio 的 setValue 语义就是「清空后输入」，比 clear + addValue 少一次往返
    await withTimeout(
      element.setValue(text),
      this.timeoutOf(options),
      `replaceText ${this.resolver.describe(locator)}`,
    );
    if (options?.submit === true) {
      if (this.platform === 'android') {
        await this.driver.execute('pressKeyCode', { keycode: ANDROID_KEYCODE.ENTER });
      } else {
        await element.addValue('\n');
      }
    }
    if (options?.hideKeyboardAfter !== false) {
      await this.dismissKeyboard();
    }
  }

  async dismissKeyboard(): Promise<void> {
    try {
      const shown = await this.driver.execute<boolean>('isKeyboardShown');
      if (shown !== true) {
        return;
      }
      await this.driver.execute('hideKeyboard');
    } catch (error) {
      // iOS 上无键盘时 hideKeyboard 会抛错；收键盘失败不应让用例失败
      this.logger.debug('收起键盘失败（已忽略）', { reason: errorMessage(error) });
    }
  }

  /* ─────────── 滚动 / 滑动 ─────────── */

  async scroll(container: LocatorLike, options?: ScrollOptions): Promise<void> {
    const direction: SwipeDirection = options?.direction ?? 'down';
    const percent = options?.percent ?? 0.75;
    const element = await this.element(container, { ...options, waitForVisible: false });
    const elementId = element.elementId;

    if (elementId !== undefined) {
      try {
        if (this.platform === 'ios') {
          // iOS 的 mobile: scroll 走 XCUITest 原生滚动，比手势更稳（不会因惯性滑过头）
          await this.driver.execute('mobile: scroll', { elementId, direction });
        } else {
          await this.driver.execute('mobile: scrollGesture', {
            elementId,
            direction,
            percent,
          });
        }
        return;
      } catch (error) {
        this.logger.debug('原生滚动命令不可用，回落为 swipe 手势', { reason: errorMessage(error) });
      }
    }

    await this.swipe(container, {
      direction,
      percent,
      durationMs: 300,
      waitForVisible: false,
    });
  }

  async scrollTo(container: LocatorLike, options: ScrollToOptions): Promise<void> {
    const maxSwipes = options.maxSwipes ?? 10;
    const targetDescription = this.resolver.describe(options.target);

    for (let attempt = 0; attempt <= maxSwipes; attempt += 1) {
      if (await this.isVisible(options.target, { timeoutMs: 500, waitForVisible: false })) {
        return;
      }
      if (attempt === maxSwipes) {
        break;
      }
      await this.scroll(container, options);
    }
    throw new ElementNotFoundError(
      `${targetDescription}（在容器「${this.resolver.describe(container)}」内滚动 ${maxSwipes} 次仍未出现）`,
      this.waitTimeoutOf(options),
    );
  }

  async swipe(target: LocatorLike | null, options: SwipeOptions): Promise<void> {
    const percent = options.percent ?? 0.6;
    const durationMs = options.durationMs ?? 300;
    const rect = await this.rectOf(target, { ...options, waitForVisible: false });

    const centerX = Math.round(rect.x + rect.width / 2);
    const centerY = Math.round(rect.y + rect.height / 2);
    const deltaX = Math.round((rect.width * percent) / 2);
    const deltaY = Math.round((rect.height * percent) / 2);

    // 手势方向语义：direction='up' 表示「内容向上移动」，即手指从下往上划
    let from = { x: centerX, y: centerY };
    let to = { x: centerX, y: centerY };
    switch (options.direction) {
      case 'up':
        from = { x: centerX, y: centerY + deltaY };
        to = { x: centerX, y: centerY - deltaY };
        break;
      case 'down':
        from = { x: centerX, y: centerY - deltaY };
        to = { x: centerX, y: centerY + deltaY };
        break;
      case 'left':
        from = { x: centerX + deltaX, y: centerY };
        to = { x: centerX - deltaX, y: centerY };
        break;
      case 'right':
      default:
        from = { x: centerX - deltaX, y: centerY };
        to = { x: centerX + deltaX, y: centerY };
        break;
    }
    await this.driver.swipeBetween(from, to, durationMs);
  }

  async pullToRefresh(container: LocatorLike, options?: BaseActionOptions): Promise<void> {
    const rect = await this.rectOf(container, { ...options, waitForVisible: false });
    const centerX = Math.round(rect.x + rect.width / 2);
    const startY = Math.round(rect.y + rect.height * 0.15);
    const endY = Math.round(rect.y + rect.height * 0.85);
    // 下拉刷新需要「慢速长距离」手势，快滑会被识别成普通滚动
    await this.driver.swipeBetween({ x: centerX, y: startY }, { x: centerX, y: endY }, 800);
    await sleep(500);
  }

  /* ─────────── 等待 ─────────── */

  async waitForVisible(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    const selector = this.selectorOf(locator);
    const element = await this.driver.findElement(selector, timeout);
    const ok = await element.waitForDisplayed({
      timeout,
      interval: options?.intervalMs ?? this.config.waitIntervalMs,
      timeoutMsg: options?.message ?? `元素未在 ${timeout}ms 内可见：${selector.description}`,
    }).catch(() => false);
    if (ok === false) {
      throw new ElementNotFoundError(options?.message ?? selector.description, timeout);
    }
  }

  async waitForNotVisible(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    await waitFor(
      async () => !(await this.isVisible(locator, { timeoutMs: 500, waitForVisible: false })),
      {
        timeoutMs: timeout,
        intervalMs: options?.intervalMs ?? this.config.waitIntervalMs,
        message: options?.message ?? `waitForNotVisible ${this.resolver.describe(locator)}`,
      },
    );
  }

  async waitForExist(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    // findElement 内部即为「轮询到出现为止」，超时会抛 ElementNotFoundError
    await this.driver.findElement(this.selectorOf(locator), timeout);
  }

  async waitForGone(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    await waitFor(
      async () => (await this.count(locator)) === 0,
      {
        timeoutMs: timeout,
        intervalMs: options?.intervalMs ?? this.config.waitIntervalMs,
        message: options?.message ?? `waitForGone ${this.resolver.describe(locator)}`,
      },
    );
  }

  async waitForText(
    locator: LocatorLike,
    expected: string,
    options?: AssertTextOptions & WaitOptions,
  ): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    await waitFor(
      async () => {
        const actual = await this.getText(locator, { ...options, waitForVisible: false });
        return textMatches(actual, expected, options?.match, options?.ignoreCase);
      },
      {
        timeoutMs: timeout,
        intervalMs: options?.intervalMs ?? this.config.waitIntervalMs,
        message: options?.message ?? `waitForText「${expected}」于 ${this.resolver.describe(locator)}`,
      },
    );
  }

  async waitUntil(predicate: () => Promise<boolean>, options?: WaitOptions): Promise<void> {
    await waitFor(predicate, {
      timeoutMs: this.waitTimeoutOf(options),
      intervalMs: options?.intervalMs ?? this.config.waitIntervalMs,
      message: options?.message ?? 'waitUntil',
    });
  }

  /* ─────────── 查询 ─────────── */

  async getText(locator: LocatorLike, options?: BaseActionOptions): Promise<string> {
    const element = await this.element(locator, { ...options, waitForVisible: options?.waitForVisible ?? false });
    const text = await element.getText();
    if (text !== null && text !== undefined && text !== '') {
      return text;
    }
    // iOS 的 StaticText 之外的控件常把文案放在 label/value 上，getText 会返回空串
    const label = await element.getAttribute(this.platform === 'ios' ? 'label' : 'content-desc').catch(() => null);
    if (label !== null && label !== '') {
      return label;
    }
    const value = await element.getAttribute('value').catch(() => null);
    return value ?? '';
  }

  async getValue(locator: LocatorLike, options?: BaseActionOptions): Promise<string | null> {
    const element = await this.element(locator, { ...options, waitForVisible: options?.waitForVisible ?? false });
    const value = await element.getAttribute('value').catch(() => null);
    if (value !== null) {
      return value;
    }
    return element.getValue().catch(() => null);
  }

  async getAttribute(
    locator: LocatorLike,
    name: string,
    options?: BaseActionOptions,
  ): Promise<string | null> {
    const element = await this.element(locator, { ...options, waitForVisible: options?.waitForVisible ?? false });
    return element.getAttribute(name).catch(() => null);
  }

  async exists(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    return (await this.count(locator, options)) > 0;
  }

  async isVisible(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    try {
      const elements = await this.driver.findElements(this.selectorOf(locator, options));
      const index = options?.index ?? this.selectorOf(locator).index ?? 0;
      const element = elements[index];
      if (element === undefined) {
        return false;
      }
      return await element.isDisplayed();
    } catch {
      // 查询类方法契约要求「不抛异常」
      return false;
    }
  }

  async isEnabled(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    try {
      const element = await this.element(locator, { ...options, waitForVisible: false });
      return await element.isEnabled();
    } catch {
      return false;
    }
  }

  async isSelected(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    try {
      const element = await this.element(locator, { ...options, waitForVisible: false });
      const selected = await element.isSelected().catch(() => false);
      if (selected) {
        return true;
      }
      // RN 的 Switch 在 Android 上不置 selected，而是把状态放在 checked 属性里
      const checked = await element.getAttribute('checked').catch(() => null);
      if (checked !== null) {
        return checked === 'true';
      }
      const value = await element.getAttribute('value').catch(() => null);
      return value === '1' || value === 'true';
    } catch {
      return false;
    }
  }

  async count(locator: LocatorLike, options?: BaseActionOptions): Promise<number> {
    try {
      const elements = await this.driver.findElements(this.selectorOf(locator, options));
      return elements.length;
    } catch {
      return 0;
    }
  }

  /* ─────────── 断言 ─────────── */

  async assertExists(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (!(await this.exists(locator, options))) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素应存在但未找到 —— ${this.resolver.describe(locator)}`,
        { locator: this.resolver.describe(locator) },
      );
    }
  }

  async assertNotExists(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (await this.exists(locator, options)) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素不应存在但被找到 —— ${this.resolver.describe(locator)}`,
        { locator: this.resolver.describe(locator) },
      );
    }
  }

  async assertVisible(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (!(await this.isVisible(locator, options))) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素应可见 —— ${this.resolver.describe(locator)}`,
        { locator: this.resolver.describe(locator) },
      );
    }
  }

  async assertNotVisible(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (await this.isVisible(locator, options)) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素不应可见 —— ${this.resolver.describe(locator)}`,
        { locator: this.resolver.describe(locator) },
      );
    }
  }

  async assertText(locator: LocatorLike, expected: string, options?: AssertTextOptions): Promise<void> {
    const actual = await this.getText(locator, options);
    if (!textMatches(actual, expected, options?.match, options?.ignoreCase)) {
      throw new AssertionFailedError(
        options?.message
        ?? `断言失败：文本不匹配 —— 期望「${expected}」(${options?.match ?? 'exact'})，实际「${actual}」`,
        { locator: this.resolver.describe(locator), expected, actual },
      );
    }
  }

  async assertValue(locator: LocatorLike, expected: string, options?: AssertTextOptions): Promise<void> {
    const actual = (await this.getValue(locator, options)) ?? '';
    if (!textMatches(actual, expected, options?.match, options?.ignoreCase)) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：值不匹配 —— 期望「${expected}」，实际「${actual}」`,
        { locator: this.resolver.describe(locator), expected, actual },
      );
    }
  }

  async assertEnabled(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (!(await this.isEnabled(locator, options))) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素应可用 —— ${this.resolver.describe(locator)}`,
        { locator: this.resolver.describe(locator) },
      );
    }
  }

  async assertCount(locator: LocatorLike, expected: number, options?: AssertTextOptions): Promise<void> {
    const actual = await this.count(locator, options);
    if (actual !== expected) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：命中数量不符 —— 期望 ${expected}，实际 ${actual}`,
        { locator: this.resolver.describe(locator), expected, actual },
      );
    }
  }
}

/* ═══════════════ IDeviceActions 实现 ═══════════════ */

export class AppiumDeviceActions implements IDeviceActions {
  private readonly driver: AppiumDriver;
  private readonly runConfig: ResolvedRunConfig;
  private readonly config: AppiumFrameworkConfig;
  private readonly logger: ILogger;
  private artifactSink: ArtifactSink | undefined = undefined;
  private videoRecording = false;

  constructor(
    driver: AppiumDriver,
    runConfig: ResolvedRunConfig,
    config: AppiumFrameworkConfig,
    logger: ILogger,
  ) {
    this.driver = driver;
    this.runConfig = runConfig;
    this.config = config;
    this.logger = logger.child('AppiumDevice');
  }

  setArtifactSink(sink: ArtifactSink | undefined): void {
    this.artifactSink = sink;
  }

  private get platform(): Platform {
    return this.runConfig.platform;
  }

  /* ── App 生命周期 ── */

  async launchApp(options?: LaunchAppOptions): Promise<void> {
    const appId = this.runConfig.appId;

    if (options?.reinstall === true) {
      await this.uninstallApp(appId).catch(() => undefined);
      await this.installApp();
    }
    if (options?.permissions !== undefined) {
      await this.setPermissions(options.permissions);
    }
    if (options?.newInstance !== false) {
      await this.driver.execute('terminateApp', { appId }).catch(() => undefined);
    }

    if (options?.url !== undefined) {
      await this.openUrl(options.url);
      return;
    }

    await withTimeout(
      this.driver.execute('activateApp', { appId }),
      options?.timeoutMs ?? this.config.startupTimeoutMs,
      `launchApp ${appId}`,
    );
  }

  async terminateApp(appId?: string): Promise<void> {
    await this.driver.execute('terminateApp', { appId: appId ?? this.runConfig.appId });
  }

  async reloadApp(options?: LaunchAppOptions): Promise<void> {
    await this.terminateApp();
    await this.launchApp({ ...options, newInstance: false });
  }

  async installApp(binaryPath?: string): Promise<void> {
    const target = binaryPath ?? this.runConfig.binaryPath;
    if (target === undefined || target === '') {
      throw new OmniError(
        ERROR_CODES.CONFIG_MISSING_FIELD,
        'installApp 需要安装包路径，但 runConfig.binaryPath 与入参均为空',
        {
          exitCode: EXIT_CODES.CONFIG_INVALID,
          details: { app: this.runConfig.app.key, platform: this.platform },
          hint: '请在 configs/apps/<app>.config.ts 中为当前平台配置 binaryPath',
        },
      );
    }
    await withTimeout(
      this.driver.execute('installApp', { path: target }),
      this.config.startupTimeoutMs,
      `installApp ${target}`,
    );
  }

  async uninstallApp(appId?: string): Promise<void> {
    await this.driver.execute('removeApp', { appId: appId ?? this.runConfig.appId });
  }

  async sendToBackground(seconds: number): Promise<void> {
    // Appium 的 background(seconds) 会阻塞到回前台；-1 表示永久后台
    await withTimeout(
      this.driver.execute('background', { seconds }),
      (Math.max(0, seconds) + 30) * 1_000,
      `sendToBackground(${seconds}s)`,
    );
  }

  async openUrl(url: string): Promise<void> {
    await this.driver.execute('mobile: deepLink', {
      url,
      package: this.platform === 'android' ? this.runConfig.appId : undefined,
      bundleId: this.platform === 'ios' ? this.runConfig.appId : undefined,
    });
  }

  /* ── 设备状态 ── */

  async setOrientation(orientation: Orientation): Promise<void> {
    await this.driver.execute('setOrientation', { orientation: APPIUM_ORIENTATION[orientation] });
  }

  async getOrientation(): Promise<Orientation> {
    const raw = await this.driver.execute<string>('getOrientation');
    return String(raw).toUpperCase() === 'LANDSCAPE' ? 'landscape' : 'portrait';
  }

  async pressBack(): Promise<void> {
    if (this.platform !== 'android') {
      throw new OmniError(
        ERROR_CODES.NOT_IMPLEMENTED,
        'iOS 没有硬件返回键，pressBack() 不可用',
        {
          exitCode: EXIT_CODES.GENERIC,
          details: { platform: this.platform },
          hint: 'iOS 请改为点击导航栏返回按钮，或用 platform 覆盖字段区分两端脚本分支',
        },
      );
    }
    await this.driver.execute('pressKeyCode', { keycode: ANDROID_KEYCODE.BACK });
  }

  async pressHome(): Promise<void> {
    if (this.platform === 'ios') {
      await this.driver.execute('mobile: pressButton', { name: 'home' });
      return;
    }
    await this.driver.execute('mobile: pressKey', { keycode: ANDROID_KEYCODE.HOME });
  }

  async setPermissions(permissions: Readonly<Record<string, string>>): Promise<void> {
    if (Object.keys(permissions).length === 0) {
      return;
    }
    if (this.platform === 'ios') {
      await this.driver.execute('mobile: setPermission', {
        bundleId: this.runConfig.appId,
        access: permissions,
      });
      return;
    }
    await this.driver.execute('mobile: changePermissions', {
      permissions: Object.keys(permissions),
      appPackage: this.runConfig.appId,
      action: 'grant',
    });
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const rect = await this.driver.getWindowRect();
    const device: DeviceConfig = this.runConfig.device;
    return {
      platform: this.platform,
      platformVersion: device.platformVersion ?? 'unknown',
      deviceName: device.deviceName,
      udid: device.udid,
      screen: { width: rect.width, height: rect.height },
    };
  }

  /* ── 产物采集 ── */

  async captureScreenshotBuffer(): Promise<Buffer> {
    return this.driver.screenshot();
  }

  async takeScreenshot(options?: ScreenshotOptions): Promise<ArtifactRef> {
    const buffer = await this.captureScreenshotBuffer();
    if (this.artifactSink !== undefined) {
      return this.artifactSink('screenshot', buffer, options);
    }
    return writeArtifactToDisk(this.runConfig, 'screenshot', buffer, options, 'png');
  }

  async startVideoRecording(_options?: ScreenshotOptions): Promise<void> {
    await this.driver.execute('startRecordingScreen', {
      timeLimit: 1_800,
      videoType: this.platform === 'ios' ? 'mpeg4' : undefined,
    });
    this.videoRecording = true;
  }

  async stopVideoRecording(): Promise<ArtifactRef | null> {
    if (!this.videoRecording) {
      return null;
    }
    this.videoRecording = false;
    try {
      const base64 = await this.driver.execute<string>('stopRecordingScreen');
      if (typeof base64 !== 'string' || base64 === '') {
        return null;
      }
      const buffer = Buffer.from(base64, 'base64');
      if (this.artifactSink !== undefined) {
        return await this.artifactSink('video', buffer);
      }
      return await writeArtifactToDisk(this.runConfig, 'video', buffer, undefined, 'mp4');
    } catch (error) {
      this.logger.warn('停止录屏失败（已忽略）', { reason: errorMessage(error) });
      return null;
    }
  }

  async getPageSource(): Promise<string> {
    return this.driver.execute<string>('getPageSource');
  }
}

/* ═══════════════ IAdapter 实现 ═══════════════ */

export class AppiumAdapter implements IAdapter {
  readonly framework: FrameworkKind = 'appium';
  readonly platform: Platform;
  readonly deviceConfig: DeviceConfig;
  readonly actions: IActions;
  readonly device: IDeviceActions;
  readonly locatorResolver: ILocatorResolver;
  readonly driver: AppiumDriver;

  private readonly runConfig: ResolvedRunConfig;
  private readonly logger: ILogger;
  private readonly deviceActionsImpl: AppiumDeviceActions;
  private currentState: AdapterState = 'idle';
  private initPromise: Promise<void> | undefined = undefined;

  constructor(init: AdapterInit) {
    this.runConfig = init.runConfig;
    this.logger = init.logger.child('AppiumAdapter');
    this.platform = init.runConfig.platform;
    this.deviceConfig = init.runConfig.device;

    const config = asAppiumConfig(init.runConfig.frameworkConfig);
    if (config === undefined) {
      throw new OmniError(
        ERROR_CODES.CONFIG_INVALID,
        `AppiumAdapter 要求 frameworkConfig.framework === 'appium'，实际为 '${String(init.runConfig.frameworkConfig.framework)}'`,
        { exitCode: EXIT_CODES.CONFIG_INVALID },
      );
    }

    this.locatorResolver = new AppiumLocatorResolver({
      platform: this.platform,
      testIdAttribute: init.runConfig.app.testIdAttribute,
    });
    this.driver = new AppiumDriver(init.runConfig, this.logger);
    this.actions = new AppiumActions(this.driver, this.locatorResolver, config, this.platform, this.logger);
    this.deviceActionsImpl = new AppiumDeviceActions(this.driver, init.runConfig, config, this.logger);
    this.device = this.deviceActionsImpl;
  }

  get state(): AdapterState {
    return this.currentState;
  }

  /** IAdapter.device 的别名，便于上层按「设备动作」语义读写 */
  get deviceActions(): IDeviceActions {
    return this.deviceActionsImpl;
  }

  /** 注入产物落盘策略（失败截图由 setup 层统一登记到报告） */
  setArtifactSink(sink: ArtifactSink | undefined): void {
    this.deviceActionsImpl.setArtifactSink(sink);
  }

  isReady(): boolean {
    return this.currentState === 'ready' && this.driver.isConnected();
  }

  /** 幂等初始化：并发调用共享同一个 initPromise，避免建出两个会话 */
  async init(): Promise<void> {
    if (this.currentState === 'ready') {
      return;
    }
    if (this.initPromise !== undefined) {
      return this.initPromise;
    }
    this.initPromise = this.doInit();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = undefined;
    }
  }

  private async doInit(): Promise<void> {
    this.currentState = 'initializing';
    try {
      await this.driver.connect();
      // capabilities 里已带 app/bundleId，Appium 建会话时通常已自动启动 App；
      // 这里再激活一次保证前台状态确定（activateApp 对已在前台的 App 是空操作）
      await this.deviceActionsImpl.launchApp({ newInstance: false }).catch((error: unknown) => {
        this.logger.warn('会话建立后激活 App 失败（继续执行）', { reason: errorMessage(error) });
      });
      if (this.deviceConfig.orientation !== undefined) {
        await this.deviceActionsImpl.setOrientation(this.deviceConfig.orientation).catch(() => undefined);
      }
      this.currentState = 'ready';
      this.logger.info('AppiumAdapter 就绪', {
        platform: this.platform,
        app: String(this.runConfig.app.key),
      });
    } catch (error) {
      this.currentState = 'error';
      throw error;
    }
  }

  /** 幂等释放，且**不抛异常**（契约要求：dispose 失败不能掩盖用例本身的错误） */
  async dispose(): Promise<void> {
    if (this.currentState === 'disposed' || this.currentState === 'disposing') {
      return;
    }
    this.currentState = 'disposing';
    try {
      await this.deviceActionsImpl.stopVideoRecording().catch(() => null);
      await this.driver.disconnect();
    } catch (error) {
      this.logger.warn('释放 AppiumAdapter 时出错（已吞掉）', { reason: errorMessage(error) });
    } finally {
      this.currentState = 'disposed';
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return this.driver.healthCheck();
  }
}

/** 适配器模块契约要求的工厂函数（`AdapterModule.createAdapter`） */
export const createAdapter: CreateAdapterFn = (init: AdapterInit): IAdapter => new AppiumAdapter(init);
