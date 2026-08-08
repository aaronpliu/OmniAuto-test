import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { promises as fsPromises } from 'node:fs';
import * as nodePath from 'node:path';

import type {
  AdapterState,
  ArtifactKind,
  ArtifactRef,
  DeviceConfig,
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
import { describeLocator } from '../../contracts/IElementLocator';
import { ensureDir, sanitizePathSegment, toRelativePath } from '../../utils/paths';
import { sleep, waitFor } from '../../utils/wait';
import { XCUITestLocatorResolver } from './XCUITestLocatorResolver';
import type { XCUITestElementHandle, XCUITestElementSnapshot } from './XCUITestDriver';
import { asXCUITestConfig, DEFAULT_XCRUN_PATH, XCUITestDriver } from './XCUITestDriver';

/**
 * XCUITest 适配器：把统一动作契约翻译成 NDJSON 桥接命令。
 *
 * 【命令命名空间约定（与 Swift Runner 的唯一契约）】
 * - `element.*` 作用于已解析的元素句柄；
 * - `device.*` 作用于 XCUIDevice / XCUIApplication 全局；
 * - `app.*`    作用于被测 App 生命周期。
 * Runner 必须实现本文件用到的全部命令；未实现的命令会以 BridgeError 形式暴露，
 * 不会被适配器静默吞掉 —— 这是「桥接未就绪」与「用例真失败」可区分的前提。
 *
 * 【为什么装包/权限/录屏走 simctl 而不是桥接】
 * 这三件事发生在 App 进程之外（甚至在 App 尚未安装时），XCTest Runner 活在 App 进程里，
 * 根本没有执行它们的时机与权限。所以由 Node 侧直接调 `xcrun simctl` 完成，
 * 这也是 Xcode 官方工具链的标准做法。
 */

/* ═══════════════ 产物落盘回调 ═══════════════ */

/** 上层（setup/report 层）注入的产物落盘策略 */
export type ArtifactSink = (
  kind: ArtifactKind,
  data: Buffer,
  options?: ScreenshotOptions,
) => Promise<ArtifactRef>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 文本匹配判定，assertText / waitForText 共用，保证两者语义一致 */
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

/** 默认产物落盘 */
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
  const base = sanitizePathSegment(options?.name ?? `xcuitest-${kind}`);
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

/** 元素探测结果（一次往返同时回答 存在/可见/可用/选中/数量） */
interface ProbeResult {
  readonly found: boolean;
  readonly count: number;
  readonly snapshot?: XCUITestElementSnapshot;
}

/** 执行 xcrun 子命令并返回 stdout；失败抛 OmniError */
function runXcrun(
  xcrunPath: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(xcrunPath, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new OmniError(
        ERROR_CODES.ACTION_TIMEOUT,
        `xcrun ${args.join(' ')} 超时（${String(timeoutMs)}ms）`,
      ));
    }, timeoutMs);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(new OmniError(
        ERROR_CODES.NOT_IMPLEMENTED,
        `无法执行 xcrun：${error.message}`,
        { cause: error },
      ));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new OmniError(
        ERROR_CODES.DRIVER_CONNECTION,
        `xcrun ${args.join(' ')} 失败（exit=${String(code)}）：${stderr.trim() || stdout.trim()}`,
        { details: { args, code } },
      ));
    });
  });
}

/* ═══════════════ IActions 实现 ═══════════════ */

export class XCUITestActions implements IActions {
  private readonly driver: XCUITestDriver;
  private readonly resolver: XCUITestLocatorResolver;
  private readonly logger: ILogger;
  private readonly defaultActionTimeoutMs: number;
  private readonly defaultWaitTimeoutMs: number;
  private readonly defaultIntervalMs: number;

  constructor(
    resolver: XCUITestLocatorResolver,
    driver: XCUITestDriver,
    runConfig: ResolvedRunConfig,
    logger: ILogger,
  ) {
    this.driver = driver;
    this.resolver = resolver;
    this.logger = logger.child('xcuitest:actions');
    this.defaultActionTimeoutMs = runConfig.frameworkConfig.actionTimeoutMs;
    this.defaultWaitTimeoutMs = runConfig.frameworkConfig.waitTimeoutMs;
    this.defaultIntervalMs = runConfig.frameworkConfig.waitIntervalMs;
  }

