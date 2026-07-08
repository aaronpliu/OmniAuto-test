/**
 * 基础选择器值（不含平台分支，避免递归）
 * Base selector value (without platform branching, to avoid recursion)
 */
export type SelectorValue = string | object;

/**
 * 平台特定选择器：同一元素在 iOS 和 Android 上可使用不同定位方式
 * Platform-specific selector: same element can use different locators on iOS/Android
 *
 * 用法 / Usage:
 *   by.platform({ ios: by.id('btn'), android: by.text('登录') })
 */
export type PlatformSelector = {
  ios: SelectorValue;
  android: SelectorValue;
};

/**
 * Generic selector type that allows each platform to define its own selector format
 * This follows the Open/Closed Principle - open for extension, closed for modification
 *
 * 支持三种形式 / Supports three forms:
 * - string: "id:login", "text:Submit", or plain "loginButton"
 * - object: WebdriverIO.Element, Detox NativeElement, Detox matcher, etc.
 * - PlatformSelector: { ios: ..., android: ... } for platform-specific locators
 */
export type TSelector = SelectorValue | PlatformSelector;

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

  // Assertions
  waitForElement(selector: TSelector, timeout?: number): Promise<void>;
  expectVisible(selector: TSelector): Promise<void>;
  expectNotVisible(selector: TSelector): Promise<void>;
  expectText(selector: TSelector, text: string): Promise<void>;
  expectContainsText(selector: TSelector, text: string): Promise<void>;
  expectEnabled(selector: TSelector): Promise<void>;
  expectDisabled(selector: TSelector): Promise<void>;

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
