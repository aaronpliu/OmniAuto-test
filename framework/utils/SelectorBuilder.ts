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

import {
  IndexedSelector,
  PlatformSelector,
  TSelector,
  TPlatformValue,
  CompoundRelation,
  CompoundSelectorNode,
  ChainableSelectorLike,
} from "../types/actions";

// ========== 选择器构建函数 / Selector Builder Functions ==========

/** 按 Accessibility ID / Test ID 选择（返回字符串，向后兼容） */
export function id(value: string): string {
  return `id:${value}`;
}

/** 按文本内容选择 / Select by text content（返回字符串，向后兼容） */
export function text(value: string): string {
  return `text:${value}`;
}

/** 按 Accessibility Label 选择 / Select by accessibility label（返回字符串，向后兼容） */
export function label(value: string): string {
  return `label:${value}`;
}

/** 按 XPath 选择 / Select by XPath（返回字符串，向后兼容） */
export function xpath(value: string): string {
  return `xpath:${value}`;
}

/** 按 CSS 选择器选择（Web 上下文）/ Select by CSS selector（返回字符串，向后兼容） */
export function css(value: string): string {
  return `css:${value}`;
}

/** 按类名选择 / Select by class name（返回字符串，向后兼容） */
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

// ========== ChainableSelector 可链式调用选择器 ==========

export type SelectorType = "id" | "text" | "label" | "xpath" | "css" | "class" | "type" | "raw";

/**
 * 可链式调用的选择器类，模拟 Detox NativeMatcher 的链式 API
 * Chainable selector class that mimics Detox's NativeMatcher chainable API
 *
 * 用法 / Usage:
 *   by.type("UIView").withDescendant(by.type("UILabel"))
 *   by.id("parent").and(by.text("child"))
 *
 * 内部存储为原子或复合树结构，可序列化为 CompoundSelectorNode，
 * 供 Detox 和 Appium 两种环境分别解析。
 * Internally stores an atomic or compound tree structure, serializable to
 * CompoundSelectorNode for resolution by both Detox and Appium environments.
 */
export class ChainableSelector implements ChainableSelectorLike {
  private _atomicType: SelectorType;
  private _atomicValue: string;
  private _relation?: CompoundRelation;
  private _left?: ChainableSelector;
  private _right?: ChainableSelector;

  /** 构造原子选择器或复合选择器 */
  private constructor(
    opts:
      | { atomicType: SelectorType; atomicValue: string }
      | {
          relation: CompoundRelation;
          left: ChainableSelector;
          right: ChainableSelector;
        }
  ) {
    if ("atomicType" in opts) {
      this._atomicType = opts.atomicType;
      this._atomicValue = opts.atomicValue;
    } else {
      this._relation = opts.relation;
      this._left = opts.left;
      this._right = opts.right;
      this._atomicType = opts.left._atomicType;
      this._atomicValue = opts.left._atomicValue;
    }
  }

  // ========== 静态工厂 / Static Factories ==========

  /** 创建原子选择器 */
  static atomic(type: SelectorType, value: string): ChainableSelector {
    return new ChainableSelector({ atomicType: type, atomicValue: value });
  }

  /** 创建复合选择器 */
  static compound(
    relation: CompoundRelation,
    left: ChainableSelector,
    right: ChainableSelector
  ): ChainableSelector {
    return new ChainableSelector({ relation, left, right });
  }

  // ========== 链式 API / Chainable API ==========

  /** A.withDescendant(B): 匹配包含后代 B 的 A / Match A that has descendant B */
  withDescendant(child: ChainableSelector): ChainableSelector {
    return ChainableSelector.compound("descendant", this, child);
  }

  /** A.withAncestor(B): 匹配位于祖先 B 内的 A / Match A that is inside ancestor B */
  withAncestor(ancestor: ChainableSelector): ChainableSelector {
    return ChainableSelector.compound("ancestor", this, ancestor);
  }

  /** A.and(B): 同时满足 A 和 B 条件（逻辑与）/ Match elements that satisfy both A AND B */
  and(other: ChainableSelector): ChainableSelector {
    return ChainableSelector.compound("and", this, other);
  }

  // ========== 序列化 / Serialization ==========

  /** 转换为跨平台可序列化的树节点 / Convert to serializable tree node */
  toNode(): CompoundSelectorNode {
    if (this._relation && this._left && this._right) {
      return {
        type: "compound",
        relation: this._relation,
        left: this._left.toNode(),
        right: this._right.toNode(),
      };
    }
    return {
      type: "atomic",
      atomic: { selectorType: this._atomicType, value: this._atomicValue },
    };
  }

  // ========== 向后兼容 / Backward Compatibility ==========

  /**
   * toString() 使 ChainableSelector 在字符串上下文中自动转换，
   * 兼容旧版代码中依赖字符串的地方。
   * toString() allows ChainableSelector to auto-convert in string contexts,
   * maintaining backward compatibility with string-based code.
   */
  toString(compact = false): string {
    if (this._relation && this._left && this._right) {
      const left = this._left.toString(compact);
      const right = this._right.toString(compact);
      if (compact) {
        const labels: Record<CompoundRelation, string> = {
          descendant: "↓",
          ancestor: "↑",
          and: "&",
        };
        return `(${left} ${labels[this._relation]} ${right})`;
      }
      return `${left} ${this._relation} ${right}`;
    }
    return `${this._atomicType}:${this._atomicValue}`;
  }

