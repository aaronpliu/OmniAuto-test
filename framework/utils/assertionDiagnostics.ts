/**
 * 断言失败自动诊断
 * Assertion Failure Diagnostics
 *
 * 断言失败时自动收集诊断信息（元素属性、截图、页面上下文），
 * 并附加到 Allure 报告，帮助快速定位问题。
 *
 * 由 ActionProxy 在 expect* 方法失败时自动调用，无需手动集成。
 */
import { BaseActions } from "../actions/BaseActions";
import { TSelector } from "../types/actions";
import { Logger } from "./logger";
import { TestSessionState } from "./testSessionState";

const logger = Logger.getInstance();

export interface AssertionDiagnosticInfo {
  /** 诊断时间戳 */
  timestamp: string;
  /** 失败的选择器 */
  selector: string;
  /** 元素属性快照（若元素存在） */
  elementAttributes?: Record<string, unknown>;
  /** 失败截图路径 */
  screenshotPath?: string;
  /** 页面上下文（Web: URL, Mobile: Activity/ViewController） */
  pageContext?: string;
  /** 原始错误信息 */
  errorMessage: string;
  /** 失败的断言方法名 */
  methodName: string;
}

/**
 * 将选择器转为可读字符串
 */
function selectorToString(selector: TSelector): string {
  if (typeof selector === "string") {
    return selector;
  }
  if (selector && typeof selector === "object" && "toString" in selector) {
    return String(selector);
  }
  return "complex-selector";
}

/**
 * 捕获断言失败时的诊断信息
 *
 * @param actions - 当前 actions 实例
 * @param selector - 断言操作的选择器
 * @param methodName - 失败的断言方法名
 * @param errorMessage - 错误消息
 * @returns 诊断信息对象
 */
export async function captureDiagnostics(
  actions: BaseActions,
  selector: TSelector,
  methodName: string,
  errorMessage: string
): Promise<AssertionDiagnosticInfo> {
  const diagnostic: AssertionDiagnosticInfo = {
    timestamp: new Date().toISOString(),
    selector: selectorToString(selector),
    methodName,
    errorMessage,
  };

  if (!TestSessionState.isActive) {
    return diagnostic;
  }

  // 收集元素属性快照
  try {
    const attrs = await actions.getAttributes(selector);
    diagnostic.elementAttributes = attrs;
  } catch {
    // 元素可能不存在，忽略属性获取失败
    diagnostic.elementAttributes = { __error: "Element not found or not accessible" };
  }

  // 截图
  try {
    const sessionDir = process.env.OMNITEST_SESSION_DIR || "artifacts";
    const screenshotName = `assert_fail_${methodName}_${Date.now()}`;
    const path = await actions.takeScreenshot(screenshotName);
    diagnostic.screenshotPath = path;
    logger.debug(`[Diagnostics] Screenshot captured: ${path}`);
  } catch {
    // 截图失败不影响诊断
    logger.debug("[Diagnostics] Screenshot capture failed");
  }

  // 获取页面上下文
  try {
    diagnostic.pageContext = await getPageContext(actions);
  } catch {
    // 忽略上下文获取失败
  }

  return diagnostic;
}

/**
 * 获取当前页面上下文信息
 */
async function getPageContext(actions: BaseActions): Promise<string> {
  const platform = (process.env.TEST_PLATFORM || "").toLowerCase();

  if (platform === "web") {
    // Web: 尝试获取当前 URL
    try {
      const attrs = await actions.getAttributes("body");
      // 返回一个简单的上下文标识
      return `web-page (body exists: ${!!attrs})`;
    } catch {
      return "web-page (context unavailable)";
    }
  }

  // Mobile: 返回平台标识
  return `${platform || "unknown"}-session`;
}

/**
 * 将诊断信息格式化为可读文本
 */
export function formatDiagnostics(diagnostic: AssertionDiagnosticInfo): string {
  const lines: string[] = [];
  lines.push("=== Assertion Failure Diagnostics ===");
  lines.push(`Time:     ${diagnostic.timestamp}`);
  lines.push(`Method:   ${diagnostic.methodName}`);
  lines.push(`Selector: ${diagnostic.selector}`);
  lines.push(`Error:    ${diagnostic.errorMessage}`);

  if (diagnostic.pageContext) {
    lines.push(`Context:  ${diagnostic.pageContext}`);
  }

  if (diagnostic.screenshotPath) {
    lines.push(`Screenshot: ${diagnostic.screenshotPath}`);
  }

  if (diagnostic.elementAttributes) {
    lines.push("Element Attributes:");
    for (const [key, value] of Object.entries(diagnostic.elementAttributes)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  lines.push("=====================================");
  return lines.join("\n");
}

/**
 * 将诊断信息写入 Allure 报告（作为 JSON attachment）
 * 需要 allure-js-commons 运行时可用
 */
export async function attachDiagnosticsToAllure(diagnostic: AssertionDiagnosticInfo): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- optional runtime dependency
    const allure = require("allure-js-commons");
    if (typeof allure.attachment === "function") {
      const jsonStr = JSON.stringify(diagnostic, null, 2);
      await allure.attachment(
        `Assertion Diagnostics: ${diagnostic.methodName}`,
        jsonStr,
        "application/json"
      );

      // 同时附加格式化文本
      const textStr = formatDiagnostics(diagnostic);
      await allure.attachment("Diagnostics Summary", textStr, "text/plain");

      logger.debug("[Diagnostics] Attached to Allure report");
    }
  } catch {
    // allure-js-commons 不可用，静默忽略
    logger.debug("[Diagnostics] allure-js-commons not available, skipping attachment");
  }
}
