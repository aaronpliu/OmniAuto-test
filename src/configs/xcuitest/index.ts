import type {
  AppConfig,
  DeviceConfig,
  EnvConfig,
  ValidationIssue,
  XCUITestFrameworkConfig,
} from '../../contracts/types';
import { ERROR_CODES, InvalidCombinationError } from '../../contracts/types';

import type { XCUITestIosConfig } from './xcuitest.ios.config';
import {
  buildXCUITestIosConfig,
  validate as validateIosConfig,
} from './xcuitest.ios.config';
import type { XCUITestRunnerConfig } from './xcuitest.runner.config';
import {
  buildXCUITestRunnerConfig,
  toBridgeConfig,
  validate as validateRunnerConfig,
} from './xcuitest.runner.config';

/**
 * XCUITest 框架配置装配入口。
 *
 * 【本文件在整条链路中的位置】
 * `xcuitest.ios.config.ts` 负责「怎么让 xcodebuild 找到正确的工程与设备」，
 * `xcuitest.runner.config.ts` 负责「怎么把 Runner 子进程拉起来并与之通信」。
 * 两者都是**片段**，谁都不能单独交给上层使用。
 * 本文件把它们缝合成契约层唯一认可的 `XCUITestFrameworkConfig`，
 * 并保证一件事：**destination 只被计算一次**。
 *
 * 为什么强调这点：destination 同时出现在
 *   - `xcodebuild build-for-testing`（iOS 侧参数）
 *   - `xcodebuild test-without-building`（Runner 侧参数）
 * 两处。如果两边各算一次，一旦设备解析逻辑有任何漂移（比如一边带 `OS=` 一边不带），
 * 就会出现「构建产物给了模拟器 A，执行却跑到模拟器 B」的幽灵失败 ——
 * 报错停在 "Test runner exited before starting test execution"，
 * 完全看不出是 destination 不一致造成的。
 * 因此这里先算 iOS 侧配置，再把 `ios.destination` 原样喂给 Runner，形成单一来源。
 *
 * 【为什么 XCUITest 只支持 iOS 而不做「优雅降级」】
 * XCUITest 是 XCTest 的一部分，绑定 Apple 工具链，Android 上无对应物。
 * 与其返回一个不可用的配置让错误延迟到 xcodebuild 启动时才炸，
 * 不如在配置装配阶段就抛 `InvalidCombinationError`，
 * 让 CLI 能直接打印「XCUITest 不支持 Android，请改用 appium/detox」。
 */

/** 框架配置装配输入 */
export interface XCUITestFrameworkBuildInput {
  readonly app: AppConfig;
  readonly device: DeviceConfig;
  readonly env: EnvConfig;
  /** 运行标识，用于隔离每轮的 .xcresult 与 Runner 日志 */
  readonly runId?: string;
  readonly scheme?: string;
  readonly workspacePath?: string;
  readonly projectPath?: string;
  readonly configuration?: 'Debug' | 'Release';
  readonly derivedDataPath?: string;
  readonly testPlan?: string;
  readonly resultBundlePath?: string;
  readonly runnerTarget?: string;
  /** `.xctestrun` 路径；缺省时由 derivedDataPath 推导 */
  readonly xctestrunPath?: string;
  readonly startupTimeoutMs?: number;
  readonly actionTimeoutMs?: number;
  readonly waitTimeoutMs?: number;
  readonly waitIntervalMs?: number;
  /** 追加到 xcodebuild 的额外参数 */
  readonly extraArgs?: readonly string[];
}

/**
 * XCUITest 框架层默认超时。
 *
 * 三个框架里 XCUITest 的 startup 最长：Appium 只需连上已运行的 server，
 * Detox 只需装包并起 App，而 XCUITest 要完整跑一遍
 * 「xcodebuild 解析 .xctestrun → 安装 Runner.app → 冷启动模拟器 → 建立 NDJSON 管道」。
 */
export const XCUITEST_FRAMEWORK_DEFAULTS = {
  /** 300s：与 Runner 握手超时对齐，避免框架层先超时而子进程还在跑 */
  startupTimeoutMs: 300_000,
  /** 15s：一次桥接往返（Node → stdin → Swift → XCTest → stdout → Node） */
  actionTimeoutMs: 15_000,
  /** 30s：显式等待元素出现 */
  waitTimeoutMs: 30_000,
  /**
   * 250ms：每次轮询都要跨进程发一帧 NDJSON 并等 XCTest 查询可访问性树，
   * 比 Detox 的内存内查询贵得多。轮询过密会把 Runner 打满，反而拖慢整体。
   */
  waitIntervalMs: 250,
  /** .xctestrun 在 DerivedData 中的相对位置 */
  xctestrunDir: 'Build/Products',
} as const;

/**
 * 由 DerivedData 推导 `.xctestrun` 路径。
 *
 * xcodebuild `build-for-testing` 会把 `.xctestrun` 落在
 * `<derivedDataPath>/Build/Products/<Scheme>_<TestPlan>_<sdk><version>-<arch>.xctestrun`，
 * 文件名中的 SDK 版本与架构在构建前无法准确预知。
 * 因此这里只给出**目录 + 通配前缀**，真正的文件由执行层做一次 glob 匹配。
 * 之所以不在配置层做 glob：配置层是纯数据，不做 I/O（否则 dry-run 与单测都会被文件系统绑架）。
 */