  // ========== 属性访问 / Property Access ==========

  get atomicType(): SelectorType {
    return this._atomicType;
  }

  get atomicValue(): string {
    return this._atomicValue;
  }

  get relation(): CompoundRelation | undefined {
    return this._relation;
  }

  get left(): ChainableSelector | undefined {
    return this._left;
  }

  get right(): ChainableSelector | undefined {
    return this._right;
  }
}

/**
 * 类型守卫：判断是否为 ChainableSelector
 * Type guard: checks if a value is a ChainableSelector instance
 */
export function isChainableSelector(selector: unknown): selector is ChainableSelector {
  return selector instanceof ChainableSelector;
}

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
      case "type":
        return { type: "type", value };
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
): TPlatformValue {
  return platform === "ios" ? selector.ios : selector.android;
}

// ========== PlatformSelector 字符串化 / PlatformSelector Stringification ==========

/**
 * 将 PlatformSelector 转为人类可读的字符串，用于日志输出
 * Converts a PlatformSelector to a human-readable string for logging
 *
 * 示例 / Example:
 *   { ios: "type:WMButtonWidgetView descendant type:UILabel", android: "type: descendant type:" }
 */
export function platformSelectorToString(selector: PlatformSelector): string {
  const iosStr = platformValueToString(selector.ios);
  const androidStr = platformValueToString(selector.android);
  return `{ios: ${iosStr}, android: ${androidStr}}`;
}

/** 递归将 TPlatformValue 转为字符串 */
function platformValueToString(value: TPlatformValue): string {
  if (isChainableSelector(value)) {
    return value.toString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (isIndexedSelector(value)) {
    const inner = platformValueToString(value.selector as TPlatformValue);
    return `[${value.index}]:${inner}`;
  }
  return String(value);
}

// ========== 索引选择器 / Indexed Selector ==========

/**
 * 创建带索引的选择器 / Create an indexed selector
 *
 * 用法 / Usage:
 *   by.index(by.id('listItem'), 2)  → 匹配第3个 listItem
 *   by.index("text:Submit", 0)      → 匹配第1个 text=Submit 的元素
 */
export function atIndex(selector: TSelector, index: number): IndexedSelector {
  return { selector, index };
}

/**
 * 类型守卫：判断是否为 IndexedSelector（{ selector, index } 对象）
 * Type guard: checks if selector is an IndexedSelector
 *
 * 注意：必须先于 isPlatformSelector 调用，避免 PlatformSelector 误匹配
 * (PlatformSelector also has "ios"/"android" keys, not "selector"/"index")
 */
export function isIndexedSelector(selector: unknown): selector is IndexedSelector {
  return (
    typeof selector === "object" &&
    selector !== null &&
    !Array.isArray(selector) &&
    "selector" in selector &&
    "index" in selector
  );
}

// ========== 导出默认对象（模拟 Detox 的 by API） ==========
// Export default object (mimics Detox's by API)

/**
 * 统一选择器构建器 API 接口
 * Unified selector builder API interface
 */
export interface ByApi {
  id: (value: string) => ChainableSelector;
  text: (value: string) => ChainableSelector;
  label: (value: string) => ChainableSelector;
  xpath: (value: string) => ChainableSelector;
  css: (value: string) => ChainableSelector;
  class: (value: string) => ChainableSelector;
  type: (value: string) => ChainableSelector;
  platform: (selectors: PlatformSelector) => PlatformSelector;
  index: (selector: TSelector, index: number) => IndexedSelector;
}

/**
 * 统一选择器构建器（模拟 Detox 的 by API 风格）
 * Unified selector builder (mimics Detox's by API style)
 *
 * 原子方法返回 ChainableSelector，支持链式调用：
 * Atomic methods return ChainableSelector, supporting chainable calls:
 *   by.type("UIView").withDescendant(by.type("UILabel"))
 *   by.id("parent").and(by.text("child"))
 *
 * 用法 / Usage:
 *   import { by } from '@framework/utils/SelectorBuilder';
 *   await actions.click(by.id('loginButton'));
 *   await actions.click(by.text('Submit'));
 *   await actions.click(by.index(by.id('listItem'), 2)); // 第3个
 */
export const by: ByApi = {
  id: (value: string) => ChainableSelector.atomic("id", value),
  text: (value: string) => ChainableSelector.atomic("text", value),
  label: (value: string) => ChainableSelector.atomic("label", value),
  xpath: (value: string) => ChainableSelector.atomic("xpath", value),
  css: (value: string) => ChainableSelector.atomic("css", value),
  class: (value: string) => ChainableSelector.atomic("class", value),
  type: (value: string) => ChainableSelector.atomic("type", value),
  platform: (selectors: PlatformSelector): PlatformSelector => platform(selectors),
  index: (selector: TSelector, index: number) => atIndex(selector, index),
};
