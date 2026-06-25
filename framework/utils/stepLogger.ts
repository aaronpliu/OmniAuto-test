/**
 * 步骤日志工具
 * Step Logger
 *
 * 用于在 Page Object 中记录测试步骤，自动附加到 Allure 报告。
 *
 * 使用方式 / Usage:
 *   import { step, stepSync } from '@framework/utils/stepLogger';
 *
 *   async login(username: string, password: string) {
 *     await step('输入用户名', async () => {
 *       await this.actions.typeText(by.id('usernameInput'), username);
 *     });
 *     await step('输入密码', async () => {
 *       await this.actions.typeText(by.id('passwordInput'), password);
 *     });
 *   }
 */
import { Logger } from './logger';

const logger = Logger.getInstance();

/**
 * 记录异步测试步骤（自动附加到 Allure 报告）
 * @param name  步骤名称
 * @param fn    步骤执行函数
 */
export async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const startTime = Date.now();
  logger.info(`[STEP] ${name}...`);

  try {
    const result = await wrapWithAllureStep(name, fn);
    const duration = Date.now() - startTime;
    logger.info(`[STEP] ✓ ${name} (${duration}ms)`);
    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(`[STEP] ✗ ${name} FAILED (${duration}ms): ${error.message}`);
    throw error;
  }
}

/**
 * 记录同步测试步骤
 * @param name  步骤名称
 * @param fn    步骤执行函数
 */
export function stepSync<T>(name: string, fn: () => T): T {
  const startTime = Date.now();
  logger.info(`[STEP] ${name}...`);

  try {
    const result = wrapWithAllureStepSync(name, fn);
    const duration = Date.now() - startTime;
    logger.info(`[STEP] ✓ ${name} (${duration}ms)`);
    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(`[STEP] ✗ ${name} FAILED (${duration}ms): ${error.message}`);
    throw error;
  }
}

/**
 * 使用 Allure step 包装异步函数
 * 如果 Allure 不可用，则直接执行函数
 */
async function wrapWithAllureStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const { allure } = require('allure-jest/node');
    return await allure.step(name, async () => {
      return await fn();
    });
  } catch (e) {
    // Allure 不可用，直接执行
    return await fn();
  }
}

/**
 * 使用 Allure step 包装同步函数
 */
function wrapWithAllureStepSync<T>(name: string, fn: () => T): T {
  try {
    const { allure } = require('allure-jest/node');
    return allure.step(name, () => {
      return fn();
    });
  } catch (e) {
    // Allure 不可用，直接执行
    return fn();
  }
}

/**
 * 在 Allure 报告中添加日志信息
 * @param message 日志内容
 */
export function addLog(message: string): void {
  try {
    const { allure } = require('allure-jest/node');
    allure.step(message, () => {
      // 空步骤，仅用于在报告中显示日志
    });
  } catch (e) {
    // Allure 不可用，忽略
  }
}
