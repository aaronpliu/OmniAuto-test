import { remote, RemoteOptions } from 'webdriverio';
import { BaseActions } from './BaseActions';
import { Selector } from '../types/actions';
import { Logger } from '../utils/logger';
import { mobileConfig } from '../utils/mobileConfig';
import { parseSelector } from '../utils/SelectorBuilder';
import { resizeScreenshot } from '../utils/imageResizer';

const logger = Logger.getInstance();

/**
 * Appium-specific selector type
 * Extends the base Selector type with WebdriverIO Element support
 */
export type AppiumSelector = Selector | WebdriverIO.Element;

export class AppiumActions extends BaseActions {
  private driver: WebdriverIO.Browser | null = null;
  private capabilities: RemoteOptions['capabilities'];
  private platform: 'android' | 'ios';

  constructor(capabilities?: RemoteOptions['capabilities']) {
    super();
    // If no capabilities provided, build from environment variables
    this.capabilities = capabilities || this.buildDefaultCapabilities();
    // Determine platform from capabilities
    const p = (this.capabilities as any)?.platformName?.toLowerCase() || 'android';
    this.platform = p === 'ios' ? 'ios' : 'android';
  }

  /**
   * Convert unified selector string to Appium/Wdio selector
   * Uses this.platform to determine the correct format
   */
  private selectorToAppiumString(selector: string): string {
    const { type, value } = parseSelector(selector);
    switch (type) {
      case 'id':    return `~${value}`;
      case 'text':
        if (this.platform === 'android') {
          return `android=new UiSelector().text("${value}")`;
        } else {
          return `-ios predicate string:label == "${value}"`;
        }
      case 'label': return `~${value}`;
      case 'xpath': return value;
      case 'css':   return value;
      case 'class':
        if (this.platform === 'android') {
          return `android=new UiSelector().className("${value}")`;
        } else {
          return `-ios class chain:**/${value}[1]`;
        }
      case 'raw':   return `~${value}`;
    }
  }

  /** Resolve selector to WebdriverIO Element */
  private async resolveElement(driver: WebdriverIO.Browser, selector: AppiumSelector): Promise<WebdriverIO.Element> {
    // If it's already a WebdriverIO element, return it
    if (typeof selector !== 'string' && typeof selector !== 'number' && !Array.isArray(selector)) {
      if ('isExisting' in selector) {
        return selector as WebdriverIO.Element;
      }
    }

    if (typeof selector === 'string') {
      const { type } = parseSelector(selector);
      if (type !== 'raw') {
        const wdioSelector = this.selectorToAppiumString(selector);
        logger.debug(`Resolved unified selector: ${selector} → Appium: ${wdioSelector}`);
        return await driver.$(wdioSelector);
      }
      return await driver.$(`~${selector}`);
    }

    const id = String(selector);
    return await driver.$(`~${id}`);
  }

  /**
   * Build default capabilities from unified mobile config + env overrides
   *
   * 优先级链：环境变量 > configs/mobile.config.js > 内置默认值
   * 具体合并逻辑见 MobileConfigLoader.getAppiumCapabilities()
   */
  private buildDefaultCapabilities(): RemoteOptions['capabilities'] {
    const platformName = (process.env.TEST_PLATFORM || 'android') as 'android' | 'ios';
    const capabilities = mobileConfig.getAppiumCapabilities(platformName);
    logger.debug('Built capabilities from mobile config:', JSON.stringify(capabilities, null, 2));
    return capabilities;
  }

  private async getDriver(): Promise<WebdriverIO.Browser> {
    if (!this.driver) {
      const serverConfig = mobileConfig.getAppiumServerConfig();
      const host = process.env.APPIUM_HOST || serverConfig.host;
      const port = parseInt(process.env.APPIUM_PORT || String(serverConfig.port), 10);

      const deviceName = (this.capabilities as any)['appium:deviceName'] ||
        process.env.IOS_DEVICE_NAME || process.env.ANDROID_DEVICE_NAME || 'Unknown';
      const platformVersion = (this.capabilities as any)['appium:platformVersion'] ||
        process.env.IOS_PLATFORM_VERSION || process.env.ANDROID_PLATFORM_VERSION || 'Unknown';
      const deviceType = this.platform === 'ios'
        ? (process.env.IOS_DEVICE_TYPE || 'unknown')
        : (process.env.ANDROID_DEVICE_TYPE || 'unknown');

      logger.info('========== Connecting to Appium Server ==========');
      logger.info(`Appium Server: ${host}:${port}`);
      logger.info(`Device: ${deviceName}`);
      if (this.platform === 'ios') {
        logger.info(`Type: ${deviceType === 'simulator' ? 'Simulator' : deviceType === 'real' ? 'Real Device' : 'Unknown'}`);
        logger.info(`OS: iOS ${platformVersion}`);
      } else {
        logger.info(`Type: ${deviceType === 'emulator' ? 'Emulator' : deviceType === 'real' ? 'Real Device' : 'Unknown'}`);
        logger.info(`OS: Android ${platformVersion}`);
      }
      logger.info('===============================================');

      this.driver = await remote({
        hostname: host,
        port,
        path: '/',
        capabilities: this.capabilities,
        logLevel: 'warn',   // 抑制 WebdriverIO 的 COMMAND/DATA/RESULT info 日志
      });

      logger.info('✓ Connected to Appium Server');
    }
    return this.driver;
  }