  /* ── 内部工具 ── */

  resolveSelector(locator: LocatorLike): NativeSelector {
    return this.resolver.resolve(locator);
  }

  /** 应用 options.index 覆盖后的选择器 */
  private selectorFor(locator: LocatorLike, options?: BaseActionOptions): NativeSelector {
    const selector = this.resolver.resolve(locator);
    if (options?.index === undefined) {
      return selector;
    }
    return { ...selector, index: options.index };
  }

  /** 解析元素句柄；默认先等可见 */
  private async element(
    locator: LocatorLike,
    options?: BaseActionOptions,
  ): Promise<XCUITestElementHandle> {
    const selector = this.selectorFor(locator, options);
    const timeoutMs = options?.timeoutMs ?? this.defaultActionTimeoutMs;
    const requireVisible = options?.waitForVisible ?? true;
    const result = await this.driver.send<{
      handle?: string;
      found?: boolean;
      snapshot?: XCUITestElementSnapshot;
    }>(
      'element.find',
      {
        query: selector.raw,
        index: selector.index,
        timeoutMs,
        requireVisible,
      },
      timeoutMs + this.driver.commandTimeoutMs,
    );
    if (result.found === false || result.handle === undefined || result.handle === '') {
      throw new ElementNotFoundError(selector.description, timeoutMs);
    }
    return { handle: result.handle, description: selector.description, snapshot: result.snapshot };
  }

  /** 一次往返拿到存在性 / 可见性 / 数量；不抛异常语义由调用方决定 */
  private async probe(
    locator: LocatorLike,
    options?: BaseActionOptions,
    timeoutOverrideMs?: number,
  ): Promise<ProbeResult> {
    const selector = this.selectorFor(locator, options);
    const timeoutMs = timeoutOverrideMs ?? options?.timeoutMs ?? 0;
    const result = await this.driver.send<{
      found?: boolean;
      count?: number;
      snapshot?: XCUITestElementSnapshot;
    }>(
      'element.probe',
      { query: selector.raw, index: selector.index, timeoutMs },
      timeoutMs + this.driver.commandTimeoutMs,
    );
    return {
      found: result.found === true,
      count: result.count ?? (result.found === true ? 1 : 0),
      snapshot: result.snapshot,
    };
  }

  /** 探测但吞掉桥接异常，供 exists / isVisible 这类「不抛异常」的查询使用 */
  private async safeProbe(
    locator: LocatorLike,
    options?: BaseActionOptions,
  ): Promise<ProbeResult> {
    try {
      return await this.probe(locator, options);
    } catch (error) {
      this.logger.debug(`probe 失败，按「不存在」处理：${errorMessage(error)}`, {
        locator: describeLocator(locator),
      });
      return { found: false, count: 0 };
    }
  }

  /** 读取元素最新属性快照 */
  private async attributes(handle: XCUITestElementHandle): Promise<XCUITestElementSnapshot> {
    return await this.driver.send<XCUITestElementSnapshot>('element.attributes', {
      handle: handle.handle,
    });
  }

  private waitOptions(options?: WaitOptions): { timeoutMs: number; intervalMs: number } {
    return {
      timeoutMs: options?.timeoutMs ?? this.defaultWaitTimeoutMs,
      intervalMs: options?.intervalMs ?? this.defaultIntervalMs,
    };
  }

  /* ── 交互 ── */

  async tap(locator: LocatorLike, options?: TapOptions): Promise<void> {
    const element = await this.element(locator, options);
    await this.driver.send('element.tap', {
      handle: element.handle,
      offsetX: options?.offset?.x,
      offsetY: options?.offset?.y,
    });
    this.logger.debug(`tap ${element.description}`);
  }

  async doubleTap(locator: LocatorLike, options?: TapOptions): Promise<void> {
    const element = await this.element(locator, options);
    await this.driver.send('element.doubleTap', {
      handle: element.handle,
      offsetX: options?.offset?.x,
      offsetY: options?.offset?.y,
    });
  }

