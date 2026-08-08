import type {
  AppConfig,
  AppiumFrameworkConfig,
  DetoxFrameworkConfig,
  DeviceConfig,
  EnvConfig,
  FrameworkConfig,
  FrameworkKind,
  Platform,
  ResolvedRunConfig,
  TestConfig,
  TestRunOptions,
  ValidationIssue,
  XCUITestFrameworkConfig,
} from '../contracts/types';
import {
  BUILTIN_FRAMEWORKS,
  ConfigValidationError,
  ERROR_CODES,
  InvalidCombinationError,
} from '../contracts/types';
import { buildRunPaths, toAbsolutePath } from '../utils/paths';

import {
  loadEnvConfigWithMeta,
  validate as validateEnvConfig,
} from './env.config';
import {
  defaultTestConfig,
  validate as validateTestConfig,
} from './test.config';

import type { DeviceOverrides } from './devices';
import { resolveDevice, validateAllDevices, validateDevice } from './devices';

import {
  resolveApp,
  resolveAppBinaryPath,
  resolveAppId,
  validateAllApps,
  validateApp,
} from './apps';

import {
  buildAppiumFrameworkConfig,
  validate as validateAppiumConfig,
} from './appium';
import {
  buildDetoxFrameworkConfig,
  validate as validateDetoxConfig,
} from './detox';
import {
  buildXCUITestFrameworkConfig,
  validate as validateXCUITestConfig,
} from './xcuitest';

/**
 * 配置层总入口 —— 产出全工程**唯一的运行时真理源** `ResolvedRunConfig`。
 *
 * ═══════════ 五级合并链 ═══════════
 * 优先级从高到低：
 *   ① CLI 显式参数        （用户此刻的意图，最高）
 *   ② 显式设置的环境变量   （本机/本次流水线的环境事实）
 *   ③ App 级配置          （这个业务 App 的特性，如 defaultTimeoutMs）
 *   ④ Device 级配置       （这台设备的特性，如 newCommandTimeoutSec）
 *   ⑤ Framework 默认值    （这个框架的性能特征，如 Appium 轮询 300ms / Detox 100ms）
 *   ⑥ 全局默认值          （test.config.ts，什么都不配时的兜底）
 *
 * 【② 为什么强调「显式设置的」】
 * `ENV_SPEC` 里每个变量都有 `defaultValue`，`loadEnvConfig()` 返回的 `EnvConfig`
 * 无法区分「用户设了 OMNI_ACTION_TIMEOUT_MS=20000」与「用户没设，拿到了 spec 默认的 20000」。
 * 若不区分，spec 的兜底值会以「环境变量」的名义**覆盖掉框架的专属调优** ——
 * 结果就是 Detox 精心设置的 100ms 轮询被环境兜底的 300ms 抹平，
 * 而用户从头到尾没有配置过任何东西。
 * 因此这里用 `loadEnvConfigWithMeta().explicitKeys` 做闸门：
 * 只有真正出现在 `.env` / `process.env` 里的键，才有资格参与第 ② 级覆盖。
 *
 * 【为什么 resolveRunConfig 一定要 freeze】
 * 这个对象会被传遍 CLI → factory → adapter → driver → reporter。
 * 只要任何一层「顺手改一下 config.xxx」，后面所有层看到的就是被改过的值，
 * 而运行日志里记录的却是最初落盘的那份 —— 排查时会得到与现实完全矛盾的证据。
 * `Object.freeze` 让这类修改在严格模式下直接抛错，把问题钉在发生的那一行。
 *
 * 【dryRun 的语义】
 * `dryRun: true` 时**不降低校验强度**，只把「真机 udid 缺失」这类
 * 依赖当前物理环境的检查降为 warning ——
 * dry-run 的目的是「在没有设备的机器上体检配置」，
 * 如果因为没插手机就报错，这个功能本身就失去了意义（U-1）。
 * 但配置写错（如 appId 为空）在 dry-run 下**依然是 error**。
 */

