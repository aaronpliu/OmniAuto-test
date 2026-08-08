import { promises as fsPromises } from 'node:fs';
import * as nodePath from 'node:path';

import type {
  AdapterState,
  ArtifactKind,
  ArtifactRef,
  DetoxFrameworkConfig,
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
import { sleep, waitFor as waitForCondition } from '../../utils/wait';
import { DetoxLocatorResolver } from './DetoxLocatorResolver';
import type {
  DetoxElementAttributes,
  DetoxElementLike,
  DetoxModuleLike,
} from './DetoxDriver';
import { DetoxDriver, toAttributeList } from './DetoxDriver';

/**
 * Detox 适配器 —— IActions / IDeviceActions / IAdapter 的 Detox 实现。
 *
 * 【与 Appium 的根本差异，决定了很多方法的写法】
 * 1. Detox 没有「元素句柄」，`element(by.id())` 是惰性查询代理，每次动作重新匹配；
 * 2. Detox 没有通用的 `getText()`，一切读取都走 `getAttributes()`，
 *    且**多命中时返回 `{ elements: [...] }`、单命中时直接返回属性对象** —— 两种形态都必须处理，
 *    只写一种会在「页面上恰好只有一个匹配」时通过、在列表页悄悄拿到错误的值；
 * 3. Detox 的等待是声明式链（`waitFor(el).toBeVisible().withTimeout(ms)`），
 *    而不是轮询回调，能用它就不要自己 poll —— 它带 UI 同步（idle 等待），比轮询稳得多。
 *
 * 【能力缺口一律显式失败】
 * Detox 确实没有「坐标点击」「全屏 swipe」「视图树导出（旧版本）」这些能力。
 * 这里抛 `OmniError(NOT_IMPLEMENTED)` 并给出可执行的替代建议，
 * 而不是用某个近似 API 去糊 —— 理由与 Resolver 里拒绝 xpath 完全相同。
 */

export type ArtifactSink = (
  kind: ArtifactKind,
  data: Buffer,
  options?: ScreenshotOptions,
) => Promise<ArtifactRef>;

/** SwipeDirection → Detox scroll/swipe 的方向字符串（两者取值域一致） */
const DETOX_DIRECTION: Readonly<Record<SwipeDirection, string>> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

function asDetoxConfig(config: FrameworkConfig): DetoxFrameworkConfig | undefined {
  return (config as DetoxFrameworkConfig).framework === 'detox'
    ? (config as DetoxFrameworkConfig)
    : undefined;
}

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
  const absolute = nodePath.join(dir, `${base}-${stamp}.${extension}`);
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

/** 归一化 Detox 属性值为字符串 */
function attributeToString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/* ═══════════════ IActions 实现 ═══════════════ */

export class DetoxActions implements IActions {
  private readonly driver: DetoxDriver;
  private readonly resolver: ILocatorResolver;
  private readonly config: DetoxFrameworkConfig;
  private readonly platform: Platform;
  private readonly logger: ILogger;

  constructor(
    driver: DetoxDriver,
    resolver: ILocatorResolver,
    config: DetoxFrameworkConfig,
    platform: Platform,
    logger: ILogger,
  ) {
    this.driver = driver;
    this.resolver = resolver;
    this.config = config;
    this.platform = platform;
    this.logger = logger.child('DetoxActions');
  }

  /* ─────────── 内部工具 ─────────── */

  resolveSelector(locator: LocatorLike): NativeSelector {
    return this.resolver.resolve(locator);
  }

  private runtime(): DetoxModuleLike {
    return this.driver.getSession();
  }

  private selectorOf(locator: LocatorLike, options?: BaseActionOptions): NativeSelector {
    const selector = this.resolver.resolve(locator);
    if (options?.index === undefined) {
      return selector;
    }
    return { ...selector, index: options.index };
  }

  private waitTimeoutOf(options?: { readonly timeoutMs?: number }): number {
    return options?.timeoutMs ?? this.config.waitTimeoutMs;
  }

  private actionTimeoutOf(options?: { readonly timeoutMs?: number }): number {
    return options?.timeoutMs ?? this.config.actionTimeoutMs;
  }

  /** 惰性查询代理（不触发任何设备往返） */
  private async proxy(locator: LocatorLike, options?: BaseActionOptions): Promise<DetoxElementLike> {
    return this.driver.findElement(this.selectorOf(locator, options));
  }

  /** 查询代理 + 默认等待可见（用 Detox 原生的声明式等待，自带 UI idle 同步） */
  private async element(locator: LocatorLike, options?: BaseActionOptions): Promise<DetoxElementLike> {
    const selector = this.selectorOf(locator, options);
    const element = await this.driver.findElement(selector);
    if (options?.waitForVisible !== false) {
      const timeout = this.waitTimeoutOf(options);
      try {
        await this.runtime().waitFor(element).toBeVisible().withTimeout(timeout);
      } catch (error) {
        throw new ElementNotFoundError(selector.description, timeout, error);
      }
    }
    return element;
  }

  /** 读取属性；自动处理单命中 / 多命中两种返回形态 */
  private async attributesOf(
    locator: LocatorLike,
    options?: BaseActionOptions,
  ): Promise<DetoxElementAttributes | undefined> {
    const selector = this.selectorOf(locator, options);
    const element = await this.driver.findElement(selector);
    try {
      const raw = await element.getAttributes();
      const list = toAttributeList(raw);
      if (list.length === 0) {
        return undefined;
      }
      const index = selector.index ?? 0;
      return list.length === 1 ? list[0] : list[index];
    } catch (error) {
      this.logger.debug('getAttributes 未命中', {
        locator: selector.description,
        reason: errorMessage(error),
      });
      return undefined;
    }
  }

  /* ─────────── 交互 ─────────── */

  async tap(locator: LocatorLike, options?: TapOptions): Promise<void> {
    const element = await this.element(locator, options);
    if (options?.offset !== undefined) {
      await element.tapAtPoint({ x: options.offset.x, y: options.offset.y });
      return;
    }
    await element.tap();
  }

  async doubleTap(locator: LocatorLike, options?: TapOptions): Promise<void> {
    const element = await this.element(locator, options);
    await element.multiTap(2);
  }

  async longPress(locator: LocatorLike, options?: LongPressOptions): Promise<void> {
    const element = await this.element(locator, options);
    await element.longPress(options?.durationMs ?? 1_000);
  }

  async tapAt(x: number, y: number, _options?: BaseActionOptions): Promise<void> {
    throw new OmniError(
      ERROR_CODES.NOT_IMPLEMENTED,
      `Detox 没有屏幕级坐标点击 API（tapAt(${x}, ${y}) 无法实现）`,
      {
        exitCode: EXIT_CODES.GENERIC,
        details: { x, y, framework: 'detox' },
        hint:
          'Detox 的坐标点击只能相对某个元素：请改用 actions.tap(容器, { offset: { x, y } })，'
          + '它会走 element(...).tapAtPoint()。坐标点击本身也不建议在跨框架脚本里使用',
      },
    );
  }

  /* ─────────── 输入 ─────────── */

  async typeText(locator: LocatorLike, text: string, options?: TypeTextOptions): Promise<void> {
    const element = await this.element(locator, options);
    if (options?.clearFirst !== false) {
      await element.clearText().catch(() => undefined);
    }

    const delay = options?.typeDelayMs ?? 0;
    if (delay > 0) {
      for (const char of text) {
        await element.typeText(char);
        await sleep(delay);
      }
    } else {
      await element.typeText(text);
    }

    if (options?.submit === true) {
      await element.tapReturnKey();
    }
    if (options?.hideKeyboardAfter !== false) {
      await this.dismissKeyboard();
    }
  }

  async clearText(locator: LocatorLike, options?: BaseActionOptions): Promise<void> {
    const element = await this.element(locator, options);
    await element.clearText();
  }

  async replaceText(locator: LocatorLike, text: string, options?: TypeTextOptions): Promise<void> {
    const element = await this.element(locator, options);
    // replaceText 是 Detox 的原子替换，比 clearText + typeText 快且不触发逐字 onChangeText
    await element.replaceText(text);
    if (options?.submit === true) {
      await element.tapReturnKey();
    }
    if (options?.hideKeyboardAfter !== false) {
      await this.dismissKeyboard();
    }
  }

  async dismissKeyboard(): Promise<void> {
    // Detox 没有 hideKeyboard API：Android 上返回键即收键盘；iOS 上 Detox 在动作结束后自动同步，无需处理
    if (this.platform === 'android') {
      await this.driver.execute('pressBack').catch(() => undefined);
    }
  }

  /* ─────────── 滚动 / 滑动 ─────────── */

  async scroll(container: LocatorLike, options?: ScrollOptions): Promise<void> {
    const direction = DETOX_DIRECTION[options?.direction ?? 'down'];
    const distance = options?.distance ?? Math.round(600 * (options?.percent ?? 0.75));
    const element = await this.proxy(container, options);
    await element.scroll(Math.max(1, distance), direction);
  }

  async scrollTo(container: LocatorLike, options: ScrollToOptions): Promise<void> {
    const direction = DETOX_DIRECTION[options.direction ?? 'down'];
    const distance = options.distance ?? Math.round(600 * (options.percent ?? 0.75));
    const runtime = this.runtime();

    const targetSelector = this.selectorOf(options.target);
    const targetElement = await this.driver.findElement(targetSelector);
    const containerMatcher = this.driver.buildMatcher(
      this.driver.specOf(this.selectorOf(container)),
    );

    try {
      // whileElement().scroll() 是 Detox 原生的「边滚边找」，比手写循环更稳：
      // 它由原生侧驱动，不受 JS 侧轮询间隔与 UI 同步状态影响
      await runtime
        .waitFor(targetElement)
        .toBeVisible()
        .whileElement(containerMatcher)
        .scroll(Math.max(1, distance), direction);
    } catch (error) {
      throw new ElementNotFoundError(
        `${targetSelector.description}（在容器「${this.resolver.describe(container)}」内滚动查找失败）`,
        this.waitTimeoutOf(options),
        error,
      );
    }
  }

  async swipe(target: LocatorLike | null, options: SwipeOptions): Promise<void> {
    if (target === null) {
      throw new OmniError(
        ERROR_CODES.NOT_IMPLEMENTED,
        'Detox 的 swipe 必须作用在具体元素上，不支持全屏滑动（target=null）',
        {
          exitCode: EXIT_CODES.GENERIC,
          details: { framework: 'detox', direction: options.direction },
          hint: '请把滚动容器（ScrollView / FlatList）的 Locator 传给 swipe 的第一个参数',
        },
      );
    }
    const element = await this.proxy(target, options);
    // Detox 的 speed 只有 'fast' | 'slow'；用 durationMs 反推：>=500ms 视为慢滑
    const speed = (options.durationMs ?? 300) >= 500 ? 'slow' : 'fast';
    await element.swipe(DETOX_DIRECTION[options.direction], speed, options.percent ?? 0.6);
  }

  async pullToRefresh(container: LocatorLike, options?: BaseActionOptions): Promise<void> {
    const element = await this.proxy(container, options);
    // 下拉刷新必须慢滑且幅度大，快滑会被 RN 的 RefreshControl 识别成普通滚动
    await element.swipe('down', 'slow', 0.9);
    await sleep(500);
  }

  /* ─────────── 等待 ─────────── */

  async waitForVisible(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    const selector = this.selectorOf(locator);
    const element = await this.driver.findElement(selector);
    try {
      await this.runtime().waitFor(element).toBeVisible().withTimeout(timeout);
    } catch (error) {
      throw new ElementNotFoundError(options?.message ?? selector.description, timeout, error);
    }
  }

  async waitForNotVisible(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    const selector = this.selectorOf(locator);
    const element = await this.driver.findElement(selector);
    try {
      await this.runtime().waitFor(element).not.toBeVisible().withTimeout(timeout);
    } catch (error) {
      throw new OmniError(
        ERROR_CODES.ACTION_TIMEOUT,
        options?.message ?? `元素在 ${timeout}ms 内仍然可见：${selector.description}`,
        { exitCode: EXIT_CODES.GENERIC, cause: error, details: { locator: selector.description } },
      );
    }
  }

  async waitForExist(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    const selector = this.selectorOf(locator);
    const element = await this.driver.findElement(selector);
    try {
      await this.runtime().waitFor(element).toExist().withTimeout(timeout);
    } catch (error) {
      throw new ElementNotFoundError(options?.message ?? selector.description, timeout, error);
    }
  }

  async waitForGone(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    const selector = this.selectorOf(locator);
    const element = await this.driver.findElement(selector);
    try {
      await this.runtime().waitFor(element).not.toExist().withTimeout(timeout);
    } catch (error) {
      throw new OmniError(
        ERROR_CODES.ACTION_TIMEOUT,
        options?.message ?? `元素在 ${timeout}ms 内仍存在于视图树：${selector.description}`,
        { exitCode: EXIT_CODES.GENERIC, cause: error, details: { locator: selector.description } },
      );
    }
  }

  async waitForText(
    locator: LocatorLike,
    expected: string,
    options?: AssertTextOptions & WaitOptions,
  ): Promise<void> {
    const timeout = this.waitTimeoutOf(options);
    const mode = options?.match ?? 'exact';

    if (mode === 'exact' && options?.ignoreCase !== true) {
      // 精确匹配走 Detox 原生断言链，自带 UI 同步
      const element = await this.driver.findElement(this.selectorOf(locator));
      try {
        await this.runtime().waitFor(element).toHaveText(expected).withTimeout(timeout);
        return;
      } catch (error) {
        throw new OmniError(
          ERROR_CODES.ACTION_TIMEOUT,
          options?.message ?? `元素文本未在 ${timeout}ms 内变为「${expected}」`,
          { exitCode: EXIT_CODES.GENERIC, cause: error },
        );
      }
    }

    // 非精确匹配 Detox 无原生等价物，退化为读属性轮询（语义仍然明确，不存在误判风险）
    await waitForCondition(
      async () => {
        const actual = await this.getText(locator, { ...options, waitForVisible: false });
        return textMatches(actual, expected, mode, options?.ignoreCase);
      },
      {
        timeoutMs: timeout,
        intervalMs: options?.intervalMs ?? this.config.waitIntervalMs,
        message: options?.message ?? `waitForText「${expected}」于 ${this.resolver.describe(locator)}`,
      },
    );
  }

  async waitUntil(predicate: () => Promise<boolean>, options?: WaitOptions): Promise<void> {
    await waitForCondition(predicate, {
      timeoutMs: this.waitTimeoutOf(options),
      intervalMs: options?.intervalMs ?? this.config.waitIntervalMs,
      message: options?.message ?? 'waitUntil',
    });
  }

  /* ─────────── 查询 ─────────── */

  async getText(locator: LocatorLike, options?: BaseActionOptions): Promise<string> {
    const attributes = await this.attributesOf(locator, options);
    if (attributes === undefined) {
      throw new ElementNotFoundError(
        this.resolver.describe(locator),
        this.actionTimeoutOf(options),
      );
    }
    // Detox 没有统一的 getText：文案按控件类型分布在 text / label / value 上
    return attributeToString(attributes.text)
      ?? attributeToString(attributes.label)
      ?? attributeToString(attributes.value)
      ?? '';
  }

  async getValue(locator: LocatorLike, options?: BaseActionOptions): Promise<string | null> {
    const attributes = await this.attributesOf(locator, options);
    if (attributes === undefined) {
      return null;
    }
    return attributeToString(attributes.value) ?? attributeToString(attributes.text);
  }

  async getAttribute(
    locator: LocatorLike,
    name: string,
    options?: BaseActionOptions,
  ): Promise<string | null> {
    const attributes = await this.attributesOf(locator, options);
    if (attributes === undefined) {
      return null;
    }
    return attributeToString(attributes[name]);
  }

  async exists(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    return (await this.attributesOf(locator, options)) !== undefined;
  }

  async isVisible(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    const attributes = await this.attributesOf(locator, options);
    if (attributes === undefined) {
      return false;
    }
    if (typeof attributes.visible === 'boolean') {
      return attributes.visible;
    }
    // 旧版 Detox 的 iOS 属性里没有 visible，退化为 hittable
    if (typeof attributes.hittable === 'boolean') {
      return attributes.hittable;
    }
    return true;
  }

  async isEnabled(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    const attributes = await this.attributesOf(locator, options);
    if (attributes === undefined) {
      return false;
    }
    return attributes.enabled !== false;
  }

  async isSelected(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    const attributes = await this.attributesOf(locator, options);
    if (attributes === undefined) {
      return false;
    }
    // RN Switch：iOS 的 value 是 '1'/'0' 字符串，Android 是布尔
    const value = attributes.value;
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value === '1' || value.toLowerCase() === 'true' || value === 'on';
    }
    return attributes.focused === true;
  }

  async count(locator: LocatorLike, options?: BaseActionOptions): Promise<number> {
    const selector = this.selectorOf(locator, options);
    try {
      const element = await this.driver.findElement({ ...selector, index: undefined });
      const raw = await element.getAttributes();
      return toAttributeList(raw).length;
    } catch {
      return 0;
    }
  }

  /* ─────────── 断言 ─────────── */

  /** 取 Detox 的 expect；在非 detox runner 环境下可能缺失，此时回落到属性判定 */
  private detoxExpect(): DetoxModuleLike['expect'] | undefined {
    const candidate = this.runtime().expect;
    return typeof candidate === 'function' ? candidate : undefined;
  }

  async assertExists(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    const expectFn = this.detoxExpect();
    if (expectFn !== undefined) {
      const element = await this.driver.findElement(this.selectorOf(locator, options));
      try {
        await expectFn(element).toExist();
        return;
      } catch (error) {
        throw new AssertionFailedError(
          options?.message ?? `断言失败：元素应存在 —— ${this.resolver.describe(locator)}`,
          { locator: this.resolver.describe(locator), reason: errorMessage(error) },
        );
      }
    }
    if (!(await this.exists(locator, options))) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素应存在 —— ${this.resolver.describe(locator)}`,
        { locator: this.resolver.describe(locator) },
      );
    }
  }

  async assertNotExists(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    const expectFn = this.detoxExpect();
    if (expectFn !== undefined) {
      const element = await this.driver.findElement(this.selectorOf(locator, options));
      try {
        await expectFn(element).toNotExist();
        return;
      } catch (error) {
        throw new AssertionFailedError(
          options?.message ?? `断言失败：元素不应存在 —— ${this.resolver.describe(locator)}`,
          { locator: this.resolver.describe(locator), reason: errorMessage(error) },
        );
      }
    }
    if (await this.exists(locator, options)) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素不应存在 —— ${this.resolver.describe(locator)}`,
        { locator: this.resolver.describe(locator) },
      );
    }
  }

  async assertVisible(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    const expectFn = this.detoxExpect();
    if (expectFn !== undefined) {
      const element = await this.driver.findElement(this.selectorOf(locator, options));
      try {
        await expectFn(element).toBeVisible();
        return;
      } catch (error) {
        throw new AssertionFailedError(
          options?.message ?? `断言失败：元素应可见 —— ${this.resolver.describe(locator)}`,
          { locator: this.resolver.describe(locator), reason: errorMessage(error) },
        );
      }
    }
    if (!(await this.isVisible(locator, options))) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素应可见 —— ${this.resolver.describe(locator)}`,
        { locator: this.resolver.describe(locator) },
      );
    }
  }

  async assertNotVisible(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    const expectFn = this.detoxExpect();
    if (expectFn !== undefined) {
      const element = await this.driver.findElement(this.selectorOf(locator, options));
      try {
        await expectFn(element).toBeNotVisible();
        return;
      } catch (error) {
        throw new AssertionFailedError(
          options?.message ?? `断言失败：元素不应可见 —— ${this.resolver.describe(locator)}`,
          { locator: this.resolver.describe(locator), reason: errorMessage(error) },
        );
      }
    }
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

export class DetoxDeviceActions implements IDeviceActions {
  private readonly driver: DetoxDriver;
  private readonly runConfig: ResolvedRunConfig;
  private readonly config: DetoxFrameworkConfig;
  private readonly logger: ILogger;
  private artifactSink: ArtifactSink | undefined = undefined;
  /** Detox 没有 getOrientation()，只能记录最后一次设置值 */
  private lastOrientation: Orientation;

  constructor(
    driver: DetoxDriver,
    runConfig: ResolvedRunConfig,
    config: DetoxFrameworkConfig,
    logger: ILogger,
  ) {
    this.driver = driver;
    this.runConfig = runConfig;
    this.config = config;
    this.logger = logger.child('DetoxDevice');
    this.lastOrientation = runConfig.device.orientation ?? 'portrait';
  }

  setArtifactSink(sink: ArtifactSink | undefined): void {
    this.artifactSink = sink;
  }

  private get platform(): Platform {
    return this.runConfig.platform;
  }

  /* ── App 生命周期 ── */

  async launchApp(options?: LaunchAppOptions): Promise<void> {
    const params: Record<string, unknown> = {
      newInstance: options?.newInstance ?? true,
      launchArgs: { ...this.config.launchArgs, ...options?.launchArgs },
    };
    if (options?.permissions !== undefined) {
      params['permissions'] = options.permissions;
    } else if (this.runConfig.app.permissions !== undefined) {
      params['permissions'] = this.runConfig.app.permissions;
    }
    if (options?.url !== undefined) {
      params['url'] = options.url;
    }
    if (options?.reinstall === true) {
      // Detox 的 delete:true 会在启动前卸载重装，等价于 reinstall 语义
      params['delete'] = true;
    }
    await this.driver.execute('launchApp', params);
  }

  async terminateApp(appId?: string): Promise<void> {
    await this.driver.execute('terminateApp', { bundleId: appId ?? this.runConfig.appId });
  }

  async reloadApp(options?: LaunchAppOptions): Promise<void> {
    try {
      // RN 应用优先用 reloadReactNative：只重载 JS bundle，比冷启快一个数量级
      await this.driver.execute('reloadReactNative');
    } catch (error) {
      this.logger.debug('reloadReactNative 失败，回落为重新启动 App', { reason: errorMessage(error) });
      await this.launchApp({ ...options, newInstance: true });
    }
  }

  async installApp(binaryPath?: string): Promise<void> {
    await this.driver.execute('installApp', {
      binaryPath: binaryPath ?? this.runConfig.binaryPath,
    });
  }

  async uninstallApp(appId?: string): Promise<void> {
    await this.driver.execute('uninstallApp', { bundleId: appId ?? this.runConfig.appId });
  }

  async sendToBackground(seconds: number): Promise<void> {
    await this.driver.execute('sendToHome');
    await sleep(Math.max(0, seconds) * 1_000);
    // newInstance:false 表示「回到前台」而不是冷启动，保留 App 内状态
    await this.driver.execute('launchApp', { newInstance: false });
  }

  async openUrl(url: string): Promise<void> {
    await this.driver.execute('openURL', { url });
  }

  /* ── 设备状态 ── */

  async setOrientation(orientation: Orientation): Promise<void> {
    await this.driver.execute('setOrientation', { orientation });
    this.lastOrientation = orientation;
  }

  async getOrientation(): Promise<Orientation> {
    // Detox 未提供读取接口，返回最后一次设置值（初始值取自 deviceConfig.orientation）
    return this.lastOrientation;
  }

  async pressBack(): Promise<void> {
    if (this.platform !== 'android') {
      throw new OmniError(
        ERROR_CODES.NOT_IMPLEMENTED,
        'iOS 没有硬件返回键，pressBack() 不可用',
        {
          exitCode: EXIT_CODES.GENERIC,
          details: { platform: this.platform },
          hint: 'iOS 请改为点击导航栏返回按钮，或用 Locator 的 platform 覆盖字段区分两端',
        },
      );
    }
    await this.driver.execute('pressBack');
  }

  async pressHome(): Promise<void> {
    await this.driver.execute('sendToHome');
  }

  async setPermissions(permissions: Readonly<Record<string, string>>): Promise<void> {
    if (Object.keys(permissions).length === 0) {
      return;
    }
    // Detox 的权限只能在启动时授予，无运行时接口 —— 因此这里必须重启 App 才能生效
    this.logger.info('Detox 权限仅在启动时生效，将以新实例重启 App 应用权限', {
      permissions: Object.keys(permissions).join(','),
    });
    await this.driver.execute('launchApp', { newInstance: true, permissions });
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const device: DeviceConfig = this.runConfig.device;
    const extra = device.extraCapabilities ?? {};
    const width = Number(extra['screenWidth'] ?? 0);
    const height = Number(extra['screenHeight'] ?? 0);
    if (width === 0 || height === 0) {
      // Detox 没有屏幕尺寸 API；需要精确尺寸时请在 device 配置的 extraCapabilities 里声明
      this.logger.debug('Detox 无法读取屏幕尺寸，返回 0（可通过 extraCapabilities.screenWidth/Height 补充）');
    }
    return {
      platform: this.platform,
      platformVersion: device.platformVersion ?? 'unknown',
      deviceName: device.deviceName,
      udid: device.udid,
      screen: { width, height },
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
    // Detox 的录屏由 artifacts 插件在 runner 层统一控制，没有命令式的 start/stop API
    this.logger.warn(
      'Detox 不支持命令式录屏；请在 .detoxrc 的 artifacts.plugins.video 中开启（或 detox test --record-videos all）',
    );
  }

  async stopVideoRecording(): Promise<ArtifactRef | null> {
    // 契约允许「不支持的框架返回 null」
    return null;
  }

  async getPageSource(): Promise<string> {
    return this.driver.execute<string>('generateViewHierarchyXml');
  }
}

/* ═══════════════ IAdapter 实现 ═══════════════ */

export class DetoxAdapter implements IAdapter {
  readonly framework: FrameworkKind = 'detox';
  readonly platform: Platform;
  readonly deviceConfig: DeviceConfig;
  readonly actions: IActions;
  readonly device: IDeviceActions;
  readonly locatorResolver: ILocatorResolver;
  readonly driver: DetoxDriver;

  private readonly runConfig: ResolvedRunConfig;
  private readonly logger: ILogger;
  private readonly deviceActionsImpl: DetoxDeviceActions;
  private currentState: AdapterState = 'idle';
  private initPromise: Promise<void> | undefined = undefined;

  constructor(init: AdapterInit) {
    this.runConfig = init.runConfig;
    this.logger = init.logger.child('DetoxAdapter');
    this.platform = init.runConfig.platform;
    this.deviceConfig = init.runConfig.device;

    const config = asDetoxConfig(init.runConfig.frameworkConfig);
    if (config === undefined) {
      throw new OmniError(
        ERROR_CODES.CONFIG_INVALID,
        `DetoxAdapter 要求 frameworkConfig.framework === 'detox'，实际为 '${String(init.runConfig.frameworkConfig.framework)}'`,
        { exitCode: EXIT_CODES.CONFIG_INVALID },
      );
    }

    this.locatorResolver = new DetoxLocatorResolver({
      platform: this.platform,
      testIdAttribute: init.runConfig.app.testIdAttribute,
    });
    this.driver = new DetoxDriver(init.runConfig, this.logger);
    this.actions = new DetoxActions(this.driver, this.locatorResolver, config, this.platform, this.logger);
    this.deviceActionsImpl = new DetoxDeviceActions(this.driver, init.runConfig, config, this.logger);
    this.device = this.deviceActionsImpl;
  }

  get state(): AdapterState {
    return this.currentState;
  }

  get deviceActions(): IDeviceActions {
    return this.deviceActionsImpl;
  }

  setArtifactSink(sink: ArtifactSink | undefined): void {
    this.deviceActionsImpl.setArtifactSink(sink);
  }

  isReady(): boolean {
    return this.currentState === 'ready' && this.driver.isConnected();
  }

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
      // reuseSession 时不强制新实例，保留上一个用例的 App 状态（Detox 的典型加速手段）
      await this.deviceActionsImpl.launchApp({
        newInstance: !this.runConfigReuse(),
        permissions: this.runConfig.app.permissions,
      });
      if (this.deviceConfig.orientation !== undefined) {
        await this.deviceActionsImpl.setOrientation(this.deviceConfig.orientation).catch(() => undefined);
      }
      this.currentState = 'ready';
      this.logger.info('DetoxAdapter 就绪', {
        platform: this.platform,
        app: String(this.runConfig.app.key),
      });
    } catch (error) {
      this.currentState = 'error';
      throw error;
    }
  }

  private runConfigReuse(): boolean {
    const config = asDetoxConfig(this.runConfig.frameworkConfig);
    return config?.reuseSession ?? false;
  }

  async dispose(): Promise<void> {
    if (this.currentState === 'disposed' || this.currentState === 'disposing') {
      return;
    }
    this.currentState = 'disposing';
    try {
      await this.driver.disconnect();
    } catch (error) {
      this.logger.warn('释放 DetoxAdapter 时出错（已吞掉）', { reason: errorMessage(error) });
    } finally {
      this.currentState = 'disposed';
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return this.driver.healthCheck();
  }
}

/** 适配器模块契约要求的工厂函数 */
export const createAdapter: CreateAdapterFn = (init: AdapterInit): IAdapter => new DetoxAdapter(init);
