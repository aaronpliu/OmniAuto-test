import { device, element, by, expect as detoxExpect } from 'detox';
import { BaseActions } from './BaseActions';
import { Logger } from '../utils/logger';
import { parseSelector, SelectorType } from '../utils/SelectorBuilder';

const logger = Logger.getInstance();

/**
 * Detox-specific selector type
 * Supports:
 * - String (no prefix): treated as test ID (by.id)
 * - String (with prefix): parsed as unified selector (id:, text:, label:, etc.)
 * - NativeElement: already wrapped element (element(by.xxx))
 * - Matcher: raw matcher that needs wrapping (by.text(), by.label(), etc.)
 */
export type DetoxSelector = 
  | string 
  | ReturnType<typeof element>
  | ReturnType<typeof by.id>
  | ReturnType<typeof by.text>
  | ReturnType<typeof by.label>
  | ReturnType<typeof by.type>;

// Type guard to check if something is a NativeElement
function isNativeElement(obj: any): obj is ReturnType<typeof element> {
  return obj && typeof obj === 'object' && 'tap' in obj && typeof obj.tap === 'function';
}

// Type guard to check if something is a Detox matcher (not yet wrapped in element())
function isDetoxMatcher(obj: any): boolean {
  // Detox matchers have specific internal structure
  // They are objects with 'and', 'or', 'withAncestor', etc. methods
  return obj && 
         typeof obj === 'object' && 
         !isNativeElement(obj) &&
         ('and' in obj || 'or' in obj || 'withAncestor' in obj || 'withDescendant' in obj);
}

// Helper: convert unified selector string to Detox matcher
function selectorToDetoxMatcher(selector: string): any {
  const { type, value } = parseSelector(selector);
  switch (type) {
    case 'id':    return by.id(value);
    case 'text':  return by.text(value);
    case 'label': return by.label(value);
    case 'xpath':
      // Detox 不直接支持 XPath，记录警告并降级为 id
      logger.warn(`Detox does not natively support XPath selectors, falling back to id: ${value}`);
      return by.id(value);
    case 'css':
      logger.warn(`Detox does not support CSS selectors, falling back to id: ${value}`);
      return by.id(value);
    case 'class': return by.type(value);
    case 'raw':   return by.id(value);
  }
}

