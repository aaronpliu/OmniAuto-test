/**
 * ActionProxy — 自动步骤录制
 *
 * 用 Proxy 包装 BaseActions 实例，自动拦截每个方法调用，
 * 将操作记录为测试步骤。步骤记录到文件系统（artifacts/allure-results/），
 * 由 Reporter 读取并写入 Allure JSON。
 *
 * 因为 Jest test sandbox 和 Reporter 不在同一 vm.Context，
 * 不能依靠 globalThis 共享数据，改用文件系统作 IPC 桥梁。
 */
import { BaseActions } from "./BaseActions";
import { IActions } from "../types/actions";
import { Logger } from "../utils/logger";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  isPlatformSelector,
  resolvePlatformSelector,
  isChainableSelector,
  isIndexedSelector,
} from "../utils/SelectorBuilder";
import { TestSessionState } from "../utils/testSessionState";
import {
  captureDiagnostics,
  attachDiagnosticsToAllure,
} from "../utils/assertionDiagnostics";

const logger = Logger.getInstance();

// ================================================================
//  步骤记录文件
// ================================================================

const STEPS_DIR = join(process.cwd(), "artifacts", "allure-results");
const STEPS_FILE_NAME = ".pending-steps.jsonl";
let cachedStepsPath = "";

function getStepsPath(): string {
  if (!cachedStepsPath) {
    cachedStepsPath = join(STEPS_DIR, STEPS_FILE_NAME);
  }
  return cachedStepsPath;
}

/** 将单条步骤追加写入文件 */
function writeStepToFile(step: Record<string, unknown>): void {
  try {
    appendFileSync(getStepsPath(), JSON.stringify(step) + "\n");
  } catch {
    // 静默忽略写入失败
  }
}

/**
 * 当 wrapWithAllureStep 已截过图时，Proxy catch 复用该路径，避免重复截图。
 * 设为 null 表示本轮未截过图。
 */
let _lastAllureScreenshotPath: string | null = null;

/**
 * 可选操作标志位
 * 由 tryAction() 设置，告知 wrapWithAllureStep 和 Proxy catch
 * 跳过截图和失败记录——用于可能失败的可选操作（如关闭弹窗）。
 */
let _tryActionMode = false;

/**
 * 软断言上下文
 * 当 SoftAssert.check() 执行时，设置此变量以收集断言失败而不是抛出。
 */
let _activeSoftAssert: { collectError: (error: Error) => void } | null = null;

/**
 * 设置软断言上下文（由 SoftAssert 内部调用）
 * @internal
 */
export function _setSoftAssertContext(ctx: { collectError: (error: Error) => void } | null): void {
  _activeSoftAssert = ctx;
}

// ================================================================
//  生成可读步骤名称
// ================================================================

function selectorName(s: unknown): string {
  // PlatformSelector: 按当前平台解析后显示
  if (isPlatformSelector(s)) {
    const platform = (process.env.TEST_PLATFORM || "ios").toLowerCase() as "ios" | "android";
    const resolved = resolvePlatformSelector(s, platform);
    return selectorName(resolved);
  }
  // ChainableSelector: 使用紧凑格式显示
  if (isChainableSelector(s)) {
    return s.toString(true);
  }
  // IndexedSelector: { selector, index } — 显示内层选择器名 + 索引
  if (isIndexedSelector(s)) {
    const innerName = selectorName((s as { selector: unknown; index: number }).selector);
    return `${innerName}[${(s as { selector: unknown; index: number }).index}]`;
  }
  if (typeof s === "string") {
    const short = s.includes(":") ? s.split(":").pop()! : s;
    return short.length > 30 ? short.substring(0, 27) + "..." : short;
  }
  if (s && typeof s === "object") {
    return "element";
  }
  return String(s);
}

function argName(arg: unknown, maxLen = 20): string {
  if (typeof arg === "string") {
    return arg.length > maxLen ? `"${arg.substring(0, maxLen)}..."` : `"${arg}"`;
  }
  if (typeof arg === "number") {
    return String(arg);
  }
  if (arg === undefined) {
    return "";
  }
  return "...";
}