/** 运行 ID 的时间戳格式化：`20250808-152030` */
function formatTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return [
    String(date.getFullYear()),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

/** 6 位随机后缀，避免同一秒内启动的两次运行撞 runId */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0');
}

/**
 * 生成运行 ID，形如 `20250808-152030-appium-android-a1b2c3`。
 *
 * 之所以把 framework/platform 编进 ID 而不只用时间戳：
 * `reports/.run/` 下会堆积几十上百个目录，
 * 纯时间戳的目录名无法一眼看出「哪次是 Android 的那轮」，
 * 而排查时最常见的动作恰恰是「找上次 Android 失败的那次产物」。
 */
export function generateRunId(options?: {
  readonly framework?: FrameworkKind;
  readonly platform?: Platform;
  readonly now?: Date;
}): string {
  const now = options?.now ?? new Date();
  const parts = [formatTimestamp(now)];
  if (options?.framework !== undefined) {
    parts.push(String(options.framework));
  }
  if (options?.platform !== undefined) {
    parts.push(options.platform);
  }
  parts.push(randomSuffix());
  return parts.join('-');
}

/** resolveRunConfig 的可选注入项（测试与嵌入场景用） */
export interface ResolveRunConfigDeps {
  /** 覆盖环境变量来源，默认 `process.env` */
  readonly envSource?: NodeJS.ProcessEnv;
  /** 覆盖 runId，默认自动生成 */
  readonly runId?: string;
  /** 覆盖启动时间，默认 `new Date()` */
  readonly now?: Date;
  /** jest worker 序号（从 0 开始），用于 Appium 端口错峰 */
  readonly workerIndex?: number;
  /** 覆盖全局测试策略，默认 `defaultTestConfig` */
  readonly test?: TestConfig;
}

/** 合并后的超时四元组 */
interface MergedTimeouts {
  readonly startupMs?: number;
  readonly actionMs?: number;
  readonly waitMs?: number;
  readonly intervalMs?: number;
}

/** ENV_SPEC 中与超时相关的键名（用于判断是否被显式设置） */
const TIMEOUT_ENV_KEYS = {
  default: 'OMNI_DEFAULT_TIMEOUT_MS',
  action: 'OMNI_ACTION_TIMEOUT_MS',
  wait: 'OMNI_WAIT_TIMEOUT_MS',
  startup: 'OMNI_STARTUP_TIMEOUT_MS',
} as const;

/**
 * 按五级规则合并超时。
 *
 * 返回的字段为 `undefined` 时表示「本级没有意见」，
 * 交由框架层用自己的默认值填充（第 ⑤ 级）。
 * 这正是「不写 undefined 就等于覆盖」这个坑的规避方式 ——
 * 如果这里给每个字段都填上兜底值，框架层的专属调优永远不会生效。
 */
function mergeTimeouts(
  options: TestRunOptions,
  env: EnvConfig,
  explicitKeys: ReadonlySet<string>,
  app: AppConfig,
  device: DeviceConfig,
): MergedTimeouts {
  // ② 显式环境变量
  const envAction = explicitKeys.has(TIMEOUT_ENV_KEYS.action) ? env.timeouts.actionMs : undefined;
  const envWait = explicitKeys.has(TIMEOUT_ENV_KEYS.wait) ? env.timeouts.waitMs : undefined;
  const envStartup = explicitKeys.has(TIMEOUT_ENV_KEYS.startup) ? env.timeouts.startupMs : undefined;
  const envDefault = explicitKeys.has(TIMEOUT_ENV_KEYS.default) ? env.timeouts.defaultMs : undefined;

  // ③ App 级
  const appDefault = app.defaultTimeoutMs;

  /**
   * ④ Device 级 —— **刻意不参与 actionTimeoutMs 的合并**。
   *
   * 唯一的候选字段是 `newCommandTimeoutSec`，但它的语义是
   * 「会话在多久没有收到任何指令后自动销毁」（空闲上限），
   * 与「单个原子动作允许执行多久」（动作上限）是两回事，量级也差一个数量级：
   * iOS 模拟器 120s / Android 模拟器 180s / Android 真机 300s。
   *
   * 早期版本把它当作 action 的兜底，实测后果是：
   *   appium.actionTimeoutMs 从框架调优的 20s 变成 120s，
   *   detox.actionTimeoutMs  从 10s 变成 180s。
   * 也就是说，用户什么都没配，框架层精心设定的动作超时被设备的空闲上限整体抹平 ——
   * 一个本该 10s 就报错的卡死要等 3 分钟，而这正是本文件开头
   * 「② 为什么强调显式设置」所要防范的同一类污染，只是换了个来源。
   *
   * `newCommandTimeoutSec` 已经在 capabilities 层被正确消费为 `appium:newCommandTimeout`，
   * 在这里二次使用（且赋予不同语义）只会制造分叉。
   * 因此 Device 级在超时维度上「没有意见」，由框架默认值（第 ⑤ 级）接管。
   */
  void device;

  return {
    // options 里没有超时字段（TestRunOptions 不含），故 ① 级在超时维度上不参与
    startupMs: envStartup,
    actionMs: envAction ?? appDefault ?? envDefault,
    waitMs: envWait,
    intervalMs: undefined,
  };
}

