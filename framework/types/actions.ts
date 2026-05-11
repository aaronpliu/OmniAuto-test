export interface IActions {
  // Navigation
  navigateTo(url?: string): Promise<void>;
  
  // Element interactions
  click(selector: string): Promise<void>;
  doubleClick(selector: string): Promise<void>;
  tap(selector: string): Promise<void>;
  longPress(selector: string, duration?: number): Promise<void>;
  
  // Input
  typeText(selector: string, text: string): Promise<void>;
  clearText(selector: string): Promise<void>;
  getText(selector: string): Promise<string>;
  
  // Assertions
  waitForElement(selector: string, timeout?: number): Promise<void>;
  expectVisible(selector: string): Promise<void>;
  expectNotVisible(selector: string): Promise<void>;
  expectText(selector: string, text: string): Promise<void>;
  expectContainsText(selector: string, text: string): Promise<void>;
  expectEnabled(selector: string): Promise<void>;
  expectDisabled(selector: string): Promise<void>;
  
  // Gestures
  swipe(direction: 'up' | 'down' | 'left' | 'right', distance?: number): Promise<void>;
  scroll(toSelector: string): Promise<void>;
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
