import * as dotenv from 'dotenv';

import type {
  EnvConfig,
  EnvVarSpec,
  LogLevel,
  ValidationIssue,
} from '../contracts/types';
import { ERROR_CODES } from '../contracts/types';

/**
 * 环境变量规格表与加载器（US-12）。
 *
 * 【为什么要有 ENV_SPEC 这张表，而不是散落的 process.env 读取】
 * 1. **可校验**：必填项缺失能在启动阶段一次性聚合报出，而不是等到某个动作执行时才 undefined 崩溃；
 * 2. **可自省**：dry-run 的 `env-spec` 检查项直接拿这张表与 `.env.example` 双向比对，
 *    保证「文档写的」与「代码读的」永不漂移 —— 这是本工程唯一防止 .env.example 腐烂的机制；
 * 3. **可解析**：`parse` 把字符串转成强类型并就地校验，避免 `Number(undefined) === NaN` 静默传播。
 *
 * ⚠ 维护铁律：**本表的 key 集合必须与 `.env.example` 完全一致**（不多不少）。
 * 新增变量必须同时改两处，dry-run 会因集合不一致而失败。
 */

/* ─────────────── parse 辅助 ─────────────── */

/** 解析正整数（毫秒类配置）；非法值抛错，由调用方收敛为 ValidationIssue */
function parsePositiveInt(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`期望正整数，实际为 "${raw}"`);
  }
  return value;
}

/** 生成「枚举值校验」parse 函数 */
function parseEnum<T extends string>(allowed: readonly T[]): (raw: string) => T {
  return (raw: string): T => {
    const normalized = raw.trim().toLowerCase() as T;
    if (!allowed.includes(normalized)) {
      throw new Error(`期望 ${allowed.join(' | ')} 之一，实际为 "${raw}"`);
    }
    return normalized;
  };
}

/** 解析 URL，校验协议合法性 */
function parseUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`仅支持 http/https 协议，实际为 "${url.protocol}"`);
    }
  } catch (error) {
    throw new Error(`不是合法的 URL："${raw}"（${error instanceof Error ? error.message : String(error)}）`);
  }
  return trimmed;
}

/** 原样透传（去除首尾空白） */
function parseString(raw: string): string {
  return raw.trim();
}

/* ─────────────── ENV_SPEC ─────────────── */

/**
 * 环境变量规格全集。顺序与 `.env.example` 的分组顺序保持一致，便于人工比对。
 *
 * `required` 的语义：**最终解析值必须非空**。
 * 带 `defaultValue` 的 required 项在 `.env` 缺失时由默认值兜底（不报错）；
 * 但被显式设置为空字符串时会报错 —— 这正是「误删值」与「未配置」两种场景的区分点。
 */
