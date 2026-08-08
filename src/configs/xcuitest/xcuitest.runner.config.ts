import type {
  EnvConfig,
  ValidationIssue,
  XCUITestBridgeConfig,
} from '../../contracts/types';
import { ERROR_CODES } from '../../contracts/types';
import { toAbsolutePath } from '../../utils/paths';

/**
 * XCUITest 子进程桥接 Runner 配置。
 *
 * 【为什么 XCUITest 必须走子进程桥接，而另外两个框架不用】
 * Appium 有 HTTP 服务、Detox 有 Node 客户端，都能从 Node 进程直接驱动。
 * XCUITest 则完全活在 Xcode 的世界里：测试代码是 Swift/ObjC，由 `xcodebuild test` 拉起，
 * 运行在设备上的 XCTest Runner 进程内，**没有任何官方的 Node 接口**。
 * 唯一可行的架构是：Node 侧起一个 `xcodebuild` 子进程，
 * Swift 侧的 Runner 通过 stdout/stdin 与 Node 交换 NDJSON 指令（C-03 / D-1）。
 *
 * 【为什么传输默认走 HTTP，而不是 stdio 管道】
 * 帧格式始终是 NDJSON（见 `protocol: 'ndjson'`），这里要选的是「帧通过什么通道送过去」：
 * 要么是 stdio 管道，要么是本地 HTTP 服务。设计上 stdio 确实更省事（零端口、生命周期天然对齐、
 * 免鉴权），但**它只在「Runner 是 Node 直接 spawn 的子进程」时成立**。
 *
 * XCUITest 的 Runner 跑在模拟器/真机里的 XCTest 进程内，由 `xcodebuild test` 拉起，
 * 是**另一台「设备」上的独立进程**。xcodebuild 会把 Runner 的 stdout 转发回主机
 * （所以 `hello` 握手帧收得到），但**不会把主机的 stdin 接到设备上的 XCTest 进程**——
 * 那边 stdin 基本就是 /dev/null。`readLine()` 会立刻返回 nil，循环直接结束。
 *
 * 于是 stdio 模式下：握手成功，但第一条命令发出去就石沉大海、超时失败，且报错完全指不到根因
 * （极易被误判成 Runner 崩溃）。这是物理链路限制，不是配置能绕过的。
 * 因此默认 `mode: 'http'`：Node 起一个本地 HTTP 服务，Runner 通过 `SIMCTL_CHILD_OMNI_BRIDGE_*`
 * 拿到 host/port 后直连。端口占用这个代价，相比「整条链路开箱即挂」完全可以接受。
 *
 * 代价是 stdout 不再被协议独占 —— 但本工程 xcuitest 的日志本就走 `logFile`（见下方字段说明），
 * 与传输模式无关。stdio 模式代码仍保留，仅适用于非 xcodebuild 的本地直跑场景；
 * omni 默认的 xcodebuild 路径**必须用 http**。
 *
 * 【为什么默认 command 是 xcrun 而不是 xcodebuild】
 * `xcrun` 会依据当前选中的 Xcode（`xcode-select -p`）定位工具链，
 * 多版本 Xcode 共存时直接调 `xcodebuild` 可能命中 PATH 里的旧版本。
 * 允许通过 `OMNI_XCRUN_PATH`（ENV_SPEC 已声明的既有变量）覆盖。
 */

/**
 * NDJSON 帧协议版本，Node 侧与 Swift 侧握手时比对。
 *
 * 类型是 **number 1**，与 XCUITestDriver.BRIDGE_PROTOCOL_VERSION(=1) 完全一致（连类型都对齐，
 * 不是只对齐值）——这就是 swift 队友指出的「协议版本类型不一致」的根因修法。
 * 注入到环境变量时由调用点 `String()` 转成 `"1"`（env 只能是字符串）。
 * Runner 侧用 `Int(env ?? "1") ?? 1` 解析，恒得 1；若这里写成 1.0 之类的小数，
 * `Int(1.0)` 在 TS 里仍是 1，但若是字符串 `"1.0"` 则 `Int("1.0")` 解析失败回落到 1——
 * 「恰好不炸」纯属巧合，故此处必须用整数 1，且禁止写成小数串。
 */
export const XCUITEST_PROTOCOL_VERSION = 1;

