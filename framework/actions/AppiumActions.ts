import { remote, RemoteOptions } from 'webdriverio';
import { BaseActions } from './BaseActions';
import { Selector } from '../types/actions';
import { Logger } from '../utils/logger';
import { config } from '../utils/config';
import { parseSelector, SelectorType } from '../utils/SelectorBuilder';

const logger = Logger.getInstance();

/**
 * Appium-specific selector type
 * Extends the base Selector type with WebdriverIO Element support
 */
export type AppiumSelector = Selector | WebdriverIO.Element;

// Helper: convert unified selector string to Appium/Wdio selector
function selectorToAppiumString(selector: string): string {
  const { type, value } = parseSelector(selector);
  switch (type) {
    case 'id':    return `~${value}`;                           // Accessibility ID
    case 'text':  return `android=new UiSelector().text("${value}")|ios=**/XCUIElementTypeStaticText[\`label == "${value}"\`]`;
    case 'label': return `~${value}`;                           // Accessibility ID
    case 'xpath':return value;                                  // XPath as-is
    case 'css':   return value;                                  // CSS as-is
    case 'class': return `~${value}`;                           // Fallback to ~id
    case 'raw':   return `~${value}`;                           // Default: Accessibility ID
  }
}

// Helper function to resolve selector to Element
async function resolveElement(driver: WebdriverIO.Browser, selector: AppiumSelector): Promise<WebdriverIO.Element> {
  // If it's already a WebdriverIO element, return it
  if (typeof selector !== 'string' && typeof selector !== 'number' && !Array.isArray(selector)) {
    // Check if it's an Element by checking for isExisting method
    if ('isExisting' in selector) {
      return selector as WebdriverIO.Element;
    }
  }
  
  // String selector — may be plain or unified format (with prefix)
  if (typeof selector === 'string') {
    const { type } = parseSelector(selector);
    if (type !== 'raw') {
      // Unified selector with prefix
      const wdioSelector = selectorToAppiumString(selector);
      logger.debug(`Resolved unified selector: ${selector} → Appium: ${wdioSelector}`);
      return await driver.$(wdioSelector);
    }
    // No prefix — treat as Accessibility ID (backward compatible)
    return await driver.$(`~${selector}`);
  }

  // Fallback: convert to string and treat as Accessibility ID
  const id = String(selector);
  return await driver.$(`~${id}`);
}

export class AppiumActions extends BaseActions {
  private driver: WebdriverIO.Browser | null = null;
  private capabilities: RemoteOptions['capabilities'];

  constructor(capabilities?: RemoteOptions['capabilities']) {
    super();
    // If no capabilities provided, build from environment variables
    this.capabilities = capabilities || this.buildDefaultCapabilities();
  }

