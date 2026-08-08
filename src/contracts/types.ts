/**
 * OmniAutoTest 契约层 —— 基础类型、配置类型、错误类型。
 *
 * 【本文件的三条铁律】
 * 1. 禁止 import 任何工程内其它模块（零依赖，依赖倒置的根）。
 *    这是 §1.2 依赖矩阵中 contracts 行全为 ⛔ 的物理保证：只要本文件没有 import，
 *    就不可能出现「契约反向依赖实现」的架构腐化。
 * 2. 本文件的签名为**冻结项**（ARCHITECTURE.md §3.1）。发现签名有误时应回到架构师评审，
 *    不允许实现者自行修改，否则三套适配器的翻译层会静默错位。
 * 3. 编译目标必须 >= ES2015（本工程 ES2022）。低于 ES2015 时 TypeScript 会把 class 降级为
 *    构造函数 + 原型链拼装，`class X extends Error` 的原型链会在 super() 处断裂，
 *    导致 `err instanceof OmniError === false`，整个错误分类 → 退出码映射体系直接失效。
 */

/* ═══════════════ 1. 基础枚举 ═══════════════ */

/** 目标平台 */
export type Platform = 'ios' | 'android';

/** 内置框架种类（新增框架无需修改本文件，见 FrameworkKind） */
export type BuiltinFrameworkKind = 'appium' | 'xcuitest' | 'detox';

/**
 * 框架种类。采用开放字面量联合：保留内置值的 IDE 补全，
 * 同时允许注册第 4 个框架而**不修改契约层**（满足 AC-6）。
 *
 * ⚠ 取舍说明（决策 X-3 的附加条件）：
 * `(string & {})` 让编译器接受任意字符串，代价是**类型层不再提供拼写保护** ——
 * `--framework=appuim` 这样的错拼在 tsc 阶段完全合法。
 * 因此拼写保护的责任被下移到**运行时**：
 *   - CLI（`src/cli/validation.ts`）必须用 `FRAMEWORK_REGISTRY` 的 keys 做白名单校验，
 *     未注册即抛 `FrameworkNotRegisteredError`（exit 2）；
 *   - 需要「仅内置框架」的场景（如生成帮助文本、遍历默认矩阵）请用下方的
 *     `BUILTIN_FRAMEWORKS` 常量数组，而不是硬编码字符串字面量。
 * 这条「类型层开放 + 运行时收口」的组合，是同时满足 AC-6（可扩展）与 AC-3（非法组合可拒绝）的唯一解。
 */
export type FrameworkKind = BuiltinFrameworkKind | (string & {});

/**
 * 内置框架的运行时枚举值。
 *
 * 存在的理由：`BuiltinFrameworkKind` 是纯类型，编译后不留任何痕迹，无法在运行时遍历。
 * 而 CLI 白名单校验、帮助文本渲染、dry-run 的全矩阵枚举都需要一份**运行时可迭代**的清单。
 * 用 `satisfies` 反向约束，保证本数组与 `BuiltinFrameworkKind` 永远同步：
 * 少写一个成员不会报错（这是 TS 的固有限制），但**写错拼写会立刻报错**。
 *
 * ⚠ 这不是「已注册框架」的清单 —— 真正的注册表是 `factory/index.ts` 的 `FRAMEWORK_REGISTRY`。
 * 运行时白名单校验应以 registry 的 keys 为准（它包含外部通过 `registerFramework()` 追加的第 4 框架）。
 */
export const BUILTIN_FRAMEWORKS = ['appium', 'xcuitest', 'detox'] as const satisfies readonly BuiltinFrameworkKind[];

/** 设备形态 */
export type DeviceKind = 'simulator' | 'emulator' | 'real';

/** 设备形态的运行时枚举值，用途同 BUILTIN_FRAMEWORKS */
export const DEVICE_KINDS = ['simulator', 'emulator', 'real'] as const satisfies readonly DeviceKind[];

/** 平台的运行时枚举值，用途同 BUILTIN_FRAMEWORKS */
export const PLATFORMS = ['ios', 'android'] as const satisfies readonly Platform[];

/** 内置业务 App */
export type BuiltinAppKey = 'mock' | 'buyer' | 'seller' | 'wallet';

/** App 标识。开放联合，新增 App 无需修改契约层（满足 G3）。 */
export type AppKey = BuiltinAppKey | (string & {});