/**
 * 按平台与 CLI 参数组装设备覆盖项（第 ① 级）。
 */
function buildDeviceOverrides(options: TestRunOptions): DeviceOverrides {
  const overrides: { -readonly [K in keyof DeviceOverrides]: DeviceOverrides[K] } = {};

  if (options.deviceId !== undefined && options.deviceId.trim() !== '') {
    // --deviceId 同时用于 iOS udid 与 Android serial，两者在 DeviceConfig 里都落到 udid 字段
    overrides.udid = options.deviceId.trim();
  }
  if (options.headless !== undefined) {
    overrides.headless = options.headless;
  }

  return overrides;
}

/**
 * 依据框架分派到对应的框架配置构建器。
 *
 * ⚠️ `FrameworkConfig` 联合类型的最后一支是**非判别式**的 `FrameworkConfigBase`
 * （为了让第 4 个框架无需修改契约层即可接入，见 types.ts 中 FrameworkKind 的说明）。
 * 这意味着 TypeScript **无法**为这个 switch 做穷尽性检查 ——
 * 漏掉一个 case 不会报编译错。
 * 因此 `default` 分支是强制要求：它把「未注册的框架名」转成一条清晰的错误，
 * 而不是让函数静默返回 undefined，让空指针在几层之外才炸开。
 */
function buildFrameworkConfig(input: {
  readonly framework: FrameworkKind;
  readonly app: AppConfig;
  readonly device: DeviceConfig;
  readonly env: EnvConfig;
  readonly test: TestConfig;
  readonly appId: string;
  readonly binaryPath?: string;
  readonly timeouts: MergedTimeouts;
  readonly workerIndex?: number;
  readonly runId: string;
}): FrameworkConfig {
  const { framework, app, device, env, test, appId, binaryPath, timeouts, runId } = input;

  switch (framework) {
    case 'appium':
      return buildAppiumFrameworkConfig({
        app,
        device,
        env,
        test,
        appId,
        binaryPath,
        workerIndex: input.workerIndex,
        timeouts,
      });

    case 'detox':
      return buildDetoxFrameworkConfig({
        app,
        device,
        env,
        test,
        binaryPath,
        timeouts,
      });

    case 'xcuitest':
      return buildXCUITestFrameworkConfig({
        app,
        device,
        env,
        runId,
        startupTimeoutMs: timeouts.startupMs,
        actionTimeoutMs: timeouts.actionMs,
        waitTimeoutMs: timeouts.waitMs,
        waitIntervalMs: timeouts.intervalMs,
      });

    default:
      // 见本函数 JSDoc：联合类型不可判别，default 是唯一的兜底防线
      throw new InvalidCombinationError(
        { framework, platform: device.platform, device: device.kind, app: app.key },
        [
          {
            code: ERROR_CODES.FRAMEWORK_NOT_REGISTERED,
            path: 'options.framework',
            message: `框架 '${String(framework)}' 在配置层没有对应的构建器`,
            severity: 'error',
            hint: `内置框架：${BUILTIN_FRAMEWORKS.join(' | ')}。`
              + '若为自定义框架，请在 src/configs/ 下提供构建器并在此 switch 中注册',
          },
        ],
      );
  }
}

