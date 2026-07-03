import { Browser, Page } from "playwright";
import { BaseActions } from "./BaseActions";
import { Logger } from "../utils/logger";

// 声明 DOM 类型 (仅在浏览器环境可用)
declare const window: any;
declare const document: any;

const logger = Logger.getInstance();

export class PlaywrightActions extends BaseActions {
  private page: Page;
  private browser?: Browser;

  constructor(page: Page, browser?: Browser) {
    super();
    this.page = page;
    this.browser = browser;
  }

  // Navigation
  async navigateTo(url?: string): Promise<void> {
    if (url) {
      logger.info(`Navigating to: ${url}`);
      await this.page.goto(url);
    }
  }

  // Element interactions
  async click(selector: string): Promise<void> {
    logger.debug(`Clicking element: ${selector}`);
    await this.page.click(selector);
  }

  async doubleClick(selector: string): Promise<void> {
    logger.debug(`Double clicking element: ${selector}`);
    await this.page.dblclick(selector);
  }

  async longPress(selector: string, duration = 1000): Promise<void> {
    logger.debug(`Long pressing element: ${selector} for ${duration}ms`);
    await this.page.dispatchEvent(selector, "mousedown");
    await this.page.waitForTimeout(duration);
    await this.page.dispatchEvent(selector, "mouseup");
  }

  // Input
  async typeText(selector: string, text: string): Promise<void> {
    logger.debug(`Typing text into element: ${selector}`);
    await this.page.fill(selector, text);
  }

  async clearText(selector: string): Promise<void> {
    logger.debug(`Clearing text from element: ${selector}`);
    await this.page.fill(selector, "");
  }

  async getText(selector: string): Promise<string> {
    logger.debug(`Getting text from element: ${selector}`);
    return (await this.page.textContent(selector)) || "";
  }

  // Assertions
  async waitForElement(selector: string, timeout = 10000): Promise<void> {
    logger.debug(`Waiting for element: ${selector}`);
    await this.page.waitForSelector(selector, { state: "visible", timeout });
  }

  async expectVisible(selector: string): Promise<void> {
    logger.debug(`Expecting element visible: ${selector}`);
    await this.page.waitForSelector(selector, { state: "visible" });
  }

  async expectNotVisible(selector: string): Promise<void> {
    logger.debug(`Expecting element not visible: ${selector}`);
    await this.page.waitForSelector(selector, { state: "hidden" });
  }

  async expectText(selector: string, text: string): Promise<void> {
    logger.debug(`Expecting text in element: ${selector}`);
    const actualText = await this.page.textContent(selector);
    if (actualText !== text) {
      throw new Error(`Expected text "${text}" but got "${actualText}"`);
    }
  }

  async expectContainsText(selector: string, text: string): Promise<void> {
    logger.debug(`Expecting element contains text: ${selector}`);
    const actualText = await this.page.textContent(selector);
    if (!actualText?.includes(text)) {
      throw new Error(`Expected text to contain "${text}" but got "${actualText}"`);
    }
  }

  async expectEnabled(selector: string): Promise<void> {
    logger.debug(`Expecting element enabled: ${selector}`);
    const isDisabled = await this.page.getAttribute(selector, "disabled");
    if (isDisabled !== null) {
      throw new Error(`Element ${selector} is disabled`);
    }
  }

  async expectDisabled(selector: string): Promise<void> {
    logger.debug(`Expecting element disabled: ${selector}`);
    const isDisabled = await this.page.getAttribute(selector, "disabled");
    if (isDisabled === null) {
      throw new Error(`Element ${selector} is enabled`);
    }
  }

  // Gestures
  async swipe(direction: "up" | "down" | "left" | "right", distance?: number): Promise<void> {
    logger.debug(`Swiping ${direction}`);
    const box = await this.page.locator("body").boundingBox();
    if (!box) {
      throw new Error("Could not get body dimensions");
    }

    const startX = box.width / 2;
    const startY = box.height / 2;
    const swipeDistance = distance || 100;

    let endX = startX;
    let endY = startY;

    switch (direction) {
      case "up":
        endY = startY - swipeDistance;
        break;
      case "down":
        endY = startY + swipeDistance;
        break;
      case "left":
        endX = startX - swipeDistance;
        break;
      case "right":
        endX = startX + swipeDistance;
        break;
    }

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY);
    await this.page.mouse.up();
  }

  async scroll(toSelector: string): Promise<void> {
    logger.debug(`Scrolling to element: ${toSelector}`);
    await this.page.locator(toSelector).scrollIntoViewIfNeeded();
  }

  async pinch(scale: number): Promise<void> {
    logger.debug(`Pinching with scale: ${scale}`);
    // Pinch gesture simulation for web
    await this.page.evaluate((s: number) => {
      const event = new window.WheelEvent("wheel", {
        deltaY: s * 100,
        ctrlKey: true,
      });
      document.dispatchEvent(event);
    }, scale);
  }

  // Utilities
  async takeScreenshot(name: string): Promise<string> {
    logger.debug(`Taking screenshot: ${name}`);
    const path = `artifacts/screenshots/${name}_${Date.now()}.png`;
    await this.page.screenshot({ path, fullPage: true });
    return path;
  }

  async reload(): Promise<void> {
    logger.info("Reloading page");
    await this.page.reload();
  }

  async back(): Promise<void> {
    logger.info("Going back");
    await this.page.goBack();
  }

  async close(): Promise<void> {
    logger.info("Closing browser");
    if (this.browser) {
      await this.browser.close();
    }
  }

  // Device
  async setOrientation(orientation: "portrait" | "landscape"): Promise<void> {
    logger.info(`Setting orientation to: ${orientation}`);
    const viewport = this.page.viewportSize();
    if (!viewport) {
      return;
    }

    if (orientation === "portrait") {
      await this.page.setViewportSize({
        width: Math.min(viewport.width, viewport.height),
        height: Math.max(viewport.width, viewport.height),
      });
    } else {
      await this.page.setViewportSize({
        width: Math.max(viewport.width, viewport.height),
        height: Math.min(viewport.width, viewport.height),
      });
    }
  }

  async setLocation(latitude: number, longitude: number): Promise<void> {
    logger.info(`Setting location to: ${latitude}, ${longitude}`);
    const context = this.page.context();
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude, longitude });
    await this.page.reload();
  }
}