/**
 * 内置 App 的运行时枚举值。
 * 与 `AppKey` 的开放联合配套：类型层放开、运行时由 `configs/apps/index.ts` 的
 * `APP_REGISTRY` 收口校验，取舍逻辑同 `FrameworkKind`。
 */
export const BUILTIN_APP_KEYS = ['mock', 'buyer', 'seller', 'wallet'] as const satisfies readonly BuiltinAppKey[];

/** 屏幕方向 */
export type Orientation = 'portrait' | 'landscape';

/** 滑动方向 */
export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

/** 文本匹配模式 */
export type TextMatchMode = 'exact' | 'contains' | 'startsWith' | 'regex';

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** 适配器生命周期状态机 */
export type AdapterState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'disposing'
  | 'disposed'
  | 'error';

/* ═══════════════ 2. App / Device 配置 ═══════════════ */

/** 单平台的 App 二进制与标识信息 */
export interface AppPlatformBinary {
  /** iOS bundleId 或 Android package name */
  readonly appId: string;
  /** 安装包路径（.app / .ipa / .apk），支持相对工程根路径 */
  readonly binaryPath?: string;
  /** Android 启动 Activity，仅 android 有效 */
  readonly launchActivity?: string;
  /** 不同构建产物路径 */
  readonly build?: {
    readonly debug?: string;
    readonly release?: string;
  };
}

/** 业务 App 配置（`configs/apps/*.config.ts` 的产物类型） */
export interface AppConfig {
  readonly key: AppKey;
  readonly displayName: string;
  /** 该 App 支持的平台，CLI 会据此校验 app×platform 组合 */
  readonly supportedPlatforms: readonly Platform[];
  readonly ios?: AppPlatformBinary;
  readonly android?: AppPlatformBinary;
  /** 启动参数，会透传给各框架的 launchApp */
  readonly launchArgs?: Readonly<Record<string, string | number | boolean>>;
  /** 权限预授权（iOS: camera/photos/location…） */
  readonly permissions?: Readonly<Record<string, 'YES' | 'NO' | 'unset'>>;
  /**
   * testId 在各平台的落地属性名。
   * iOS 默认 'accessibilityIdentifier'；Android 默认 'content-desc'。
   * LocatorResolver 依赖此项决定翻译策略。
   */
  readonly testIdAttribute?: {
    readonly ios?: 'accessibilityIdentifier' | 'name' | (string & {});
    readonly android?: 'content-desc' | 'resource-id' | (string & {});
  };
  /** App 级默认动作超时，优先级低于 CLI/env */
  readonly defaultTimeoutMs?: number;
}

/** 设备配置（`configs/devices/*.config.ts` 的产物类型） */
export interface DeviceConfig {
  /** 唯一标识，形如 'ios.simulator' / 'android.real' */
  readonly id: string;
  readonly platform: Platform;
  readonly kind: DeviceKind;
  /** 设备名，如 'iPhone 15' / 'Pixel_6_API_34' */
  readonly deviceName: string;
  readonly platformVersion?: string;
  /** iOS 真机 udid / Android 真机 serial */
  readonly udid?: string;
  /** Android 模拟器 AVD 名 */
  readonly avdName?: string;
  readonly headless?: boolean;
  readonly orientation?: Orientation;
  readonly newCommandTimeoutSec?: number;
  /** 透传给底层框架的额外能力 */
  readonly extraCapabilities?: Readonly<Record<string, unknown>>;
}

/* ═══════════════ 3. 框架配置 ═══════════════ */

/** 所有框架配置的公共部分 */
export interface FrameworkConfigBase {
  readonly framework: FrameworkKind;
  readonly platform: Platform;
  /** 会话建立超时 */
  readonly startupTimeoutMs: number;
  /** 单个原子动作超时 */
  readonly actionTimeoutMs: number;
  /** 显式等待默认超时 */
  readonly waitTimeoutMs: number;
  /** 轮询间隔 */
  readonly waitIntervalMs: number;
}