/**
 * ═══ 框架配置类型守卫 ═══
 *
 * 【为什么不能直接用 `config.framework === 'appium'` 收窄】
 * `FrameworkConfig` 的最后一支是 `FrameworkConfigBase`，
 * 而它的 `framework` 字段类型是 `FrameworkKind`（含 `string & {}` 开放字面量）。
 * 这意味着一个 `FrameworkConfigBase` **完全可以**满足 `framework === 'appium'` ——
 * 联合类型因此不是可判别联合（discriminated union），TypeScript 拒绝收窄，
 * 报 "Argument of type 'FrameworkConfig' is not assignable to ..."。
 *
 * 解法不是 `as` 断言（那只是把运行时风险掩盖掉），
 * 而是补上**结构性检查**：除了看 framework 字段，还要确认该分支的标志性字段确实存在。
 * 这样守卫在类型层与运行时层同时成立 —— 第 4 个框架若恰好也叫 'appium'
 * 但没有 capabilities，会被正确地判为「非 Appium 配置」而走兜底分支。
 */
function isAppiumConfig(config: FrameworkConfig): config is AppiumFrameworkConfig {
  return config.framework === 'appium'
    && 'serverUrl' in config
    && 'capabilities' in config;
}

function isDetoxConfig(config: FrameworkConfig): config is DetoxFrameworkConfig {
  return config.framework === 'detox'
    && 'configurationName' in config
    && 'detoxConfigPath' in config;
}

function isXCUITestConfig(config: FrameworkConfig): config is XCUITestFrameworkConfig {
  return config.framework === 'xcuitest'
    && 'bridge' in config
    && 'scheme' in config;
}

/** 框架名对上了但结构对不上 —— 说明构建器与契约类型分叉，属于工程内部错误 */
function shapeMismatch(framework: FrameworkKind, config: FrameworkConfig): ValidationIssue[] {
  return [
    {
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'frameworkConfig',
      message: `框架 '${String(framework)}' 的配置缺少该类型的标志性字段，`
        + `实际 framework='${String(config.framework)}'`,
      severity: 'error',
      hint: '这是构建器与 contracts/types.ts 定义分叉导致的内部错误，请检查对应的 build*FrameworkConfig',
    },
  ];
}

/**
 * 校验框架配置，按框架分派到对应的 validate。
 *
 * 同样需要 default 分支：未知框架的配置无法校验，
 * 但这不该是致命错误（走到这里说明构建已经成功了），
 * 故降级为一条 warning，提示「本次运行未经框架级配置校验」。
 */
function validateFrameworkConfig(
  framework: FrameworkKind,
  config: FrameworkConfig,
): ValidationIssue[] {
  switch (framework) {
    case 'appium':
      return isAppiumConfig(config) ? validateAppiumConfig(config) : shapeMismatch('appium', config);

    case 'detox':
      return isDetoxConfig(config) ? validateDetoxConfig(config) : shapeMismatch('detox', config);

    case 'xcuitest':
      return isXCUITestConfig(config) ? validateXCUITestConfig(config) : shapeMismatch('xcuitest', config);

    default:
      return [
        {
          code: ERROR_CODES.CONFIG_INVALID,
          path: 'framework',
          message: `框架 '${String(framework)}' 没有注册配置校验器，本次运行未经框架级配置体检`,
          severity: 'warning',
          hint: '自定义框架建议提供 validate(config): ValidationIssue[] 并在 configs/index.ts 中注册',
        },
      ];
  }
}

/**
 * 五级合并，产出唯一运行时真理源。
 *
 * @throws {InvalidCombinationError} 框架 × 平台 × 设备 × App 组合非法
 * @throws {ConfigValidationError}   聚合校验存在 error 级问题
 */