export const ENV_SPEC: readonly EnvVarSpec[] = [
  /* ── 运行环境 ── */
  {
    key: 'OMNI_NODE_ENV',
    required: true,
    defaultValue: 'local',
    description: '运行环境标识，影响日志格式默认值与部分超时策略',
    parse: parseEnum(['local', 'ci', 'staging', 'prod'] as const),
  },
  {
    key: 'OMNI_BASE_URL',
    required: false,
    description: '被测服务端基础地址（纯 UI 冒烟可留空）',
    parse: parseUrl,
  },

  /* ── Appium ── */
  {
    key: 'OMNI_APPIUM_SERVER_URL',
    required: true,
    defaultValue: 'http://127.0.0.1:4723',
    description: 'Appium Server 地址，仅 appium 框架使用',
    parse: parseUrl,
  },

  /* ── 测试凭据 ── */
  {
    key: 'OMNI_USERNAME',
    required: false,
    defaultValue: 'demo',
    description: '测试账号，供 loginWorkflow 使用（脚本层禁止硬编码）',
    parse: parseString,
  },
  {
    key: 'OMNI_PASSWORD',
    required: false,
    defaultValue: 'demo123',
    description: '测试密码，供 loginWorkflow 使用（脚本层禁止硬编码）',
    parse: parseString,
  },
  {
    key: 'OMNI_OTP_SECRET',
    required: false,
    description: '双因子登录的 TOTP 种子，不需要时留空',
    parse: parseString,
  },

  /* ── 超时 ── */
  {
    key: 'OMNI_TIMEOUT_DEFAULT_MS',
    required: true,
    defaultValue: '30000',
    description: '兜底默认超时（毫秒），优先级最低',
    parse: parsePositiveInt,
  },
  {
    key: 'OMNI_TIMEOUT_ACTION_MS',
    required: true,
    defaultValue: '15000',
    description: '单个原子动作超时（毫秒）',
    parse: parsePositiveInt,
  },
  {
    key: 'OMNI_TIMEOUT_WAIT_MS',
    required: true,
    defaultValue: '20000',
    description: '显式等待超时（毫秒）',
    parse: parsePositiveInt,
  },
  {
    key: 'OMNI_TIMEOUT_STARTUP_MS',
    required: true,
    defaultValue: '120000',
    description: '会话建立 / App 启动超时（毫秒）',
    parse: parsePositiveInt,
  },

  /* ── 产物与日志 ── */
  {
    key: 'OMNI_ARTIFACTS_DIR',
    required: true,
    defaultValue: 'reports',
    description: '产物根目录，相对工程根',
    parse: parseString,
  },
  {
    key: 'OMNI_LOG_LEVEL',
    required: true,
    defaultValue: 'info',
    description: '日志级别：debug | info | warn | error | silent',
    parse: parseEnum(['debug', 'info', 'warn', 'error', 'silent'] as const),
  },
  {
    key: 'OMNI_LOG_FORMAT',
    required: true,
    defaultValue: 'text',
    description: '日志格式：text（人读） | json（CI 友好）',
    parse: parseEnum(['text', 'json'] as const),
  },

  /* ── 平台工具链 ── */
  {
    key: 'OMNI_XCRUN_PATH',
    required: true,
    defaultValue: '/usr/bin/xcrun',
    description: 'xcrun 可执行路径，XCUITest 框架使用',
    parse: parseString,
  },
  {
    key: 'ANDROID_SDK_ROOT',
    required: false,
    description: 'Android SDK 根目录；沿用业界标准变量名，便于回退到系统同名变量',
    parse: parseString,
  },

  /* ── 设备覆盖 ── */
  {
    key: 'OMNI_DEVICE_UDID',
    required: false,
    description: '指定 iOS 真机 udid 或 Android 真机 serial，留空则用设备配置默认值',
    parse: parseString,
  },
];

/** ENV_SPEC 的 key 集合，供 dry-run 与 .env.example 比对 */
export const ENV_SPEC_KEYS: readonly string[] = ENV_SPEC.map((spec) => spec.key);

/* ─────────────── 加载与解析 ─────────────── */

/** 单个变量的解析结果，含来源标记 */
interface ParsedEnvEntry {
  readonly key: string;
  readonly value: unknown;
  /** true 表示值来自 .env / process.env 的显式设置；false 表示来自 ENV_SPEC 的 defaultValue */
  readonly explicit: boolean;
}

export interface EnvLoadResult {
  readonly config: EnvConfig;
  /**
   * 被**显式设置**过的变量名集合。
   *
   * 这个集合是解决 §6.1 与 §9.6 冲突的关键（详见 configs/index.ts 的合并说明）：
   * 只有显式设置的环境变量才有资格覆盖框架层的专属默认值；
   * 来自 ENV_SPEC defaultValue 的值只作为最底层兜底，不参与覆盖。
   */
  readonly explicitKeys: ReadonlySet<string>;
  readonly issues: readonly ValidationIssue[];
}

/** dotenv 只需加载一次；重复调用会重复读盘且可能覆盖运行期的手动设置 */
let dotenvLoaded = false;

/**
 * 加载 `.env` 到 process.env（幂等）。
 * `override: false` 是刻意选择：真实环境变量（CI 注入、shell export）优先级高于 `.env` 文件，
 * 否则本地遗留的 `.env` 会在 CI 上悄悄覆盖流水线注入的凭据。
 */
