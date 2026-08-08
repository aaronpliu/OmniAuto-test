import type {
  AppConfig,
  DetoxFrameworkConfig,
  DeviceConfig,
  EnvConfig,
  Platform,
  TestConfig,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES, InvalidCombinationError } from '../../contracts/types';
import { toAbsolutePath } from '../../utils/paths';

import type {
  DetoxAndroidAppEntry,
  DetoxAndroidDeviceEntry,
} from './detox.android.config';
import {
  DETOX_ANDROID_DEFAULTS,
  buildAndroidBinaryPath,
  buildAndroidBuildCommand,
  buildAndroidTestBinaryPath,
  buildDetoxAndroidApp,
  buildDetoxAndroidDevice,
  validateApp as validateAndroidApp,
  validateDevice as validateAndroidDevice,
} from './detox.android.config';
import type { DetoxIosAppEntry, DetoxIosDeviceEntry } from './detox.ios.config';
import {
  DETOX_IOS_DEFAULTS,
  buildDetoxIosApp,
  buildDetoxIosDevice,
  buildIosBinaryPath,
  buildIosBuildCommand,
  defaultIosScheme,
  validateApp as validateIosApp,
  validateDevice as validateIosDevice,
} from './detox.ios.config';
import type { DetoxRunnerConfig, DetoxRunnerInput } from './detox.runner.config';
import {
  DETOX_RUNNER_DEFAULTS,
  buildDetoxArtifactsConfig,
  buildDetoxBehaviorConfig,
  buildDetoxRunnerConfig,
  buildDetoxSessionConfig,
  buildDetoxTestRunnerConfig,
  validate as validateDetoxRunner,
} from './detox.runner.config';

/**
 * Detox 框架配置装配层。
 *
 * 本文件产出**两种形态**的配置，服务于两个不同的消费者：
 *
 * 1. `buildDetoxFrameworkConfig()` → `DetoxFrameworkConfig`
 *    给本工程的适配器层用，只含「Detox 会话该怎么建」的元信息（configuration 名、超时、产物目录）。
 *
 * 2. `buildDetoxrcObject()` → Detox CLI 真正认识的 `.detoxrc` 结构
 *    Detox 是**外部进程**：`detox test -c ios.sim.debug` 由 detox CLI 读取磁盘上的
 *    `.detoxrc.js` 来决定装哪个包、起哪台设备。CLI 不可能读到我们内存里的 TS 对象，
 *    所以必须能把配置**序列化落盘**。这就是第二个函数存在的全部理由。
 *
 * 落盘方式（由 CLI/setup 层执行，本文件不做任何 I/O）：
 * ```js
 * // .detoxrc.js（工程根）
 * const { buildDetoxrcObject } = require('./src/configs/detox');
 * module.exports = buildDetoxrcObject({ ... });
 * ```
 * 或在 globalSetup 中写出静态 JSON：
 * ```ts
 * fs.writeFileSync('.detoxrc.json', JSON.stringify(buildDetoxrcObject(input), null, 2));
 * ```
 * 两种方式 detox CLI 都支持（`.detoxrc.js` / `.detoxrc.json`）。
 */

/* ═══════════════ 类型 ═══════════════ */

/** 框架层超时覆盖 */
export interface DetoxTimeoutOverrides {
  readonly startupMs?: number;
  readonly actionMs?: number;
  readonly waitMs?: number;
  readonly intervalMs?: number;
}

/** Detox 框架配置构建输入 */
export interface DetoxFrameworkBuildInput {
  readonly app: AppConfig;
  readonly device: DeviceConfig;
  readonly env: EnvConfig;
  readonly test?: TestConfig;
  readonly binaryPath?: string;
  readonly timeouts?: DetoxTimeoutOverrides;
  /** `.detoxrc` 路径（相对工程根或绝对路径），默认 `.detoxrc.js` */
  readonly detoxConfigPath?: string;
  /** 覆盖 configuration 名 */
  readonly configurationName?: string;
  /** 是否跨用例复用同一 App 实例 */
  readonly reuseSession?: boolean;
  /** 构建类型，影响 configuration 名后缀与 gradle/xcodebuild 参数 */
  readonly buildType?: 'debug' | 'release';
}