export function resolveRunConfig(
  options: TestRunOptions,
  deps: ResolveRunConfigDeps = {},
): ResolvedRunConfig {
  const startedAtDate = deps.now ?? new Date();
  const runId = deps.runId ?? generateRunId({
    framework: options.framework,
    platform: options.platform,
    now: startedAtDate,
  });

  /* ── 第 1 步：环境 ── */
  const envResult = loadEnvConfigWithMeta(deps.envSource);
  const env = envResult.config;
  const test = deps.test ?? defaultTestConfig;

  /* ── 第 2 步：App，并校验 app × platform ── */
  // resolveApp 未知 key 直接抛 ConfigValidationError；
  // resolveAppId 在 App 不支持该平台时抛 InvalidCombinationError。
  // 两者都在这里发生，因为它们是「用户输入非法」而非「配置有瑕疵」，
  // 不应该被塞进 issue 列表里等到最后统一报 —— 后续步骤依赖它们的结果，根本进行不下去。
  const app = resolveApp(options.app);
  const appId = resolveAppId(app, options.platform);
  const rawBinaryPath = resolveAppBinaryPath(app, options.platform);

  /* ── 第 3 步：设备（非法组合在此抛错） ── */
  const device = resolveDevice(
    options.platform,
    options.device,
    env,
    buildDeviceOverrides(options),
  );

  // device 的平台必须与 options 一致，否则说明注册表配错了
  if (device.platform !== options.platform) {
    throw new InvalidCombinationError(options, [
      {
        code: ERROR_CODES.CONFIG_INVALID,
        path: 'DEVICE_REGISTRY',
        message: `设备注册表返回了 platform='${device.platform}' 的配置，`
          + `但请求的是 '${options.platform}'`,
        severity: 'error',
        hint: '检查 src/configs/devices/index.ts 的 DEVICE_REGISTRY 键与 defaults.platform 是否一致',
      },
    ]);
  }

  /* ── 第 4 步：安装包绝对化 ── */
  // 绝对化只在这里做一次：框架层拿到的一律是绝对路径，
  // 避免各框架各自相对 cwd 解析（detox CLI 的 cwd 与我们不同，这是真实踩过的坑）。
  const binaryPath = rawBinaryPath !== undefined ? toAbsolutePath(rawBinaryPath) : undefined;

  /* ── 第 5 步：超时五级合并 ── */
  const timeouts = mergeTimeouts(options, env, envResult.explicitKeys, app, device);

  /* ── 第 6 步：框架配置 ── */
  const frameworkConfig = buildFrameworkConfig({
    framework: options.framework,
    app,
    device,
    env,
    test,
    appId,
    binaryPath,
    timeouts,
    workerIndex: deps.workerIndex,
    runId,
  });

  /* ── 第 7 步：路径 ── */
  const paths = buildRunPaths(runId, { artifactsDir: env.artifactsDir });

  /* ── 第 8 步：聚合校验 ── */
  const issues: ValidationIssue[] = [
    ...envResult.issues,
    ...validateEnvConfig(env),
    ...validateTestConfig(test),
    ...validateApp(app),
    // dry-run 下放宽「真机 udid 缺失」这类物理环境依赖项，见文件头说明
    ...validateDevice(device, { strict: !options.dryRun }),
    ...validateFrameworkConfig(options.framework, frameworkConfig),
  ];

  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    throw new ConfigValidationError(issues);
  }

  /* ── 第 9 步：冻结并返回 ── */
  const resolved: ResolvedRunConfig = {
    runId,
    startedAt: startedAtDate.toISOString(),
    options,
    framework: options.framework,
    platform: options.platform,
    deviceKind: options.device,
    app,
    device,
    frameworkConfig,
    env,
    test,
    appId,
    binaryPath,
    paths,
  };

  // 浅冻结顶层 + 冻结嵌套的 paths：
  // 深冻结整棵树会连 capabilities 里的用户自定义对象一起锁死，
  // 而适配器有正当理由在建立会话时向 capabilities 的副本追加字段。
  // 顶层冻结已经能拦住 99% 的「顺手改一下」，代价最低。
  Object.freeze(resolved.paths);
  return Object.freeze(resolved);
}

