import type {
  ILogger,
  LogContext,
  LogLevel,
  ResolvedRunConfig,
} from '../contracts/types';
import { isOmniError } from '../contracts/types';

/**
 * ILogger 实现：级别过滤 + scope 派生 + 固定标签五元组 + text/json 双格式（US-11）。
 *
 * 【为什么区分「标签」与「调用上下文」】
 * 标签（framework/app/platform/device/runId）在整次运行中恒定，由 child 自动继承，
 * 业务代码一次都不用重复传 —— 少写就少错，也保证了每条日志都能被稳定归因到某次运行。
 * 调用上下文（sessionId/durationMs…）逐条不同，渲染在行尾 JSON 里。
 * 二者若混在一起，text 模式的行首会被撑爆而丧失可扫读性，这正是 §9.5 样例要分开渲染的原因。
 *
 * 【为什么不用 console.log】
 * §9.5 明令禁止（dry-run 的 dependency-direction 检查会扫描违规）。
 * console 在 jest worker 中会被劫持并加上来源前缀，破坏日志格式的机器可解析性；
 * 直接写 process.stdout/stderr 才能保证 json 模式下每行都是合法 JSON。
 */

/** 级别权重。数值越大越严重；silent 取 Infinity 语义，任何日志都被过滤 */
export const LOG_LEVEL_WEIGHTS: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/** 可实际输出的级别（不含 silent） */
export type WritableLogLevel = Exclude<LogLevel, 'silent'>;

/** 日志输出目的地。抽象出来是为了让单测可以断言输出内容，而不必劫持全局 stdout */
export type LogSink = (line: string, level: WritableLogLevel) => void;

/** 日志格式 */
export type LogFormat = 'text' | 'json';

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly format?: LogFormat;
  /** 作用域名，渲染为 `[AppiumDriver]`；根 logger 无 scope */
  readonly scope?: string;
  /** 继承性标签，child 时与父级合并 */
  readonly context?: LogContext;
  readonly sink?: LogSink;
  /** 时间源，便于单测冻结时间 */
  readonly now?: () => Date;
}

/** text 模式下标签键的短别名，对应 §9.5 的 `[fw=... app=... pf=... dev=... run=...]` */
const TAG_ALIASES: Readonly<Record<string, string>> = {
  framework: 'fw',
  app: 'app',
  platform: 'pf',
  device: 'dev',
  runId: 'run',
};

/** 标签渲染顺序。固定顺序保证同一次运行的日志前缀完全一致，便于 grep 与 diff */
const TAG_ORDER: readonly string[] = ['framework', 'app', 'platform', 'device', 'runId'];

/** 默认输出：warn/error 走 stderr，其余走 stdout，符合 POSIX 约定，CI 可分流采集 */
const defaultSink: LogSink = (line, level) => {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
};

/** 把 unknown 异常序列化为可写进日志的结构（OmniError 走 toJSON，保留 code/exitCode/hint） */
function serializeError(error: unknown): Record<string, unknown> {
  if (isOmniError(error)) {
    const serialized = error.toJSON();
    if (error.stack !== undefined) {
      serialized['stack'] = error.stack;
    }
    if (error.cause !== undefined) {
      serialized['cause'] = readableCause(error.cause);
    }
    return serialized;
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause !== undefined ? { cause: readableCause(error.cause) } : {}),
    };
  }
  return { value: String(error) };
}

/** cause 只取一层摘要，避免异常链把整份日志撑到不可读 */
function readableCause(cause: unknown): string {
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }
  return String(cause);
}

