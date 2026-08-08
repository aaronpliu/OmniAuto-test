import type { EnvConfig, TestConfig, ValidationIssue } from '../../contracts/types';
import { ERROR_CODES } from '../../contracts/types';

/**
 * Detox runner / behavior / artifacts / session 层配置。
 *
 * 【谁驱动谁：Detox 与 Jest 的关系是反过来的】
 * 其它两个框架是「jest 跑起来，用例里建会话」；Detox 则是
 * `detox test -c <configuration>` **先启动**，由 Detox CLI 拼出 jest 命令行再去调 jest。
 * 因此 `testRunner.args.config` 指向的 jest 配置文件路径，是 Detox 传给 jest 的 `--config`。
 * 这也是为什么 Detox 场景下 jest 的 `maxWorkers` 必须为 1：
 * Detox 的设备分配器在多 worker 下需要设备池支持，单设备并发会互相抢占。
 *
 * 【behavior.init.exposeGlobals 为什么必须 false】
 * Detox 默认会把 `device` / `element` / `by` / `expect` 注入全局作用域。
 * 本工程的核心承诺是「一份脚本零改动跑三套框架」（C-01），全局注入会让用例作者
 * 不自觉地写出 Detox 专有 API，编译期不报错、换框架时才崩 —— 这是最昂贵的一类错误。
 * 关掉它，强制所有能力都从统一的 `testContext` 走。
 * 另外 Detox 的全局 `expect` 会覆盖 jest 的 `expect`，让断言库行为在不同文件间静默不一致。
 */

/** Detox testRunner 配置 */
export interface DetoxTestRunnerConfig {
  readonly args: {
    /** runner 可执行名，Detox 用它拼命令行 */
    readonly $0: string;
    /** 传给 jest 的 --config */
    readonly config: string;
    /** 传给 jest 的 --maxWorkers（Detox 会原样透传） */
    readonly maxWorkers?: number;
    readonly _?: readonly string[];
  };
  readonly jest: {
    readonly setupTimeout: number;
    readonly teardownTimeout: number;
    /** 用例失败后是否继续跑同文件的后续用例 */
    readonly retryAfterCircusRetries?: boolean;
  };
  /** 是否在用例失败时立刻结束整轮 */
  readonly forwardEnv?: boolean;
  /** 失败重试次数，由 Detox 自己实现（区别于 jest 的 retry） */
  readonly retries?: number;
}

/** Detox behavior 配置 */
export interface DetoxBehaviorConfig {
  readonly init: {
    /** 是否向全局作用域注入 device/element/by/expect（本工程恒为 false，理由见文件头） */
    readonly exposeGlobals: boolean;
    /** 每轮开始时是否卸载重装 App */
    readonly reinstallApp: boolean;
  };
  /** 'auto' 表示 Detox 在 beforeEach 自动启动 App */
  readonly launchApp: 'auto' | 'manual';
  readonly cleanup: {
    /** 跑完是否关闭模拟器；本地关掉能省下次冷启动，CI 上无所谓 */
    readonly shutdownDevice: boolean;
  };
}

/** Detox artifacts 配置 */
export interface DetoxArtifactsConfig {
  readonly rootDir: string;
  readonly pathBuilder?: string;
  readonly plugins: {
    readonly screenshot: {
      readonly enabled: boolean;
      readonly shouldTakeAutomaticSnapshots: boolean;
      readonly keepOnlyFailedTestsArtifacts: boolean;
      readonly takeWhen: {
        readonly testStart: boolean;
        readonly testDone: boolean;
        readonly appNotReady?: boolean;
      };
    };
    readonly video: 'none' | 'all' | 'failing';
    readonly log: 'none' | 'all' | 'failing';
    readonly instruments: 'none' | 'all';
    readonly uiHierarchy: 'disabled' | 'enabled';
  };
}

/** Detox session 配置 */
export interface DetoxSessionConfig {
  /** 由 Detox 自己启动 websocket server（几乎总是 true） */
  readonly autoStart: boolean;
  /**
   * 同步机制调试阈值（毫秒）。设为正数后，Detox 在等待 App 空闲超过该时长时
   * 会打印「当前是哪个资源让 App 处于 busy 状态」，这是排查 Detox 超时的唯一有效手段。
   */
  readonly debugSynchronization: number;
  readonly server?: string;
  readonly sessionId?: string;
}