/**
 * 全量配置体检 —— **返回问题列表，不抛错**。
 *
 * 与 `resolveRunConfig` 的关键区别：
 * 后者只体检「本次要用的那一套」并在有 error 时中止；
 * 本函数遍历**所有** App 与设备，把问题一次性摊开，供 `--dry-run` 渲染报告。
 * 不抛错是刻意的：体检报告的价值就在于「一次看到全部问题」，
 * 抛在第一条上等于把它退化成 fail-fast。
 */
export function validateAllConfigs(deps: { readonly envSource?: NodeJS.ProcessEnv } = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const envResult = loadEnvConfigWithMeta(deps.envSource);
  issues.push(...envResult.issues);
  issues.push(...validateEnvConfig(envResult.config));
  issues.push(...validateTestConfig(defaultTestConfig));
  issues.push(...validateAllApps());
  // 非 strict：体检可能跑在没有任何设备的机器上（U-1）
  issues.push(...validateAllDevices(envResult.config));

  return issues;
}

/** 把 issue 列表按严重级别分组，供 CLI 渲染 */
export function partitionIssues(issues: readonly ValidationIssue[]): {
  readonly errors: ValidationIssue[];
  readonly warnings: ValidationIssue[];
} {
  return {
    errors: issues.filter((issue) => issue.severity === 'error'),
    warnings: issues.filter((issue) => issue.severity === 'warning'),
  };
}

/* ═══════════════ 再导出 ═══════════════ */

export {
  ENV_SPEC,
  ENV_SPEC_KEYS,
  loadEnvConfig,
  loadEnvConfigWithMeta,
  resetEnvCache,
  validate as validateEnvConfig,
} from './env.config';
export type { EnvLoadResult } from './env.config';

export { defaultTestConfig, validate as validateTestConfig } from './test.config';

export {
  APP_REGISTRY,
  isAppRegistered,
  listAppKeys,
  listApps,
  resolveApp,
  resolveAppBinaryPath,
  resolveAppId,
  resolveAppPlatform,
  validateAllApps,
  validateApp,
  validateAppShape,
} from './apps';

export {
  DEVICE_REGISTRY,
  deviceRegistryKey,
  isDeviceSupported,
  listDeviceKeys,
  listDevices,
  resolveDevice,
  validateAllDevices,
  validateDevice,
} from './devices';
export type { DeviceBuilder, DeviceOverrides, DeviceRegistryEntry, DeviceRegistryKey } from './devices';

export {
  APPIUM_FRAMEWORK_DEFAULTS,
  buildAppiumFrameworkConfig,
  toWebdriverIoOptions,
  validate as validateAppiumFrameworkConfig,
} from './appium';
export type { AppiumFrameworkBuildInput } from './appium';

export {
  buildConfigurationName,
  buildDetoxFrameworkConfig,
  buildDetoxrcObject,
  DETOX_FRAMEWORK_DEFAULTS,
  validate as validateDetoxFrameworkConfig,
  validateDetoxrc,
} from './detox';
export type { DetoxFrameworkBuildInput, DetoxrcObject } from './detox';

export {
  buildXCUITestAssembly,
  buildXCUITestFrameworkConfig,
  validate as validateXCUITestFrameworkConfig,
  XCUITEST_FRAMEWORK_DEFAULTS,
} from './xcuitest';
export type { XCUITestAssembly, XCUITestFrameworkBuildInput } from './xcuitest';

export {
  createBaseJestConfig,
  diffModuleNameMapper,
  JEST_MODULE_NAME_MAPPER,
  JEST_SETUP_PATHS,
  mergeJestConfig,
} from './jest/jest.base.config';
export { createAppiumJestConfig } from './jest/jest.appium.config';
export { createDetoxJestConfig } from './jest/jest.detox.config';
export { createXCUITestJestConfig } from './jest/jest.xcuitest.config';