function buildStepName(method: string, args: unknown[]): string {
  const parts: string[] = [];

  if (method === "click") {
    parts.push("点击", selectorName(args[0]));
  } else if (method === "doubleClick") {
    parts.push("双击", selectorName(args[0]));
  } else if (method === "longPress") {
    parts.push("长按", selectorName(args[0]));
  } else if (method === "typeText") {
    parts.push("输入", selectorName(args[0]), argName(args[1]));
  } else if (method === "clearText") {
    parts.push("清空", selectorName(args[0]));
  } else if (method === "getText") {
    parts.push("获取文本", selectorName(args[0]));
  } else if (method === "getAttributes") {
    parts.push("获取属性", selectorName(args[0]));
    if (args[1] !== undefined) {
      parts.push(argName(args[1]));
    }
  } else if (method === "expectVisible") {
    const notVisible = args[1] === true;
    parts.push(notVisible ? "验证不可见" : "验证可见", selectorName(args[0]));
  } else if (method === "expectNotVisible") {
    parts.push("验证不可见", selectorName(args[0]));
  } else if (method === "expectText") {
    const textArg = args[1];
    if (textArg instanceof RegExp) {
      parts.push("验证文本匹配", selectorName(args[0]), `/${textArg.source}/`);
    } else {
      parts.push("验证文本", selectorName(args[0]), argName(args[1]));
    }
  } else if (method === "expectContainsText") {
    parts.push("验证包含文本", selectorName(args[0]), argName(args[1]));
  } else if (method === "expectEnabled") {
    parts.push("验证可交互", selectorName(args[0]));
  } else if (method === "expectDisabled") {
    parts.push("验证禁用", selectorName(args[0]));
  } else if (method === "expectExist") {
    parts.push("验证存在", selectorName(args[0]));
  } else if (method === "expectNotExist") {
    parts.push("验证不存在", selectorName(args[0]));
  } else if (method === "expectNotText") {
    const textArg = args[1];
    if (textArg instanceof RegExp) {
      parts.push("验证文本不匹配", selectorName(args[0]), `/${textArg.source}/`);
    } else {
      parts.push("验证文本不是", selectorName(args[0]), argName(args[1]));
    }
  } else if (method === "expectAttribute") {
    parts.push("验证属性", selectorName(args[0]), argName(args[1]), argName(args[2]));
  } else if (method === "expectValue") {
    parts.push("验证值", selectorName(args[0]), argName(args[1]));
  } else if (method === "expectCount") {
    parts.push("验证元素数量", selectorName(args[0]), String(args[1]));
  } else if (method === "expectFocused") {
    parts.push("验证聚焦", selectorName(args[0]));
  } else if (method === "expectNotFocused") {
    parts.push("验证非聚焦", selectorName(args[0]));
  } else if (method.startsWith("waitForElement")) {
    if (method === "waitForElement") {
      const notVisible = args[2] === true;
      parts.push(notVisible ? "等待元素不可见" : "等待元素可见", selectorName(args[0]));
    } else if (method === "waitForElementToExist") {
      parts.push("等待元素存在", selectorName(args[0]));
    } else if (method === "waitForElementToDisappear") {
      parts.push("等待元素消失", selectorName(args[0]));
    } else if (method === "waitForElementToBeEnabled") {
      parts.push("等待元素可交互", selectorName(args[0]));
    } else if (method === "waitForElementWhileScrolling") {
      parts.push("滚动等待", selectorName(args[0]));
    } else if (method === "waitForElementWithRetry") {
      parts.push("重试等待", selectorName(args[0]));
    } else if (method === "waitForAllElements") {
      parts.push("等待全部元素");
    } else if (method === "waitForAnyElement") {
      parts.push("等待任意元素");
    } else {
      parts.push("等待元素", selectorName(args[0]));
    }

    const t =
      args[1] && typeof args[1] === "number"
        ? args[1]
        : args[2] && typeof args[2] === "number"
          ? args[2]
          : null;
    if (t) {
      parts.push(`(${t}ms)`);
    }
  } else if (method === "waitForText") {
    parts.push("等待文本", argName(args[1]));
  } else if (method === "navigateTo") {
    parts.push("打开应用");
  } else if (method === "reload") {
    parts.push("重新加载");
  } else if (method === "back") {
    parts.push("返回");
  } else if (method === "close") {
    parts.push("关闭");
  } else if (method === "swipe") {
    parts.push("滑动", String(args[0]));
  } else if (method === "scroll") {
    parts.push("滚动到", selectorName(args[0]));
  } else if (method === "pinch") {
    parts.push("缩放", String(args[1] || ""));
  } else if (method === "takeScreenshot") {
    parts.push("截图");
  } else if (method === "setOrientation") {
    parts.push("设置方向", String(args[0]));
  } else if (method === "setLocation") {
    parts.push("设置位置", String(args[0]), String(args[1]));
  } else if (method === "startRecording") {
    parts.push("开始录屏");
  } else if (method === "stopRecording") {
    parts.push("停止录屏");
  } else {
    parts.push(method);
  }

  const name = parts.filter(Boolean).join(" ");
  return name.length > 100 ? name.substring(0, 97) + "..." : name;
}