export interface AppiumFrameworkConfig extends FrameworkConfigBase {
  readonly framework: 'appium';
  /** 形如 http://127.0.0.1:4723 */
  readonly serverUrl: string;
  readonly automationName: 'XCUITest' | 'UiAutomator2' | (string & {});
  /** W3C capabilities（appium: 前缀由 Driver 统一补全） */
  readonly capabilities: Readonly<Record<string, unknown>>;
  readonly connectionRetries: number;
  readonly logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

export interface DetoxFrameworkConfig extends FrameworkConfigBase {
  readonly framework: 'detox';
  /** .detoxrc 中的 configuration 名，如 'ios.sim.debug' */
  readonly configurationName: string;
  /** .detoxrc(.js|.json) 路径 */
  readonly detoxConfigPath: string;
  readonly artifactsRootDir: string;
  readonly launchArgs?: Readonly<Record<string, string | number | boolean>>;
  /** 是否跨用例复用同一 App 实例 */
  readonly reuseSession: boolean;
}

/** XCUITest 子进程桥接协议配置（C-03 / D-1） */
export interface XCUITestBridgeConfig {
  /** stdio: NDJSON over child stdout/stdin（默认）；http: Runner 内起 HTTP server */
  readonly mode: 'stdio' | 'http';
  readonly host: string;
  readonly port: number;
  /** Runner 启动握手超时 */
  readonly handshakeTimeoutMs: number;
  /** 单条桥接命令超时 */
  readonly commandTimeoutMs: number;
  /** 优雅退出信号，超时后升级为 SIGKILL */
  readonly killSignal: NodeJS.Signals;
}

export interface XCUITestFrameworkConfig extends FrameworkConfigBase {
  readonly framework: 'xcuitest';
  /** xcrun 可执行路径，默认 '/usr/bin/xcrun' */
  readonly xcrunPath: string;
  readonly projectPath?: string;
  readonly workspacePath?: string;
  readonly scheme: string;
  readonly testPlan?: string;
  /** XCTest Runner target 名 */
  readonly runnerTarget: string;
  readonly derivedDataPath: string;
  readonly resultBundlePath: string;
  readonly bridge: XCUITestBridgeConfig;
}

/** 框架配置联合类型；第 4 框架可退化到 FrameworkConfigBase */
export type FrameworkConfig =
  | AppiumFrameworkConfig
  | DetoxFrameworkConfig
  | XCUITestFrameworkConfig
  | FrameworkConfigBase;

/* ═══════════════ 4. 环境与测试策略配置 ═══════════════ */

/** 单个环境变量的规格声明（供 .env.example 生成与校验复用） */
export interface EnvVarSpec {
  readonly key: string;
  readonly required: boolean;
  readonly defaultValue?: string;
  readonly description: string;
  /** 类型转换与合法性校验，抛错即视为非法 */
  readonly parse?: (raw: string) => unknown;
}

export interface EnvConfig {
  readonly nodeEnv: 'local' | 'ci' | 'staging' | 'prod' | (string & {});
  readonly baseUrl?: string;
  readonly appiumServerUrl: string;
  readonly credentials: {
    readonly username?: string;
    readonly password?: string;
    readonly otpSecret?: string;
  };
  readonly timeouts: {
    readonly defaultMs: number;
    readonly actionMs: number;
    readonly waitMs: number;
    readonly startupMs: number;
  };
  readonly artifactsDir: string;
  readonly logLevel: LogLevel;
  readonly logFormat: 'text' | 'json';
  readonly xcrunPath: string;
  readonly androidSdkRoot?: string;
  readonly deviceUdid?: string;
}

export interface TestConfig {
  readonly testMatch: readonly string[];
  readonly maxWorkers: number | string;
  readonly retries: number;
  readonly bail: number;
  readonly timeouts: {
    readonly testMs: number;
    readonly hookMs: number;
  };
  readonly screenshot: {
    readonly onFailure: boolean;
    readonly onStep: boolean;
    readonly dir: string;
    readonly format: 'png';
  };
  readonly video: {
    readonly enabled: boolean;
    readonly dir: string;
  };
  readonly report: {
    readonly dir: string;
    readonly junit: boolean;
    readonly json: boolean;
    readonly html: boolean;
  };
}

/* ═══════════════ 5. 运行选项与解析结果 ═══════════════ */

/** CLI 解析产物（未合并配置前的用户意图） */
export interface TestRunOptions {
  readonly framework: FrameworkKind;
  readonly app: AppKey;
  readonly platform: Platform;
  readonly device: DeviceKind;
  readonly dryRun: boolean;
  /** 透传给 jest 的 testPathPattern */
  readonly testPathPattern?: string;
  /** 覆盖设备 udid/serial */
  readonly deviceId?: string;
  readonly tags?: readonly string[];
  readonly retries?: number;
  readonly bail?: boolean;
  readonly headless?: boolean;
  readonly verbose?: boolean;
  readonly logLevel?: LogLevel;
  readonly reportDir?: string;
  /** 原样透传给 jest 的额外参数 */
  readonly jestArgs?: readonly string[];
  readonly help?: boolean;
  readonly version?: boolean;
}

/** 运行期路径集合 */
export interface RunPaths {
  readonly projectRoot: string;
  readonly reportsDir: string;
  readonly screenshotsDir: string;
  readonly videosDir: string;
  /** reports/.run/<runId> */
  readonly runtimeDir: string;
  /** reports/.run/<runId>/run-config.json */
  readonly runConfigFile: string;
  /** reports/.run/<runId>/shards */
  readonly shardsDir: string;
}

/**
 * 五级合并后的**唯一运行时真理源**。
 * 由 configs/index.ts#resolveRunConfig 产出，Object.freeze 后传遍全工程。
 */
export interface ResolvedRunConfig {
  readonly runId: string;
  readonly startedAt: string;
  readonly options: TestRunOptions;
  readonly framework: FrameworkKind;
  readonly platform: Platform;
  readonly deviceKind: DeviceKind;
  readonly app: AppConfig;
  readonly device: DeviceConfig;
  readonly frameworkConfig: FrameworkConfig;
  readonly env: EnvConfig;
  readonly test: TestConfig;
  /** 依据 platform 从 app 解析出的 bundleId / package */
  readonly appId: string;
  /** 依据 platform 解析出的安装包绝对路径 */
  readonly binaryPath?: string;
  readonly paths: RunPaths;
}

/* ═══════════════ 6. 校验与能力矩阵 ═══════════════ */

export interface ValidationIssue {
  /** 形如 OMNI_E_CONFIG_MISSING_FIELD */
  readonly code: string;
  /** 出问题的配置路径，如 'app.ios.appId' */
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly hint?: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

/** 框架能力声明（D-4 组合矩阵的数据源） */
export interface FrameworkCapability {
  readonly framework: FrameworkKind;
  readonly displayName: string;
  /** 支持的平台，如 xcuitest 只有 ['ios'] */
  readonly platforms: readonly Platform[];
  /** 每个平台支持的设备形态 */
  readonly deviceKinds: Readonly<Partial<Record<Platform, readonly DeviceKind[]>>>;
  /** 运行所需的 npm 包（dry-run 只探测存在性，不加载） */
  readonly requiredPackages: readonly string[];
  readonly supportsVideo: boolean;
  readonly supportsRealDevice: boolean;
  readonly notes?: string;
}

export interface HealthCheckResult {
  readonly ok: boolean;
  readonly framework: FrameworkKind;
  readonly checks: readonly {
    readonly name: string;
    readonly ok: boolean;
    readonly detail?: string;
  }[];
}

/* ═══════════════ 7. 产物与报告 ═══════════════ */

export type ArtifactKind = 'screenshot' | 'video' | 'log' | 'report' | 'pageSource';

export interface ArtifactRef {
  readonly kind: ArtifactKind;
  readonly path: string;
  /** 相对 reports/ 的路径，写进报告里方便迁移 */
  readonly relativePath: string;
  readonly createdAt: string;
  readonly testName?: string;
  readonly label?: string;
  readonly bytes?: number;
}

export type TestCaseStatus = 'passed' | 'failed' | 'skipped' | 'todo';

export interface TestCaseRecord {
  readonly suite: string;
  readonly name: string;
  readonly fullName: string;
  readonly status: TestCaseStatus;
  readonly durationMs: number;
  readonly failureMessages: readonly string[];
  readonly artifacts: readonly ArtifactRef[];
}

export interface RunReport {
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly options: TestRunOptions;
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
  readonly cases: readonly TestCaseRecord[];
  readonly artifacts: readonly ArtifactRef[];
  readonly exitCode: number;
}

/* ═══════════════ 8. Dry-run 自检 ═══════════════ */

export type DryRunCheckId =
  | 'structure'
  | 'dependency-direction'
  | 'config-load'
  | 'combination-matrix'
  | 'adapter-registry'
  | 'locator-purity'
  | 'test-structure'
  | 'artifacts-writable'
  | 'typecheck'
  | 'env-spec';

export interface DryRunCheckResult {
  readonly id: DryRunCheckId;
  readonly title: string;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly issues: readonly ValidationIssue[];
  readonly details?: readonly string[];
}

export interface DryRunReport {
  readonly runId: string;
  readonly generatedAt: string;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly ok: boolean;
  readonly exitCode: number;
  readonly checks: readonly DryRunCheckResult[];
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly warnings: number;
  };
}

/* ═══════════════ 9. 日志契约 ═══════════════ */

export type LogContext = Readonly<Record<string, string | number | boolean | undefined>>;

export interface ILogger {
  readonly level: LogLevel;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
  /** 派生带 scope 的子 logger，继承并合并上下文标签 */
  child(scope: string, context?: LogContext): ILogger;
  setLevel(level: LogLevel): void;
}

/* ═══════════════ 10. 退出码与错误类族 ═══════════════ */

export const EXIT_CODES = {
  SUCCESS: 0,
  GENERIC: 1,
  /** CLI 参数缺失 / 非法组合（AC-3） */
  INVALID_ARGS: 2,
  /** 配置加载或必填项校验失败 */
  CONFIG_INVALID: 3,
  /** tsc --noEmit 失败 */
  TYPECHECK_FAILED: 4,
  /** dry-run 其它检查项失败 */
  DRY_RUN_FAILED: 5,
  /** 框架依赖未安装 */
  FRAMEWORK_MISSING: 6,
  /** 驱动 / 桥接连接失败 */
  DRIVER_FAILED: 7,
  /** 用例执行失败（jest 非零） */
  TESTS_FAILED: 10,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export const ERROR_CODES = {
  CONFIG_INVALID: 'OMNI_E_CONFIG_INVALID',
  CONFIG_MISSING_FIELD: 'OMNI_E_CONFIG_MISSING_FIELD',
  ENV_MISSING: 'OMNI_E_ENV_MISSING',
  INVALID_COMBINATION: 'OMNI_E_INVALID_COMBINATION',
  FRAMEWORK_NOT_INSTALLED: 'OMNI_E_FRAMEWORK_NOT_INSTALLED',
  FRAMEWORK_NOT_REGISTERED: 'OMNI_E_FRAMEWORK_NOT_REGISTERED',
  ADAPTER_NOT_INITIALIZED: 'OMNI_E_ADAPTER_NOT_INITIALIZED',
  DRIVER_CONNECTION: 'OMNI_E_DRIVER_CONNECTION',
  BRIDGE: 'OMNI_E_BRIDGE',
  UNSUPPORTED_LOCATOR: 'OMNI_E_UNSUPPORTED_LOCATOR',
  ELEMENT_NOT_FOUND: 'OMNI_E_ELEMENT_NOT_FOUND',
  ACTION_TIMEOUT: 'OMNI_E_ACTION_TIMEOUT',
  ASSERTION_FAILED: 'OMNI_E_ASSERTION_FAILED',
  DRY_RUN_FAILED: 'OMNI_E_DRY_RUN_FAILED',
  NOT_IMPLEMENTED: 'OMNI_E_NOT_IMPLEMENTED',
} as const;

export type OmniErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface OmniErrorOptions {
  readonly exitCode?: number;
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly hint?: string;
}

/**
 * 全工程错误基类。
 * 注意：tsconfig 必须 target >= ES2015（本工程 ES2022），否则 instanceof 失效。
 */
export class OmniError extends Error {
  readonly code: OmniErrorCode;
  readonly exitCode: number;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly hint?: string;

  constructor(code: OmniErrorCode, message: string, options?: OmniErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.exitCode = options?.exitCode ?? EXIT_CODES.GENERIC;
    this.details = options?.details;
    this.hint = options?.hint;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      exitCode: this.exitCode,
      details: this.details,
      hint: this.hint,
    };
  }
}

/** 配置校验失败，聚合多条 issue */
export class ConfigValidationError extends OmniError {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[], message?: string) {
    const errorCount = issues.filter((issue) => issue.severity === 'error').length;
    super(
      ERROR_CODES.CONFIG_INVALID,
      message ?? `配置校验未通过：${errorCount} 个错误 / 共 ${issues.length} 条问题`,
      {
        exitCode: EXIT_CODES.CONFIG_INVALID,
        details: { issues },
        // 聚合报出而非 fail-fast：一次修完所有配置问题，避免「改一条跑一次」的低效循环
        hint: '逐条修正上述配置项后重试；也可执行 `npm run dry-run` 查看完整配置体检报告',
      },
    );
    this.issues = issues;
  }
}

