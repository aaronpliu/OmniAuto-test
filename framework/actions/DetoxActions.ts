import { device, element, by, expect as detoxExpect } from 'detox';
import { BaseActions } from './BaseActions';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

export class DetoxActions extends BaseActions {
  // Navigation
  async navigateTo(url?: string): Promise<void> {
    logger.info('Launching app with Detox');
    await device.launchApp({ newInstance: true });
  }

  // Element interactions
  async click(selector: string): Promise<void> {
    logger.debug(`Clicking element: ${selector}`);
    await element(by.id(selector)).tap();
  }

  async doubleClick(selector: string): Promise<void> {
    logger.debug(`Double clicking element: ${selector}`);
    await element(by.id(selector)).multiTap(2);
  }

  async tap(selector: string): Promise<void> {
    logger.debug(`Tapping element: ${selector}`);
    await element(by.id(selector)).tap();
  }

  async longPress(selector: string, duration = 1000): Promise<void> {
    logger.debug(`Long pressing element: ${selector} for ${duration}ms`);
    await element(by.id(selector)).longPress(duration);
  }

  // Input
  async typeText(selector: string, text: string): Promise<void> {
    logger.debug(`Typing text into element: ${selector}`);
    await element(by.id(selector)).replaceText(text);
  }

  async clearText(selector: string): Promise<void> {
    logger.debug(`Clearing text from element: ${selector}`);
    await element(by.id(selector)).clearText();
  }

  async getText(selector: string): Promise<string> {
    logger.debug(`Getting text from element: ${selector}`);
    const attribute = await element(by.id(selector)).getAttributes();
    return (attribute as any).text || '';
  }

  // Assertions
  async waitForElement(selector: string, timeout = 10000): Promise<void> {
    logger.debug(`Waiting for element: ${selector}`);
    await waitFor(element(by.id(selector))).toBeVisible().withTimeout(timeout);
  }

  async expectVisible(selector: string): Promise<void> {
    logger.debug(`Expecting element visible: ${selector}`);
    await detoxExpect(element(by.id(selector))).toBeVisible();
  }

  async expectNotVisible(selector: string): Promise<void> {
    logger.debug(`Expecting element not visible: ${selector}`);
    await detoxExpect(element(by.id(selector))).toBeNotVisible();
  }

  async expectText(selector: string, text: string): Promise<void> {
    logger.debug(`Expecting text in element: ${selector}`);
    await detoxExpect(element(by.id(selector))).toHaveText(text);
  }

  async expectContainsText(selector: string, text: string): Promise<void> {
    logger.debug(`Expecting element contains text: ${selector}`);
    await detoxExpect(element(by.id(selector))).toHaveLabel(text);
  }

  async expectEnabled(selector: string): Promise<void> {
    logger.debug(`Expecting element enabled: ${selector}`);
    await detoxExpect(element(by.id(selector))).toBeEnabled();
  }

  async expectDisabled(selector: string): Promise<void> {
    logger.debug(`Expecting element disabled: ${selector}`);
    await detoxExpect(element(by.id(selector))).toBeDisabled();
  }

  // Gestures
  async swipe(direction: 'up' | 'down' | 'left' | 'right', distance?: number): Promise<void> {
    logger.debug(`Swiping ${direction}`);
    await element(by.type('UIScrollView')).swipe(direction, 'fast', NaN, 0.5, 0.5);
  }

  async scroll(toSelector: string): Promise<void> {
    logger.debug(`Scrolling to element: ${toSelector}`);
    await element(by.id(toSelector)).scrollTo('bottom');
  }

  async pinch(scale: number): Promise<void> {
    logger.debug(`Pinching with scale: ${scale}`);
    await element(by.type('UIView')).pinchWithScale(scale, 0, 1000);
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