  // Navigation
  async navigateTo(url?: string): Promise<void> {
    logger.info('Starting app with Appium');
    await this.getDriver();
  }

  // Element interactions
  async click(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Clicking element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.click();
  }

  async doubleClick(selector: AppiumSelector, duration = 1000): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Double clicking element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.doubleClick();
  }

  async longPress(selector: AppiumSelector, duration = 1000): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Long pressing element: ${typeof selector === 'string' ? selector : 'custom element'} for ${duration}ms`);
    await el.touchAction([
      { action: 'press' },
      { action: 'wait', ms: duration },
      { action: 'release' },
    ]);
  }

  // Input
  async typeText(selector: AppiumSelector, text: string): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Typing text into element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.setValue(text);
  }

  async clearText(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Clearing text from element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.clearValue();
  }

  async getText(selector: AppiumSelector): Promise<string> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Getting text from element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    return await el.getText();
  }

  // Assertions
  async waitForElement(selector: AppiumSelector, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Waiting for element visible: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.waitForDisplayed({ timeout });
  }

  async waitForElementToExist(selector: AppiumSelector, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Waiting for element to exist: ${typeof selector === 'string' ? selector : 'custom element'}`);
    await el.waitForExist({ timeout });
  }

  async waitForElementWhileScrolling(
    targetSelector: AppiumSelector,
    scrollContainerSelector: AppiumSelector,
    direction: 'up' | 'down' | 'left' | 'right' = 'down',
    scrollAmount: number = 50,
    timeout = 15000,
  ): Promise<void> {
    const driver = await this.getDriver();
    const targetElem = await this.resolveElement(driver, targetSelector);
    const scrollContainer = await this.resolveElement(driver, scrollContainerSelector);

    logger.debug(`Waiting for element while scrolling ${direction}`);

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

      await this.scroll(scrollContainerSelector);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error(`Timed out waiting for element after scrolling for ${timeout}ms`);
  }

  async waitForElementWithRetry(
    selector: AppiumSelector,
    options: {
      timeout?: number;
      pollingInterval?: number;
      condition?: 'visible' | 'exist' | 'enabled';
    } = {},
  ): Promise<void> {
    const { timeout = 10000, pollingInterval = 500, condition = 'visible' } = options;
    const driver = await this.getDriver();
    const startTime = Date.now();

    logger.debug(`Waiting for element with retry (${condition}): ${typeof selector === 'string' ? selector : 'custom element'}`);

    while (Date.now() - startTime < timeout) {
      try {
        const el = await this.resolveElement(driver, selector);

        switch (condition) {
          case 'visible': {
            const isDisplayed = await el.isDisplayed();
            if (isDisplayed) return;
            break;
          }
          case 'exist': {
            const exists = await el.isExisting();
            if (exists) return;
            break;
          }
          case 'enabled': {
            const isEnabled = await el.isEnabled();
            if (isEnabled) return;
            break;
          }
        }
      } catch (error) {
        logger.debug('Element not ready, retrying...');
      }

      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }

    throw new Error(`Timed out waiting for element after ${timeout}ms`);
  }

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

  async waitForAnyElement(selectors: AppiumSelector[], timeout = 10000): Promise<number> {
    logger.debug(`Waiting for any of ${selectors.length} elements to be visible`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      for (let i = 0; i < selectors.length; i++) {
        try {
          const driver = await this.getDriver();
          const el = await this.resolveElement(driver, selectors[i]);
          const isDisplayed = await el.isDisplayed();
          if (isDisplayed) {
            logger.debug(`Element at index ${i} is visible`);
            return i;
          }
        } catch (error) {
          continue;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timed out waiting for any element after ${timeout}ms`);
  }

  async waitForElementToDisappear(selector: AppiumSelector, timeout = 5000): Promise<void> {
    const driver = await this.getDriver();
    logger.debug(`Waiting for element to disappear: ${typeof selector === 'string' ? selector : 'custom element'}`);

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const el = await this.resolveElement(driver, selector);
        const isDisplayed = await el.isDisplayed();
        if (!isDisplayed) {
          logger.debug('Element is not visible');
          return;
        }
      } catch (error) {
        logger.debug('Element not found (disappeared)');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Element did not disappear within ${timeout}ms`);
  }

  async waitForText(selector: AppiumSelector, expectedText: string, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    logger.debug(`Waiting for text "${expectedText}" in element`);

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const el = await this.resolveElement(driver, selector);
        const actualText = await el.getText();

        if (actualText.includes(expectedText)) {
          logger.debug(`Found expected text: "${expectedText}"`);
          return;
        }
      } catch (error) {
        logger.debug('Text not available yet, retrying...');
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error(`Text "${expectedText}" not found within ${timeout}ms`);
  }

  async waitForElementToBeEnabled(selector: AppiumSelector, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    logger.debug('Waiting for element to be enabled');

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const el = await this.resolveElement(driver, selector);
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
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Expecting element visible: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const isDisplayed = await el.isDisplayed();
    if (!isDisplayed) {
      throw new Error(`Element is not visible: ${typeof selector === 'string' ? selector : 'custom element'}`);
    }
  }

  async expectNotVisible(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Expecting element not visible: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const isDisplayed = await el.isDisplayed();
    if (isDisplayed) {
      throw new Error(`Element is visible: ${typeof selector === 'string' ? selector : 'custom element'}`);
    }
  }

  async expectText(selector: AppiumSelector, text: string): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Expecting text in element: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const actualText = await el.getText();
    if (actualText !== text) {
      throw new Error(`Expected text "${text}" but got "${actualText}"`);
    }
  }

  async expectContainsText(selector: AppiumSelector, text: string): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Expecting element contains text: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const actualText = await el.getText();
    if (!actualText.includes(text)) {
      throw new Error(`Expected text to contain "${text}" but got "${actualText}"`);
    }
  }

  async expectEnabled(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Expecting element enabled: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const isEnabled = await el.isEnabled();
    if (!isEnabled) {
      throw new Error(`Element is not enabled: ${typeof selector === 'string' ? selector : 'custom element'}`);
    }
  }

  async expectDisabled(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Expecting element disabled: ${typeof selector === 'string' ? selector : 'custom element'}`);
    const isEnabled = await el.isEnabled();
    if (isEnabled) {
      throw new Error(`Element is not disabled: ${typeof selector === 'string' ? selector : 'custom element'}`);
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
      { action: 'release' },
    ]);
  }

  async scroll(toSelector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, toSelector);
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
    // 缩放截图至适合 Web 报告查看的尺寸
    return await resizeScreenshot(path);
  }

  /** 开始屏幕录制（基于 Appium 原生 API） */
  async startRecording(timeLimit = 180, quality: 'low' | 'medium' | 'high' = 'medium', fps = 10): Promise<void> {
    const driver = await this.getDriver();
    logger.info('开始录屏...');
    const opts: Record<string, any> = {
      timeLimit,
      videoQuality: quality,
      videoFps: fps,
      videoType: 'h264',
    };
    if (this.platform === 'android') {
      opts.bitRate = 4000000;
      opts.videoSize = '720x1280';
    }
    await driver.startRecordingScreen(opts);
    logger.info('录屏已开始');
  }

  /** 停止屏幕录制并返回视频 Buffer */
  async stopRecording(): Promise<Buffer | null> {
    const driver = await this.getDriver();
    logger.info('停止录屏...');
    const base64 = await driver.stopRecordingScreen();
    if (!base64) {
      logger.warn('录屏返回空数据');
      return null;
    }
    const buf = Buffer.from(base64, 'base64');
    logger.info(`录屏完成，大小: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
    return buf;
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

  // Static helper methods for direct element creation
  static async byId(driver: WebdriverIO.Browser, id: string): Promise<WebdriverIO.Element> {
    return await driver.$(`~${id}`);
  }

  static async byText(driver: WebdriverIO.Browser, text: string): Promise<WebdriverIO.Element> {
    // Determine platform from driver capabilities
    const platform = (driver.capabilities as any)?.platformName?.toLowerCase() === 'ios' ? 'ios' : 'android';
    if (platform === 'android') {
      return await driver.$(`android=new UiSelector().text("${text}")`);
    } else {
      return await driver.$(`-ios predicate string:label == "${text}"`);
    }
  }

  static async byLabel(driver: WebdriverIO.Browser, label: string): Promise<WebdriverIO.Element> {
    return await driver.$(`~${label}`);
  }

  static async byXPath(driver: WebdriverIO.Browser, xpath: string): Promise<WebdriverIO.Element> {
    return await driver.$(xpath);
  }

  static async byCSS(driver: WebdriverIO.Browser, cssSelector: string): Promise<WebdriverIO.Element> {
    return await driver.$(cssSelector);
  }
}