/** 框架 × 平台 × 设备 × App 组合非法（AC-3，CLI 阶段抛出） */
export class InvalidCombinationError extends OmniError {
  readonly issues: readonly ValidationIssue[];

  constructor(options: Partial<TestRunOptions>, issues: readonly ValidationIssue[]) {
    const combo = [
      `framework=${String(options.framework ?? '-')}`,
      `platform=${String(options.platform ?? '-')}`,
      `device=${String(options.device ?? '-')}`,
      `app=${String(options.app ?? '-')}`,
    ].join(' ');
    super(ERROR_CODES.INVALID_COMBINATION, `运行组合非法：${combo}`, {
      exitCode: EXIT_CODES.INVALID_ARGS,
      details: { options, issues },
      hint: '执行 `npx tsx src/index.ts --help` 查看各框架支持的平台与设备形态矩阵',
    });
    this.issues = issues;
  }
}

/** 第三方框架依赖未安装（D-1 惰性导入失败时抛出） */
export class FrameworkNotInstalledError extends OmniError {
  constructor(framework: FrameworkKind, packageName: string, cause?: unknown) {
    super(
      ERROR_CODES.FRAMEWORK_NOT_INSTALLED,
      `框架 "${String(framework)}" 依赖的 npm 包 "${packageName}" 未安装，无法建立会话`,
      {
        exitCode: EXIT_CODES.FRAMEWORK_MISSING,
        cause,
        details: { framework, packageName },
        // 说明「为什么默认没装」，避免使用者误以为是 npm install 出了问题
        hint:
          `"${packageName}" 被声明为 optional peerDependency，npm 7+ 默认不会自动安装，` +
          `以保证本工程在无设备环境下也能 install 成功。真机联调前请执行：npm install --no-save ${packageName}`,
      },
    );
  }
}