/** `.detoxrc` 顶层结构 */
export interface DetoxrcObject {
  readonly apps: Readonly<Record<string, DetoxIosAppEntry | DetoxAndroidAppEntry>>;
  readonly devices: Readonly<Record<string, DetoxIosDeviceEntry | DetoxAndroidDeviceEntry>>;
  readonly configurations: Readonly<Record<string, { readonly device: string; readonly app: string }>>;
  readonly behavior: DetoxRunnerConfig['behavior'];
  readonly artifacts: DetoxRunnerConfig['artifacts'];
  readonly testRunner: DetoxRunnerConfig['testRunner'];
  readonly session: DetoxRunnerConfig['session'];
}

/** Detox 框架层超时默认值 —— 五级合并链的第 ⑤ 级 */
export const DETOX_FRAMEWORK_DEFAULTS = {
  /** 300s：起设备 + 装两个包 + 建 ws 会话，与 runner 的 setupTimeout 对齐 */
  startupTimeoutMs: 300_000,
  /**
   * 10s：Detox 的动作是进程内同步调用，且自带「等 App 空闲」的同步机制，
   * 真正卡住时多半是 App 有常驻动画/轮询，再等也没用，早点报错反而能拿到 busy 资源清单。
   */
  actionTimeoutMs: 10_000,
  /** 20s */
  waitTimeoutMs: 20_000,
  /** 100ms：进程内轮询几乎无成本，可以比 Appium 密集得多 */
  waitIntervalMs: 100,
  /** 默认 `.detoxrc` 文件名 */
  configFileName: '.detoxrc.js',
} as const;

/* ═══════════════ configuration 名 ═══════════════ */

/**
 * 生成 Detox configuration 名。
 *
 * 命名遵循 Detox 社区约定 `<platform>.<deviceShort>.<buildType>`：
 * `ios.sim.debug` / `android.emu.debug` / `android.attached.debug`。
 * 这个名字会出现在 `detox test -c <name>` 命令行里，是人机交互的一部分，
 * 所以用简写而不是把 DeviceKind 原样拼进去（`android.emulator.debug` 太长且不符合社区习惯）。
 */
export function buildConfigurationName(
  platform: Platform,
  deviceKind: DeviceConfig['kind'],
  buildType: 'debug' | 'release' = 'debug',
): string {
  if (platform === 'ios') {
    return `ios.sim.${buildType}`;
  }
  const deviceSegment = deviceKind === 'emulator' ? 'emu' : 'attached';
  return `android.${deviceSegment}.${buildType}`;
}

/** 由 configuration 名反推 device / app 条目键 */
export function buildEntryKeys(platform: Platform, deviceKind: DeviceConfig['kind'], buildType: string): {
  readonly deviceKey: string;
  readonly appKey: string;
} {
  if (platform === 'ios') {
    return { deviceKey: 'ios.simulator', appKey: `ios.${buildType}` };
  }
  return {
    deviceKey: deviceKind === 'emulator' ? 'android.emulator' : 'android.attached',
    appKey: `android.${buildType}`,
  };
}

/* ═══════════════ 框架配置 ═══════════════ */

/**
 * 构建 `DetoxFrameworkConfig`（给本工程适配器层用）。
 *
 * @throws {InvalidCombinationError} 平台非 ios/android，或 iOS 真机（Detox 不支持）
 */
export function buildDetoxFrameworkConfig(input: DetoxFrameworkBuildInput): DetoxFrameworkConfig {
  const { app, device, env } = input;
  const platform = device.platform;
  const buildType = input.buildType ?? 'debug';

  if (platform !== 'ios' && platform !== 'android') {
    throw new InvalidCombinationError(
      { framework: 'detox', platform, device: device.kind, app: app.key },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'options.platform',
          message: `Detox 仅支持 ios / android，实际收到 '${String(platform)}'`,
          severity: 'error',
        },
      ],
    );
  }

  // iOS 真机：Detox 官方明确不支持，必须在配置阶段拦下而不是等到运行时报一个费解的错
  if (platform === 'ios' && device.kind !== 'simulator') {
    throw new InvalidCombinationError(
      { framework: 'detox', platform, device: device.kind, app: app.key },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'options.device',
          message: `Detox 在 iOS 上只支持模拟器，不支持 ${device.kind}`,
          severity: 'error',
          hint: 'iOS 真机请改用 --framework=appium 或 --framework=xcuitest',
        },
      ],
    );
  }

  const configurationName = input.configurationName
    ?? buildConfigurationName(platform, device.kind, buildType);

  return {
    framework: 'detox',
    platform,
    startupTimeoutMs: input.timeouts?.startupMs ?? DETOX_FRAMEWORK_DEFAULTS.startupTimeoutMs,
    actionTimeoutMs: input.timeouts?.actionMs ?? DETOX_FRAMEWORK_DEFAULTS.actionTimeoutMs,
    waitTimeoutMs: input.timeouts?.waitMs ?? DETOX_FRAMEWORK_DEFAULTS.waitTimeoutMs,
    waitIntervalMs: input.timeouts?.intervalMs ?? DETOX_FRAMEWORK_DEFAULTS.waitIntervalMs,
    configurationName,
    // 绝对化：detox CLI 的 cwd 不一定是工程根，相对路径会解析到意料之外的位置
    detoxConfigPath: toAbsolutePath(input.detoxConfigPath ?? DETOX_FRAMEWORK_DEFAULTS.configFileName),
    artifactsRootDir: toAbsolutePath(env.artifactsDir),
    launchArgs: app.launchArgs,
    reuseSession: input.reuseSession ?? false,
  };
}

