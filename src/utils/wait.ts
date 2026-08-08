import { ActionTimeoutError } from '../contracts/types';

/**
 * 等待与超时原语。
 *
 * 【为什么禁止裸 await（§9.6）】
 * 所有跨进程 / 跨网络调用都可能永久挂起：Appium Server 卡死不返回、XCUITest Runner
 * 崩溃后 stdin 无人读取、Detox 的 matcher 在设备失联时静默等待。裸 await 会让 jest
 * 一直等到用例级超时，届时错误信息只剩一句「Exceeded timeout of 30000 ms」，
 * 完全无法定位是哪一步卡住。`withTimeout` 强制每个危险调用自带语义化超时，
 * 失败时能明确指出「哪个动作、等了多久」。
 *
 * 本模块的全部超时一律抛 `ActionTimeoutError`（OmniError 子类），
 * 满足 §9.4 第 1 条「只抛 OmniError 子类」，并保证顶层能按错误类型映射退出码。
 */

/** 默认轮询间隔（毫秒） */
export const DEFAULT_POLL_INTERVAL_MS = 200;

/** 默认等待超时（毫秒） */
export const DEFAULT_WAIT_TIMEOUT_MS = 20_000;

export interface WaitForOptions {
  /** 总超时，默认 20000 */
  readonly timeoutMs?: number;
  /** 轮询间隔，默认 200 */
  readonly intervalMs?: number;
  /** 超时报错时附加的业务语义说明，会成为错误信息中的动作名 */
  readonly message?: string;
  /** 是否在进入循环前立刻求值一次，默认 true（避免已满足的条件仍白等一个 interval） */
  readonly immediate?: boolean;
  /**
   * 谓词自身抛异常时的处理策略。
   * - 'retry'（默认）：视为「条件未满足」继续轮询。元素查找类谓词在元素尚未渲染时抛错是常态。
   * - 'throw'：立即向上抛出。用于谓词异常代表真实故障的场景。
   */
  readonly onPredicateError?: 'retry' | 'throw';
  /** 外部中断信号，触发后立即以 ActionTimeoutError 结束等待 */
  readonly signal?: AbortSignal;
}

/**
 * 休眠指定毫秒数。
 *
 * ⚠ 这里的定时器**绝不能 unref()**。
 * 曾经为「避免退出时被未结算的 sleep 拖住」而加过 `timer.unref()`，结果是灾难性的：
 * 被 unref 的定时器不再持有事件循环，当 `await sleep()` 是当前唯一的待办事项时
 * （轮询等待的间隙、重试的退避间隙都正是这种情形），Node 会判定「无事可做」直接退出，
 * 进程以 exit 0 静默终止，`waitFor` / `retry` 后面的代码一行都不执行 ——
 * 表现为「测试莫名其妙提前成功了」，是最难排查的一类故障。
 * 等待中的休眠本就应当持有事件循环，这是正确行为而非泄漏。
 */
export function sleep(ms: number): Promise<void> {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return new Promise<void>((resolve) => {
    setTimeout(resolve, safeMs);
  });
}

/**
 * 为一个已存在的 Promise 施加超时。
 *
 * ⚠ 注意语义边界：超时后原 Promise **不会被取消**（JS 的 Promise 本身不可取消），
 * 它仍会在后台跑完。这里做了两件事避免副作用泄漏：
 * 1. 无论成败都 clearTimeout，防止定时器把事件循环钉住；
 * 2. 给原 Promise 挂一个空的 catch，避免它在超时后才 reject 时触发
 *    UnhandledPromiseRejection 把整个进程带崩。
 *
 * 定时器同样**不 unref**（理由见 `sleep`）：若被保护的 Promise 自身不持有事件循环
 * 且永不结算，ref 住的超时定时器正是保证我们最终能抛出 ActionTimeoutError 的唯一依靠。
 *
 * @param promise 被保护的 Promise
 * @param ms 超时毫秒数；<= 0 或非有限值表示不设超时，直接透传
 * @param message 语义化动作名，会出现在 ActionTimeoutError 中
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return promise;
  }

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ActionTimeoutError(message, ms));
    }, ms);
  });

  // 兜底吞掉超时之后才到达的 rejection，否则会变成 unhandled rejection
  promise.catch(() => undefined);

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * 轮询等待谓词成立。
 *
 * 【为什么用「先判定后检查剩余时间」的顺序】
 * 若先检查时间再判定，当 timeoutMs 恰好等于一个 interval 时会出现「一次都没判定就超时」的
 * 反直觉行为。这里保证：只要还没超时，至少完整判定一次；超时判定发生在 sleep 之前，
 * 避免多睡一轮造成实际耗时超出用户设定的超时值。
 *
 * @throws ActionTimeoutError 超时或被 signal 中断
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: WaitForOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const action = options.message ?? 'waitFor';
  const onPredicateError = options.onPredicateError ?? 'retry';
  const immediate = options.immediate ?? true;
  const deadline = Date.now() + timeoutMs;

  if (!immediate) {
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }

  for (;;) {
    if (options.signal?.aborted === true) {
      throw new ActionTimeoutError(`${action}（被外部信号中断）`, timeoutMs);
    }

    let satisfied = false;
    try {
      satisfied = await predicate();
    } catch (error) {
      if (onPredicateError === 'throw') {
        throw error;
      }
      satisfied = false;
    }

    if (satisfied) {
      return;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new ActionTimeoutError(action, timeoutMs);
    }
    await sleep(Math.min(intervalMs, remaining));
  }
}

/**
 * 轮询直到产出的值被 accept 接受，并返回该值。
 *
 * 与 `waitFor` 的区别：`waitFor` 只关心「成没成」，本函数还要**把结果带回来**。
 * 典型用途：轮询读取元素文本直到非空，且后续逻辑要用这段文本 ——
 * 用 waitFor 的话得在闭包外用可变变量捕获，既丑陋又容易出竞态。
 *
 * @throws ActionTimeoutError 超时；错误信息中会附带最后一次取到的值，便于排查「一直没变成期望值」的现场
 */
export async function pollUntil<T>(
  producer: () => T | Promise<T>,
  accept: (value: T) => boolean,
  options: WaitForOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const action = options.message ?? 'pollUntil';
  const onPredicateError = options.onPredicateError ?? 'retry';
  const deadline = Date.now() + timeoutMs;

  let lastValue: T | undefined;
  let lastError: unknown;

  for (;;) {
    if (options.signal?.aborted === true) {
      throw new ActionTimeoutError(`${action}（被外部信号中断）`, timeoutMs);
    }

    try {
      const value = await producer();
      lastValue = value;
      if (accept(value)) {
        return value;
      }
    } catch (error) {
      if (onPredicateError === 'throw') {
        throw error;
      }
      lastError = error;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const detail = lastError !== undefined
        ? `最后一次异常：${lastError instanceof Error ? lastError.message : String(lastError)}`
        : `最后一次取值：${JSON.stringify(lastValue) ?? 'undefined'}`;
      throw new ActionTimeoutError(`${action}（${detail}）`, timeoutMs);
    }
    await sleep(Math.min(intervalMs, remaining));
  }
}
