export interface IActions {
  // Navigation
  navigateTo(url?: string): Promise<void>;
  
  // Element interactions
  click(selector: any): Promise<void>;
  doubleClick(selector: any): Promise<void>;
  tap(selector: any): Promise<void>;
  longPress(selector: any, duration?: number): Promise<void>;
  
  // Input
  typeText(selector: any, text: string): Promise<void>;
  clearText(selector: any): Promise<void>;
  getText(selector: any): Promise<string>;
  
  // Assertions
  waitForElement(selector: any, timeout?: number): Promise<void>;
  expectVisible(selector: any): Promise<void>;
  expectNotVisible(selector: any): Promise<void>;
  expectText(selector: any, text: string): Promise<void>;
  expectContainsText(selector: any, text: string): Promise<void>;
  expectEnabled(selector: any): Promise<void>;
  expectDisabled(selector: any): Promise<void>;
  
  // Gestures
  swipe(direction: 'up' | 'down' | 'left' | 'right', distance?: number): Promise<void>;
  scroll(toSelector: any): Promise<void>;
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
