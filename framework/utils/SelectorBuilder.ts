/**
 * 跨平台选择器构建器
 * Cross-platform Selector Builder
 *
 * 统一 Detox 和 Appium 的选择器语法，
 * 通过字符串前缀标识选择器类型，两套 Actions 均能正确解析。
 *
 * 选择器格式 / Selector Format:
 * - "id:xxx"    → Accessibility ID / Test ID
 * - "text:xxx"   → 文本匹配 / Text matcher
 * - "label:xxx"  → Accessibility Label（iOS）/ Content-desc（Android）
 * - "xpath:xxx"  → XPath 选择器 / XPath selector
 * - "css:xxx"    → CSS 选择器（Web 上下文）/ CSS selector (web context)
 * - "class:xxx"  → 类名选择器 / Class name selector
 * - "xxx"        → 纯字符串，默认按 Accessibility ID 处理（向后兼容）
 *
 * 用法 / Usage:
 *   import { by } from '@framework/utils/SelectorBuilder';
 *   await actions.click(by.id('loginButton'));
 *   await actions.click(by.text('Submit'));
 */

import { PlatformSelector, SelectorValue } from "../types/actions";

// ========== 选择器构建函数 / Selector Builder Functions ==========

/** 按 Accessibility ID / Test ID 选择 */
export function id(value: string): string {
  return `id:${value}`;
}

/** 按文本内容选择 / Select by text content */
export function text(value: string): string {
  return `text:${value}`;
}

/** 按 Accessibility Label 选择 / Select by accessibility label */
export function label(value: string): string {
  return `label:${value}`;
}

/** 按 XPath 选择 / Select by XPath */
export function xpath(value: string): string {
  return `xpath:${value}`;
}

/** 按 CSS 选择器选择（Web 上下文）/ Select by CSS selector (web context) */
export function css(value: string): string {
  return `css:${value}`;
}

/** 按类名选择 / Select by class name */
export function className(value: string): string {
  return `class:${value}`;
}

/**
 * 创建平台特定选择器 / Create a platform-specific selector
 *
 * 用法 / Usage:
 *   by.platform({ ios: by.id('btn'), android: by.text('登录') })
 */
export function platform(selectors: PlatformSelector): PlatformSelector {
  return selectors;
}

// ========== 选择器解析 / Selector Parser ==========

export type SelectorType = "id" | "text" | "label" | "xpath" | "css" | "class" | "raw";

/**
 * 解析选择器，返回类型和值
 * Parse selector and return type and value
 */
export function parseSelector(selector: string): { type: SelectorType; value: string } {
  const idx = selector.indexOf(":");
  // 需要至少1个字符的前缀，且冒号不能在末尾
  // Need at least 1 char prefix, and colon can't be at the end
  if (idx > 0 && idx < selector.length - 1) {
    const prefix = selector.substring(0, idx);
    const value = selector.substring(idx + 1);
    switch (prefix) {
      case "id":
        return { type: "id", value };
      case "text":
        return { type: "text", value };
      case "label":
        return { type: "label", value };
      case "xpath":
        return { type: "xpath", value };
      case "css":
        return { type: "css", value };
      case "class":
        return { type: "class", value };
    }
  }
  // 无前缀，按纯字符串处理（Accessibility ID）
  // No prefix, treat as raw string (Accessibility ID)
  return { type: "raw", value: selector };
}

// ========== 平台特定选择器 / Platform-Specific Selector ==========

/**
 * 类型守卫：判断是否为 PlatformSelector（{ ios, android } 对象）
 * Type guard: checks if selector is a PlatformSelector ({ ios, android } object)
 *
 * 精确匹配同时拥有 ios 和 android 两个键的普通对象，
 * 不会误判 WebdriverIO.Element、Detox NativeElement 或 Detox matcher。
 */
export function isPlatformSelector(selector: unknown): selector is PlatformSelector {
  return (
    typeof selector === "object" &&
    selector !== null &&
    !Array.isArray(selector) &&
    "ios" in selector &&
    "android" in selector
  );
}

/**
 * 解析 PlatformSelector，返回当前平台对应的选择器值
 * Resolve a PlatformSelector to the selector value for the given platform
 */
export function resolvePlatformSelector(
  selector: PlatformSelector,
  platform: "ios" | "android"
): SelectorValue {
  return platform === "ios" ? selector.ios : selector.android;
}

// ========== 导出默认对象（模拟 Detox 的 by API） ==========
// Export default object (mimics Detox's by API)

/**
 * 统一选择器构建器（模拟 Detox 的 by API 风格）
 * Unified selector builder (mimics Detox's by API style)
 *
 * 用法 / Usage:
 *   import { by } from '@framework/utils/SelectorBuilder';
 *   await actions.click(by.id('loginButton'));
 *   await actions.click(by.text('Submit'));
 */
export const by = {
  id: (value: string) => id(value),
  text: (value: string) => text(value),
  label: (value: string) => label(value),
  xpath: (value: string) => xpath(value),
  css: (value: string) => css(value),
  class: (value: string) => className(value),
  platform: (selectors: PlatformSelector): PlatformSelector => platform(selectors),
};