/** 安全 JSON 序列化：循环引用与 BigInt 都不该让一条日志把整个进程搞崩 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === 'bigint') {
        return item.toString();
      }
      if (typeof item === 'object' && item !== null) {
        if (seen.has(item)) {
          return '[Circular]';
        }
        seen.add(item);
      }
      return item;
    }) ?? 'null';
  } catch {
    return '"[Unserializable]"';
  }
}

/** 剔除值为 undefined 的键，避免日志里出现 `key=undefined` 噪音 */
function compactContext(context: LogContext | undefined): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (context === undefined) {
    return result;
  }
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * ILogger 的标准实现。
 * 有意做成类而非闭包：`child()` 需要复制一份配置并共享 sink，类的字段结构让这个关系一目了然。
 */
export class Logger implements ILogger {
  #level: LogLevel;

  readonly #format: LogFormat;
  readonly #scope: string | undefined;
  readonly #tags: Readonly<Record<string, string | number | boolean>>;
  readonly #sink: LogSink;
  readonly #now: () => Date;

  constructor(options: LoggerOptions = {}) {
    this.#level = options.level ?? 'info';
    this.#format = options.format ?? 'text';
    this.#scope = options.scope;
    this.#tags = compactContext(options.context);
    this.#sink = options.sink ?? defaultSink;
    this.#now = options.now ?? ((): Date => new Date());
  }

  get level(): LogLevel {
    return this.#level;
  }

  setLevel(level: LogLevel): void {
    this.#level = level;
  }

  debug(message: string, context?: LogContext): void {
    this.#write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.#write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.#write('warn', message, context);
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    // 异常单独成键，不混进 context —— context 的值类型被契约限定为标量，
    // 而错误是结构化对象，混入会破坏 json 模式下 ctx 字段的类型一致性
    this.#write('error', message, context, error === undefined ? undefined : serializeError(error));
  }

  /**
   * 派生子 logger：继承级别、格式、sink 与全部标签，追加 scope 与新标签。
   * scope 采用点号拼接（`AppiumAdapter.actions`），使嵌套派生仍能还原完整调用路径。
   */
  child(scope: string, context?: LogContext): ILogger {
    const mergedScope = this.#scope === undefined || this.#scope === ''
      ? scope
      : `${this.#scope}.${scope}`;

    return new Logger({
      level: this.#level,
      format: this.#format,
      scope: mergedScope,
      context: { ...this.#tags, ...compactContext(context) },
      sink: this.#sink,
      now: this.#now,
    });
  }

  /** 级别过滤：silent 权重为 100，高于任何真实级别，因此天然吞掉所有输出 */
  #isEnabled(level: WritableLogLevel): boolean {
    return LOG_LEVEL_WEIGHTS[level] >= LOG_LEVEL_WEIGHTS[this.#level];
  }

  #write(
    level: WritableLogLevel,
    message: string,
    context?: LogContext,
    error?: Record<string, unknown>,
  ): void {
    if (!this.#isEnabled(level)) {
      return;
    }
    const timestamp = this.#now().toISOString();
    const ctx = compactContext(context);
    const line = this.#format === 'json'
      ? this.#renderJson(timestamp, level, message, ctx, error)
      : this.#renderText(timestamp, level, message, ctx, error);
    this.#sink(line, level);
  }