/** Runner 进程启动配置 */
export interface XCUITestRunnerConfig {
  /** 可执行文件，默认取 `env.xcrunPath`（OMNI_XCRUN_PATH） */
  readonly command: string;
  /** 参数数组（execFile 风格，不经过 shell，无需手工转义） */
  readonly args: readonly string[];
  /** 工作目录，默认工程根 */
  readonly cwd: string;
  /** 追加到子进程的环境变量 */
  readonly env: Readonly<Record<string, string>>;
  /** 握手超时：从 spawn 到收到 Runner 的 `hello` 帧 */
  readonly handshakeTimeoutMs: number;
  /** 单条桥接请求的超时 */
  readonly requestTimeoutMs: number;
  /** 发出 killSignal 后等待优雅退出的时间，超时升级为 SIGKILL */
  readonly shutdownGraceMs: number;
  readonly killSignal: NodeJS.Signals;
  /** 帧协议 */
  readonly protocol: 'ndjson';
  readonly protocolVersion: string;
  /**
   * 同时在途的最大请求数。
   * NDJSON 是有序流，超过这个数会让响应匹配队列无限增长并掩盖对端卡死；
   * 设为 1 表示严格串行（本工程默认，因为 UI 操作本身就必须串行）。
   */
  readonly maxPendingRequests: number;
  /** Runner 人类可读日志的落盘位置（stdout 被协议独占，见文件头） */
  readonly logFile: string;
  /** 是否把 Runner 的 stderr 转发到父进程 stderr */
  readonly forwardStderr: boolean;
}

/** Runner 配置构建输入 */
export interface XCUITestRunnerInput {
  readonly env: EnvConfig;
  /** `xcodebuild test-without-building` 需要的 `.xctestrun` 路径 */
  readonly xctestrunPath?: string;
  /** `-destination` 值，由 `xcuitest.ios.config.ts#buildDestination` 产出 */
  readonly destination: string;
  /** `-derivedDataPath` */
  readonly derivedDataPath?: string;
  /** `.xcresult` 输出路径 */
  readonly resultBundlePath?: string;
  /** 覆盖可执行文件 */
  readonly command?: string;
  /** 覆盖完整参数数组（提供后不再自动拼装） */
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly handshakeTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  readonly shutdownGraceMs?: number;
  readonly maxPendingRequests?: number;
  readonly logFile?: string;
  readonly runId?: string;
  /** 追加的额外 xcodebuild 参数 */
  readonly extraArgs?: readonly string[];
}

/** Runner 默认值 */
export const XCUITEST_RUNNER_DEFAULTS = {
  command: '/usr/bin/xcrun',
  /**
   * 300s：握手要等 xcodebuild 完成「解析 .xctestrun → 装 Runner.app → 启动设备 → Runner 建立管道」，
   * 冷启动模拟器时 3~5 分钟属正常。这是整条链路上最慢的一步。
   */
  handshakeTimeoutMs: 300_000,
  /** 30s：单条 UI 指令（tap / 查询元素）在设备侧应在秒级完成 */
  requestTimeoutMs: 30_000,
  /**
   * 10s：xcodebuild 收到 SIGTERM 后需要时间收尾 `.xcresult`。
   * 直接 SIGKILL 会留下损坏的结果包，Xcode 打不开、CI 也解析不了。
   */
  shutdownGraceMs: 10_000,
  killSignal: 'SIGTERM' as NodeJS.Signals,
  /** 串行：UI 操作天然不可并发 */
  maxPendingRequests: 1,
  logDir: 'reports/xcuitest',
  /**
   * 桥接传输模式，默认 http。
   *
   * 历史默认是 'stdio'，但 xcodebuild 不会把主机 stdin 接到设备上的 XCTest 进程，
   * 导致「握手成功、首条命令超时」的迷惑性失败（见文件头【为什么传输默认走 HTTP】）。
   * 故默认改为 http。stdio 模式仅适用于非 xcodebuild 的本地直跑，omni 默认路径（xcodebuild）必须用 http。
   */
  mode: 'http' as const,
  /** http 模式下的监听地址，stdio 模式忽略 */
  host: '127.0.0.1',
  /**
   * http 模式监听端口，与 XCUITestDriver.DEFAULT_BRIDGE_CONFIG.port(8642) 对齐。
   *
   * 实际生效值取本默认值：config.bridge 总由 toBridgeConfig() 从 runner 投影出来（见 index.ts），
   * Driver 的 DEFAULT_BRIDGE_CONFIG 仅作兜底、正常路径不会走到。
   * 统一成 8642 可消除「两端默认端口不一致、靠调用顺序决定谁生效」的隐患
   * （原 8300 与 Driver 的 8642 分歧，Runner 侧 README 已记录在案）。
   */
  port: 8642,
} as const;