  async longPress(locator: LocatorLike, options?: LongPressOptions): Promise<void> {
    const element = await this.element(locator, options);
    const durationMs = options?.durationMs ?? 1000;
    await this.driver.send(
      'element.press',
      { handle: element.handle, durationMs },
      durationMs + this.driver.commandTimeoutMs,
    );
  }

  async tapAt(x: number, y: number, options?: BaseActionOptions): Promise<void> {
    // XCUITest 支持坐标点击：app.coordinate(withNormalizedOffset:.zero).withOffset(vector).tap()
    await this.driver.send(
      'device.tapAt',
      { x, y },
      options?.timeoutMs ?? this.defaultActionTimeoutMs,
    );
  }

  /* ── 输入 ── */

  async typeText(locator: LocatorLike, text: string, options?: TypeTextOptions): Promise<void> {
    const element = await this.element(locator, options);
    const clearFirst = options?.clearFirst ?? true;
    const submit = options?.submit ?? false;
    const hideKeyboardAfter = options?.hideKeyboardAfter ?? true;
    const typeDelayMs = options?.typeDelayMs ?? 0;
    const timeoutMs = options?.timeoutMs ?? this.defaultActionTimeoutMs;

    await this.driver.send(
      'element.typeText',
      {
        handle: element.handle,
        text,
        clearFirst,
        submit,
        typeDelayMs,
      },
      // 逐字输入时总耗时与文本长度线性相关，超时必须按字数放大，否则长文本必超时
      timeoutMs + typeDelayMs * text.length + this.driver.commandTimeoutMs,
    );

    if (hideKeyboardAfter && !submit) {
      await this.dismissKeyboard();
    }
  }

  async clearText(locator: LocatorLike, options?: BaseActionOptions): Promise<void> {
    const element = await this.element(locator, options);
    await this.driver.send('element.clearText', { handle: element.handle });
  }

  async replaceText(locator: LocatorLike, text: string, options?: TypeTextOptions): Promise<void> {
    await this.typeText(locator, text, { ...options, clearFirst: true });
  }

  async dismissKeyboard(): Promise<void> {
    try {
      await this.driver.send('device.dismissKeyboard', {});
    } catch (error) {
      // 键盘本来就没弹出时 Runner 会报错，这属于良性失败
      this.logger.debug(`收起键盘失败（可能键盘未弹出）：${errorMessage(error)}`);
    }
  }

  /* ── 滚动 / 滑动 ── */

  async scroll(container: LocatorLike, options?: ScrollOptions): Promise<void> {
    const element = await this.element(container, options);
    const direction: SwipeDirection = options?.direction ?? 'down';
    await this.driver.send('element.scroll', {
      handle: element.handle,
      direction,
      distance: options?.distance,
      percent: options?.percent ?? 0.75,
    });
  }

  async scrollTo(container: LocatorLike, options: ScrollToOptions): Promise<void> {
    const maxSwipes = options.maxSwipes ?? 10;
    const direction: SwipeDirection = options.direction ?? 'down';
    const percent = options.percent ?? 0.75;
    const containerElement = await this.element(container, options);

    for (let attempt = 0; attempt <= maxSwipes; attempt += 1) {
      const probe = await this.safeProbe(options.target, { timeoutMs: 0 });
      if (probe.found && probe.snapshot?.visible !== false) {
        return;
      }
      if (attempt === maxSwipes) {
        break;
      }
      await this.driver.send('element.scroll', {
        handle: containerElement.handle,
        direction,
        distance: options.distance,
        percent,
      });
    }

    throw new ElementNotFoundError(
      describeLocator(options.target),
      (options.timeoutMs ?? this.defaultWaitTimeoutMs),
    );
  }

  async swipe(target: LocatorLike | null, options: SwipeOptions): Promise<void> {
    const percent = options.percent ?? 0.6;
    const durationMs = options.durationMs ?? 300;
    if (target === null) {
      await this.driver.send('device.swipe', {
        direction: options.direction,
        percent,
        durationMs,
      });
      return;
    }
    const element = await this.element(target, options);
    await this.driver.send('element.swipe', {
      handle: element.handle,
      direction: options.direction,
      percent,
      durationMs,
    });
  }

