import type { EnvConfig, LogLevel, ValidationIssue } from '../../contracts/types';
import { ERROR_CODES } from '../../contracts/types';

/**
 * Appium Server 连接配置。
 *
 * 【path 为什么是 `/` 而不是 `/wd/hub`】
 * Appium 2.x 把默认基础路径从 1.x 的 `/wd/hub` 改成了根路径 `/`。
 * 这是 1.x → 2.x 迁移中最高频的踩坑点：webdriverio 的 `path` 默认值仍是 `/wd/hub`，
 * 若不显式覆盖，会向 Appium 2 请求 `POST /wd/hub/session` 并收到 404，
 * 而 404 在 wdio 的错误包装下往往表现为语焉不详的 "Failed to create session"，
 * 排查者常常误以为是 capabilities 写错了。所以本文件把 `/` 设为显式默认值。
 * 仍在用 Appium 1.x 的团队可通过 `OMNI_APPIUM_SERVER_URL=http://host:4723/wd/hub` 回退。
 *
 * 【为什么要真的 parse URL 而不是直接透传字符串】
 * `AppiumFrameworkConfig.serverUrl` 是给人看和给日志用的；而 webdriverio 的 `remote()`
 * 接受的是拆开的 `{protocol, hostname, port, path}` 四元组。二者必须由同一处解析产出，
 * 否则「env 里写了 https，代码里硬编码 http」这类不一致会在 CI 上以连接超时的形式爆发。
 */

/** Appium Server 的日志级别取值（比工程 LogLevel 多一个 trace） */
export type AppiumLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** Appium Server 连接配置 */
export interface AppiumServerConfig {
  readonly protocol: 'http' | 'https';
  readonly hostname: string;
  readonly port: number;
  /** 基础路径，Appium 2.x 为 `/`；Appium 1.x 为 `/wd/hub` */
  readonly path: string;
  /** 由上面四项重新拼出的规范化 URL，用于日志与 `AppiumFrameworkConfig.serverUrl` */
  readonly serverUrl: string;
  /** 单次 HTTP 请求超时（毫秒），对应 wdio 的 connectionRetryTimeout */
  readonly connectionRetryTimeout: number;
  /** 连接重试次数，对应 wdio 的 connectionRetryCount */
  readonly connectionRetryCount: number;
  readonly logLevel: AppiumLogLevel;
  /** https 自签证书场景需要关掉；http 下该项无意义 */
  readonly strictSSL: boolean;
}

/** 可覆盖项 */
export interface AppiumServerOverrides {
  readonly protocol?: 'http' | 'https';
  readonly hostname?: string;
  readonly port?: number;
  readonly path?: string;
  readonly connectionRetryTimeout?: number;
  readonly connectionRetryCount?: number;
  readonly logLevel?: AppiumLogLevel;
  readonly strictSSL?: boolean;
}

/** 默认值（Appium 2.x 官方默认监听地址与端口） */
export const APPIUM_SERVER_DEFAULTS = {
  protocol: 'http',
  hostname: '127.0.0.1',
  port: 4723,
  /** Appium 2.x 基础路径 */
  path: '/',
  /**
   * 120s：`POST /session` 这一条请求会同步等待「装 App + 起 WDA/UiAutomator2 Server」，
   * 是全流程唯一可能长达 1~2 分钟的 HTTP 请求。wdio 默认 120s，此处与之对齐。
   */
  connectionRetryTimeout: 120_000,
  /**
   * 2 次：Appium Server 刚起来时端口可能还没 listen，一次重试能吃掉这个竞态；
   * 但重试次数再高就会把「设备真的连不上」拖成 3 倍等待，无谓延长失败反馈。
   */
  connectionRetryCount: 2,
  strictSSL: false,
} as const;

/** Appium 1.x 的历史基础路径，用于给出迁移提示 */
export const LEGACY_APPIUM_BASE_PATH = '/wd/hub';

/** URL 解析结果 */
export interface ParsedAppiumServerUrl {
  readonly protocol: 'http' | 'https';
  readonly hostname: string;
  readonly port: number;
  readonly path: string;
}

/**
 * 解析 Appium Server URL，拆出 wdio 需要的四元组。
 *
 * 解析失败时**不抛异常**而是回落到默认值：URL 的合法性已由 `ENV_SPEC` 的 `parseUrl` 在
 * 加载阶段校验过并产出过 issue，此处再抛一次只会让同一个错误报两遍、且打断聚合式报错。
 *
 * @param raw 形如 `http://127.0.0.1:4723` 或 `https://grid.internal:443/wd/hub`
 */
export function parseAppiumServerUrl(raw: string): ParsedAppiumServerUrl {
  const fallback: ParsedAppiumServerUrl = {
    protocol: APPIUM_SERVER_DEFAULTS.protocol,
    hostname: APPIUM_SERVER_DEFAULTS.hostname,
    port: APPIUM_SERVER_DEFAULTS.port,
    path: APPIUM_SERVER_DEFAULTS.path,
  };

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return fallback;
  }

  const protocol: 'http' | 'https' = url.protocol === 'https:' ? 'https' : 'http';

  // URL.port 在使用协议默认端口时返回空串（http→80 / https→443），必须自己补回来，
  // 否则 wdio 会拿到 port: NaN 并静默连到 4723
  const defaultPort = protocol === 'https' ? 443 : 80;
  const port = url.port === '' ? defaultPort : Number(url.port);

  // URL.pathname 对 `http://host:4723` 会给出 '/'，与 Appium 2.x 默认值天然一致；
  // 末尾多余的斜杠要规范化掉（'/wd/hub/' → '/wd/hub'），否则 wdio 会拼出 '//session'
  const pathname = url.pathname === '' ? '/' : url.pathname;
  const normalizedPath = pathname !== '/' && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;

  return {
    protocol,
    hostname: url.hostname === '' ? fallback.hostname : url.hostname,
    port: Number.isFinite(port) && port > 0 ? port : fallback.port,
    path: normalizedPath,
  };
}