/**
 * 拼装 `xcodebuild test-without-building` 参数。
 *
 * 为什么是 `test-without-building` 而不是 `test`：
 * `test` 每次都会做一次增量编译检查，即使没有代码变更也要花 10~60s；
 * 而 E2E 的常态是「构建一次、跑很多轮」。把构建与执行拆开，
 * 让 CI 可以缓存 `.xctestrun` 与产物，单轮执行时间能降一个数量级。
 */
export function buildXcodebuildTestArgs(input: {
  readonly xctestrunPath?: string;
  readonly destination: string;
  readonly derivedDataPath?: string;
  readonly resultBundlePath?: string;
  readonly extraArgs?: readonly string[];
}): string[] {
  const args: string[] = ['xcodebuild', 'test-without-building'];

  if (input.xctestrunPath !== undefined && input.xctestrunPath.trim() !== '') {
    args.push('-xctestrun', toAbsolutePath(input.xctestrunPath));
  }

  args.push('-destination', input.destination);

  if (input.derivedDataPath !== undefined && input.derivedDataPath.trim() !== '') {
    args.push('-derivedDataPath', toAbsolutePath(input.derivedDataPath));
  }

  if (input.resultBundlePath !== undefined && input.resultBundlePath.trim() !== '') {
    args.push('-resultBundlePath', toAbsolutePath(input.resultBundlePath));
  }

  // 见 xcuitest.ios.config.ts 中的同名说明
  args.push('-destination-timeout', '120');

  /**
   * `-parallel-testing-enabled NO`：xcodebuild 的并行测试会克隆多台模拟器，
   * 每台都跑一个 Runner，而我们的 NDJSON 桥接假设「一个子进程 ↔ 一台设备」。
   * 开启并行会让多个 Runner 往同一个 stdout 写帧，协议直接错乱。
   */
  args.push('-parallel-testing-enabled', 'NO');

  if (input.extraArgs !== undefined) {
    args.push(...input.extraArgs);
  }

  return args;
}

/** 构建 Runner 进程配置 */
export function buildXCUITestRunnerConfig(input: XCUITestRunnerInput): XCUITestRunnerConfig {
  const { env } = input;

  // OMNI_XCRUN_PATH 是 ENV_SPEC 中的既有变量，默认 /usr/bin/xcrun
  const command = input.command
    ?? (env.xcrunPath.trim() !== '' ? env.xcrunPath : XCUITEST_RUNNER_DEFAULTS.command);

  const args = input.args ?? buildXcodebuildTestArgs({
    xctestrunPath: input.xctestrunPath,
    destination: input.destination,
    derivedDataPath: input.derivedDataPath,
    resultBundlePath: input.resultBundlePath,
    extraArgs: input.extraArgs,
  });

  const logFile = toAbsolutePath(
    input.logFile
    ?? `${XCUITEST_RUNNER_DEFAULTS.logDir}/runner-${input.runId ?? 'latest'}.log`,
  );

  return {
    command,
    args,
    cwd: toAbsolutePath(input.cwd ?? '.'),
    env: {
      // 关掉 Xcode 的彩色输出：ANSI 转义序列混进 stderr 会污染日志文件
      NSUnbufferedIO: 'YES',
      // 告诉 Swift 侧 Runner 用哪个协议版本握手
      OMNI_BRIDGE_PROTOCOL: 'ndjson',
      OMNI_BRIDGE_PROTOCOL_VERSION: String(XCUITEST_PROTOCOL_VERSION),
      // Runner 的人类可读日志落到这里，避免打到被协议独占的 stdout
      OMNI_BRIDGE_LOG_FILE: logFile,
    },
    handshakeTimeoutMs: input.handshakeTimeoutMs
      ?? Math.max(env.timeouts.startupMs, XCUITEST_RUNNER_DEFAULTS.handshakeTimeoutMs),
    requestTimeoutMs: input.requestTimeoutMs
      ?? Math.max(env.timeouts.actionMs, XCUITEST_RUNNER_DEFAULTS.requestTimeoutMs),
    shutdownGraceMs: input.shutdownGraceMs ?? XCUITEST_RUNNER_DEFAULTS.shutdownGraceMs,
    killSignal: XCUITEST_RUNNER_DEFAULTS.killSignal,
    protocol: 'ndjson',
    protocolVersion: String(XCUITEST_PROTOCOL_VERSION),
    maxPendingRequests: input.maxPendingRequests ?? XCUITEST_RUNNER_DEFAULTS.maxPendingRequests,
    logFile,
    forwardStderr: env.logLevel === 'debug',
  };
}