/** runner 层构建输入 */
export interface DetoxRunnerInput {
  readonly env?: EnvConfig;
  readonly test?: TestConfig;
  /** 传给 jest 的配置文件路径（相对工程根） */
  readonly jestConfigPath?: string;
  /** 产物根目录 */
  readonly artifactsRootDir?: string;
  /** 是否跨用例复用同一 App 实例（true 时不重装、不重启） */
  readonly reuseSession?: boolean;
  /** 强制开启视频录制 */
  readonly recordVideo?: boolean;
  /** 覆盖同步调试阈值 */
  readonly debugSynchronizationMs?: number;
}

/** runner 层默认值 */
export const DETOX_RUNNER_DEFAULTS = {
  /** Detox 官方约定的 jest 配置位置；本工程改指向 configs/jest 下的 detox 专用配置 */
  jestConfigPath: 'src/configs/jest/jest.detox.config.ts',
  artifactsRootDir: 'reports',
  /**
   * 300s：Detox 的 setup 要串行完成「起模拟器 → 装 App → 装 test apk → 建 ws 会话」，
   * Android 冷启动叠加两次 apk 安装，5 分钟是安全下限。
   */
  setupTimeout: 300_000,
  /** 60s：teardown 只需关会话与收产物 */
  teardownTimeout: 60_000,
  /**
   * 10s：超过 10s 仍未空闲就打印 busy 资源。设太小会在正常的网络请求期间刷屏，
   * 设太大（或设 0 关闭）则彻底失去排查线索。
   */
  debugSynchronization: 10_000,
} as const;

/** 构建 testRunner 配置 */
export function buildDetoxTestRunnerConfig(input: DetoxRunnerInput = {}): DetoxTestRunnerConfig {
  return {
    args: {
      $0: 'jest',
      config: input.jestConfigPath ?? DETOX_RUNNER_DEFAULTS.jestConfigPath,
      // 恒为 1：单设备场景下多 worker 会互相抢占设备（详见文件头）
      maxWorkers: 1,
      _: [],
    },
    jest: {
      setupTimeout: input.test?.timeouts.hookMs ?? DETOX_RUNNER_DEFAULTS.setupTimeout,
      teardownTimeout: DETOX_RUNNER_DEFAULTS.teardownTimeout,
      retryAfterCircusRetries: false,
    },
    // 把宿主机环境变量透传给 Detox 起的子进程，否则 .env 里的凭据在用例里读不到
    forwardEnv: true,
    // 交给 jest / 本工程统一管理重试策略，避免两层重试相乘
    retries: 0,
  };
}

/** 构建 behavior 配置 */
export function buildDetoxBehaviorConfig(input: DetoxRunnerInput = {}): DetoxBehaviorConfig {
  const reuseSession = input.reuseSession ?? false;
  return {
    init: {
      exposeGlobals: false,
      // 复用会话时不重装，能把一轮冒烟的耗时砍掉一大截
      reinstallApp: !reuseSession,
    },
    launchApp: 'auto',
    cleanup: {
      // 不关设备：下一轮可直接复用已启动的模拟器，省 30~90s 冷启动
      shutdownDevice: false,
    },
  };
}

/** 构建 artifacts 配置 */
export function buildDetoxArtifactsConfig(input: DetoxRunnerInput = {}): DetoxArtifactsConfig {
  const test = input.test;
  const recordVideo = input.recordVideo ?? test?.video.enabled ?? false;
  const onStep = test?.screenshot.onStep ?? false;
  const onFailure = test?.screenshot.onFailure ?? true;

  return {
    rootDir: input.artifactsRootDir ?? input.env?.artifactsDir ?? DETOX_RUNNER_DEFAULTS.artifactsRootDir,
    plugins: {
      screenshot: {
        enabled: true,
        // 自动快照只在显式开启逐步截图时才打开：默认开启会在每个用例产生 2 张图，
        // 长套件下动辄上千张，淹没真正有价值的失败截图
        shouldTakeAutomaticSnapshots: onStep,
        keepOnlyFailedTestsArtifacts: onFailure && !onStep,
        takeWhen: {
          testStart: onStep,
          // testDone 恒为 true：失败瞬间的界面是排障第一现场，任何情况下都要留
          testDone: true,
          appNotReady: true,
        },
      },
      video: recordVideo ? 'failing' : 'none',
      // 日志恒开：Detox 的 device log 是定位「App 崩了还是没崩」的唯一依据，体积也小
      log: 'all',
      // instruments 会显著拖慢 iOS 执行速度，默认关闭
      instruments: 'none',
      uiHierarchy: 'disabled',
    },
  };
}