export function buildXctestrunHint(derivedDataPath: string, scheme: string): string {
  return `${derivedDataPath}/${XCUITEST_FRAMEWORK_DEFAULTS.xctestrunDir}/${scheme}_*.xctestrun`;
}

/** 装配结果：契约配置 + 两个内部片段（供执行层直接取用，避免二次计算） */
export interface XCUITestAssembly {
  readonly config: XCUITestFrameworkConfig;
  readonly ios: XCUITestIosConfig;
  readonly runner: XCUITestRunnerConfig;
  /** `.xctestrun` 的 glob 提示，见 buildXctestrunHint 说明 */
  readonly xctestrunHint: string;
}

/**
 * 装配 XCUITest 框架配置（含内部片段）。
 *
 * @throws {InvalidCombinationError} 平台不是 iOS
 */
export function buildXCUITestAssembly(input: XCUITestFrameworkBuildInput): XCUITestAssembly {
  const { app, device, env } = input;

  if (device.platform !== 'ios') {
    throw new InvalidCombinationError(
      { framework: 'xcuitest', platform: device.platform, device: device.kind, app: app.key },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'options.framework',
          message: `XCUITest 依赖 Apple 的 XCTest 工具链，无法运行在 platform='${device.platform}' 上`,
          severity: 'error',
          hint: 'Android 平台请使用 --framework=appium 或 --framework=detox',
        },
      ],
    );
  }

  // 第一步：iOS 侧参数（destination 在这里被唯一地计算出来）
  const ios = buildXCUITestIosConfig({
    app,
    device,
    env,
    scheme: input.scheme,
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    configuration: input.configuration,
    derivedDataPath: input.derivedDataPath,
    testPlan: input.testPlan,
    resultBundlePath: input.resultBundlePath,
    runnerTarget: input.runnerTarget,
    runId: input.runId,
    extraArgs: input.extraArgs,
  });

  const xctestrunHint = buildXctestrunHint(ios.derivedDataPath, ios.scheme);

  // 第二步：Runner 子进程，destination / derivedData / resultBundle 全部复用 iOS 侧结果
  const runner = buildXCUITestRunnerConfig({
    env,
    xctestrunPath: input.xctestrunPath,
    destination: ios.destination,
    derivedDataPath: ios.derivedDataPath,
    resultBundlePath: ios.resultBundlePath,
    handshakeTimeoutMs: input.startupTimeoutMs,
    requestTimeoutMs: input.actionTimeoutMs,
    runId: input.runId,
    extraArgs: input.extraArgs,
  });

  // 第三步：投影为契约类型
  const config: XCUITestFrameworkConfig = {
    framework: 'xcuitest',
    platform: 'ios',
    startupTimeoutMs: input.startupTimeoutMs
      ?? Math.max(env.timeouts.startupMs, XCUITEST_FRAMEWORK_DEFAULTS.startupTimeoutMs),
    actionTimeoutMs: input.actionTimeoutMs
      ?? Math.max(env.timeouts.actionMs, XCUITEST_FRAMEWORK_DEFAULTS.actionTimeoutMs),
    waitTimeoutMs: input.waitTimeoutMs
      ?? Math.max(env.timeouts.waitMs, XCUITEST_FRAMEWORK_DEFAULTS.waitTimeoutMs),
    waitIntervalMs: input.waitIntervalMs ?? XCUITEST_FRAMEWORK_DEFAULTS.waitIntervalMs,
    xcrunPath: runner.command,
    projectPath: ios.projectPath,
    workspacePath: ios.workspacePath,
    scheme: ios.scheme,
    testPlan: ios.testPlan,
    runnerTarget: ios.runnerTarget,
    derivedDataPath: ios.derivedDataPath,
    resultBundlePath: ios.resultBundlePath,
    bridge: toBridgeConfig(runner),
  };

  return { config, ios, runner, xctestrunHint };
}

/**
 * 装配 XCUITest 框架配置（仅契约类型，供 resolveRunConfig 使用）。
 *
 * @throws {InvalidCombinationError} 平台不是 iOS
 */
export function buildXCUITestFrameworkConfig(
  input: XCUITestFrameworkBuildInput,
): XCUITestFrameworkConfig {
  return buildXCUITestAssembly(input).config;
}

/**
 * 校验 XCUITest 框架配置。
 *
 * 只接收契约类型（`resolveRunConfig` 手里只有它）；
 * 需要连同 iOS/Runner 片段一起校验时用 `validateAssembly`。
 */