  /**
   * Build default capabilities from environment variables and configuration
   * This allows AppiumActions to work without explicit capabilities,
   * similar to how DetoxActions uses Detox configuration
   */
  private buildDefaultCapabilities(): RemoteOptions['capabilities'] {
    const platformName = process.env.PLATFORM_NAME || 'android';
    const automationName = process.env.ANDROID_AUTOMATION_NAME || 'UiAutomator2';
    const deviceName = process.env.ANDROID_DEVICE_NAME || 'Pixel_10_Pro_XL';
    const platformVersion = process.env.ANDROID_PLATFORM_VERSION || '17';
    
    // Build base capabilities
    const capabilities: any = {
      platformName,
      'appium:automationName': automationName,
      'appium:deviceName': deviceName,
      'appium:platformVersion': platformVersion,
    };

    // Add app package and activity for Android
    if (platformName === 'android') {
      const appPackage = process.env.ANDROID_APP_PACKAGE;
      const appActivity = process.env.ANDROID_APP_ACTIVITY;
      const appPath = process.env.ANDROID_APP_PATH;

      // Priority: environment variable > configuration file > nothing
      if (appPackage && appActivity) {
        capabilities['appium:appPackage'] = appPackage;
        capabilities['appium:appActivity'] = appActivity;
      } else if (appPath) {
        capabilities['appium:app'] = appPath;
      } else {
        // Try to read from configuration file
        try {
          const envConfig = config.getConfig();
          if (envConfig.applications && envConfig.applications.androidApk) {
            const path = require('path');
            const apkPath = path.resolve(process.cwd(), envConfig.applications.androidApk);
            capabilities['appium:app'] = apkPath;
            logger.info(`使用配置文件中的 APK 路径: ${apkPath}`);
          }
        } catch (error) {
          logger.warn('无法从配置文件读取 APK 路径');
        }
      }

      // Optional Android-specific capabilities
      if (process.env.ANDROID_SYSTEM_PORT) {
        capabilities['appium:systemPort'] = parseInt(process.env.ANDROID_SYSTEM_PORT);
      }
      if (process.env.AUTO_GRANT_PERMISSIONS) {
        capabilities['appium:autoGrantPermissions'] = process.env.AUTO_GRANT_PERMISSIONS === 'true';
      }
    }

    // Add iOS capabilities if needed
    if (platformName === 'ios') {
      const bundleId = process.env.IOS_BUNDLE_ID;
      const appPath = process.env.IOS_APP_PATH;
      const iosDeviceName = process.env.IOS_DEVICE_NAME || 'iPhone 14';
      const iosPlatformVersion = process.env.IOS_PLATFORM_VERSION || '17.0';

      capabilities['appium:deviceName'] = iosDeviceName;
      capabilities['appium:platformVersion'] = iosPlatformVersion;
      capabilities['appium:automationName'] = process.env.IOS_AUTOMATION_NAME || 'XCUITest';

      if (bundleId) {
        capabilities['appium:bundleId'] = bundleId;
      } else if (appPath) {
        capabilities['appium:app'] = appPath;
      }

      // Optional iOS-specific capabilities
      if (process.env.AUTO_ACCEPT_ALERTS) {
        capabilities['appium:autoAcceptAlerts'] = process.env.AUTO_ACCEPT_ALERTS === 'true';
      }
    }

    // Add common capabilities
    if (process.env.NO_RESET) {
      capabilities['appium:noReset'] = process.env.NO_RESET === 'true';
    }
    if (process.env.FULL_RESET) {
      capabilities['appium:fullReset'] = process.env.FULL_RESET === 'true';
    }
    if (process.env.NEW_COMMAND_TIMEOUT) {
      capabilities['appium:newCommandTimeout'] = parseInt(process.env.NEW_COMMAND_TIMEOUT);
    }
    if (process.env.LANGUAGE) {
      capabilities['appium:language'] = process.env.LANGUAGE;
    }
    if (process.env.LOCALE) {
      capabilities['appium:locale'] = process.env.LOCALE;
    }
    if (process.env.ORIENTATION) {
      capabilities['appium:orientation'] = process.env.ORIENTATION;
    }

    logger.debug('Built capabilities from environment:', JSON.stringify(capabilities, null, 2));
    return capabilities;
  }

  private async getDriver(): Promise<WebdriverIO.Browser> {
    if (!this.driver) {
      const host = process.env.APPIUM_HOST || 'localhost';
      const port = parseInt(process.env.APPIUM_PORT || '4723');
      
      // 记录设备信息
      const deviceName = (this.capabilities as any)['appium:deviceName'] || process.env.ANDROID_DEVICE_NAME || 'Unknown';
      const platformVersion = (this.capabilities as any)['appium:platformVersion'] || process.env.ANDROID_PLATFORM_VERSION || 'Unknown';
      const deviceType = process.env.ANDROID_DEVICE_TYPE || 'unknown';
      
      logger.info('========== 连接 Appium Server ==========');
      logger.info(`Appium Server: ${host}:${port}`);
      logger.info(`设备名称: ${deviceName}`);
      logger.info(`设备类型: ${deviceType === 'emulator' ? '模拟器' : deviceType === 'real' ? '真机' : '未知'}`);
      logger.info(`系统版本: Android ${platformVersion}`);
      logger.info('=======================================');
      
      this.driver = await remote({
        hostname: host,
        port,
        path: '/',
        capabilities: this.capabilities
      });
      
      logger.info('✓ 已成功连接到 Appium Server');
    }
    return this.driver;
  }

  // Navigation
  async navigateTo(url?: string): Promise<void> {
    logger.info('Starting app with Appium');
    const driver = await this.getDriver();
    // Appium automatically launches the app based on capabilities
  }

  // Element interactions
  async click(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Clicking element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.click();
  }

  async doubleClick(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Double clicking element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.doubleClick();
  }