/** 未注册的框架 */
export class FrameworkNotRegisteredError extends OmniError {
  constructor(framework: FrameworkKind, available: readonly FrameworkKind[]) {
    super(
      ERROR_CODES.FRAMEWORK_NOT_REGISTERED,
      `未注册的框架 "${String(framework)}"，可用：${available.map(String).join(' / ') || '（空）'}`,
      {
        exitCode: EXIT_CODES.INVALID_ARGS,
        details: { framework, available },
        hint: '新增框架请参考 docs/EXTENDING.md，在 src/factory/index.ts 中调用 registerFramework() 完成注册',
      },
    );
  }
}

/** 在 testContext 初始化前访问 actions/device */
export class AdapterNotInitializedError extends OmniError {
  constructor(accessor: string) {
    super(
      ERROR_CODES.ADAPTER_NOT_INITIALIZED,
      `测试上下文尚未初始化，无法访问 ${accessor}()`,
      {
        exitCode: EXIT_CODES.GENERIC,
        details: { accessor },
        hint:
          '当前 framework 未初始化，请确认 jest 配置的 setupFilesAfterEach 指向 src/setup/jestSetupAfterEnv.ts，' +
          '或在非 jest 环境手动调用 initTestContext()',
      },
    );
  }
}

/** 驱动 / 会话建立失败 */
export class DriverConnectionError extends OmniError {
  constructor(framework: FrameworkKind, message: string, cause?: unknown) {
    super(ERROR_CODES.DRIVER_CONNECTION, `[${String(framework)}] 驱动连接失败：${message}`, {
      exitCode: EXIT_CODES.DRIVER_FAILED,
      cause,
      details: { framework },
      hint: '请确认目标设备已启动、框架服务（如 Appium Server）在运行，且 capabilities 与设备匹配',
    });
  }
}

