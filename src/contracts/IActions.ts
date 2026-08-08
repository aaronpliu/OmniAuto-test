import type {
  AdapterState,
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
} from './types';
import type { ILocatorResolver, LocatorLike, NativeSelector } from './IElementLocator';

/**
 * 统一动作契约（C-02）。全部方法为 async。
 * 脚本作者只通过本接口与设备交互，不感知底层框架。
 *
 * 【为什么全部 async，包括看起来同步的查询】
 * Detox 的 matcher 求值、Appium 的 W3C 命令、XCUITest 的桥接往返本质都是异步的。
 * 若为「本地可同步计算」的方法开同步口子，脚本就会在不同框架下呈现不同的书写形态，
 * 破坏「一份脚本零改动跨框架」的核心承诺。唯一例外是 `resolveSelector` ——
 * 它是纯函数翻译，不触碰设备，故保持同步。
 */

/* ═══════════════ Options ═══════════════ */

export interface BaseActionOptions {
  /** 覆盖框架默认动作超时 */
  readonly timeoutMs?: number;
  /** 多命中时的下标，等价于 Locator.index，优先级更高 */
  readonly index?: number;
  /** 执行前是否等待元素可见，默认 true */
  readonly waitForVisible?: boolean;
}

export interface TapOptions extends BaseActionOptions {
  /** 相对元素左上角的偏移点击 */
  readonly offset?: { readonly x: number; readonly y: number };
}

export interface LongPressOptions extends BaseActionOptions {
  /** 按压时长，默认 1000 */
  readonly durationMs?: number;
}

export interface TypeTextOptions extends BaseActionOptions {
  /** 输入前先清空，默认 true */
  readonly clearFirst?: boolean;
  /** 输入后触发回车/提交 */
  readonly submit?: boolean;
  /** 输入后收起键盘，默认 true */
  readonly hideKeyboardAfter?: boolean;
  /** 逐字输入间隔（部分框架需要），默认 0 */
  readonly typeDelayMs?: number;
}

export interface WaitOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  /** 超时报错时附加的业务语义说明 */
  readonly message?: string;
}

export interface ScrollOptions extends BaseActionOptions {
  readonly direction?: SwipeDirection;
  /** 单次滚动距离（像素），未传则按容器高度的 percent 计算 */
  readonly distance?: number;
  /** 单次滚动占容器比例，0~1，默认 0.75 */
  readonly percent?: number;
  /** 最大滚动次数，默认 10 */
  readonly maxSwipes?: number;
}

export interface ScrollToOptions extends ScrollOptions {
  /** 滚动过程中每次检查该元素是否可见 */
  readonly target: LocatorLike;
}

export interface SwipeOptions extends BaseActionOptions {
  readonly direction: SwipeDirection;
  /** 滑动幅度占参考区域比例，0~1，默认 0.6 */
  readonly percent?: number;
  /** 滑动时长，默认 300 */
  readonly durationMs?: number;
}

export interface AssertTextOptions extends BaseActionOptions {
  readonly match?: TextMatchMode;
  readonly ignoreCase?: boolean;
  /** 自定义失败信息 */
  readonly message?: string;
}

export interface LaunchAppOptions {
  /** 是否强制新实例（先 terminate 再 launch），默认 true */
  readonly newInstance?: boolean;
  readonly launchArgs?: Readonly<Record<string, string | number | boolean>>;
  readonly permissions?: Readonly<Record<string, string>>;
  /** 通过 deep link 启动 */
  readonly url?: string;
  /** 启动前删除并重装（Detox 支持） */
  readonly reinstall?: boolean;
  readonly timeoutMs?: number;
}

export interface ScreenshotOptions {
  /** 文件名主体，缺省用当前用例名 */
  readonly name?: string;
  /** 附加标签，写进 ArtifactRef.label */
  readonly label?: string;
}

export interface DeviceInfo {
  readonly platform: Platform;
  readonly platformVersion: string;
  readonly deviceName: string;
  readonly udid?: string;
  readonly screen: {
    readonly width: number;
    readonly height: number;
    readonly scale?: number;
  };
}

/* ═══════════════ IActions：元素级动作全集 ═══════════════ */

export interface IActions {
  /* ── 交互 ── */
  /** 点击元素 */
  tap(locator: LocatorLike, options?: TapOptions): Promise<void>;
  /** 双击 */
  doubleTap(locator: LocatorLike, options?: TapOptions): Promise<void>;
  /** 长按 */
  longPress(locator: LocatorLike, options?: LongPressOptions): Promise<void>;
  /** 按坐标点击（逃生舱，脚本层慎用） */
  tapAt(x: number, y: number, options?: BaseActionOptions): Promise<void>;