  async longPress(selector: AppiumSelector, duration = 1000): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Long pressing element: ${typeof selector === 'string' ? selector : 'custom element'} for ${duration}ms`);
    await el.touchAction([
      { action: 'press' },
      { action: 'wait', ms: duration },
      { action: 'release' }
    ]);
  }

  // Input
  async typeText(selector: AppiumSelector, text: string): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Typing text into element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.setValue(text);
  }

  async clearText(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Clearing text from element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.clearValue();
  }

  async getText(selector: AppiumSelector): Promise<string> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Getting text from element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    return await el.getText();
  }

  // Assertions
  /**
   * Wait for element to be visible (default wait strategy)
   * @param selector - Element selector
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForElement(selector: AppiumSelector, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Waiting for element to be visible: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.waitForDisplayed({ timeout });
  }

  /**
   * Wait for element to exist in the UI hierarchy (may not be visible)
   * @param selector - Element selector
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForElementToExist(selector: AppiumSelector, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Waiting for element to exist: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.waitForExist({ timeout });
  }

  /**
   * Wait for element to be visible while scrolling
   * Useful for elements in scrollable containers
   * @param targetSelector - Target element to wait for
   * @param scrollContainerSelector - Scroll container selector
   * @param direction - Scroll direction
   * @param scrollAmount - Pixels to scroll each iteration (default: 50)
   * @param timeout - Timeout in milliseconds (default: 15000)
   */
  async waitForElementWhileScrolling(
    targetSelector: AppiumSelector,
    scrollContainerSelector: AppiumSelector,
    direction: 'up' | 'down' | 'left' | 'right' = 'down',
    scrollAmount: number = 50,
    timeout = 15000
  ): Promise<void> {
    const driver = await this.getDriver();
    const targetElem = await resolveElement(driver, targetSelector);
    const scrollContainer = await resolveElement(driver, scrollContainerSelector);
    
    logger.debug(`Waiting for element while scrolling ${direction}`);
    
    // Scroll until element is visible or timeout
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const isDisplayed = await targetElem.isDisplayed();
        if (isDisplayed) {
          logger.debug('Element is visible after scrolling');
          return;
        }
      } catch (error) {
        // Element not found yet, continue scrolling
      }
      
      // Perform scroll
      await this.scroll(scrollContainerSelector);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    throw new Error(`Timed out waiting for element after scrolling for ${timeout}ms`);
  }

  /**
   * Wait for element with custom polling interval and retry logic
   * @param selector - Element selector
   * @param options - Wait options
   */
  async waitForElementWithRetry(
    selector: AppiumSelector,
    options: {
      timeout?: number;
      pollingInterval?: number;
      condition?: 'visible' | 'exist' | 'enabled';
    } = {}
  ): Promise<void> {
    const { timeout = 10000, pollingInterval = 500, condition = 'visible' } = options;
    const driver = await this.getDriver();
    const startTime = Date.now();
    
    logger.debug(`Waiting for element with retry (${condition}): ${typeof selector === 'string' ? selector : 'custom element'}`);
    
    while (Date.now() - startTime < timeout) {
      try {
        const el = await resolveElement(driver, selector);
        
        switch (condition) {
          case 'visible':
            const isDisplayed = await el.isDisplayed();
            if (isDisplayed) {
              logger.debug('Element is visible');
              return;
            }
            break;
          case 'exist':
            const exists = await el.isExisting();
            if (exists) {
              logger.debug('Element exists');
              return;
            }
            break;
          case 'enabled':
            const isEnabled = await el.isEnabled();
            if (isEnabled) {
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
  async waitForAllElements(selectors: AppiumSelector[], timeout = 10000): Promise<void> {
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
  async waitForAnyElement(selectors: AppiumSelector[], timeout = 10000): Promise<number> {
    logger.debug(`Waiting for any of ${selectors.length} elements to be visible`);
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      for (let i = 0; i < selectors.length; i++) {
        try {
          const driver = await this.getDriver();
          const el = await resolveElement(driver, selectors[i]);
          const isDisplayed = await el.isDisplayed();
          if (isDisplayed) {
            logger.debug(`Element at index ${i} is visible`);
            return i;
          }
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
  async waitForElementToDisappear(selector: AppiumSelector, timeout = 5000): Promise<void> {
    const driver = await this.getDriver();
    logger.debug(`Waiting for element to disappear: ${typeof selector === 'string' ? selector : 'custom element'}`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const el = await resolveElement(driver, selector);
        const isDisplayed = await el.isDisplayed();
        if (!isDisplayed) {
          logger.debug('Element is not visible');
          return;
        }
      } catch (error) {
        // Element not found, which means it's disappeared
        logger.debug('Element not found (disappeared)');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Element did not disappear within ${timeout}ms`);
  }

  /**
   * Wait for text to appear in an element
   * @param selector - Element selector
   * @param expectedText - Expected text content
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForText(selector: AppiumSelector, expectedText: string, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    logger.debug(`Waiting for text "${expectedText}" in element`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const el = await resolveElement(driver, selector);
        const actualText = await el.getText();
        
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
  async waitForElementToBeEnabled(selector: AppiumSelector, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    logger.debug(`Waiting for element to be enabled`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const el = await resolveElement(driver, selector);
        const isEnabled = await el.isEnabled();
        
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

  async expectVisible(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Expecting element visible: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const isDisplayed = await el.isDisplayed();
    if (!isDisplayed) {
      throw new Error(`Element is not visible`);
    }
  }

  async expectNotVisible(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Expecting element not visible: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const isDisplayed = await el.isDisplayed();
    if (isDisplayed) {
      throw new Error(`Element is visible`);
    }
  }

  async expectText(selector: AppiumSelector, text: string): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Expecting text in element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const actualText = await el.getText();
    if (actualText !== text) {
      throw new Error(`Expected text "${text}" but got "${actualText}"`);
    }
  }

  async expectContainsText(selector: AppiumSelector, text: string): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Expecting element contains text: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const actualText = await el.getText();
    if (!actualText.includes(text)) {
      throw new Error(`Expected text to contain "${text}" but got "${actualText}"`);
    }
  }

  async expectEnabled(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Expecting element enabled: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const isEnabled = await el.isEnabled();
    if (!isEnabled) {
      throw new Error(`Element is not enabled`);
    }
  }

  async expectDisabled(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, selector);
    logger.debug(`Expecting element disabled: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const isEnabled = await el.isEnabled();
    if (isEnabled) {
      throw new Error(`Element is not disabled`);
    }
  }

  // Gestures
  async swipe(direction: 'up' | 'down' | 'left' | 'right', distance?: number): Promise<void> {
    logger.debug(`Swiping ${direction}`);
    const driver = await this.getDriver();
    const windowSize = await driver.getWindowSize();
    const startX = windowSize.width / 2;
    const startY = windowSize.height / 2;
    
    let endX = startX;
    let endY = startY;
    const swipeDistance = distance || 100;

    switch (direction) {
      case 'up':
        endY = startY - swipeDistance;
        break;
      case 'down':
        endY = startY + swipeDistance;
        break;
      case 'left':
        endX = startX - swipeDistance;
        break;
      case 'right':
        endX = startX + swipeDistance;
        break;
    }

    await driver.touchAction([
      { action: 'press', x: startX, y: startY },
      { action: 'wait', ms: 100 },
      { action: 'moveTo', x: endX, y: endY },
      { action: 'release' }
    ]);
  }

  async scroll(toSelector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await resolveElement(driver, toSelector);
    logger.debug(`Scrolling to element: ${typeof toSelector === 'string' ? toSelector : 'custom element'}`);
    await el.scrollIntoView();
  }

  async pinch(scale: number): Promise<void> {
    logger.debug(`Pinching with scale: ${scale}`);
    const driver = await this.getDriver();
    await driver.execute('mobile: pinchOpen', { scale });
  }

  // Utilities
  async takeScreenshot(name: string): Promise<string> {
    logger.debug(`Taking screenshot: ${name}`);
    const driver = await this.getDriver();
    const path = `artifacts/screenshots/${name}_${Date.now()}.png`;
    await driver.saveScreenshot(path);
    return path;
  }

  async reload(): Promise<void> {
    logger.info('Reloading app');
    const driver = await this.getDriver();
    await driver.reloadSession();
  }

  async back(): Promise<void> {
    logger.info('Going back');
    const driver = await this.getDriver();
    await driver.back();
  }

  async close(): Promise<void> {
    logger.info('Closing app');
    if (this.driver) {
      await this.driver.deleteSession();
      this.driver = null;
    }
  }

  // Device
  async setOrientation(orientation: 'portrait' | 'landscape'): Promise<void> {
    logger.info(`Setting orientation to: ${orientation}`);
    const driver = await this.getDriver();
    await driver.setOrientation(orientation === 'portrait' ? 'PORTRAIT' : 'LANDSCAPE');
  }

  async setLocation(latitude: number, longitude: number): Promise<void> {
    logger.info(`Setting location to: ${latitude}, ${longitude}`);
    const driver = await this.getDriver();
    await driver.setGeoLocation({ latitude, longitude });
  }

  // Helper methods to create Appium selectors
  /**
   * Create a selector by accessibility ID
   * @param id - The accessibility ID
   */
  static async byId(driver: WebdriverIO.Browser, id: string): Promise<WebdriverIO.Element> {
    return await driver.$(`~${id}`);
  }

  /**
   * Create a selector by text content
   * @param text - The text to match
   */
  static async byText(driver: WebdriverIO.Browser, text: string): Promise<WebdriverIO.Element> {
    return await driver.$(`android=new UiSelector().text("${text}")|ios=**/XCUIElementTypeStaticText[` + text + `]`);
  }

  /**
   * Create a selector by label (accessibility label)
   * @param label - The label to match
   */
  static async byLabel(driver: WebdriverIO.Browser, label: string): Promise<WebdriverIO.Element> {
    return await driver.$(`~${label}`);
  }

  /**
   * Create a selector using XPath
   * @param xpath - The XPath expression
   */
  static async byXPath(driver: WebdriverIO.Browser, xpath: string): Promise<WebdriverIO.Element> {
    return await driver.$(xpath);
  }

  /**
   * Create a selector using CSS selector (for web contexts)
   * @param cssSelector - The CSS selector
   */
  static async byCSS(driver: WebdriverIO.Browser, cssSelector: string): Promise<WebdriverIO.Element> {
    return await driver.$(cssSelector);
  }
}