// ================================================================
//  Allure step wrapper（Appium 环境，有 allure-js-commons 运行时）
// ================================================================

async function wrapWithAllureStep<T>(name: string, fn: () => Promise<T>, target: any): Promise<T> {
  // 隔离 require 的 try-catch：仅处理 allure-js-commons 不存在的情况（如 Detox 环境）
  // step() 执行产生的异常应自然向上传播，不应被此处捕获
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- allure-js-commons runtime types
  let step: ((...args: any[]) => any) | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- allure-js-commons runtime types
  let attachment: ((...args: any[]) => any) | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- optional runtime dependency
    const allure = require("allure-js-commons");
    step = allure.step;
    attachment = allure.attachment;
  } catch {
    // allure-js-commons 不可用，降级为直接执行 fn()
    return await fn();
  }

  if (typeof step !== "function") {
    return await fn();
  }

  const result = await step(name, async () => {
    try {
      return await fn();
    } catch (innerErr: any) {
      // 可选操作模式（tryAction）：吞掉错误，让 step 正常结束为 passed
      // 错误会由 tryAction 外层 catch 处理，不在 Allure 中标记为 Broken
      if (_tryActionMode) {
        return undefined as T;
      }

      // 步骤失败时截屏并附加到当前 Allure step 上下文中
      // 若会话正在销毁则跳过
      if (TestSessionState.isActive) {
        try {
          if (typeof attachment === "function" && typeof target.takeScreenshot === "function") {
            const path = await target.takeScreenshot(`step_fail_${Date.now()}`);
            _lastAllureScreenshotPath = path; // 共享给 Proxy catch，避免重复截图
            attachment("Step Failure Screenshot", readFileSync(path as string), "image/png");
            logger.info(`[Step] 📸 截图已附加到 Allure step`);
          }
        } catch {
          /* 截图附加失败不影响步骤 */
        }
      }
      throw innerErr;
    }
  });

  return result;
}

// ================================================================
//  可选操作 API（tryAction）
// ================================================================

/**
 * 尝试执行一个可选操作，失败时不抛出异常。
 *
 * 用于可能失败的可选步骤（如关闭可能不存在的弹窗），
 * 内部自动抑制截图和 Allure 失败记录，返回布尔值表示成功与否。
 *
 * @param fn - 包含 actions 操作的异步函数
 * @returns `true` 表示操作成功，`false` 表示操作失败（已静默处理）
 *
 * @example
 * ```ts
 * import { tryAction } from "@framework/actions";
 *
 * async closeOptionalDialog(): Promise<void> {
 *   const dismissed = await tryAction(
 *     () => this.actions.click(by.id("dialog_OK"))
 *   );
 *   if (!dismissed) {
 *     logger.debug("弹窗不存在，跳过");
 *   }
 * }
 * ```
 */
export async function tryAction(fn: () => Promise<unknown>): Promise<boolean> {
  _tryActionMode = true;
  try {
    await fn();
    return true;
  } catch {
    return false;
  } finally {
    _tryActionMode = false;
  }
}

// ================================================================
//  Proxy 包装器
// ================================================================

