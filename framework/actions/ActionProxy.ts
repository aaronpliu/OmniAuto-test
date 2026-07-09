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
import { appendFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  isPlatformSelector,
  resolvePlatformSelector,
  isChainableSelector,
} from "../utils/SelectorBuilder";

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

/** 清空步骤文件（在每个 test 开始时调用） */
export function clearStepsFile(): void {
  try {
    const p = getStepsPath();
    if (existsSync(p)) {
      unlinkSync(p);
    }
  } catch {
    // ignore
  }
}

/** 读取并清空步骤文件（Reporter 调用） */
export function drainStepsFile(): Record<string, unknown>[] {
  const p = getStepsPath();
  try {
    if (!existsSync(p)) {
      return [];
    }
    const raw = readFileSync(p, "utf-8");
    unlinkSync(p);
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l: string) => JSON.parse(l));
  } catch {
    return [];
  }
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
  } else if (method === "expectVisible") {
    parts.push("验证可见", selectorName(args[0]));
  } else if (method === "expectNotVisible") {
    parts.push("验证不可见", selectorName(args[0]));
  } else if (method === "expectText") {
    parts.push("验证文本", selectorName(args[0]), argName(args[1]));
  } else if (method === "expectContainsText") {
    parts.push("验证包含文本", selectorName(args[0]), argName(args[1]));
  } else if (method === "expectEnabled") {
    parts.push("验证可交互", selectorName(args[0]));
  } else if (method === "expectDisabled") {
    parts.push("验证禁用", selectorName(args[0]));
  } else if (method.startsWith("waitForElement")) {
    if (method === "waitForElement") {
      parts.push("等待元素可见", selectorName(args[0]));
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
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- optional runtime dependency
    const { step, attachment } = require("allure-js-commons");
    if (typeof step === "function") {
      return await step(name, async () => {
        try {
          return await fn();
        } catch (innerErr: any) {
          // 步骤失败时截屏并附加到当前 Allure step 上下文中
          try {
            if (typeof attachment === "function" && typeof target.takeScreenshot === "function") {
              const path = await target.takeScreenshot(`step_fail_${Date.now()}`);
              attachment("Step Failure Screenshot", readFileSync(path as string), "image/png");
              logger.info(`[Step] 📸 截图已附加到 Allure step`);
            }
          } catch {
            /* 截图附加失败不影响步骤 */
          }
          throw innerErr;
        }
      });
    }
  } catch {
    // Allure 运行时不可用（如 Detox 环境），降级为直接执行
  }
  return await fn();
}

// ================================================================
//  Proxy 包装器
// ================================================================

const SKIP_METHODS = new Set([
  "getDriver",
  "buildDefaultCapabilities",
  "getPlatform",
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
          // 失败步骤自动截图
          let screenshotPath = "";
          try {
            if (typeof (target as any).takeScreenshot === "function") {
              screenshotPath = await (target as any).takeScreenshot(`step_fail_${Date.now()}`);
              logger.info(`[Step] 📸 失败截图已保存: ${screenshotPath}`);
            }
          } catch {
            /* 截图失败不影响步骤记录 */
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

          throw error;
        }
      };
    },
  });
}
