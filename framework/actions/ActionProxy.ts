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
import { isPlatformSelector, resolvePlatformSelector } from "../utils/SelectorBuilder";

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

// ================================================================
//  步骤模板声明式注册表
// ================================================================

/** 步骤参数规格：描述如何从 args 中提取并格式化某个参数 */
type ArgSpec =
  | { kind: "selector"; index: number } // 用 selectorName() 格式化（选择器）
  | { kind: "value"; index: number } // 用 argName() 格式化（字面量值）
  | { kind: "duration"; indices: number[] }; // 从多个位置找 number 类型 timeout，输出 "(Nms)"

/** 单个步骤模板：动词 + 参数规格列表 */
interface StepTemplate {
  label: string;
  args?: ArgSpec[];
}

/**
 * 核心方法模板表：Record<keyof IActions, StepTemplate> 强类型约束。
 * 新增 IActions 接口方法时 tsc 会编译报错强制补模板，避免静默遗漏。
 */
const STEP_TEMPLATES: Record<keyof IActions, StepTemplate> = {
  // Element interactions
  click: { label: "点击", args: [{ kind: "selector", index: 0 }] },
  doubleClick: { label: "双击", args: [{ kind: "selector", index: 0 }] },
  longPress: { label: "长按", args: [{ kind: "selector", index: 0 }] },
  // Input
  typeText: {
    label: "输入",
    args: [
      { kind: "selector", index: 0 },
      { kind: "value", index: 1 },
    ],
  },
  clearText: { label: "清空", args: [{ kind: "selector", index: 0 }] },
  getText: { label: "获取文本", args: [{ kind: "selector", index: 0 }] },
  // Assertions
  expectVisible: { label: "验证可见", args: [{ kind: "selector", index: 0 }] },
  expectNotVisible: {
    label: "验证不可见",
    args: [{ kind: "selector", index: 0 }],
  },
  expectText: {
    label: "验证文本",
    args: [
      { kind: "selector", index: 0 },
      { kind: "value", index: 1 },
    ],
  },
  expectContainsText: {
    label: "验证包含文本",
    args: [
      { kind: "selector", index: 0 },
      { kind: "value", index: 1 },
    ],
  },
  expectEnabled: { label: "验证可交互", args: [{ kind: "selector", index: 0 }] },
  expectDisabled: { label: "验证禁用", args: [{ kind: "selector", index: 0 }] },
  // Wait
  waitForElement: {
    label: "等待元素可见",
    args: [
      { kind: "selector", index: 0 },
      { kind: "duration", indices: [1, 2] },
    ],
  },
  // Navigation
  navigateTo: { label: "打开应用" },
  reload: { label: "重新加载" },
  back: { label: "返回" },
  close: { label: "关闭" },
  // Gestures
  swipe: { label: "滑动", args: [{ kind: "value", index: 0 }] },
  scroll: { label: "滚动到", args: [{ kind: "selector", index: 0 }] },
  pinch: { label: "缩放", args: [{ kind: "value", index: 1 }] },
  // Utilities
  takeScreenshot: { label: "截图" },
  // Device
  setOrientation: { label: "设置方向", args: [{ kind: "value", index: 0 }] },
  setLocation: {
    label: "设置位置",
    args: [
      { kind: "value", index: 0 },
      { kind: "value", index: 1 },
    ],
  },
};

/**
 * 扩展方法模板表：非 IActions 接口的方法（Detox/Appium 扩展的 waitFor* 变体、录屏等）。
 * 无强类型约束，靠开发者补充；遗漏时 buildStepName 会降级 + warn 提醒。
 */
const EXTENDED_TEMPLATES: Record<string, StepTemplate> = {
  waitForElementToExist: {
    label: "等待元素存在",
    args: [
      { kind: "selector", index: 0 },
      { kind: "duration", indices: [1, 2] },
    ],
  },
  waitForElementToDisappear: {
    label: "等待元素消失",
    args: [
      { kind: "selector", index: 0 },
      { kind: "duration", indices: [1, 2] },
    ],
  },
  waitForElementToBeEnabled: {
    label: "等待元素可交互",
    args: [
      { kind: "selector", index: 0 },
      { kind: "duration", indices: [1, 2] },
    ],
  },
  waitForElementWhileScrolling: {
    label: "滚动等待",
    args: [
      { kind: "selector", index: 0 },
      { kind: "duration", indices: [1, 2] },
    ],
  },
  waitForElementWithRetry: {
    label: "重试等待",
    args: [
      { kind: "selector", index: 0 },
      { kind: "duration", indices: [1, 2] },
    ],
  },
  waitForAllElements: {
    label: "等待全部元素",
    args: [{ kind: "duration", indices: [1, 2] }],
  },
  waitForAnyElement: {
    label: "等待任意元素",
    args: [{ kind: "duration", indices: [1, 2] }],
  },
  waitForText: { label: "等待文本", args: [{ kind: "value", index: 1 }] },
  startRecording: { label: "开始录屏" },
  stopRecording: { label: "停止录屏" },
};

/** 按 ArgSpec 从 args 中提取并格式化为步骤名片段 */
function formatArg(spec: ArgSpec, args: unknown[]): string {
  switch (spec.kind) {
    case "selector":
      return selectorName(args[spec.index]);
    case "value":
      return argName(args[spec.index]);
    case "duration": {
      for (const i of spec.indices) {
        const v = args[i];
        if (v !== undefined && typeof v === "number") {
          return `(${v}ms)`;
        }
      }
      return "";
    }
  }
}

/** 记录已 warn 过的未配置方法，避免重复刷日志 */
const warnedMethods = new Set<string>();

function buildStepName(method: string, args: unknown[]): string {
  const coreTpl = (STEP_TEMPLATES as Record<string, StepTemplate | undefined>)[method];
  const tpl = coreTpl ?? EXTENDED_TEMPLATES[method];

  if (!tpl) {
    // 未配置模板：降级为方法名 + 每方法仅 warn 一次
    if (!warnedMethods.has(method)) {
      logger.warn(`[ActionProxy] 步骤模板未配置: ${method}，报告将显示原始方法名`);
      warnedMethods.add(method);
    }
    return method;
  }

  const parts: string[] = [tpl.label];
  for (const spec of tpl.args ?? []) {
    parts.push(formatArg(spec, args));
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