/**
 * 构建 detox CLI 真正认识的 `.detoxrc` 对象。
 *
 * @param input 与 `buildDetoxFrameworkConfig` 相同的输入
 * @returns 可直接 `JSON.stringify` 落盘或在 `.detoxrc.js` 里 `module.exports =` 的对象
 * @throws {InvalidCombinationError} 组合非法（同 buildDetoxFrameworkConfig）
 */
export function buildDetoxrcObject(input: DetoxFrameworkBuildInput): DetoxrcObject {
  const { app, device, env } = input;
  const platform = device.platform;
  const buildType = input.buildType ?? 'debug';

  // 复用框架配置构建器做组合合法性校验，避免两处各写一份规则
  const frameworkConfig = buildDetoxFrameworkConfig(input);

  const { deviceKey, appKey } = buildEntryKeys(platform, device.kind, buildType);

  const devices: Record<string, DetoxIosDeviceEntry | DetoxAndroidDeviceEntry> = {};
  const apps: Record<string, DetoxIosAppEntry | DetoxAndroidAppEntry> = {};

  if (platform === 'ios') {
    devices[deviceKey] = buildDetoxIosDevice(device);
    apps[appKey] = buildDetoxIosApp({
      app,
      binaryPath: input.binaryPath,
      configuration: buildType === 'release' ? 'Release' : 'Debug',
    });
  } else {
    devices[deviceKey] = buildDetoxAndroidDevice(device);
    apps[appKey] = buildDetoxAndroidApp({
      app,
      binaryPath: input.binaryPath,
      buildType,
    });
  }

  const runnerInput: DetoxRunnerInput = {
    env,
    test: input.test,
    artifactsRootDir: env.artifactsDir,
    reuseSession: input.reuseSession,
  };
  const runner = buildDetoxRunnerConfig(runnerInput);

  return {
    apps,
    devices,
    configurations: {
      [frameworkConfig.configurationName]: { device: deviceKey, app: appKey },
    },
    behavior: runner.behavior,
    artifacts: runner.artifacts,
    testRunner: runner.testRunner,
    session: runner.session,
  };
}

/** 校验 `DetoxFrameworkConfig` */
export function validate(config: DetoxFrameworkConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.configurationName.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.configurationName',
      message: 'configurationName 不能为空，detox CLI 需要用它定位 configuration',
      severity: 'error',
    });
  }

  if (config.detoxConfigPath.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.detoxConfigPath',
      message: 'detoxConfigPath 不能为空',
      severity: 'error',
    });
  } else if (!/\.(js|json|ts|cjs|mjs)$/.test(config.detoxConfigPath)) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.detoxConfigPath',
      message: `detoxConfigPath "${config.detoxConfigPath}" 扩展名不是 detox 支持的类型`,
      severity: 'warning',
      hint: 'detox CLI 支持 .detoxrc.js / .detoxrc.json / .detoxrc（无扩展名的 JSON）',
    });
  }

  if (config.artifactsRootDir.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.artifactsRootDir',
      message: '产物根目录不能为空',
      severity: 'error',
    });
  }

  const timeoutEntries: readonly (readonly [string, number])[] = [
    ['startupTimeoutMs', config.startupTimeoutMs],
    ['actionTimeoutMs', config.actionTimeoutMs],
    ['waitTimeoutMs', config.waitTimeoutMs],
    ['waitIntervalMs', config.waitIntervalMs],
  ];
  for (const [name, value] of timeoutEntries) {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        code: ERROR_CODES.CONFIG_INVALID,
        path: `detox.${name}`,
        message: `${name} 必须为正数，实际为 ${String(value)}`,
        severity: 'error',
      });
    }
  }

  if (config.waitIntervalMs >= config.waitTimeoutMs) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.waitIntervalMs',
      message: `轮询间隔（${config.waitIntervalMs}ms）不小于等待超时（${config.waitTimeoutMs}ms）`,
      severity: 'error',
    });
  }

  if (config.platform === 'ios' && !config.configurationName.startsWith('ios.')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.configurationName',
      message: `platform=ios 但 configurationName='${config.configurationName}' 不以 "ios." 开头，可能选错了 configuration`,
      severity: 'warning',
    });
  }
  if (config.platform === 'android' && !config.configurationName.startsWith('android.')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.configurationName',
      message: `platform=android 但 configurationName='${config.configurationName}' 不以 "android." 开头`,
      severity: 'warning',
    });
  }

  return issues;
}