  async pullToRefresh(container: LocatorLike, options?: BaseActionOptions): Promise<void> {
    const element = await this.element(container, options);
    await this.driver.send('element.swipe', {
      handle: element.handle,
      direction: 'down',
      percent: 0.6,
      durationMs: 500,
    });
    // 给刷新动画一个起手时间，否则紧随其后的断言会读到刷新前的旧内容
    await sleep(500);
  }

  /* ── 等待 ── */

  async waitForVisible(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const { timeoutMs, intervalMs } = this.waitOptions(options);
    await waitFor(
      async () => {
        const probe = await this.safeProbe(locator, { timeoutMs: 0 });
        return probe.found && probe.snapshot?.visible !== false;
      },
      {
        timeoutMs,
        intervalMs,
        message: options?.message ?? `等待可见：${describeLocator(locator)}`,
      },
    );
  }

  async waitForNotVisible(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const { timeoutMs, intervalMs } = this.waitOptions(options);
    await waitFor(
      async () => {
        const probe = await this.safeProbe(locator, { timeoutMs: 0 });
        return !probe.found || probe.snapshot?.visible === false;
      },
      {
        timeoutMs,
        intervalMs,
        message: options?.message ?? `等待不可见：${describeLocator(locator)}`,
      },
    );
  }

  async waitForExist(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const { timeoutMs, intervalMs } = this.waitOptions(options);
    await waitFor(
      async () => (await this.safeProbe(locator, { timeoutMs: 0 })).found,
      {
        timeoutMs,
        intervalMs,
        message: options?.message ?? `等待存在：${describeLocator(locator)}`,
      },
    );
  }

  async waitForGone(locator: LocatorLike, options?: WaitOptions): Promise<void> {
    const { timeoutMs, intervalMs } = this.waitOptions(options);
    await waitFor(
      async () => !(await this.safeProbe(locator, { timeoutMs: 0 })).found,
      {
        timeoutMs,
        intervalMs,
        message: options?.message ?? `等待消失：${describeLocator(locator)}`,
      },
    );
  }

  async waitForText(
    locator: LocatorLike,
    expected: string,
    options?: AssertTextOptions & WaitOptions,
  ): Promise<void> {
    const { timeoutMs, intervalMs } = this.waitOptions(options);
    await waitFor(
      async () => {
        try {
          const actual = await this.getText(locator, { ...options, waitForVisible: false });
          return textMatches(actual, expected, options?.match ?? 'exact', options?.ignoreCase);
        } catch {
          return false;
        }
      },
      {
        timeoutMs,
        intervalMs,
        message: options?.message ?? `等待文本「${expected}」：${describeLocator(locator)}`,
      },
    );
  }

  async waitUntil(predicate: () => Promise<boolean>, options?: WaitOptions): Promise<void> {
    const { timeoutMs, intervalMs } = this.waitOptions(options);
    await waitFor(predicate, {
      timeoutMs,
      intervalMs,
      message: options?.message ?? 'waitUntil',
    });
  }

  /* ── 查询 ── */