  /* ── 输入 ── */
  /** 输入文本 */
  typeText(locator: LocatorLike, text: string, options?: TypeTextOptions): Promise<void>;
  /** 清空输入框 */
  clearText(locator: LocatorLike, options?: BaseActionOptions): Promise<void>;
  /** 替换文本（clear + type 的原子封装） */
  replaceText(locator: LocatorLike, text: string, options?: TypeTextOptions): Promise<void>;
  /** 收起键盘 */
  dismissKeyboard(): Promise<void>;

  /* ── 滚动 / 滑动 ── */
  /** 在容器内滚动固定距离 */
  scroll(container: LocatorLike, options?: ScrollOptions): Promise<void>;
  /** 在容器内滚动直到 target 可见（找不到则抛 ElementNotFoundError） */
  scrollTo(container: LocatorLike, options: ScrollToOptions): Promise<void>;
  /** 在元素上滑动；container 传 null 表示全屏滑动 */
  swipe(target: LocatorLike | null, options: SwipeOptions): Promise<void>;
  /** 下拉刷新语义封装 */
  pullToRefresh(container: LocatorLike, options?: BaseActionOptions): Promise<void>;

  /* ── 等待 ── */
  /** 等待元素可见 */
  waitForVisible(locator: LocatorLike, options?: WaitOptions): Promise<void>;
  /** 等待元素不可见 */
  waitForNotVisible(locator: LocatorLike, options?: WaitOptions): Promise<void>;
  /** 等待元素存在于视图树（不要求可见） */
  waitForExist(locator: LocatorLike, options?: WaitOptions): Promise<void>;
  /** 等待元素从视图树消失 */
  waitForGone(locator: LocatorLike, options?: WaitOptions): Promise<void>;
  /** 等待元素文本满足期望 */
  waitForText(locator: LocatorLike, expected: string, options?: AssertTextOptions & WaitOptions): Promise<void>;
  /** 通用条件等待（业务自定义谓词） */
  waitUntil(predicate: () => Promise<boolean>, options?: WaitOptions): Promise<void>;