/** 校验完整的 `.detoxrc` 对象（apps / devices / runner 三段聚合） */
export function validateDetoxrc(detoxrc: DetoxrcObject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const entry of Object.values(detoxrc.devices)) {
    if (entry.type === 'ios.simulator') {
      issues.push(...validateIosDevice(entry));
    } else {
      issues.push(...validateAndroidDevice(entry));
    }
  }

  for (const entry of Object.values(detoxrc.apps)) {
    if (entry.type === 'ios.app') {
      issues.push(...validateIosApp(entry));
    } else {
      issues.push(...validateAndroidApp(entry));
    }
  }

  issues.push(...validateDetoxRunner({
    testRunner: detoxrc.testRunner,
    behavior: detoxrc.behavior,
    artifacts: detoxrc.artifacts,
    session: detoxrc.session,
  }));

  // 交叉校验：每个 configuration 引用的 device / app 键必须真实存在，
  // 这是 .detoxrc 手写时最常见的错误（改了键名忘了同步引用）
  for (const [name, configuration] of Object.entries(detoxrc.configurations)) {
    if (detoxrc.devices[configuration.device] === undefined) {
      issues.push({
        code: ERROR_CODES.CONFIG_INVALID,
        path: `detox.configurations.${name}.device`,
        message: `configuration "${name}" 引用了不存在的 device 条目 "${configuration.device}"`,
        severity: 'error',
        hint: `可用 device 键：${Object.keys(detoxrc.devices).join(' / ')}`,
      });
    }
    if (detoxrc.apps[configuration.app] === undefined) {
      issues.push({
        code: ERROR_CODES.CONFIG_INVALID,
        path: `detox.configurations.${name}.app`,
        message: `configuration "${name}" 引用了不存在的 app 条目 "${configuration.app}"`,
        severity: 'error',
        hint: `可用 app 键：${Object.keys(detoxrc.apps).join(' / ')}`,
      });
    }
  }

  return issues;
}

/* ═══════════════ 透传导出 ═══════════════ */

export {
  DETOX_ANDROID_DEFAULTS,
  DETOX_IOS_DEFAULTS,
  DETOX_RUNNER_DEFAULTS,
  buildAndroidBinaryPath,
  buildAndroidBuildCommand,
  buildAndroidTestBinaryPath,
  buildDetoxAndroidApp,
  buildDetoxAndroidDevice,
  buildDetoxArtifactsConfig,
  buildDetoxBehaviorConfig,
  buildDetoxIosApp,
  buildDetoxIosDevice,
  buildDetoxRunnerConfig,
  buildDetoxSessionConfig,
  buildDetoxTestRunnerConfig,
  buildIosBinaryPath,
  buildIosBuildCommand,
  defaultIosScheme,
  validateAndroidApp,
  validateAndroidDevice,
  validateDetoxRunner,
  validateIosApp,
  validateIosDevice,
};

export type {
  AndroidArtifactPathInput,
  DetoxAndroidAppEntry,
  DetoxAndroidAppInput,
  DetoxAndroidAttachedDeviceEntry,
  DetoxAndroidDeviceEntry,
  DetoxAndroidEmulatorDeviceEntry,
} from './detox.android.config';
export type { DetoxIosAppEntry, DetoxIosAppInput, DetoxIosDeviceEntry } from './detox.ios.config';
export type {
  DetoxArtifactsConfig,
  DetoxBehaviorConfig,
  DetoxRunnerConfig,
  DetoxRunnerInput,
  DetoxSessionConfig,
  DetoxTestRunnerConfig,
} from './detox.runner.config';