  /** 从快照中按 label → value → title → placeholder 的优先级取「用户看到的文字」 */
  private snapshotText(snapshot: XCUITestElementSnapshot): string {
    const candidates = [
      snapshot.label,
      snapshot.value,
      snapshot.title,
      snapshot.placeholderValue,
    ];
    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== '') {
        return candidate;
      }
    }
    return '';
  }

  async getText(locator: LocatorLike, options?: BaseActionOptions): Promise<string> {
    const element = await this.element(locator, { waitForVisible: false, ...options });
    const snapshot = await this.attributes(element);
    return this.snapshotText(snapshot);
  }

  async getValue(locator: LocatorLike, options?: BaseActionOptions): Promise<string | null> {
    const element = await this.element(locator, { waitForVisible: false, ...options });
    const snapshot = await this.attributes(element);
    return snapshot.value ?? null;
  }

  async getAttribute(
    locator: LocatorLike,
    name: string,
    options?: BaseActionOptions,
  ): Promise<string | null> {
    const element = await this.element(locator, { waitForVisible: false, ...options });
    const result = await this.driver.send<{ value?: unknown }>('element.attribute', {
      handle: element.handle,
      name,
    });
    const value = result.value;
    if (value === undefined || value === null) {
      return null;
    }
    return typeof value === 'string' ? value : String(value);
  }

  async exists(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    return (await this.safeProbe(locator, options)).found;
  }

  async isVisible(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    const probe = await this.safeProbe(locator, options);
    return probe.found && probe.snapshot?.visible !== false;
  }

  async isEnabled(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    const probe = await this.safeProbe(locator, options);
    return probe.found && probe.snapshot?.enabled !== false;
  }

  async isSelected(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean> {
    const probe = await this.safeProbe(locator, options);
    return probe.found && probe.snapshot?.selected === true;
  }

  async count(locator: LocatorLike, options?: BaseActionOptions): Promise<number> {
    // count 语义要求「同类元素全部数量」，index 会把结果缩到 1，故显式剥掉
    const probe = await this.safeProbe(locator, { ...options, index: undefined });
    return probe.count;
  }

  /* ── 断言 ── */

  async assertExists(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (!(await this.exists(locator, options))) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素应存在但未找到 —— ${describeLocator(locator)}`,
        { locator: describeLocator(locator) },
      );
    }
  }

  async assertNotExists(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (await this.exists(locator, options)) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素不应存在但已找到 —— ${describeLocator(locator)}`,
        { locator: describeLocator(locator) },
      );
    }
  }

  async assertVisible(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (!(await this.isVisible(locator, options))) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素应可见 —— ${describeLocator(locator)}`,
        { locator: describeLocator(locator) },
      );
    }
  }

  async assertNotVisible(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (await this.isVisible(locator, options)) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素不应可见 —— ${describeLocator(locator)}`,
        { locator: describeLocator(locator) },
      );
    }
  }

  async assertText(
    locator: LocatorLike,
    expected: string,
    options?: AssertTextOptions,
  ): Promise<void> {
    const actual = await this.getText(locator, { waitForVisible: false, ...options });
    if (!textMatches(actual, expected, options?.match ?? 'exact', options?.ignoreCase)) {
      throw new AssertionFailedError(
        options?.message
        ?? `断言失败：文本不匹配 —— ${describeLocator(locator)}，期望「${expected}」实际「${actual}」`,
        { locator: describeLocator(locator), expected, actual, match: options?.match ?? 'exact' },
      );
    }
  }

  async assertValue(
    locator: LocatorLike,
    expected: string,
    options?: AssertTextOptions,
  ): Promise<void> {
    const actual = await this.getValue(locator, { waitForVisible: false, ...options });
    if (actual === null || !textMatches(actual, expected, options?.match ?? 'exact', options?.ignoreCase)) {
      throw new AssertionFailedError(
        options?.message
        ?? `断言失败：值不匹配 —— ${describeLocator(locator)}，期望「${expected}」实际「${String(actual)}」`,
        { locator: describeLocator(locator), expected, actual },
      );
    }
  }

  async assertEnabled(locator: LocatorLike, options?: AssertTextOptions): Promise<void> {
    if (!(await this.isEnabled(locator, options))) {
      throw new AssertionFailedError(
        options?.message ?? `断言失败：元素应可用 —— ${describeLocator(locator)}`,
        { locator: describeLocator(locator) },
      );
    }
  }

  async assertCount(
    locator: LocatorLike,
    expected: number,
    options?: AssertTextOptions,
  ): Promise<void> {
    const actual = await this.count(locator, options);
    if (actual !== expected) {
      throw new AssertionFailedError(
        options?.message
        ?? `断言失败：数量不匹配 —— ${describeLocator(locator)}，期望 ${String(expected)} 实际 ${String(actual)}`,
        { locator: describeLocator(locator), expected, actual },
      );
    }
  }
}

/* ═══════════════ IDeviceActions 实现 ═══════════════ */

export class XCUITestDeviceActions implements IDeviceActions {
  private readonly driver: XCUITestDriver;
  private readonly runConfig: ResolvedRunConfig;
  private readonly logger: ILogger;
  private readonly xcrunPath: string;
  private artifactSink: ArtifactSink | undefined = undefined;
  private videoProcess: ChildProcess | undefined = undefined;
  private videoPath: string | undefined = undefined;
  private lastOrientation: Orientation;

