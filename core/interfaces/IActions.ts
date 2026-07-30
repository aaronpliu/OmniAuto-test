/**
 * 插件操作接口
 * Plugin Actions Interface
 *
 * 从 framework/types/actions.ts 的 IActions 演进，
 * 增加 getPluginName() 方法以标识所属插件。
 *
 * 阶段一期间通过 re-export 保持与现有 IActions 兼容，
 * 阶段五迁移完成后将类型定义收归 core。
 */
import { TSelector } from "../../framework/types/actions";

/**
 * 统一操作接口 — 所有插件的 Actions 必须实现此接口。
 *
 * 与现有 IActions 相比增加了 getPluginName()，
 * 其余方法签名保持完全一致以确保向后兼容。
 */
export interface IActions {
  /** 返回所属插件名称（如 "detox", "appium", "playwright"） */
  getPluginName(): string;

  // ---- Navigation ----
  navigateTo(url?: string): Promise<void>;

  // ---- Element interactions ----
  click(selector: TSelector): Promise<void>;
  doubleClick(selector: TSelector): Promise<void>;
  longPress(selector: TSelector, duration?: number): Promise<void>;

  // ---- Input ----
  typeText(selector: TSelector, text: string): Promise<void>;
  clearText(selector: TSelector): Promise<void>;
  getText(selector: TSelector): Promise<string>;

  // ---- Attributes ----
  /** 获取元素所有属性（返回完整对象） */
  getAttributes(selector: TSelector): Promise<Record<string, unknown>>;
  /** 获取元素指定属性值 */
  getAttributes(selector: TSelector, attrName: string): Promise<string>;

  // ---- Assertions ----
  /** 等待元素可见（isNotVisible=false）或不可见（isNotVisible=true） */
  waitForElement(selector: TSelector, timeout?: number, isNotVisible?: boolean): Promise<void>;
  waitForElementToExist(selector: TSelector, timeout?: number): Promise<void>;
  waitForElementToDisappear(selector: TSelector, timeout?: number): Promise<void>;
  waitForElementToBeEnabled(selector: TSelector, timeout?: number): Promise<void>;
  waitForText(selector: TSelector, text: string, timeout?: number): Promise<void>;
  expectVisible(selector: TSelector, isNotVisible?: boolean): Promise<void>;
  expectNotVisible(selector: TSelector): Promise<void>;
  expectExist(selector: TSelector): Promise<void>;
  expectNotExist(selector: TSelector): Promise<void>;
  expectText(selector: TSelector, text: string | RegExp): Promise<void>;
  expectNotText(selector: TSelector, text: string | RegExp): Promise<void>;
  expectContainsText(selector: TSelector, text: string): Promise<void>;
  expectEnabled(selector: TSelector): Promise<void>;
  expectDisabled(selector: TSelector): Promise<void>;
  expectAttribute(
    selector: TSelector,
    attrName: string,
    expectedValue: string | RegExp
  ): Promise<void>;
  expectValue(selector: TSelector, expectedValue: string): Promise<void>;
  expectCount(selector: TSelector, count: number): Promise<void>;
  expectFocused(selector: TSelector): Promise<void>;
  expectNotFocused(selector: TSelector): Promise<void>;

  // ---- Gestures ----
  swipe(direction: "up" | "down" | "left" | "right", distance?: number): Promise<void>;
  scroll(toSelector: TSelector): Promise<void>;
  pinch(scale: number): Promise<void>;

  // ---- Utilities ----
  takeScreenshot(name: string): Promise<string>;
  reload(): Promise<void>;
  back(): Promise<void>;
  close(): Promise<void>;

  // ---- Device ----
  setOrientation(orientation: "portrait" | "landscape"): Promise<void>;
  setLocation(latitude: number, longitude: number): Promise<void>;
}