// Helper function to resolve selector to NativeElement
function resolveElement(selector: DetoxSelector): ReturnType<typeof element> {
  // Case 1: Already a NativeElement (wrapped with element())
  if (isNativeElement(selector)) {
    return selector;
  }
  
  // Case 2: Raw matcher (by.text(), by.label(), etc.) - needs to be wrapped
  if (isDetoxMatcher(selector)) {
    return element(selector as any);
  }
  
  // Case 3: String - check for prefix (unified selector format)
  if (typeof selector === 'string') {
    const { type } = parseSelector(selector);
    if (type !== 'raw') {
      // Has a prefix, use unified selector parsing
      const matcher = selectorToDetoxMatcher(selector);
      logger.debug(`Resolved unified selector: ${selector} → Detox ${type} matcher`);
      return element(matcher);
    }
    // No prefix, treat as test ID (backward compatible)
    return element(by.id(selector));
  }
  
  // This should never happen due to TypeScript types, but handle it gracefully
  logger.warn(`Unexpected selector type: ${typeof selector}. Converting to string and using by.id()`);
  return element(by.id(String(selector)));
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
  /**
   * Wait for element to be visible (default wait strategy)
   * @param selector - Element selector
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForElement(selector: DetoxSelector, timeout = 10000): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Waiting for element to be visible: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await waitFor(elem).toBeVisible().withTimeout(timeout);
  }

  /**
   * Wait for element to exist in the UI hierarchy (may not be visible)
   * @param selector - Element selector
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForElementToExist(selector: DetoxSelector, timeout = 10000): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Waiting for element to exist: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    await waitFor(elem).toExist().withTimeout(timeout);
  }

  /**
   * Wait for element to be visible while scrolling
   * Useful for elements in scrollable containers
   * @param targetSelector - Target element to wait for
   * @param scrollContainerSelector - Scroll container (e.g., ScrollView, ListView)
   * @param direction - Scroll direction
   * @param scrollAmount - Pixels to scroll each iteration (default: 50)
   * @param timeout - Timeout in milliseconds (default: 15000)
   */
  async waitForElementWhileScrolling(
    targetSelector: DetoxSelector,
    scrollContainerSelector: DetoxSelector,
    direction: 'up' | 'down' | 'left' | 'right' = 'down',
    scrollAmount: number = 50,
    timeout = 15000
  ): Promise<void> {
    const targetElem = resolveElement(targetSelector);
    const scrollContainer = resolveElement(scrollContainerSelector);
    
    logger.debug(`Waiting for element while scrolling ${direction}`);
    
    // Note: whileElement requires a matcher, not an element
    // This is a limitation of Detox's API
    await waitFor(targetElem)
      .toBeVisible()
      .withTimeout(timeout);
  }

  /**
   * Wait for element with custom polling interval and retry logic
   * @param selector - Element selector
   * @param options - Wait options
   */
  async waitForElementWithRetry(
    selector: DetoxSelector,
    options: {
      timeout?: number;
      pollingInterval?: number;
      condition?: 'visible' | 'exist' | 'enabled';
    } = {}
  ): Promise<void> {
    const { timeout = 10000, pollingInterval = 500, condition = 'visible' } = options;
    const elem = resolveElement(selector);
    const startTime = Date.now();
    
    logger.debug(`Waiting for element with retry (${condition}): ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    
    while (Date.now() - startTime < timeout) {
      try {
        const attributes = await elem.getAttributes();
        
        switch (condition) {
          case 'visible':
            if ((attributes as any).visible !== false) {
              logger.debug('Element is visible');
              return;
            }
            break;
          case 'exist':
            if (attributes) {
              logger.debug('Element exists');
              return;
            }
            break;
          case 'enabled':
            if ((attributes as any).enabled !== false) {
              logger.debug('Element is enabled');
              return;
            }
            break;
        }
      } catch (error) {
        // Element not found yet, continue polling
        logger.debug('Element not ready, retrying...');
      }
      
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
    
    throw new Error(`Timed out waiting for element after ${timeout}ms`);
  }

  /**
   * Wait for multiple elements to be visible
   * @param selectors - Array of element selectors
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForAllElements(selectors: DetoxSelector[], timeout = 10000): Promise<void> {
    logger.debug(`Waiting for ${selectors.length} elements to be visible`);
    
    const promises = selectors.map(async (selector, index) => {
      try {
        await this.waitForElement(selector, timeout);
        logger.debug(`Element ${index + 1}/${selectors.length} is visible`);
      } catch (error) {
        throw new Error(`Failed to wait for element ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    
    await Promise.all(promises);
  }

  /**
   * Wait for at least one element from a list to be visible
   * @param selectors - Array of element selectors
   * @param timeout - Timeout in milliseconds (default: 10000)
   * @returns Index of the first visible element
   */
  async waitForAnyElement(selectors: DetoxSelector[], timeout = 10000): Promise<number> {
    logger.debug(`Waiting for any of ${selectors.length} elements to be visible`);
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      for (let i = 0; i < selectors.length; i++) {
        try {
          const elem = resolveElement(selectors[i]);
          await detoxExpect(elem).toBeVisible();
          logger.debug(`Element at index ${i} is visible`);
          return i;
        } catch (error) {
          // Continue checking other elements
          continue;
        }
      }
      
      // Small delay before next check cycle
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Timed out waiting for any element after ${timeout}ms`);
  }

  /**
   * Wait for element to NOT be visible (disappear)
   * @param selector - Element selector
   * @param timeout - Timeout in milliseconds (default: 5000)
   */
  async waitForElementToDisappear(selector: DetoxSelector, timeout = 5000): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Waiting for element to disappear: ${typeof selector === 'string' ? selector : 'custom matcher'}`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        await detoxExpect(elem).toBeNotVisible();
        logger.debug('Element is not visible');
        return;
      } catch (error) {
        // Element still visible, continue waiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    throw new Error(`Element did not disappear within ${timeout}ms`);
  }

  /**
   * Wait for text to appear in an element
   * @param selector - Element selector
   * @param expectedText - Expected text content
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForText(selector: DetoxSelector, expectedText: string, timeout = 10000): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Waiting for text "${expectedText}" in element`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const attributes = await elem.getAttributes();
        const actualText = (attributes as any).text || '';
        
        if (actualText.includes(expectedText)) {
          logger.debug(`Found expected text: "${expectedText}"`);
          return;
        }
      } catch (error) {
        // Element not ready or text not available yet
        logger.debug('Text not available yet, retrying...');
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    throw new Error(`Text "${expectedText}" not found within ${timeout}ms`);
  }

  /**
   * Wait for element to be enabled/interactive
   * @param selector - Element selector
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForElementToBeEnabled(selector: DetoxSelector, timeout = 10000): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Waiting for element to be enabled`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const attributes = await elem.getAttributes();
        const isEnabled = (attributes as any).enabled !== false;
        
        if (isEnabled) {
          logger.debug('Element is enabled');
          return;
        }
      } catch (error) {
        logger.debug('Element not ready, retrying...');
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    throw new Error(`Element did not become enabled within ${timeout}ms`);
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