/** 由四元组拼回规范化 URL；协议默认端口不写进字符串，保持与用户输入一致的观感 */
export function formatAppiumServerUrl(parts: ParsedAppiumServerUrl): string {
  const isDefaultPort = (parts.protocol === 'http' && parts.port === 80)
    || (parts.protocol === 'https' && parts.port === 443);
  const authority = isDefaultPort ? parts.hostname : `${parts.hostname}:${String(parts.port)}`;
  const suffix = parts.path === '/' ? '' : parts.path;
  return `${parts.protocol}://${authority}${suffix}`;
}

/**
 * 把工程 LogLevel 映射为 Appium/wdio 的日志级别。
 * 两个枚举只差一个 `trace`，其余同名同义，故为恒等映射；
 * 单独抽成函数是为了在契约层新增级别时有唯一的收口点。
 */
export function toAppiumLogLevel(level: LogLevel): AppiumLogLevel {
  switch (level) {
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    case 'silent':
      return 'silent';
    default:
      return 'info';
  }
}

/**
 * 构建 Appium Server 配置。
 *
 * 覆盖优先级（高 → 低）：`overrides` > `env.appiumServerUrl` 解析结果 > `APPIUM_SERVER_DEFAULTS`。
 *
 * @param env 已加载的环境配置；缺省时全部走默认值
 * @param overrides 调用方显式覆盖
 */
export function buildAppiumServerConfig(
  env?: EnvConfig,
  overrides: AppiumServerOverrides = {},
): AppiumServerConfig {
  const parsed = env?.appiumServerUrl !== undefined && env.appiumServerUrl.trim() !== ''
    ? parseAppiumServerUrl(env.appiumServerUrl)
    : {
      protocol: APPIUM_SERVER_DEFAULTS.protocol,
      hostname: APPIUM_SERVER_DEFAULTS.hostname,
      port: APPIUM_SERVER_DEFAULTS.port,
      path: APPIUM_SERVER_DEFAULTS.path,
    };

  const merged: ParsedAppiumServerUrl = {
    protocol: overrides.protocol ?? parsed.protocol,
    hostname: overrides.hostname ?? parsed.hostname,
    port: overrides.port ?? parsed.port,
    path: overrides.path ?? parsed.path,
  };

  return {
    ...merged,
    serverUrl: formatAppiumServerUrl(merged),
    connectionRetryTimeout: overrides.connectionRetryTimeout
      ?? APPIUM_SERVER_DEFAULTS.connectionRetryTimeout,
    connectionRetryCount: overrides.connectionRetryCount
      ?? APPIUM_SERVER_DEFAULTS.connectionRetryCount,
    logLevel: overrides.logLevel ?? toAppiumLogLevel(env?.logLevel ?? 'info'),
    strictSSL: overrides.strictSSL ?? APPIUM_SERVER_DEFAULTS.strictSSL,
  };
}

/** 校验 Appium Server 配置（纯函数，不发起任何网络探测） */
export function validate(config: AppiumServerConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.hostname.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'appium.server.hostname',
      message: 'Appium Server 主机名不能为空',
      severity: 'error',
      hint: '请检查 OMNI_APPIUM_SERVER_URL 是否形如 http://127.0.0.1:4723',
    });
  }

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.server.port',
      message: `Appium Server 端口非法：${String(config.port)}，应为 1~65535 的整数`,
      severity: 'error',
    });
  }

  if (!config.path.startsWith('/')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.server.path',
      message: `Appium Server 基础路径必须以 "/" 开头，实际为 "${config.path}"`,
      severity: 'error',
    });
  }

  if (config.path === LEGACY_APPIUM_BASE_PATH) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.server.path',
      message: `基础路径为 "${LEGACY_APPIUM_BASE_PATH}"，这是 Appium 1.x 的约定；Appium 2.x 已改为根路径 "/"`,
      severity: 'warning',
      hint: '若服务端是 Appium 2.x，请把 OMNI_APPIUM_SERVER_URL 末尾的 /wd/hub 去掉，否则所有请求都会 404',
    });
  }

  if (config.connectionRetryTimeout <= 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.server.connectionRetryTimeout',
      message: `connectionRetryTimeout 必须为正数，实际为 ${String(config.connectionRetryTimeout)}`,
      severity: 'error',
    });
  } else if (config.connectionRetryTimeout < 60_000) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.server.connectionRetryTimeout',
      message: `connectionRetryTimeout=${config.connectionRetryTimeout}ms 偏小；`
        + 'POST /session 需同步等待装包与 WDA/UiAutomator2 启动，通常需要 60s 以上',
      severity: 'warning',
    });
  }

  if (!Number.isInteger(config.connectionRetryCount) || config.connectionRetryCount < 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.server.connectionRetryCount',
      message: `connectionRetryCount 必须为非负整数，实际为 ${String(config.connectionRetryCount)}`,
      severity: 'error',
    });
  }

  if (config.protocol === 'https' && config.strictSSL === false) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.server.strictSSL',
      message: '使用 https 但关闭了证书校验（strictSSL=false）',
      severity: 'warning',
      hint: '仅在连接自签证书的内网 Grid 时可接受；公网环境请置为 true',
    });
  }

  return issues;
}
