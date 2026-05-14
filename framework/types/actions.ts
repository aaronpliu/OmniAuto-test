/**
 * Generic selector type that allows each platform to define its own selector format
 * This follows the Open/Closed Principle - open for extension, closed for modification
 */
export type Selector = string | object;

export interface IActions {
  // Navigation
  navigateTo(url?: string): Promise<void>;
  
  // Element interactions - using generic Selector type
  click(selector: Selector): Promise<void>;
  doubleClick(selector: Selector): Promise<void>;
  tap(selector: Selector): Promise<void>;
  longPress(selector: Selector, duration?: number): Promise<void>;
  
  // Input
  typeText(selector: Selector, text: string): Promise<void>;
  clearText(selector: Selector): Promise<void>;
  getText(selector: Selector): Promise<string>;
  
  // Assertions
  waitForElement(selector: Selector, timeout?: number): Promise<void>;
  expectVisible(selector: Selector): Promise<void>;
  expectNotVisible(selector: Selector): Promise<void>;
  expectText(selector: Selector, text: string): Promise<void>;
  expectContainsText(selector: Selector, text: string): Promise<void>;
  expectEnabled(selector: Selector): Promise<void>;
  expectDisabled(selector: Selector): Promise<void>;
  
  // Gestures
  swipe(direction: 'up' | 'down' | 'left' | 'right', distance?: number): Promise<void>;
  scroll(toSelector: Selector): Promise<void>;
  pinch(scale: number): Promise<void>;
  
  // Utilities
  takeScreenshot(name: string): Promise<string>;
  reload(): Promise<void>;
  back(): Promise<void>;
  close(): Promise<void>;
  
  // Device
  setOrientation(orientation: 'portrait' | 'landscape'): Promise<void>;
  setLocation(latitude: number, longitude: number): Promise<void>;
}

export type Platform = 'ios' | 'android' | 'web';

export interface ActionFactoryConfig {
  platform: Platform;
  capabilities?: Record<string, any>;
  browserType?: 'chromium' | 'firefox' | 'webkit';
}
