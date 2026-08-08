import type {
  AppConfig,
  AppiumFrameworkConfig,
  DeviceConfig,
  EnvConfig,
  TestConfig,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES, InvalidCombinationError } from '../../contracts/types';

import {
  APPIUM_ANDROID_DEFAULTS,
  buildAndroidCapabilities,
  computeSystemPort,
  toOptionalIntentArguments,
  validate as validateAndroidCapabilities,
} from './appium.android.capabilities.config';
import {
  APPIUM_IOS_DEFAULTS,
  buildIosCapabilities,
  formatIosPermissions,
  toProcessArguments,
  validate as validateIosCapabilities,
} from './appium.ios.capabilities.config';
import type { AppiumLogLevel, AppiumServerConfig, AppiumServerOverrides } from './appium.server.config';
import {
  APPIUM_SERVER_DEFAULTS,
  buildAppiumServerConfig,
  formatAppiumServerUrl,
  LEGACY_APPIUM_BASE_PATH,
  parseAppiumServerUrl,
  toAppiumLogLevel,
  validate as validateAppiumServer,
} from './appium.server.config';

/**
 * Appium 框架配置装配层。
 *
 * 职责边界：本文件只做「把 server + capabilities + 超时」拼成契约要求的
 * `AppiumFrameworkConfig`，**不创建任何会话、不加载 webdriverio**。
 * webdriverio 是 optional peerDependency，配置层一旦 import 它，
 * 没装依赖的机器连 `--dry-run` 都跑不起来（违背 U-1）。
 */

/** 框架层超时覆盖（由 configs/index.ts 按五级合并规则算好后传入） */
export interface AppiumTimeoutOverrides {
  readonly startupMs?: number;
  readonly actionMs?: number;
  readonly waitMs?: number;
  readonly intervalMs?: number;
}

/** Appium 框架配置构建输入 */
export interface AppiumFrameworkBuildInput {
  readonly app: AppConfig;
  readonly device: DeviceConfig;
  readonly env: EnvConfig;
  readonly test?: TestConfig;
  /** 已解析的 appId（bundleId / package name） */
  readonly appId?: string;
  /** 已解析为绝对路径的安装包 */
  readonly binaryPath?: string;
  /** jest worker 序号（从 0 开始），用于错开 wdaLocalPort / systemPort */
  readonly workerIndex?: number;
  readonly timeouts?: AppiumTimeoutOverrides;
  readonly server?: AppiumServerOverrides;
  readonly extraCapabilities?: Readonly<Record<string, unknown>>;
}

/**
 * Appium 框架层超时默认值 —— 五级合并链的第 ⑤ 级。
 *
 * 只有**显式设置**过的环境变量才有资格覆盖这里的值（见 EnvLoadResult.explicitKeys 的说明），
 * 否则 ENV_SPEC 的兜底默认值会把框架的专属调优全部抹平。
 */
export const APPIUM_FRAMEWORK_DEFAULTS = {
  /** 180s：`POST /session` 同步等待装包 + WDA/UiAutomator2 Server 启动 */
  startupTimeoutMs: 180_000,
  /** 20s：每个原子动作都是一次 HTTP 往返，比进程内框架慢一个量级 */
  actionTimeoutMs: 20_000,
  /** 30s */
  waitTimeoutMs: 30_000,
  /**
   * 300ms：Appium 的每次轮询都是真实 HTTP 请求，间隔太小会把服务端打满、
   * 反而拖慢整体响应。这是它与 Detox（进程内，100ms 即可）的关键差异。
   */
  waitIntervalMs: 300,
} as const;

/** 由平台推导 automationName */
export function resolveAutomationName(platform: DeviceConfig['platform']): 'XCUITest' | 'UiAutomator2' {
  return platform === 'ios' ? APPIUM_IOS_DEFAULTS.automationName : APPIUM_ANDROID_DEFAULTS.automationName;
}

/**
 * 构建完整的 Appium 框架配置。
 *
 * @throws {InvalidCombinationError} 平台不是 ios / android
 */
export function buildAppiumFrameworkConfig(input: AppiumFrameworkBuildInput): AppiumFrameworkConfig {
  const { app, device, env } = input;
  const platform = device.platform;

  if (platform !== 'ios' && platform !== 'android') {
    throw new InvalidCombinationError(
      { framework: 'appium', platform, device: device.kind, app: app.key },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'options.platform',
          message: `Appium 仅支持 ios / android，实际收到 '${String(platform)}'`,
          severity: 'error',
        },
      ],
    );
  }

  const server = buildAppiumServerConfig(env, input.server);

  const capabilities = platform === 'ios'
    ? buildIosCapabilities({
      app,
      device,
      env,
      test: input.test,
      appId: input.appId,
      binaryPath: input.binaryPath,
      workerIndex: input.workerIndex,
      extra: input.extraCapabilities,
    })
    : buildAndroidCapabilities({
      app,
      device,
      env,
      test: input.test,
      appId: input.appId,
      binaryPath: input.binaryPath,
      workerIndex: input.workerIndex,
      extra: input.extraCapabilities,
    });

  return {
    framework: 'appium',
    platform,
    startupTimeoutMs: input.timeouts?.startupMs ?? APPIUM_FRAMEWORK_DEFAULTS.startupTimeoutMs,
    actionTimeoutMs: input.timeouts?.actionMs ?? APPIUM_FRAMEWORK_DEFAULTS.actionTimeoutMs,
    waitTimeoutMs: input.timeouts?.waitMs ?? APPIUM_FRAMEWORK_DEFAULTS.waitTimeoutMs,
    waitIntervalMs: input.timeouts?.intervalMs ?? APPIUM_FRAMEWORK_DEFAULTS.waitIntervalMs,
    serverUrl: server.serverUrl,
    automationName: resolveAutomationName(platform),
    capabilities,
    connectionRetries: server.connectionRetryCount,
    logLevel: server.logLevel,
  };
}

