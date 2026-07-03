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

  // Assertions
  abstract waitForElement(selector: TSelector, timeout?: number): Promise<void>;
  abstract expectVisible(selector: TSelector): Promise<void>;
  abstract expectNotVisible(selector: TSelector): Promise<void>;
  abstract expectText(selector: TSelector, text: string): Promise<void>;
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
