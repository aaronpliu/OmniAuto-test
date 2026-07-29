/**
 * 基础选择器值（不含平台分支，避免递归）
 * Base selector value (without platform branching, to avoid recursion)
 */
export type SelectorValue = string | object;

/**
 * PlatformSelector 内部允许的选择器值类型
 * 排除 PlatformSelector 自身以避免 TSelector → PlatformSelector → TSelector 递归
 *
 * Allowed selector value inside PlatformSelector fields.
 * Excludes PlatformSelector itself to break TSelector → PlatformSelector → TSelector recursion.
 */
export type TPlatformValue = SelectorValue | IndexedSelector | ChainableSelectorLike;

/**
 * 平台特定选择器：同一元素在 iOS 和 Android 上可使用不同定位方式
 * Platform-specific selector: same element can use different locators on iOS/Android
 *
 * 用法 / Usage:
 *   by.platform({ ios: by.id('btn'), android: by.text('登录') })
 */
export type PlatformSelector = {
  ios: TPlatformValue;
  android: TPlatformValue;
};

/**
 * 带索引的选择器：同一选择器匹配多个元素时，指定选取第 N 个（0-based）
 * Indexed selector: when the same selector matches multiple elements,
 * specify which one to pick by its 0-based index
 *
 * 用法 / Usage:
 *   by.index(by.id('listItem'), 2)  → 第3个 listItem
 */
export type IndexedSelector = {
  selector: TSelector;
  index: number;
};

/**
 * 复合选择器关系类型
 * Compound selector relation types
 * - 'descendant': A has descendant B (withDescendant)
 * - 'ancestor':  A has ancestor B  (withAncestor)
 * - 'and':       A AND B           (and)
 */
export type CompoundRelation = "descendant" | "ancestor" | "and";

/**
 * 复合选择器树节点（可序列化，跨平台传递）
 * Serializable compound selector tree node for cross-platform resolution
 */
export interface CompoundSelectorNode {
  type: "atomic" | "compound";

  /** 原子选择器 / Atomic selector: by.id('foo'), by.text('bar'), by.type('UIView') 等 */
  atomic?: {
    selectorType: string;
    value: string;
  };

  /** 复合选择器：left RELATION right */
  relation?: CompoundRelation;
  left?: CompoundSelectorNode;
  right?: CompoundSelectorNode;
}

/**
 * 可链式调用的选择器接口标记
 * Marker interface for chainable selectors, avoiding circular import
 * between SelectorBuilder and Actions modules.
 */
export interface ChainableSelectorLike {
  toNode(): CompoundSelectorNode;
  toString(compact?: boolean): string;
}

/**
 * Generic selector type that allows each platform to define its own selector format
 * This follows the Open/Closed Principle - open for extension, closed for modification
 *
 * 支持四种形式 / Supports four forms:
 * - string: "id:login", "text:Submit", or plain "loginButton"
 * - object: WebdriverIO.Element, Detox NativeElement, Detox matcher, etc.
 * - PlatformSelector: { ios: ..., android: ... } for platform-specific locators
 * - IndexedSelector: { selector: ..., index: ... } for selecting the Nth match
 */
export type TSelector = SelectorValue | PlatformSelector | IndexedSelector | ChainableSelectorLike;

export interface IActions {
  // Navigation
  navigateTo(url?: string): Promise<void>;

  // Element interactions - using generic TSelector type
  click(selector: TSelector): Promise<void>;
  doubleClick(selector: TSelector): Promise<void>;
  longPress(selector: TSelector, duration?: number): Promise<void>;

  // Input
  typeText(selector: TSelector, text: string): Promise<void>;
  clearText(selector: TSelector): Promise<void>;
  getText(selector: TSelector): Promise<string>;

  // Attributes
  /** 获取元素所有属性（返回完整对象） */
  getAttributes(selector: TSelector): Promise<Record<string, unknown>>;
  /** 获取元素指定属性值 */
  getAttributes(selector: TSelector, attrName: string): Promise<string>;

  // Assertions
  /** 等待元素可见（isNotVisible=false）或不可见（isNotVisible=true） */
  waitForElement(selector: TSelector, timeout?: number, isNotVisible?: boolean): Promise<void>;
  /** 等待元素存在于 DOM/UI 层级中 */
  waitForElementToExist(selector: TSelector, timeout?: number): Promise<void>;
  /** 等待元素消失（不可见或不存在） */
  waitForElementToDisappear(selector: TSelector, timeout?: number): Promise<void>;
  /** 等待元素变为可交互状态 */
  waitForElementToBeEnabled(selector: TSelector, timeout?: number): Promise<void>;
  /** 等待元素文本包含指定内容 */
  waitForText(selector: TSelector, text: string, timeout?: number): Promise<void>;
  /** 验证元素可见（isNotVisible=false）或不可见（isNotVisible=true） */
  expectVisible(selector: TSelector, isNotVisible?: boolean): Promise<void>;
  expectNotVisible(selector: TSelector): Promise<void>;
  expectExist(selector: TSelector): Promise<void>;
  expectNotExist(selector: TSelector): Promise<void>;
  expectText(selector: TSelector, text: string | RegExp): Promise<void>;
  expectNotText(selector: TSelector, text: string | RegExp): Promise<void>;
  expectContainsText(selector: TSelector, text: string): Promise<void>;
  expectEnabled(selector: TSelector): Promise<void>;
  expectDisabled(selector: TSelector): Promise<void>;
  expectAttribute(selector: TSelector, attrName: string, expectedValue: string | RegExp): Promise<void>;
  expectValue(selector: TSelector, expectedValue: string): Promise<void>;
  expectCount(selector: TSelector, count: number): Promise<void>;
  expectFocused(selector: TSelector): Promise<void>;
  expectNotFocused(selector: TSelector): Promise<void>;

  // Gestures
  swipe(direction: "up" | "down" | "left" | "right", distance?: number): Promise<void>;
  scroll(toSelector: TSelector): Promise<void>;
  pinch(scale: number): Promise<void>;

  // Utilities
  takeScreenshot(name: string): Promise<string>;
  reload(): Promise<void>;
  back(): Promise<void>;
  close(): Promise<void>;

  // Device
  setOrientation(orientation: "portrait" | "landscape"): Promise<void>;
  setLocation(latitude: number, longitude: number): Promise<void>;
}

export type Platform = "ios" | "android" | "web";

/**
 * iOS 自动化模式
 * - 'detox': 使用 Detox 框架（默认，适用于 React Native / 原生 iOS 应用）
 * - 'appium': 使用 Appium + XCUITest（适用于原生 iOS 应用）
 */
export type IosAutomationMode = "detox" | "appium";

/**
 * Android 自动化模式
 * - 'appium': 使用 Appium + UiAutomator2（默认）
 * - 'detox': 使用 Detox 框架（适用于 React Native / 原生 Android 应用）
 */
export type AndroidAutomationMode = "appium" | "detox";

export interface ActionFactoryConfig {
  platform: Platform;
  capabilities?: Record<string, any>;
  browserType?: "chromium" | "firefox" | "webkit";
  page?: any; // Playwright Page object for web platform
  browser?: any; // Playwright Browser object for web platform (optional)
  /** iOS 自动化模式，默认 'detox' */
  iosAutomationMode?: IosAutomationMode;
  /** Android 自动化模式，默认 'appium' */
  androidAutomationMode?: AndroidAutomationMode;
}