/** XCUITest 桥接层错误（进程退出 / 协议错误 / 命令超时） */
export class BridgeError extends OmniError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>, cause?: unknown) {
    super(ERROR_CODES.BRIDGE, `XCUITest 桥接错误：${message}`, {
      exitCode: EXIT_CODES.DRIVER_FAILED,
      cause,
      details,
      hint: 'XCTest Runner（Swift 侧）需按 docs/ARCHITECTURE.md §9.8 的 NDJSON 协议实现；未就绪时本错误为预期行为',
    });
  }
}

/** 当前框架无法翻译该 Locator（如 Detox 不支持 xpath） */
export class UnsupportedLocatorError extends OmniError {
  constructor(framework: FrameworkKind, locatorDescription: string, reason: string) {
    super(
      ERROR_CODES.UNSUPPORTED_LOCATOR,
      `[${String(framework)}] 无法翻译定位器「${locatorDescription}」：${reason}`,
      {
        exitCode: EXIT_CODES.GENERIC,
        details: { framework, locator: locatorDescription, reason },
        // 显式抛错而非静默降级为 xpath：静默降级会让脚本在某个框架上「能跑但很慢很脆」，
        // 问题被推迟到线上暴露，违背 C-01 的跨框架等价性承诺
        hint: '请改用该框架可表达的定位语义（优先 testId），不要依赖框架专有的逃生舱',
      },
    );
  }
}

