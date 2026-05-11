import { IActions } from '../types/actions';

export abstract class BaseActions implements IActions {
  // Navigation
  abstract navigateTo(url?: string): Promise<void>;
  
  // Element interactions
  abstract click(selector: string): Promise<void>;
  abstract doubleClick(selector: string): Promise<void>;
  abstract tap(selector: string): Promise<void>;
  abstract longPress(selector: string, duration?: number): Promise<void>;
  
  // Input
  abstract typeText(selector: string, text: string): Promise<void>;
  abstract clearText(selector: string): Promise<void>;
  abstract getText(selector: string): Promise<string>;
  
  // Assertions
  abstract waitForElement(selector: string, timeout?: number): Promise<void>;
  abstract expectVisible(selector: string): Promise<void>;
  abstract expectNotVisible(selector: string): Promise<void>;
  abstract expectText(selector: string, text: string): Promise<void>;
  abstract expectContainsText(selector: string, text: string): Promise<void>;
  abstract expectEnabled(selector: string): Promise<void>;
  abstract expectDisabled(selector: string): Promise<void>;
  
  // Gestures
  abstract swipe(direction: 'up' | 'down' | 'left' | 'right', distance?: number): Promise<void>;
  abstract scroll(toSelector: string): Promise<void>;
  abstract pinch(scale: number): Promise<void>;
  
  // Utilities
  abstract takeScreenshot(name: string): Promise<string>;
  abstract reload(): Promise<void>;
  abstract back(): Promise<void>;
  abstract close(): Promise<void>;
  
  // Device
  abstract setOrientation(orientation: 'portrait' | 'landscape'): Promise<void>;
  abstract setLocation(latitude: number, longitude: number): Promise<void>;
}