  /* ── 查询 ── */
  /** 读取元素文本；元素不存在时抛 ElementNotFoundError */
  getText(locator: LocatorLike, options?: BaseActionOptions): Promise<string>;
  /** 读取元素值（输入框/开关/滑块） */
  getValue(locator: LocatorLike, options?: BaseActionOptions): Promise<string | null>;
  /** 读取任意原生属性 */
  getAttribute(locator: LocatorLike, name: string, options?: BaseActionOptions): Promise<string | null>;
  /** 元素是否存在于视图树（不抛异常） */
  exists(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean>;
  /** 元素是否可见（不抛异常） */
  isVisible(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean>;
  /** 元素是否可用 */
  isEnabled(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean>;
  /** 元素是否选中（switch/checkbox/tab） */
  isSelected(locator: LocatorLike, options?: BaseActionOptions): Promise<boolean>;
  /** 命中元素数量 */
  count(locator: LocatorLike, options?: BaseActionOptions): Promise<number>;

  /* ── 断言（失败统一抛 AssertionFailedError，便于集中截图） ── */
  assertExists(locator: LocatorLike, options?: AssertTextOptions): Promise<void>;
  assertNotExists(locator: LocatorLike, options?: AssertTextOptions): Promise<void>;
  assertVisible(locator: LocatorLike, options?: AssertTextOptions): Promise<void>;
  assertNotVisible(locator: LocatorLike, options?: AssertTextOptions): Promise<void>;
  assertText(locator: LocatorLike, expected: string, options?: AssertTextOptions): Promise<void>;
  assertValue(locator: LocatorLike, expected: string, options?: AssertTextOptions): Promise<void>;
  assertEnabled(locator: LocatorLike, options?: AssertTextOptions): Promise<void>;
  assertCount(locator: LocatorLike, expected: number, options?: AssertTextOptions): Promise<void>;

  /* ── 低层逃生舱（脚本层禁止调用，仅供 Page 基类与调试） ── */
  /** 返回解析后的原生选择器，用于日志与排障 */
  resolveSelector(locator: LocatorLike): NativeSelector;
}

/* ═══════════════ IDeviceActions：设备与 App 级能力 ═══════════════ */

export interface IDeviceActions {
  /* ── App 生命周期 ── */
  launchApp(options?: LaunchAppOptions): Promise<void>;
  terminateApp(appId?: string): Promise<void>;
  /** 重启 App 并复位到初始页面 */
  reloadApp(options?: LaunchAppOptions): Promise<void>;
  installApp(binaryPath?: string): Promise<void>;
  uninstallApp(appId?: string): Promise<void>;
  /** 将 App 切到后台 seconds 秒后回前台 */
  sendToBackground(seconds: number): Promise<void>;
  /** 通过 deep link 打开 */
  openUrl(url: string): Promise<void>;

  /* ── 设备状态 ── */
  setOrientation(orientation: Orientation): Promise<void>;
  getOrientation(): Promise<Orientation>;
  /** 硬件返回键（Android 有效，iOS 抛 OmniError(NOT_IMPLEMENTED)） */
  pressBack(): Promise<void>;
  pressHome(): Promise<void>;
  setPermissions(permissions: Readonly<Record<string, string>>): Promise<void>;
  getDeviceInfo(): Promise<DeviceInfo>;

  /* ── 产物采集 ── */
  /** 低层：返回截图二进制，不落盘 */
  captureScreenshotBuffer(): Promise<Buffer>;
  /** 高层：落盘并登记为 ArtifactRef（内部委托 utils/screenshot） */
  takeScreenshot(options?: ScreenshotOptions): Promise<ArtifactRef>;
  /** 视频录制（R-15 / P2；不支持的框架返回 null） */
  startVideoRecording(options?: ScreenshotOptions): Promise<void>;
  stopVideoRecording(): Promise<ArtifactRef | null>;
  /** 导出当前视图树，排障与 dry-run 快照用 */
  getPageSource(): Promise<string>;
}

/* ═══════════════ IFrameworkDriver：低层驱动契约 ═══════════════ */

/**
 * 唯一允许接触第三方 SDK / 子进程的层。
 * @typeParam TSession 框架会话对象（webdriverio Browser / detox 运行时 / 桥接客户端）
 * @typeParam TElement 框架元素句柄
 */
export interface IFrameworkDriver<TSession = unknown, TElement = unknown> {
  readonly framework: FrameworkKind;
  readonly platform: Platform;

  /** 建立会话 / 拉起子进程；失败抛 DriverConnectionError 或 FrameworkNotInstalledError */
  connect(): Promise<void>;
  /** 断开并释放资源，必须幂等 */
  disconnect(): Promise<void>;
  isConnected(): boolean;
  /** 未连接时抛 AdapterNotInitializedError */
  getSession(): TSession;

  /** 查找单个元素；超时抛 ElementNotFoundError */
  findElement(selector: NativeSelector, timeoutMs?: number): Promise<TElement>;
  /** 查找全部匹配元素，无命中返回空数组 */
  findElements(selector: NativeSelector): Promise<TElement[]>;

  /** 下发原子命令（各框架自定义 command 命名空间） */
  execute<TResult = unknown>(
    command: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<TResult>;

  /** 截图二进制 */
  screenshot(): Promise<Buffer>;

  /** 连通性自检，不改变会话状态 */
  healthCheck(): Promise<HealthCheckResult>;
}

/* ═══════════════ IAdapter：框架适配器契约 ═══════════════ */

/** 工厂注入给适配器的构造依赖 */
export interface AdapterInit {
  readonly runConfig: ResolvedRunConfig;
  readonly logger: ILogger;
}

export interface IAdapter {
  readonly framework: FrameworkKind;
  readonly platform: Platform;
  readonly deviceConfig: DeviceConfig;
  readonly state: AdapterState;

  /** 元素级动作 */
  readonly actions: IActions;
  /** 设备与 App 级能力 */
  readonly device: IDeviceActions;
  /** 定位器翻译器 */
  readonly locatorResolver: ILocatorResolver;
  /** 低层驱动（仅供调试与扩展，脚本层禁止访问） */
  readonly driver: IFrameworkDriver;

  /** 建立会话并启动 App；必须幂等（重复调用直接返回） */
  init(): Promise<void>;
  /** 释放全部资源；必须幂等且不抛异常（内部吞错并记日志） */
  dispose(): Promise<void>;
  isReady(): boolean;
  healthCheck(): Promise<HealthCheckResult>;
}

/**
 * 每个适配器模块（`adapters/<fw>/<Fw>Adapter.ts`）必须导出的工厂函数。
 * 工厂层通过惰性 import 拿到它 —— 这是新增框架的唯一契约要求。
 */
export type CreateAdapterFn = (init: AdapterInit) => IAdapter;

/** 适配器模块的结构约束，供 registry 的动态 import 做类型标注 */
export interface AdapterModule {
  readonly createAdapter: CreateAdapterFn;
}