  constructor(driver: XCUITestDriver, runConfig: ResolvedRunConfig, logger: ILogger) {
    this.driver = driver;
    this.runConfig = runConfig;
    this.logger = logger.child('xcuitest:device');
    const config = asXCUITestConfig(runConfig.frameworkConfig);
    this.xcrunPath = config?.xcrunPath !== undefined && config.xcrunPath !== ''
      ? config.xcrunPath
      : DEFAULT_XCRUN_PATH;
    this.lastOrientation = runConfig.device.orientation ?? 'portrait';
  }

  /** 注入上层的产物落盘策略 */
  setArtifactSink(sink: ArtifactSink | undefined): void {
    this.artifactSink = sink;
  }

  /** simctl 的设备定位符：优先 udid，其次已启动设备 */
  private get simctlTarget(): string {
    const udid = this.runConfig.device.udid;
    return udid !== undefined && udid !== '' ? udid : 'booted';
  }

  private get isSimulator(): boolean {
    return this.runConfig.device.kind !== 'real';
  }

  /* ── App 生命周期 ── */

  async launchApp(options?: LaunchAppOptions): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? this.runConfig.frameworkConfig.startupTimeoutMs;
    await this.driver.send(
      'app.launch',
      {
        appId: this.runConfig.appId,
        newInstance: options?.newInstance ?? true,
        launchArgs: { ...this.runConfig.app.launchArgs, ...options?.launchArgs },
        permissions: { ...this.runConfig.app.permissions, ...options?.permissions },
        url: options?.url,
      },
      timeoutMs,
    );
    this.logger.info('App 已启动', { appId: this.runConfig.appId });
  }

  async terminateApp(appId?: string): Promise<void> {
    await this.driver.send('app.terminate', { appId: appId ?? this.runConfig.appId });
  }

  async reloadApp(options?: LaunchAppOptions): Promise<void> {
    await this.terminateApp();
    await this.launchApp({ ...options, newInstance: true });
  }

  async installApp(binaryPath?: string): Promise<void> {
    const target = binaryPath ?? this.runConfig.binaryPath;
    if (target === undefined || target === '') {
      throw new OmniError(
        ERROR_CODES.CONFIG_MISSING_FIELD,
        '未提供安装包路径：请在 App 配置中设置 ios.binaryPath 或显式传入 binaryPath',
      );
    }
    if (!this.isSimulator) {
      throw new OmniError(
        ERROR_CODES.NOT_IMPLEMENTED,
        'iOS 真机安装需依赖 ios-deploy / devicectl，本适配器仅支持模拟器安装',
        { hint: '真机请在 CI 步骤中预装 App，再由本框架 launchApp' },
      );
    }
    await runXcrun(this.xcrunPath, ['simctl', 'install', this.simctlTarget, target], 180_000);
    this.logger.info('App 已安装', { binaryPath: target });
  }

  async uninstallApp(appId?: string): Promise<void> {
    if (!this.isSimulator) {
      throw new OmniError(
        ERROR_CODES.NOT_IMPLEMENTED,
        'iOS 真机卸载不受支持，请手动或通过 devicectl 处理',
      );
    }
    await runXcrun(
      this.xcrunPath,
      ['simctl', 'uninstall', this.simctlTarget, appId ?? this.runConfig.appId],
      120_000,
    );
  }

  async sendToBackground(seconds: number): Promise<void> {
    await this.driver.send(
      'device.background',
      { seconds },
      seconds * 1000 + this.driver.commandTimeoutMs,
    );
  }

  async openUrl(url: string): Promise<void> {
    try {
      await this.driver.send('device.openUrl', { url });
    } catch (error) {
      if (!this.isSimulator) {
        throw error;
      }
      // Runner 未实现 openUrl 时退回 simctl —— 两者对模拟器等价，且 simctl 一定可用
      this.logger.debug(`桥接 openUrl 失败，回退 simctl：${errorMessage(error)}`);
      await runXcrun(this.xcrunPath, ['simctl', 'openurl', this.simctlTarget, url], 60_000);
    }
  }

  /* ── 设备状态 ── */

  async setOrientation(orientation: Orientation): Promise<void> {
    await this.driver.send('device.setOrientation', { orientation });
    this.lastOrientation = orientation;
  }

  async getOrientation(): Promise<Orientation> {
    try {
      const result = await this.driver.send<{ orientation?: string }>('device.getOrientation', {});
      const raw = (result.orientation ?? '').toLowerCase();
      if (raw.includes('landscape')) {
        this.lastOrientation = 'landscape';
      } else if (raw.includes('portrait')) {
        this.lastOrientation = 'portrait';
      }
      return this.lastOrientation;
    } catch (error) {
      // XCUIDevice.orientation 在部分 iOS 版本上返回 .unknown，退回本地记账值
      this.logger.debug(`读取方向失败，返回最近一次设置值：${errorMessage(error)}`);
      return this.lastOrientation;
    }
  }

  async pressBack(): Promise<void> {
    throw new OmniError(
      ERROR_CODES.NOT_IMPLEMENTED,
      'iOS 没有硬件返回键，pressBack() 在 XCUITest 上不可用',
      { hint: '请改用页面内的返回按钮（如 navigationBar 的 Back），或 device.sendToBackground()' },
    );
  }

  async pressHome(): Promise<void> {
    await this.driver.send('device.pressHome', {});
  }

  async setPermissions(permissions: Readonly<Record<string, string>>): Promise<void> {
    if (!this.isSimulator) {
      throw new OmniError(
        ERROR_CODES.NOT_IMPLEMENTED,
        'iOS 真机不支持通过 simctl 预授权权限',
      );
    }
    for (const [service, decision] of Object.entries(permissions)) {
      const normalized = decision.toUpperCase();
      const action = normalized === 'YES'
        ? 'grant'
        : normalized === 'NO'
          ? 'revoke'
          : 'reset';
      await runXcrun(
        this.xcrunPath,
        ['simctl', 'privacy', this.simctlTarget, action, service, this.runConfig.appId],
        60_000,
      );
    }
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const result = await this.driver.send<{
      platformVersion?: string;
      deviceName?: string;
      udid?: string;
      screen?: { width?: number; height?: number; scale?: number };
    }>('device.info', {});
    const device: DeviceConfig = this.runConfig.device;
    return {
      platform: 'ios',
      platformVersion: result.platformVersion ?? device.platformVersion ?? 'unknown',
      deviceName: result.deviceName ?? device.deviceName,
      udid: result.udid ?? device.udid,
      screen: {
        width: result.screen?.width ?? 0,
        height: result.screen?.height ?? 0,
        scale: result.screen?.scale,
      },
    };
  }

  /* ── 产物采集 ── */

  async captureScreenshotBuffer(): Promise<Buffer> {
    return await this.driver.screenshot();
  }

  async takeScreenshot(options?: ScreenshotOptions): Promise<ArtifactRef> {
    const buffer = await this.captureScreenshotBuffer();
    if (this.artifactSink !== undefined) {
      return await this.artifactSink('screenshot', buffer, options);
    }
    return await writeArtifactToDisk(this.runConfig, 'screenshot', buffer, options, 'png');
  }

  async startVideoRecording(options?: ScreenshotOptions): Promise<void> {
    if (!this.isSimulator) {
      this.logger.warn('iOS 真机不支持 simctl 录屏，已跳过');
      return;
    }
    if (this.videoProcess !== undefined) {
      this.logger.warn('已有录屏在进行中，忽略本次 startVideoRecording');
      return;
    }
    const dir = ensureDir(this.runConfig.paths.videosDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = sanitizePathSegment(options?.name ?? 'xcuitest-video');
    const target = nodePath.join(dir, `${base}-${stamp}.mp4`);
    this.videoPath = target;
    this.videoProcess = spawn(
      this.xcrunPath,
      ['simctl', 'io', this.simctlTarget, 'recordVideo', '--codec=h264', '--force', target],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    this.videoProcess.on('error', (error: Error) => {
      this.logger.warn(`录屏进程异常：${error.message}`);
    });
    this.logger.info('开始录屏', { path: target });
  }

  async stopVideoRecording(): Promise<ArtifactRef | null> {
    const child = this.videoProcess;
    const target = this.videoPath;
    this.videoProcess = undefined;
    this.videoPath = undefined;
    if (child === undefined || target === undefined) {
      return null;
    }
    // simctl recordVideo 只有收到 SIGINT 才会写出 moov box，SIGTERM/SIGKILL 会留下不可播放的残片
    child.kill('SIGINT');
    const deadline = Date.now() + 15_000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
      await sleep(100);
    }
    try {
      const data = await fsPromises.readFile(target);
      if (this.artifactSink !== undefined) {
        return await this.artifactSink('video', data, undefined);
      }
      return {
        kind: 'video',
        path: target,
        relativePath: toRelativePath(target, this.runConfig.paths.projectRoot),
        createdAt: new Date().toISOString(),
        bytes: data.byteLength,
      };
    } catch (error) {
      this.logger.warn(`读取录屏文件失败：${errorMessage(error)}`);
      return null;
    }
  }

  async getPageSource(): Promise<string> {
    const result = await this.driver.send<{ source?: string }>('device.pageSource', {});
    return result.source ?? '';
  }
}