  #renderText(
    timestamp: string,
    level: WritableLogLevel,
    message: string,
    context: Record<string, string | number | boolean>,
    error?: Record<string, unknown>,
  ): string {
    const segments: string[] = [`[${timestamp}]`, `[${level.toUpperCase().padEnd(5, ' ')}]`];

    const tagText = this.#renderTags();
    if (tagText !== '') {
      segments.push(`[${tagText}]`);
    }
    if (this.#scope !== undefined && this.#scope !== '') {
      segments.push(`[${this.#scope}]`);
    }
    segments.push(message);

    if (Object.keys(context).length > 0) {
      segments.push(safeStringify(context));
    }
    if (error !== undefined) {
      segments.push(safeStringify(error));
    }
    return segments.join(' ');
  }

  /** 标签渲染：五元组按固定顺序在前，自定义标签按字典序在后，保证输出稳定可 diff */
  #renderTags(): string {
    const rendered: string[] = [];
    for (const key of TAG_ORDER) {
      const value = this.#tags[key];
      if (value !== undefined) {
        rendered.push(`${TAG_ALIASES[key] ?? key}=${String(value)}`);
      }
    }
    const extraKeys = Object.keys(this.#tags)
      .filter((key) => !TAG_ORDER.includes(key))
      .sort();
    for (const key of extraKeys) {
      rendered.push(`${key}=${String(this.#tags[key])}`);
    }
    return rendered.join(' ');
  }

  #renderJson(
    timestamp: string,
    level: WritableLogLevel,
    message: string,
    context: Record<string, string | number | boolean>,
    error?: Record<string, unknown>,
  ): string {
    // 标签在 json 模式下平铺到顶层（而非嵌进 tags 子对象），
    // 这样 ELK / Loki 可以直接按 framework、runId 建索引，无需额外的字段展开规则
    const payload: Record<string, unknown> = {
      ts: timestamp,
      level,
      ...this.#tags,
    };
    if (this.#scope !== undefined && this.#scope !== '') {
      payload['scope'] = this.#scope;
    }
    payload['msg'] = message;
    if (Object.keys(context).length > 0) {
      payload['ctx'] = context;
    }
    if (error !== undefined) {
      payload['err'] = error;
    }
    return safeStringify(payload);
  }
}

/** 解析日志级别字符串，非法值回退到 fallback（配置错误不该让程序起不来） */
export function parseLogLevel(raw: string | undefined, fallback: LogLevel = 'info'): LogLevel {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized in LOG_LEVEL_WEIGHTS ? (normalized as LogLevel) : fallback;
}

/** 解析日志格式字符串，非法值回退到 fallback */
export function parseLogFormat(raw: string | undefined, fallback: LogFormat = 'text'): LogFormat {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'json' || normalized === 'text' ? normalized : fallback;
}

/**
 * 创建 logger。
 * 未显式传 level/format 时读取 OMNI_LOG_LEVEL / OMNI_LOG_FORMAT ——
 * utils 层不允许依赖 configs（§1.2），因此这里直接读 process.env，
 * 让「配置体系尚未初始化」的早期阶段（CLI 参数解析、dry-run 结构扫描）也有可用日志。
 */
export function createLogger(options: LoggerOptions = {}): ILogger {
  return new Logger({
    ...options,
    level: options.level ?? parseLogLevel(process.env['OMNI_LOG_LEVEL']),
    format: options.format ?? parseLogFormat(process.env['OMNI_LOG_FORMAT']),
  });
}

/**
 * 从已解析的运行配置创建 root logger，自动挂载 §9.5 规定的标签五元组。
 *
 * 对应 ARCHITECTURE.md §9.5 中提到的 `createLogger(runConfig)`。这里拆成独立命名的函数，
 * 是为了让 `createLogger(options)` 保持「不依赖运行配置」的纯净形态 ——
 * CLI 在 resolveRunConfig 之前就需要日志能力，两个入口各司其职，避免联合类型入参带来的歧义。
 */
export function createRunLogger(
  runConfig: ResolvedRunConfig,
  overrides: LoggerOptions = {},
): ILogger {
  return createLogger({
    ...overrides,
    level: overrides.level ?? runConfig.options.logLevel ?? runConfig.env.logLevel,
    format: overrides.format ?? runConfig.env.logFormat,
    context: {
      framework: String(runConfig.framework),
      app: String(runConfig.options.app),
      platform: runConfig.platform,
      device: runConfig.deviceKind,
      runId: runConfig.runId,
      ...overrides.context,
    },
  });
}

/**
 * 静默 logger。
 * 供单测与 dry-run 的探测路径使用：那些路径需要传入一个 ILogger 以满足签名，
 * 但不应污染控制台输出（dry-run 的表格渲染要求控制台干净）。
 */
export function createSilentLogger(): ILogger {
  return new Logger({ level: 'silent', sink: () => undefined });
}