/**
 * 检测错误是否由 Jest 环境 teardown 导致
 * 当 Jest vm.Context 已销毁时，WebdriverIO 等模块的 import 会抛出：
 *   - ReferenceError: "after the Jest environment has been torn down"
 *   - Error: "Provided module is not an instance of Module"
 */
function isJestEnvironmentTornDown(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message || "";
    return (
      msg.includes("after the Jest environment has been torn down") ||
      msg.includes("Provided module is not an instance of Module")
    );
  }
  return false;
}

const SKIP_METHODS = new Set([
  "getDriver",
  "buildDefaultCapabilities",
  "selectorToAppiumString",
  "resolveElement",
]);

export function createActionProxy<T extends BaseActions>(actions: T): T {
  logger.info(`[ActionProxy] Wrapping ${actions.constructor.name} — auto step recording enabled`);

  return new Proxy(actions, {
    get(target: T, prop: string | symbol) {
      const original = (target as any)[prop];

      if (typeof original !== "function" || typeof prop !== "string" || SKIP_METHODS.has(prop)) {
        return original;
      }

      if (prop === "constructor" || prop.startsWith("_")) {
        return original;
      }

      // 返回包装后的函数 — 每次调用都记录步骤到文件
      return async function (...args: unknown[]): Promise<unknown> {
        const stepName = buildStepName(prop, args);
        const startTime = Date.now();

        try {
          const result = await wrapWithAllureStep(
            stepName,
            async () => {
              return await original.apply(target, args);
            },
            target
          );

          // 记录成功步骤到文件
          writeStepToFile({
            name: stepName,
            status: "passed",
            start: startTime,
            stop: Date.now(),
          });
          logger.info(`[Step] ✓ ${stepName}`);

          return result;
        } catch (error: any) {
          // 可选操作模式（tryAction）：不截图、不记录失败、不诊断
          // tryAction 外层会捕获此错误并返回 false
          if (_tryActionMode) {
            logger.info(`[Step] ⚠ ${stepName} (optional, skipped): ${error.message}`);
            throw error;
          }

          // 失败步骤自动截图（仅一次 — 若 wrapWithAllureStep 已截则复用）
          let screenshotPath = _lastAllureScreenshotPath || "";
          _lastAllureScreenshotPath = null;

          // wrapWithAllureStep 未截图（Detox 模式）且会话仍活跃时，在此截图
          // 同样尊重抑制标志位
          if (
            !screenshotPath &&
            !isJestEnvironmentTornDown(error) &&
            TestSessionState.isActive &&
            !_tryActionMode
          ) {
            try {
              if (typeof (target as any).takeScreenshot === "function") {
                screenshotPath = await (target as any).takeScreenshot(`step_fail_${Date.now()}`);
                logger.info(`[Step] 📸 失败截图已保存: ${screenshotPath}`);
              }
            } catch {
              /* 截图失败不影响步骤记录 */
            }
          }

          // 断言失败自动诊断：当 expect* 方法失败时，收集元素属性和截图
          if (
            prop.startsWith("expect") &&
            TestSessionState.isActive &&
            !isJestEnvironmentTornDown(error) &&
            !_tryActionMode
          ) {
            try {
              const selector = args[0] as any;
              const diagnostic = await captureDiagnostics(
                target,
                selector,
                prop,
                error.message || String(error)
              );
              await attachDiagnosticsToAllure(diagnostic);
              logger.debug(`[Step] Diagnostics captured for ${prop}`);
            } catch {
              // 诊断收集失败不影响主流程
            }
          }

          // 记录失败步骤到文件
          writeStepToFile({
            name: stepName,
            status: "failed",
            start: startTime,
            stop: Date.now(),
            error: error.message,
            screenshot: screenshotPath || undefined,
          });
          logger.info(`[Step] ✗ ${stepName}: ${error.message}`);

          // 软断言模式：断言失败收集到 SoftAssert 实例而不抛出
          if (_activeSoftAssert && prop.startsWith("expect")) {
            _activeSoftAssert.collectError(
              error instanceof Error ? error : new Error(String(error))
            );
            logger.info(`[Step] ✗ ${stepName} (soft assert collected)`);
            return undefined;
          }

          throw error;
        }
      };
    },
  });
}
