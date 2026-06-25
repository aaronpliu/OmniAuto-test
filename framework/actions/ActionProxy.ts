/**
 * ActionProxy — 自动步骤录制
 *
 * 用 Proxy 包装 BaseActions 实例，自动拦截每个方法调用，
 * 将操作记录为测试步骤，无需用户修改任何 Page Object 代码。
 *
 * 兼容模式：
 *   Appium 环境：同时使用 allure.step() 原生记录 + 全局 StepCollector
 *   Detox 环境：使用全局 StepCollector，Reporter 写入 Allure JSON
 */
import { BaseActions } from './BaseActions';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

// ================================================================
//  全局步骤收集器
// ================================================================

export interface StepRecord {
  name: string;
  status: 'passed' | 'failed' | 'broken';
  start: number;
  stop: number;
  error?: string;
}

class StepCollector {
  private steps: StepRecord[] = [];

  addStep(step: StepRecord): void {
    this.steps.push(step);
  }

  getSteps(): StepRecord[] {
    return [...this.steps];
  }

  clear(): void {
    this.steps = [];
  }
}

/* 全局单例，Reporter 和 Proxy 共享 */
export function getStepCollector(): StepCollector {
  const key = '__OMNI_STEP_COLLECTOR__';
  if (!(globalThis as any)[key]) {
    (globalThis as any)[key] = new StepCollector();
  }
  return (globalThis as any)[key];
}

// ================================================================
//  生成可读步骤名称
// ================================================================

function selectorName(s: unknown): string {
  if (typeof s === 'string') {
    // 截取 last part after : or /
    const short = s.includes(':') ? s.split(':').pop()! : s;
    return short.length > 30 ? short.substring(0, 27) + '...' : short;
  }
  if (s && typeof s === 'object') return 'element';
  return String(s);
}

function argName(arg: unknown, maxLen = 20): string {
  if (typeof arg === 'string') {
    return arg.length > maxLen ? `"${arg.substring(0, maxLen)}..."` : `"${arg}"`;
  }
  if (typeof arg === 'number') return String(arg);
  if (arg === undefined) return '';
  return '...';
}

function buildStepName(method: string, args: unknown[]): string {
  const parts: string[] = [];

  if (method === 'click')             parts.push('点击', selectorName(args[0]));
  else if (method === 'doubleClick')  parts.push('双击', selectorName(args[0]));
  else if (method === 'longPress')    parts.push('长按', selectorName(args[0]));
  else if (method === 'typeText')     parts.push('输入', selectorName(args[0]), argName(args[1]));
  else if (method === 'clearText')    parts.push('清空', selectorName(args[0]));
  else if (method === 'getText')      parts.push('获取文本', selectorName(args[0]));
  else if (method === 'expectVisible') parts.push('验证可见', selectorName(args[0]));
  else if (method === 'expectNotVisible') parts.push('验证不可见', selectorName(args[0]));
  else if (method === 'expectText')   parts.push('验证文本', selectorName(args[0]), argName(args[1]));
  else if (method === 'expectContainsText') parts.push('验证包含文本', selectorName(args[0]), argName(args[1]));
  else if (method === 'expectEnabled')  parts.push('验证可交互', selectorName(args[0]));
  else if (method === 'expectDisabled') parts.push('验证禁用', selectorName(args[0]));
  else if (method.startsWith('waitForElement')) {
    if (method === 'waitForElement')                    parts.push('等待元素可见', selectorName(args[0]));
    else if (method === 'waitForElementToExist')        parts.push('等待元素存在', selectorName(args[0]));
    else if (method === 'waitForElementToDisappear')    parts.push('等待元素消失', selectorName(args[0]));
    else if (method === 'waitForElementToBeEnabled')    parts.push('等待元素可交互', selectorName(args[0]));
    else if (method === 'waitForElementWhileScrolling') parts.push('滚动等待', selectorName(args[0]));
    else if (method === 'waitForElementWithRetry')      parts.push('重试等待', selectorName(args[0]));
    else if (method === 'waitForAllElements')           parts.push('等待全部元素');
    else if (method === 'waitForAnyElement')            parts.push('等待任意元素');
    else                                                parts.push('等待元素', selectorName(args[0]));

    const t = (args[1] && typeof args[1] === 'number') ? args[1] : (args[2] && typeof args[2] === 'number' ? args[2] : null);
    if (t) parts.push(`(${t}ms)`);
  }
  else if (method === 'waitForText')          parts.push('等待文本', argName(args[1]));
  else if (method === 'navigateTo')           parts.push('打开应用');
  else if (method === 'reload')               parts.push('重新加载');
  else if (method === 'back')                 parts.push('返回');
  else if (method === 'close')                parts.push('关闭');
  else if (method === 'swipe')                parts.push('滑动', String(args[0]));
  else if (method === 'scroll')               parts.push('滚动到', selectorName(args[0]));
  else if (method === 'pinch')                parts.push('缩放', String(args[1] || ''));
  else if (method === 'takeScreenshot')       parts.push('截图');
  else if (method === 'setOrientation')       parts.push('设置方向', String(args[0]));
  else if (method === 'setLocation')          parts.push('设置位置', String(args[0]), String(args[1]));
  else if (method === 'startRecording')       parts.push('开始录屏');
  else if (method === 'stopRecording')        parts.push('停止录屏');
  else                                        parts.push(method);

  const name = parts.filter(Boolean).join(' ');
  // 截断过长的步骤名
  return name.length > 100 ? name.substring(0, 97) + '...' : name;
}

// ================================================================
//  Allure step wrapper（Appium 环境）
// ================================================================

async function wrapWithAllureStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    // allure-js-commons 的 step() 在 allure-jest/node 环境中自动关联当前测试
    const { step } = require('allure-js-commons');
    if (typeof step === 'function') {
      return await (step as any)(name, async () => await fn());
    }
  } catch {
    // Allure 运行时不可用（如 Detox 环境），降级为直接执行
    logger.debug(`[StepProxy] allure runtime unavailable, step "${name}" logged via collector only`);
  }
  return await fn();
}

// ================================================================
//  Proxy 包装器
// ================================================================

/** 不需要记录为步骤的内部方法 */
const SKIP_METHODS = new Set(['getDriver', 'buildDefaultCapabilities', 'getPlatform', 'selectorToAppiumString', 'resolveElement']);

export function createActionProxy<T extends BaseActions>(actions: T): T {
  return new Proxy(actions, {
    get(target: T, prop: string | symbol, receiver: any) {
      const original = Reflect.get(target, prop, receiver);

      // 只包装原型上的异步函数
      if (typeof original !== 'function' || typeof prop !== 'string' || SKIP_METHODS.has(prop)) {
        return original;
      }

      // 跳过构造函数、getter 等
      if (prop === 'constructor' || prop.startsWith('_')) {
        return original;
      }

      // 返回包装后的函数
      return async function (...args: unknown[]): Promise<unknown> {
        const stepName = buildStepName(prop, args);
        const startTime = Date.now();
        const collector = getStepCollector();

        try {
          const result = await wrapWithAllureStep(stepName, async () => {
            return await original.apply(target, args);
          });

          // 记录成功步骤
          collector.addStep({
            name: stepName,
            status: 'passed',
            start: startTime,
            stop: Date.now(),
          });

          return result;
        } catch (error: any) {
          // 记录失败步骤
          collector.addStep({
            name: stepName,
            status: 'failed',
            start: startTime,
            stop: Date.now(),
            error: error.message,
          });

          throw error;
        }
      };
    },
  });
}