/* ═══════════════ IAdapter 实现 ═══════════════ */

export class XCUITestAdapter implements IAdapter {
  readonly framework: FrameworkKind = 'xcuitest';
  readonly platform: Platform = 'ios';
  readonly deviceConfig: DeviceConfig;

  readonly driver: XCUITestDriver;
  readonly locatorResolver: ILocatorResolver;
  readonly actions: IActions;
  readonly device: IDeviceActions;

  private readonly runConfig: ResolvedRunConfig;
  private readonly logger: ILogger;
  private readonly deviceActionsImpl: XCUITestDeviceActions;
  private currentState: AdapterState = 'idle';
  private initPromise: Promise<void> | undefined = undefined;

  constructor(init: AdapterInit) {
    this.runConfig = init.runConfig;
    this.logger = init.logger.child('xcuitest:adapter');
    this.deviceConfig = init.runConfig.device;

    this.driver = new XCUITestDriver(init.runConfig, init.logger);
    // 先用具体类型持有，再窄化为契约类型暴露出去，避免对外字段回头做 as 断言
    const resolver = new XCUITestLocatorResolver({
      testIdAttribute: init.runConfig.app.testIdAttribute?.ios,
    });
    this.locatorResolver = resolver;
    this.actions = new XCUITestActions(resolver, this.driver, init.runConfig, init.logger);
    this.deviceActionsImpl = new XCUITestDeviceActions(this.driver, init.runConfig, init.logger);
    this.device = this.deviceActionsImpl;
  }

