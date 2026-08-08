import { isOmniError, ERROR_CODES } from '../contracts/types';
import { sleep, withTimeout } from './wait';

/**
 * 通用重试原语：支持固定 / 线性 / 指数退避、错误白名单与重试回调。
 *
 * 【重试的适用边界（§9.6，务必遵守）】
 * 只允许用在两类地方：
 * 1. **Driver 层的连接建立** —— Appium Server 冷启动、模拟器开机、Runner 握手，都是「等一会就好」的瞬态失败；
 * 2. **显式标注的不稳定动作** —— 如已知有动画竞态的滚动。
 *
 * **断言层禁止隐式重试。** 一旦给 assert* 加上自动重试，偶发的真实缺陷会被重试掩盖成「偶尔失败」，
 * 测试就从「质量守门员」退化成「概率性噪音源」，这是自动化测试工程最常见也最致命的腐化路径。
 *
 * 本模块与 `wait.ts` 同属 L1 基础设施层，同层互相 import 不违反 §1.2 的依赖矩阵。
 */

/** 退避策略 */
export type BackoffStrategy = 'fixed' | 'linear' | 'exponential';

export interface RetryOptions {
  /** 总尝试次数（含首次），默认 3。<= 1 表示不重试 */
  readonly attempts?: number;
  /** 首次重试前的基础延迟，默认 200ms */
  readonly delayMs?: number;
  /** 退避策略，默认 'exponential' */
  readonly backoff?: BackoffStrategy;
  /**
   * 错误白名单：返回 true 才重试。
   * 默认策略见 `isRetryableError` —— 只重试瞬态类错误，配置/组合非法这类确定性错误重试多少次都一样。
   */
  readonly retryOn?: (error: unknown, attempt: number) => boolean;
  /** 每次准备重试前的回调（打日志、埋点）。抛出的异常会被忽略，不影响重试主流程 */
  readonly onRetry?: (error: unknown, attempt: number, delayMs: number) => void | Promise<void>;
  /** 指数退避的底数，默认 2 */
  readonly factor?: number;
  /** 单次延迟上限，默认 10000ms，防止指数退避把等待时间放大到分钟级 */
  readonly maxDelayMs?: number;
  /**
   * 是否加入随机抖动（0~50% 的额外延迟），默认 true。
   * 多个 worker 同时重连同一个 Appium Server 时，同步退避会形成「重试风暴」周期性打满服务端；
   * 抖动把重试时刻打散，是分布式重试的标准做法。
   */
  readonly jitter?: boolean;
  /** 单次尝试的超时；超时视为一次失败并参与重试计数。默认不限制 */
  readonly timeoutMsPerAttempt?: number;
  /** 语义化操作名，用于超时与耗尽重试时的错误信息，默认 'retry' */
  readonly label?: string;
  /** 外部中断信号，触发后停止重试并抛出最后一次错误 */
  readonly signal?: AbortSignal;
}

/** 默认不重试的错误码：这些是确定性失败，重试只是浪费时间并延后错误暴露 */
const NON_RETRYABLE_CODES: ReadonlySet<string> = new Set<string>([
  ERROR_CODES.CONFIG_INVALID,
  ERROR_CODES.CONFIG_MISSING_FIELD,
  ERROR_CODES.ENV_MISSING,
  ERROR_CODES.INVALID_COMBINATION,
  ERROR_CODES.FRAMEWORK_NOT_INSTALLED,
  ERROR_CODES.FRAMEWORK_NOT_REGISTERED,
  ERROR_CODES.UNSUPPORTED_LOCATOR,
  ERROR_CODES.ASSERTION_FAILED,
  ERROR_CODES.NOT_IMPLEMENTED,
]);

/**
 * 默认重试判定。
 * 非 OmniError（第三方 SDK 原始异常、网络错误）一律视为可重试 —— 它们多为瞬态；
 * OmniError 则按错误码判定，确定性错误直接放弃。
 */
export function isRetryableError(error: unknown): boolean {
  if (!isOmniError(error)) {
    return true;
  }
  return !NON_RETRYABLE_CODES.has(error.code);
}

/** 计算第 attempt 次失败后应等待的毫秒数（attempt 从 1 开始计数） */
export function computeBackoffDelay(attempt: number, options: RetryOptions = {}): number {
  const base = options.delayMs ?? 200;
  const factor = options.factor ?? 2;
  const maxDelay = options.maxDelayMs ?? 10_000;
  const strategy = options.backoff ?? 'exponential';

  let delay: number;
  switch (strategy) {
    case 'fixed':
      delay = base;
      break;
    case 'linear':
      delay = base * attempt;
      break;
    case 'exponential':
    default:
      delay = base * Math.pow(factor, attempt - 1);
      break;
  }

  delay = Math.min(delay, maxDelay);

  if (options.jitter !== false) {
    delay += Math.random() * delay * 0.5;
  }

  return Math.max(0, Math.round(delay));
}

/**
 * 带退避的重试执行器。
 *
 * @param fn 被执行的操作，入参为当前尝试序号（从 1 开始），便于日志与分支处理
 * @param options 重试策略
 * @returns fn 的返回值
 * @throws 最后一次尝试的原始错误 —— **不做包装**。
 *   包装会掩盖真实错误类型，导致上层的 `instanceof FrameworkNotInstalledError` 判定失效、
 *   退出码映射错乱（§9.4 第 2 条要求每个错误都带正确的 exitCode），因此原样抛出。
 */
export async function retry<T>(
  fn: (attempt: number) => T | Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const shouldRetry = options.retryOn ?? ((error: unknown): boolean => isRetryableError(error));
  const label = options.label ?? 'retry';

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const execution = Promise.resolve(fn(attempt));
      if (options.timeoutMsPerAttempt !== undefined) {
        return await withTimeout(
          execution,
          options.timeoutMsPerAttempt,
          `${label}（第 ${attempt}/${attempts} 次尝试）`,
        );
      }
      return await execution;
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt >= attempts;
      const aborted = options.signal?.aborted === true;
      if (isLastAttempt || aborted || !shouldRetry(error, attempt)) {
        throw error;
      }

      const delayMs = computeBackoffDelay(attempt, options);
      if (options.onRetry !== undefined) {
        try {
          await options.onRetry(error, attempt, delayMs);
        } catch {
          // 回调只用于观测（打日志/埋点），它自身出错绝不能影响重试主流程
        }
      }
      await sleep(delayMs);
    }
  }

  // 循环内必定 return 或 throw；此处仅为满足 TypeScript 的控制流分析
  throw lastError;
}
