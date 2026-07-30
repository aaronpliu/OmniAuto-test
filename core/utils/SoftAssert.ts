/**
 * 软断言机制
 * Soft Assertion Utility
 *
 * 允许收集多个断言结果而不立即中断测试，最后统一报告所有失败。
 *
 * 使用方式 / Usage:
 *   import { SoftAssert, createSoftAssert } from '@framework/utils/softAssert';
 *
 *   const softAssert = createSoftAssert();
 *
 *   await softAssert.check(async () => {
 *     await actions.expectVisible('element1');
 *   });
 *   await softAssert.check(async () => {
 *     await actions.expectText('element2', 'Hello');
 *   });
 *
 *   // 统一报告所有收集的失败
 *   softAssert.assertAll();
 */
import { Logger } from "./Logger";
import { _setSoftAssertContext } from "../actions/ActionProxy";

const logger = Logger.getInstance();

export interface SoftAssertError {
  index: number;
  error: Error;
  context?: string;
}

export class SoftAssert {
  private errors: SoftAssertError[] = [];
  private checkCount = 0;

  /**
   * 异步断言检查：捕获失败但不中断执行
   * @param fn - 包含断言的异步函数
   * @param context - 可选的上下文描述，用于错误报告
   */
  async check(fn: () => Promise<void>, context?: string): Promise<void> {
    this.checkCount++;
    // 设置软断言上下文：ActionProxy 在此上下文中收集的断言失败不抛出，而是转交给 collectError
    const collected: Error[] = [];
    _setSoftAssertContext({
      collectError: (err: Error) => collected.push(err),
    });
    try {
      await fn();
      logger.debug(`SoftAssert check #${this.checkCount} passed${context ? ` (${context})` : ""}`);
    } catch (e: any) {
      const error = e instanceof Error ? e : new Error(String(e));
      collected.push(error);
    } finally {
      _setSoftAssertContext(null);
    }
    // 将收集的所有错误注册到软断言列表
    for (const error of collected) {
      this.errors.push({ index: this.checkCount, error, context });
      logger.warn(
        `SoftAssert check #${this.checkCount} failed${context ? ` (${context})` : ""}: ${error.message}`
      );
    }
  }

  /**
   * 同步断言检查：捕获失败但不中断执行
   * @param fn - 包含断言的同步函数
   * @param context - 可选的上下文描述
   */
  checkSync(fn: () => void, context?: string): void {
    this.checkCount++;
    const collected: Error[] = [];
    _setSoftAssertContext({
      collectError: (err: Error) => collected.push(err),
    });
    try {
      fn();
      logger.debug(`SoftAssert check #${this.checkCount} passed${context ? ` (${context})` : ""}`);
    } catch (e: any) {
      const error = e instanceof Error ? e : new Error(String(e));
      collected.push(error);
    } finally {
      _setSoftAssertContext(null);
    }
    for (const error of collected) {
      this.errors.push({ index: this.checkCount, error, context });
      logger.warn(
        `SoftAssert check #${this.checkCount} failed${context ? ` (${context})` : ""}: ${error.message}`
      );
    }
  }

  /**
   * 统一抛出所有收集的断言失败
   * 如果没有任何失败，此方法不执行任何操作
   *
   * @throws Error - 包含所有失败信息的聚合错误
   */
  assertAll(): void {
    if (this.errors.length === 0) {
      logger.debug(`SoftAssert: all ${this.checkCount} checks passed`);
      return;
    }

    const failCount = this.errors.length;
    const totalCount = this.checkCount;
    const details = this.errors
      .map((e) => {
        const ctx = e.context ? ` [${e.context}]` : "";
        return `  #${e.index}${ctx}: ${e.error.message}`;
      })
      .join("\n");

    const message = `SoftAssert: ${failCount}/${totalCount} checks failed:\n${details}`;
    logger.error(message);

    // 重置状态以便复用
    const aggregatedError = new Error(message);
    this.errors = [];
    this.checkCount = 0;

    throw aggregatedError;
  }

  /**
   * 获取所有收集的错误
   */
  getErrors(): SoftAssertError[] {
    return [...this.errors];
  }

  /**
   * 是否存在断言失败
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * 已执行的检查次数
   */
  get totalChecks(): number {
    return this.checkCount;
  }

  /**
   * 失败次数
   */
  get failedChecks(): number {
    return this.errors.length;
  }

  /**
   * 通过次数
   */
  get passedChecks(): number {
    return this.checkCount - this.errors.length;
  }

  /**
   * 重置软断言状态
   */
  reset(): void {
    this.errors = [];
    this.checkCount = 0;
    logger.debug("SoftAssert: state reset");
  }
}

/**
 * 便捷工厂函数：创建新的软断言实例
 */
export function createSoftAssert(): SoftAssert {
  return new SoftAssert();
}