/** 构建 session 配置 */
export function buildDetoxSessionConfig(input: DetoxRunnerInput = {}): DetoxSessionConfig {
  return {
    autoStart: true,
    debugSynchronization: input.debugSynchronizationMs ?? DETOX_RUNNER_DEFAULTS.debugSynchronization,
  };
}

/** runner 层完整配置 */
export interface DetoxRunnerConfig {
  readonly testRunner: DetoxTestRunnerConfig;
  readonly behavior: DetoxBehaviorConfig;
  readonly artifacts: DetoxArtifactsConfig;
  readonly session: DetoxSessionConfig;
}

/** 一次性构建 runner 层四段配置 */
export function buildDetoxRunnerConfig(input: DetoxRunnerInput = {}): DetoxRunnerConfig {
  return {
    testRunner: buildDetoxTestRunnerConfig(input),
    behavior: buildDetoxBehaviorConfig(input),
    artifacts: buildDetoxArtifactsConfig(input),
    session: buildDetoxSessionConfig(input),
  };
}

/** 校验 runner 层配置 */
export function validate(config: DetoxRunnerConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.testRunner.args.config.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.testRunner.args.config',
      message: 'Detox 需要知道把哪个 jest 配置传给 runner，config 不能为空',
      severity: 'error',
    });
  }

  if (config.testRunner.args.maxWorkers !== undefined && config.testRunner.args.maxWorkers > 1) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.testRunner.args.maxWorkers',
      message: `maxWorkers=${config.testRunner.args.maxWorkers} > 1，单设备场景下多个 worker 会争抢同一台设备`,
      severity: 'error',
      hint: 'Detox 多 worker 需要配套的设备池（每 worker 一台 AVD），否则必须保持 1',
    });
  }

  if (config.behavior.init.exposeGlobals) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.behavior.init.exposeGlobals',
      message: 'exposeGlobals=true 会把 device/element/by/expect 注入全局，'
        + '诱导用例写出 Detox 专有 API，破坏跨框架等价性；且会覆盖 jest 的 expect',
      severity: 'error',
      hint: '本工程要求恒为 false，所有能力从统一的 testContext 获取',
    });
  }

  if (config.testRunner.jest.setupTimeout <= 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.testRunner.jest.setupTimeout',
      message: `setupTimeout 必须为正数，实际为 ${String(config.testRunner.jest.setupTimeout)}`,
      severity: 'error',
    });
  } else if (config.testRunner.jest.setupTimeout < 120_000) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.testRunner.jest.setupTimeout',
      message: `setupTimeout=${config.testRunner.jest.setupTimeout}ms 偏小；`
        + 'Detox 的 setup 需串行完成「起设备 → 装 App → 装 test apk → 建会话」',
      severity: 'warning',
      hint: '建议不低于 120000',
    });
  }

  if (config.artifacts.rootDir.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.artifacts.rootDir',
      message: '产物根目录不能为空',
      severity: 'error',
    });
  }

  if (config.session.debugSynchronization < 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.session.debugSynchronization',
      message: `debugSynchronization 不能为负，实际为 ${String(config.session.debugSynchronization)}`,
      severity: 'error',
    });
  } else if (config.session.debugSynchronization === 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.session.debugSynchronization',
      message: 'debugSynchronization=0 会关闭同步调试输出，Detox 超时时将无法定位是哪个资源处于 busy',
      severity: 'warning',
      hint: '建议保留 10000（10s）',
    });
  }

  return issues;
}
