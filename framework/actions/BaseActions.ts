import { IActions, Selector } from "../types/actions";

export abstract class BaseActions implements IActions {
  // Navigation
  abstract navigateTo(url?: string): Promise<void>;

  // Element interactions - using generic Selector type for flexibility
  abstract click(selector: Selector): Promise<void>;
  abstract doubleClick(selector: Selector): Promise<void>;
  abstract longPress(selector: Selector, duration?: number): Promise<void>;

  // Input
  abstract typeText(selector: Selector, text: string): Promise<void>;
  abstract clearText(selector: Selector): Promise<void>;
  abstract getText(selector: Selector): Promise<string>;

  // Assertions
  abstract waitForElement(selector: Selector, timeout?: number): Promise<void>;
  abstract expectVisible(selector: Selector): Promise<void>;
  abstract expectNotVisible(selector: Selector): Promise<void>;
  abstract expectText(selector: Selector, text: string): Promise<void>;
  abstract expectContainsText(selector: Selector, text: string): Promise<void>;
  abstract expectEnabled(selector: Selector): Promise<void>;
  abstract expectDisabled(selector: Selector): Promise<void>;

  // Gestures
  abstract swipe(direction: "up" | "down" | "left" | "right", distance?: number): Promise<void>;
  abstract scroll(toSelector: Selector): Promise<void>;
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
