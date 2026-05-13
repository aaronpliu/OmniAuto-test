import { device, element, by, expect as detoxExpect } from 'detox';
import { BaseActions } from './BaseActions';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

// Type for flexible selector: string (for id) or Detox NativeElement
export type DetoxSelector = string | ReturnType<typeof element>;

// Helper function to resolve selector to NativeElement
function resolveElement(selector: DetoxSelector): ReturnType<typeof element> {
  if (typeof selector === 'string') {
    // Default to by.id for backward compatibility
    return element(by.id(selector));
  }
  return selector;
}

export class DetoxActions extends BaseActions {
  // Navigation
  async navigateTo(url?: string): Promise<void> {
    logger.info('Launching app with Detox');
    await device.launchApp({ newInstance: true });
  }

  // Element interactions
  async click(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Clicking element: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await elem.tap();
  }

  async doubleClick(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Double clicking element: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await elem.multiTap(2);
  }

  async tap(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Tapping element: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await elem.tap();
  }

  async longPress(selector: DetoxSelector, duration = 1000): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Long pressing element: ${typeof selector === 'string' ? selector : 'custom matcher'} for ${duration}ms`);
    await elem.longPress(duration);
  }

  // Input
  async typeText(selector: DetoxSelector, text: string): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Typing text into element: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await elem.replaceText(text);
  }

  async clearText(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Clearing text from element: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await elem.clearText();
  }

  async getText(selector: DetoxSelector): Promise<string> {
    const elem = resolveElement(selector);
    logger.debug(`Getting text from element: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    const attribute = await elem.getAttributes();
    return (attribute as any).text || '';
  }

  // Assertions
  async waitForElement(selector: DetoxSelector, timeout = 10000): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Waiting for element: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await waitFor(elem).toBeVisible().withTimeout(timeout);
  }

  async expectVisible(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Expecting element visible: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await detoxExpect(elem).toBeVisible();
  }

  async expectNotVisible(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Expecting element not visible: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await detoxExpect(elem).toBeNotVisible();
  }

  async expectText(selector: DetoxSelector, text: string): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Expecting text in element: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await detoxExpect(elem).toHaveText(text);
  }

  async expectContainsText(selector: DetoxSelector, text: string): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Expecting element contains text: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await detoxExpect(elem).toHaveLabel(text);
  }

  async expectEnabled(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Expecting element enabled: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    const attribute = await elem.getAttributes();
    const isEnabled = (attribute as any).enabled !== false;
    if (!isEnabled) {
      throw new Error(`Element is not enabled`);
    }
  }

  async expectDisabled(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Expecting element disabled: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    const attribute = await elem.getAttributes();
    const isEnabled = (attribute as any).enabled !== false;
    if (isEnabled) {
      throw new Error(`Element is not disabled`);
    }
  }

  // Gestures
  async swipe(direction: 'up' | 'down' | 'left' | 'right', distance?: number): Promise<void> {
    logger.debug(`Swiping ${direction}`);
    await element(by.type('UIScrollView')).swipe(direction, 'fast', NaN, 0.5, 0.5);
  }

  async scroll(toSelector: DetoxSelector): Promise<void> {
    const elem = resolveElement(toSelector);
    logger.debug(`Scrolling to element: ${typeof toSelector === 'string' ? toSelector : 'custom matcher'}`);
    await elem.scrollTo('bottom');
  }

  async pinch(scale: number, speed: 'slow' | 'fast' = 'fast', angle: number = 0): Promise<void> {
    logger.debug(`Pinching with scale: ${scale}, speed: ${speed}, angle: ${angle}`);
    await element(by.type('UIView')).pinch(scale, speed, angle);
  }

  // Helper methods to create Detox matchers
  /**
   * Create a matcher by test ID (accessibilityIdentifier)
   * @param id - The test ID
   */
  static byId(id: string): ReturnType<typeof element> {
    return element(by.id(id));
  }

  /**
   * Create a matcher by text content
   * @param text - The text to match
   */
  static byText(text: string): ReturnType<typeof element> {
    return element(by.text(text));
  }

  /**
   * Create a matcher by label (accessibilityLabel)
   * @param label - The label to match
   */
  static byLabel(label: string): ReturnType<typeof element> {
    return element(by.label(label));
  }

  /**
   * Create a matcher by type (native component type)
   * @param type - The native type (e.g., 'UIScrollView', 'UIButton')
   */
  static byType(type: string): ReturnType<typeof element> {
    return element(by.type(type));
  }

  /**
   * Create a matcher using multiple conditions (AND)
   * Example: DetoxActions.byAll('button', 'Submit') - matches element with id='button' AND text='Submit'
   * @param firstMatcher - First matcher function call (e.g., by.id('...'))
   * @param additionalMatchers - Additional matchers to combine with AND
   */
  static byAll(firstMatcher: any, ...additionalMatchers: any[]): ReturnType<typeof element> {
    let combined = firstMatcher;
    for (const matcher of additionalMatchers) {
      combined = combined.and(matcher);
    }
    return element(combined);
  }

  // Utilities
  async takeScreenshot(name: string): Promise<string> {
    logger.debug(`Taking screenshot: ${name}`);
    const path = await device.takeScreenshot(name);
    return path;
  }

  async reload(): Promise<void> {
    logger.info('Reloading app');
    await device.reloadReactNative();
  }

  async back(): Promise<void> {
    logger.info('Going back');
    await device.pressBack();
  }

  async close(): Promise<void> {
    logger.info('Closing app');
    await device.terminateApp();
  }

  // Device
  async setOrientation(orientation: 'portrait' | 'landscape'): Promise<void> {
    logger.info(`Setting orientation to: ${orientation}`);
    await device.setOrientation(orientation);
  }

  async setLocation(latitude: number, longitude: number): Promise<void> {
    logger.info(`Setting location to: ${latitude}, ${longitude}`);
    await device.setLocation(latitude, longitude);
  }
}
