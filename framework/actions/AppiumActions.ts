import { remote, RemoteOptions } from 'webdriverio';
import { BaseActions } from './BaseActions';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

export class AppiumActions extends BaseActions {
  private driver: WebdriverIO.Browser | null = null;
  private capabilities: RemoteOptions['capabilities'];

  constructor(capabilities: RemoteOptions['capabilities']) {
    super();
    this.capabilities = capabilities;
  }

  private async getDriver(): Promise<WebdriverIO.Browser> {
    if (!this.driver) {
      const host = process.env.APPIUM_HOST || 'localhost';
      const port = parseInt(process.env.APPIUM_PORT || '4723');
      
      logger.info(`Connecting to Appium at ${host}:${port}`);
      
      this.driver = await remote({
        hostname: host,
        port,
        path: '/wd/hub',
        capabilities: this.capabilities
      });
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
  async click(selector: string): Promise<void> {
    logger.debug(`Clicking element: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    await el.click();
  }

  async doubleClick(selector: string): Promise<void> {
    logger.debug(`Double clicking element: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    await el.doubleClick();
  }

  async tap(selector: string): Promise<void> {
    logger.debug(`Tapping element: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    await el.click();
  }

  async longPress(selector: string, duration = 1000): Promise<void> {
    logger.debug(`Long pressing element: ${selector} for ${duration}ms`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    await el.touchAction([
      { action: 'press' },
      { action: 'wait', ms: duration },
      { action: 'release' }
    ]);
  }

  // Input
  async typeText(selector: string, text: string): Promise<void> {
    logger.debug(`Typing text into element: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    await el.setValue(text);
  }

  async clearText(selector: string): Promise<void> {
    logger.debug(`Clearing text from element: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    await el.clearValue();
  }

  async getText(selector: string): Promise<string> {
    logger.debug(`Getting text from element: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    return await el.getText();
  }

  // Assertions
  async waitForElement(selector: string, timeout = 10000): Promise<void> {
    logger.debug(`Waiting for element: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    await el.waitForDisplayed({ timeout });
  }

  async expectVisible(selector: string): Promise<void> {
    logger.debug(`Expecting element visible: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    const isDisplayed = await el.isDisplayed();
    if (!isDisplayed) {
      throw new Error(`Element ${selector} is not visible`);
    }
  }

  async expectNotVisible(selector: string): Promise<void> {
    logger.debug(`Expecting element not visible: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    const isDisplayed = await el.isDisplayed();
    if (isDisplayed) {
      throw new Error(`Element ${selector} is visible`);
    }
  }

  async expectText(selector: string, text: string): Promise<void> {
    logger.debug(`Expecting text in element: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    const actualText = await el.getText();
    if (actualText !== text) {
      throw new Error(`Expected text "${text}" but got "${actualText}"`);
    }
  }

  async expectContainsText(selector: string, text: string): Promise<void> {
    logger.debug(`Expecting element contains text: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    const actualText = await el.getText();
    if (!actualText.includes(text)) {
      throw new Error(`Expected text to contain "${text}" but got "${actualText}"`);
    }
  }

  async expectEnabled(selector: string): Promise<void> {
    logger.debug(`Expecting element enabled: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    const isEnabled = await el.isEnabled();
    if (!isEnabled) {
      throw new Error(`Element ${selector} is not enabled`);
    }
  }

  async expectDisabled(selector: string): Promise<void> {
    logger.debug(`Expecting element disabled: ${selector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${selector}`);
    const isEnabled = await el.isEnabled();
    if (isEnabled) {
      throw new Error(`Element ${selector} is enabled`);
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

  async scroll(toSelector: string): Promise<void> {
    logger.debug(`Scrolling to element: ${toSelector}`);
    const driver = await this.getDriver();
    const el = await driver.$(`~${toSelector}`);
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
}