  get state(): AdapterState {
    return this.currentState;
  }

  /** 注入上层的产物落盘策略（setup 层调用） */
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
    // 并发调用共享同一个 promise：jest 的 beforeAll 与脚本内的兜底 init 可能同时触发，
    // 各自拉起一个 xcodebuild 会直接抢占同一台模拟器
    if (this.initPromise !== undefined) {
      return await this.initPromise;
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
      // Runner 启动时 App 已在前台（XCTest 会自动 launch），这里再显式 launch 一次
      // 以应用 launchArgs / permissions，并把 App 复位到初始页面
      await this.device.launchApp({ newInstance: true });
      this.currentState = 'ready';
      this.logger.info('XCUITest 适配器就绪');
    } catch (error) {
      this.currentState = 'error';
      await this.driver.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this.currentState === 'disposed' || this.currentState === 'disposing') {
      return;
    }
    this.currentState = 'disposing';
    try {
      await this.deviceActionsImpl.stopVideoRecording();
    } catch (error) {
      this.logger.debug(`停止录屏失败：${errorMessage(error)}`);
    }
    try {
      await this.driver.disconnect();
    } catch (error) {
      this.logger.warn(`释放 XCUITest 资源时出错：${errorMessage(error)}`);
    }
    this.currentState = 'disposed';
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return await this.driver.healthCheck();
  }
}

/** 符合 `CreateAdapterFn` 的工厂函数 */
export const createAdapter: CreateAdapterFn = (init: AdapterInit): IAdapter =>
  new XCUITestAdapter(init);