/** 元素在超时内未找到 */
export class ElementNotFoundError extends OmniError {
  constructor(locatorDescription: string, timeoutMs: number, cause?: unknown) {
    super(
      ERROR_CODES.ELEMENT_NOT_FOUND,
      `元素未找到：「${locatorDescription}」（已等待 ${timeoutMs}ms）`,
      {
        exitCode: EXIT_CODES.GENERIC,
        cause,
        details: { locator: locatorDescription, timeoutMs },
        hint: '可用 device.getPageSource() 导出当前视图树核对 testId 是否与 App 实现一致',
      },
    );
  }
}

/** 动作超时 */
export class ActionTimeoutError extends OmniError {
  constructor(action: string, timeoutMs: number, locatorDescription?: string) {
    const target = locatorDescription !== undefined ? ` 于「${locatorDescription}」` : '';
    super(ERROR_CODES.ACTION_TIMEOUT, `动作 ${action}${target} 超时（${timeoutMs}ms）`, {
      exitCode: EXIT_CODES.GENERIC,
      details: { action, timeoutMs, locator: locatorDescription },
      hint: '可通过 options.timeoutMs 单点放宽，或调整 OMNI_TIMEOUT_ACTION_MS 全局默认值',
    });
  }
}

/** 断言失败（由 IActions.assert* 抛出，便于统一截图） */
export class AssertionFailedError extends OmniError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(ERROR_CODES.ASSERTION_FAILED, message, {
      exitCode: EXIT_CODES.GENERIC,
      details,
    });
  }
}

/** dry-run 自检不通过 */
export class DryRunFailedError extends OmniError {
  constructor(report: DryRunReport) {
    const failedIds = report.checks.filter((check) => !check.ok).map((check) => check.id);
    super(
      ERROR_CODES.DRY_RUN_FAILED,
      `dry-run 自检未通过：${failedIds.length}/${report.checks.length} 项失败（${failedIds.join(', ')}）`,
      {
        // 复用报告自带的退出码：typecheck 失败是 4，其它检查失败是 5，两者需要被 CI 区分对待
        exitCode: report.exitCode !== EXIT_CODES.SUCCESS ? report.exitCode : EXIT_CODES.DRY_RUN_FAILED,
        details: { report },
        hint: '详见 reports/dry-run-report.json 中的逐项 issue 与 hint',
      },
    );
  }
}

/** 类型守卫 */
export function isOmniError(error: unknown): error is OmniError {
  if (error instanceof OmniError) {
    return true;
  }
  // 结构化兜底：ts-jest（worker）与 tsx（主进程）可能各自加载一份 types.ts 副本，
  // 此时同名类的 instanceof 会失败。错误分类是退出码映射的唯一依据，不能因模块实例分裂而误判，
  // 故对「Error 实例 + OMNI_E_ 前缀的 code + 数值 exitCode」这一结构特征做二次识别。
  if (!(error instanceof Error)) {
    return false;
  }
  const candidate = error as Partial<OmniError>;
  return typeof candidate.code === 'string'
    && candidate.code.startsWith('OMNI_E_')
    && typeof candidate.exitCode === 'number';
}

/** 从任意异常推导退出码 */
export function toExitCode(error: unknown): number {
  if (isOmniError(error)) {
    return error.exitCode;
  }
  return EXIT_CODES.GENERIC;
}