function ensureDotenvLoaded(): void {
  if (dotenvLoaded) {
    return;
  }
  dotenv.config({ override: false });
  dotenvLoaded = true;
}

/** 重置 dotenv 加载状态，仅供单测在同一进程内切换 .env 使用 */
export function resetEnvCache(): void {
  dotenvLoaded = false;
}

/** 逐条解析 ENV_SPEC，产出值与 issue */
function parseAllSpecs(source: NodeJS.ProcessEnv): {
  entries: Map<string, ParsedEnvEntry>;
  issues: ValidationIssue[];
} {
  const entries = new Map<string, ParsedEnvEntry>();
  const issues: ValidationIssue[] = [];

  for (const spec of ENV_SPEC) {
    const raw = source[spec.key];
    // 未定义 → 走默认值；定义了但为空串 → 视为「被显式清空」，required 时报错
    const isDefined = raw !== undefined;
    const isEmpty = isDefined && raw.trim() === '';

    if (!isDefined || isEmpty) {
      if (spec.required && spec.defaultValue === undefined) {
        issues.push({
          code: ERROR_CODES.ENV_MISSING,
          path: `env.${spec.key}`,
          message: `必填环境变量 ${spec.key} 未设置（${spec.description}）`,
          severity: 'error',
          hint: `请在 .env 中设置 ${spec.key}，或参考 .env.example`,
        });
        continue;
      }
      if (isEmpty && spec.required) {
        issues.push({
          code: ERROR_CODES.ENV_MISSING,
          path: `env.${spec.key}`,
          message: `必填环境变量 ${spec.key} 被设置为空值（${spec.description}）`,
          severity: 'error',
          hint: `请为 ${spec.key} 填写有效值，或删除该行以使用默认值 "${spec.defaultValue ?? ''}"`,
        });
        continue;
      }
      if (spec.defaultValue !== undefined) {
        try {
          const parsed = spec.parse !== undefined ? spec.parse(spec.defaultValue) : spec.defaultValue;
          entries.set(spec.key, { key: spec.key, value: parsed, explicit: false });
        } catch (error) {
          // 默认值自身解析失败属于代码缺陷，不是用户配置问题，必须显式暴露
          issues.push({
            code: ERROR_CODES.CONFIG_INVALID,
            path: `env.${spec.key}`,
            message: `ENV_SPEC 的默认值非法：${error instanceof Error ? error.message : String(error)}`,
            severity: 'error',
            hint: '这是 ENV_SPEC 定义错误，请修正 src/configs/env.config.ts',
          });
        }
      }
      continue;
    }

    try {
      const parsed = spec.parse !== undefined ? spec.parse(raw) : raw;
      entries.set(spec.key, { key: spec.key, value: parsed, explicit: true });
    } catch (error) {
      issues.push({
        code: ERROR_CODES.CONFIG_INVALID,
        path: `env.${spec.key}`,
        message: `环境变量 ${spec.key} 解析失败：${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        hint: spec.description,
      });
    }
  }

  return { entries, issues };
}

/** 从解析结果中取值，带类型收窄与兜底 */
function pickString(entries: Map<string, ParsedEnvEntry>, key: string, fallback: string): string {
  const value = entries.get(key)?.value;
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function pickOptionalString(entries: Map<string, ParsedEnvEntry>, key: string): string | undefined {
  const value = entries.get(key)?.value;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function pickNumber(entries: Map<string, ParsedEnvEntry>, key: string, fallback: number): number {
  const value = entries.get(key)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 加载环境配置（完整版，含来源元信息与 issue）。
 *
 * @param source 环境变量来源，默认 `process.env`；单测可注入隔离的对象
 */
export function loadEnvConfigWithMeta(source?: NodeJS.ProcessEnv): EnvLoadResult {
  if (source === undefined) {
    ensureDotenvLoaded();
  }
  const env = source ?? process.env;
  const { entries, issues } = parseAllSpecs(env);

  const explicitKeys = new Set<string>();
  for (const entry of entries.values()) {
    if (entry.explicit) {
      explicitKeys.add(entry.key);
    }
  }

  // ANDROID_SDK_ROOT 未显式设置时回退到 ANDROID_HOME（旧版 SDK 的标准变量名）
  const androidSdkRoot = pickOptionalString(entries, 'ANDROID_SDK_ROOT')
    ?? (typeof env['ANDROID_HOME'] === 'string' && env['ANDROID_HOME'] !== '' ? env['ANDROID_HOME'] : undefined);

  const config: EnvConfig = {
    nodeEnv: pickString(entries, 'OMNI_NODE_ENV', 'local'),
    baseUrl: pickOptionalString(entries, 'OMNI_BASE_URL'),
    appiumServerUrl: pickString(entries, 'OMNI_APPIUM_SERVER_URL', 'http://127.0.0.1:4723'),
    credentials: {
      username: pickOptionalString(entries, 'OMNI_USERNAME'),
      password: pickOptionalString(entries, 'OMNI_PASSWORD'),
      otpSecret: pickOptionalString(entries, 'OMNI_OTP_SECRET'),
    },
    timeouts: {
      defaultMs: pickNumber(entries, 'OMNI_TIMEOUT_DEFAULT_MS', 30_000),
      actionMs: pickNumber(entries, 'OMNI_TIMEOUT_ACTION_MS', 15_000),
      waitMs: pickNumber(entries, 'OMNI_TIMEOUT_WAIT_MS', 20_000),
      startupMs: pickNumber(entries, 'OMNI_TIMEOUT_STARTUP_MS', 120_000),
    },
    artifactsDir: pickString(entries, 'OMNI_ARTIFACTS_DIR', 'reports'),
    logLevel: pickString(entries, 'OMNI_LOG_LEVEL', 'info') as LogLevel,
    logFormat: pickString(entries, 'OMNI_LOG_FORMAT', 'text') === 'json' ? 'json' : 'text',
    xcrunPath: pickString(entries, 'OMNI_XCRUN_PATH', '/usr/bin/xcrun'),
    androidSdkRoot,
    deviceUdid: pickOptionalString(entries, 'OMNI_DEVICE_UDID'),
  };

  return { config, explicitKeys, issues };
}

/**
 * 加载环境配置（简化版）。
 * 存在 error 级 issue 时**不抛异常**，由上层 `resolveRunConfig` 聚合后统一抛
 * `ConfigValidationError` —— 保证「一次报全所有配置问题」而非逐条打断。
 */
export function loadEnvConfig(source?: NodeJS.ProcessEnv): EnvConfig {
  return loadEnvConfigWithMeta(source).config;
}

/** 校验环境配置，返回 issue 列表（纯函数，不读 process.env） */
export function validate(config: EnvConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const timeoutEntries: readonly (readonly [string, number])[] = [
    ['defaultMs', config.timeouts.defaultMs],
    ['actionMs', config.timeouts.actionMs],
    ['waitMs', config.timeouts.waitMs],
    ['startupMs', config.timeouts.startupMs],
  ];
  for (const [name, value] of timeoutEntries) {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        code: ERROR_CODES.CONFIG_INVALID,
        path: `env.timeouts.${name}`,
        message: `超时值必须为正数，实际为 ${String(value)}`,
        severity: 'error',
      });
    }
  }

  // 动作超时不应大于启动超时：这通常意味着配置写反了，虽不致命但几乎肯定是笔误
  if (config.timeouts.actionMs > config.timeouts.startupMs) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'env.timeouts.actionMs',
      message: `动作超时（${config.timeouts.actionMs}ms）大于启动超时（${config.timeouts.startupMs}ms），配置可能写反`,
      severity: 'warning',
      hint: '通常 startupMs 应是四者中最大的值',
    });
  }

  if (config.artifactsDir.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'env.artifactsDir',
      message: '产物目录不能为空',
      severity: 'error',
    });
  }

  return issues;
}