/**
 * 把框架配置还原成 webdriverio `remote()` 需要的连接参数。
 *
 * 存在的理由：`AppiumFrameworkConfig` 只保留了拼好的 `serverUrl`（给人读），
 * 而 wdio 要的是拆开的四元组。适配器层不应自己再解析一次字符串 ——
 * 解析逻辑必须只有一份，否则两处实现迟早分叉。
 */
export function toWebdriverIoOptions(config: AppiumFrameworkConfig): {
  readonly protocol: 'http' | 'https';
  readonly hostname: string;
  readonly port: number;
  readonly path: string;
  readonly connectionRetryTimeout: number;
  readonly connectionRetryCount: number;
  readonly logLevel: AppiumLogLevel;
  readonly capabilities: Readonly<Record<string, unknown>>;
} {
  const parsed = parseAppiumServerUrl(config.serverUrl);
  return {
    ...parsed,
    connectionRetryTimeout: Math.max(config.startupTimeoutMs, APPIUM_SERVER_DEFAULTS.connectionRetryTimeout),
    connectionRetryCount: config.connectionRetries,
    logLevel: config.logLevel,
    capabilities: config.capabilities,
  };
}

/** 校验完整的 Appium 框架配置（聚合 server + capabilities + 超时三部分的 issue） */
export function validate(config: AppiumFrameworkConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── server ──
  const parsed = parseAppiumServerUrl(config.serverUrl);
  const serverConfig: AppiumServerConfig = {
    ...parsed,
    serverUrl: config.serverUrl,
    connectionRetryTimeout: config.startupTimeoutMs,
    connectionRetryCount: config.connectionRetries,
    logLevel: config.logLevel,
    strictSSL: APPIUM_SERVER_DEFAULTS.strictSSL,
  };
  issues.push(...validateAppiumServer(serverConfig));

  // ── capabilities ──
  if (config.platform === 'ios') {
    issues.push(...validateIosCapabilities({ ...config.capabilities }));
  } else {
    issues.push(...validateAndroidCapabilities({ ...config.capabilities }));
  }

  // ── automationName 与平台是否匹配 ──
  const expectedAutomation = resolveAutomationName(config.platform);
  if (config.automationName !== expectedAutomation) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.automationName',
      message: `platform=${config.platform} 期望 automationName='${expectedAutomation}'，`
        + `实际为 '${String(config.automationName)}'`,
      severity: 'warning',
      hint: '使用非默认 driver（如 Espresso / Flutter）时可忽略本提示',
    });
  }

  // ── 超时自洽性 ──
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
        path: `appium.${name}`,
        message: `${name} 必须为正数，实际为 ${String(value)}`,
        severity: 'error',
      });
    }
  }

  if (config.waitIntervalMs >= config.waitTimeoutMs) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.waitIntervalMs',
      message: `轮询间隔（${config.waitIntervalMs}ms）不小于等待超时（${config.waitTimeoutMs}ms），`
        + '意味着最多只会检查一次',
      severity: 'error',
    });
  }

  return issues;
}

/* ═══════════════ 透传导出 ═══════════════ */

export {
  APPIUM_ANDROID_DEFAULTS,
  APPIUM_IOS_DEFAULTS,
  APPIUM_SERVER_DEFAULTS,
  LEGACY_APPIUM_BASE_PATH,
  buildAndroidCapabilities,
  buildAppiumServerConfig,
  buildIosCapabilities,
  computeSystemPort,
  formatAppiumServerUrl,
  formatIosPermissions,
  parseAppiumServerUrl,
  toAppiumLogLevel,
  toOptionalIntentArguments,
  toProcessArguments,
  validateAndroidCapabilities,
  validateAppiumServer,
  validateIosCapabilities,
};

export type {
  AppiumLogLevel,
  AppiumServerConfig,
  AppiumServerOverrides,
  ParsedAppiumServerUrl,
} from './appium.server.config';
export type { AndroidCapabilityInput } from './appium.android.capabilities.config';
export type { IosCapabilityInput } from './appium.ios.capabilities.config';