export function validate(config: XCUITestFrameworkConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.platform !== 'ios') {
    issues.push({
      code: ERROR_CODES.INVALID_COMBINATION,
      path: 'framework.platform',
      message: `XCUITest 配置的 platform 为 '${config.platform}'，但该框架仅支持 ios`,
      severity: 'error',
    });
  }

  if (config.xcrunPath.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'framework.xcrunPath',
      message: 'xcrunPath 为空，无法定位 Xcode 工具链',
      severity: 'error',
      hint: '设置 OMNI_XCRUN_PATH，或确认 /usr/bin/xcrun 存在（需已安装 Xcode Command Line Tools）',
    });
  } else if (!config.xcrunPath.startsWith('/')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'framework.xcrunPath',
      message: `xcrunPath '${config.xcrunPath}' 不是绝对路径`,
      severity: 'warning',
      hint: '子进程的 PATH 可能与当前 shell 不同，建议使用绝对路径',
    });
  }

  if (config.workspacePath === undefined && config.projectPath === undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'framework.workspacePath',
      message: 'workspacePath 与 projectPath 均未提供，xcodebuild 无法确定构建目标',
      severity: 'error',
    });
  }

  if (config.scheme.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'framework.scheme',
      message: 'scheme 不能为空',
      severity: 'error',
    });
  }

  if (config.runnerTarget.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'framework.runnerTarget',
      message: 'runnerTarget 不能为空：NDJSON 桥接的 Swift 侧实现就在这个 target 里',
      severity: 'error',
    });
  } else if (!config.runnerTarget.includes('UITests')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'framework.runnerTarget',
      message: `runnerTarget '${config.runnerTarget}' 不含 UITests；`
        + 'XCUITest 的宿主必须是 UI Testing Bundle，Unit Testing Bundle 无法驱动其它进程的 UI',
      severity: 'warning',
    });
  }

  if (config.derivedDataPath.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'framework.derivedDataPath',
      message: 'derivedDataPath 不能为空，否则 .xctestrun 会落到 Xcode 全局缓存目录而难以定位',
      severity: 'error',
    });
  }

  if (config.resultBundlePath.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'framework.resultBundlePath',
      message: 'resultBundlePath 不能为空，测试结果将无法归档',
      severity: 'error',
    });
  }

  // 桥接超时必须覆盖框架层的动作超时，否则框架层还在等、管道已被判死
  if (config.bridge.commandTimeoutMs < config.actionTimeoutMs) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'framework.bridge.commandTimeoutMs',
      message: `桥接命令超时（${config.bridge.commandTimeoutMs}ms）小于框架动作超时（${config.actionTimeoutMs}ms），`
        + '动作还没超时管道就先断了，错误会表现为莫名其妙的 bridge timeout',
      severity: 'warning',
    });
  }

  if (config.bridge.handshakeTimeoutMs < config.startupTimeoutMs) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'framework.bridge.handshakeTimeoutMs',
      message: `桥接握手超时（${config.bridge.handshakeTimeoutMs}ms）小于框架启动超时（${config.startupTimeoutMs}ms）`,
      severity: 'warning',
    });
  }

  if (config.bridge.mode === 'http' && config.bridge.port <= 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'framework.bridge.port',
      message: `bridge.mode='http' 时 port 必须为正整数，实际为 ${String(config.bridge.port)}`,
      severity: 'error',
    });
  }

  if (config.waitIntervalMs <= 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'framework.waitIntervalMs',
      message: `waitIntervalMs 必须为正数，实际为 ${String(config.waitIntervalMs)}`,
      severity: 'error',
    });
  } else if (config.waitIntervalMs < 100) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'framework.waitIntervalMs',
      message: `轮询间隔 ${config.waitIntervalMs}ms 过密；每次轮询都是一次跨进程 NDJSON 往返，`
        + '会把 Runner 打满并拖慢整体',
      severity: 'warning',
      hint: '建议不低于 200ms',
    });
  }

  if (config.waitTimeoutMs < config.actionTimeoutMs) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'framework.waitTimeoutMs',
      message: `显式等待超时（${config.waitTimeoutMs}ms）小于单动作超时（${config.actionTimeoutMs}ms），语义倒置`,
      severity: 'warning',
    });
  }

  return issues;
}

/** 连同 iOS/Runner 片段一起校验，返回聚合后的问题列表 */
export function validateAssembly(assembly: XCUITestAssembly): ValidationIssue[] {
  return [
    ...validate(assembly.config),
    ...validateIosConfig(assembly.ios),
    ...validateRunnerConfig(assembly.runner),
  ];
}

export {
  buildDestination,
  buildXCUITestIosConfig,
  defaultXcuitestScheme,
  resolveSdk,
  validate as validateIosConfig,
  XCUITEST_IOS_DEFAULTS,
} from './xcuitest.ios.config';
export type { XCUITestIosConfig, XCUITestIosInput } from './xcuitest.ios.config';

export {
  buildXCUITestRunnerConfig,
  buildXcodebuildTestArgs,
  toBridgeConfig,
  validate as validateRunnerConfig,
  XCUITEST_PROTOCOL_VERSION,
  XCUITEST_RUNNER_DEFAULTS,
} from './xcuitest.runner.config';
export type { XCUITestRunnerConfig, XCUITestRunnerInput } from './xcuitest.runner.config';
