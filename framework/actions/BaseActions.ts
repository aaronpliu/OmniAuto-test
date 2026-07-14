import { IActions, TSelector } from "../types/actions";

export abstract class BaseActions implements IActions {
  // Navigation
  abstract navigateTo(url?: string): Promise<void>;

  // Element interactions - using generic TSelector type for flexibility
  abstract click(selector: TSelector): Promise<void>;
  abstract doubleClick(selector: TSelector): Promise<void>;
  abstract longPress(selector: TSelector, duration?: number): Promise<void>;

  // Input
  abstract typeText(selector: TSelector, text: string): Promise<void>;
  abstract clearText(selector: TSelector): Promise<void>;
  abstract getText(selector: TSelector): Promise<string>;

  // Attributes
  /** 获取元素所有属性（返回完整对象） */
  abstract getAttributes(selector: TSelector): Promise<Record<string, unknown>>;
  /** 获取元素指定属性值 */
  abstract getAttributes(selector: TSelector, attrName: string): Promise<string>;

  // Assertions
  /** 等待元素可见（isNotVisible=false）或不可见（isNotVisible=true） */
  abstract waitForElement(
    selector: TSelector,
    timeout?: number,
    isNotVisible?: boolean
  ): Promise<void>;
  /** 验证元素可见（isNotVisible=false）或不可见（isNotVisible=true） */
  abstract expectVisible(selector: TSelector, isNotVisible?: boolean): Promise<void>;
  abstract expectNotVisible(selector: TSelector): Promise<void>;
  abstract expectExist(selector: TSelector): Promise<void>;
  abstract expectNotExist(selector: TSelector): Promise<void>;
  abstract expectText(selector: TSelector, text: string | RegExp): Promise<void>;
  abstract expectContainsText(selector: TSelector, text: string): Promise<void>;
  abstract expectEnabled(selector: TSelector): Promise<void>;
  abstract expectDisabled(selector: TSelector): Promise<void>;

  // Gestures
  abstract swipe(direction: "up" | "down" | "left" | "right", distance?: number): Promise<void>;
  abstract scroll(toSelector: TSelector): Promise<void>;
  abstract pinch(scale: number): Promise<void>;

  // Utilities
  abstract takeScreenshot(name: string): Promise<string>;
  abstract reload(): Promise<void>;
  abstract back(): Promise<void>;
  abstract close(): Promise<void>;

  // Device
  abstract setOrientation(orientation: "portrait" | "landscape"): Promise<void>;
  abstract setLocation(latitude: number, longitude: number): Promise<void>;
}