/**
 * 从 Runner 配置投影出契约层要求的 `XCUITestBridgeConfig`。
 *
 * 两个类型的关系：`XCUITestRunnerConfig` 是**进程启动规格**（怎么把 Runner 拉起来），
 * `XCUITestBridgeConfig` 是**契约层的桥接元信息**（超时、模式、退出信号）。
 * 后者是前者的子集投影，由本函数单向派生，避免两处各写一份超时值而分叉。
 */
export function toBridgeConfig(runner: XCUITestRunnerConfig): XCUITestBridgeConfig {
  return {
    mode: XCUITEST_RUNNER_DEFAULTS.mode,
    host: XCUITEST_RUNNER_DEFAULTS.host,
    port: XCUITEST_RUNNER_DEFAULTS.port,
    handshakeTimeoutMs: runner.handshakeTimeoutMs,
    commandTimeoutMs: runner.requestTimeoutMs,
    killSignal: runner.killSignal,
  };
}

/** 校验 Runner 配置 */
export function validate(config: XCUITestRunnerConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.command.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'xcuitest.runner.command',
      message: 'Runner 可执行文件路径不能为空',
      severity: 'error',
      hint: '请检查 OMNI_XCRUN_PATH，默认应为 /usr/bin/xcrun',
    });
  }

  if (config.args.length === 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'xcuitest.runner.args',
      message: 'Runner 参数数组为空，子进程将不知道要执行什么',
      severity: 'error',
    });
  }

  const hasDestination = config.args.includes('-destination');
  if (!hasDestination) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'xcuitest.runner.args',
      message: '参数中缺少 -destination，xcodebuild 无法确定目标设备',
      severity: 'error',
    });
  }

  // 参数里出现引号，几乎必然是把 shell 写法照搬进了 execFile 数组
  for (const arg of config.args) {
    if (arg.startsWith('"') || arg.startsWith("'")) {
      issues.push({
        code: ERROR_CODES.CONFIG_INVALID,
        path: 'xcuitest.runner.args',
        message: `参数 ${arg} 以引号开头；execFile 不经过 shell，引号会成为参数值的一部分`,
        severity: 'error',
        hint: '直接写裸值即可，如 platform=iOS Simulator,name=iPhone 15',
      });
      break;
    }
  }

  if (config.protocol !== 'ndjson') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.runner.protocol',
      message: `当前仅实现 ndjson 协议，实际为 '${String(config.protocol)}'`,
      severity: 'error',
    });
  }

  if (config.handshakeTimeoutMs <= 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.runner.handshakeTimeoutMs',
      message: `握手超时必须为正数，实际为 ${String(config.handshakeTimeoutMs)}`,
      severity: 'error',
    });
  } else if (config.handshakeTimeoutMs < 120_000) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.runner.handshakeTimeoutMs',
      message: `握手超时 ${config.handshakeTimeoutMs}ms 偏小；`
        + 'xcodebuild 需完成解析 .xctestrun、安装 Runner.app、启动设备三步',
      severity: 'warning',
      hint: '建议不低于 120000',
    });
  }

  if (config.requestTimeoutMs <= 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.runner.requestTimeoutMs',
      message: `请求超时必须为正数，实际为 ${String(config.requestTimeoutMs)}`,
      severity: 'error',
    });
  }

  if (config.requestTimeoutMs >= config.handshakeTimeoutMs) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.runner.requestTimeoutMs',
      message: `单条请求超时（${config.requestTimeoutMs}ms）不小于握手超时（${config.handshakeTimeoutMs}ms），`
        + '意味着握手期间的重试窗口被完全吃掉',
      severity: 'warning',
    });
  }

  if (config.shutdownGraceMs < 1_000) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.runner.shutdownGraceMs',
      message: `优雅退出宽限 ${config.shutdownGraceMs}ms 过短，xcodebuild 来不及收尾 .xcresult，结果包会损坏`,
      severity: 'warning',
      hint: '建议不低于 5000',
    });
  }

  if (!Number.isInteger(config.maxPendingRequests) || config.maxPendingRequests < 1) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.runner.maxPendingRequests',
      message: `maxPendingRequests 必须是 >= 1 的整数，实际为 ${String(config.maxPendingRequests)}`,
      severity: 'error',
    });
  } else if (config.maxPendingRequests > 1) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.runner.maxPendingRequests',
      message: `maxPendingRequests=${config.maxPendingRequests} > 1；UI 操作本身不可并发，`
        + '在途请求堆积只会掩盖对端卡死',
      severity: 'warning',
    });
  }

  if (config.logFile.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'xcuitest.runner.logFile',
      message: 'logFile 不能为空：stdout 被 NDJSON 协议独占，Runner 日志必须有落脚点',
      severity: 'error',
    });
  }

  return issues;
}
