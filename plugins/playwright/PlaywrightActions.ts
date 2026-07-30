import { Browser, Page } from "playwright";
import { BaseActions } from "../../framework/actions/BaseActions";
import { TSelector } from "../../framework/types/actions";
import { Logger } from "../../core/utils/Logger";
import { parseSelector, isPlatformSelector } from "../../core/selector/SelectorBuilder";

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

  /**
   * 将 TSelector 解析为 Playwright 选择器字符串
   * Resolve TSelector to a Playwright selector string
   *
   * Web 平台不支持 PlatformSelector，收到时抛错。
   * Web platform does not support PlatformSelector; throws on receipt.
   */
  private resolveSelector(selector: TSelector): string {
    if (isPlatformSelector(selector)) {
      throw new Error(
        "PlatformSelector { ios, android } is not supported on web platform. " +
          "Use a plain string or prefixed selector (e.g. by.id('...'), by.css('...'))."
      );
    }
    if (typeof selector === "string") {
      const { type, value } = parseSelector(selector);
      switch (type) {
        case "id":
          return `#${value}`;
        case "text":
          return `text=${value}`;
        case "label":
          return `[aria-label="${value}"]`;
        case "xpath":
          return `xpath=${value}`;
        case "css":
          return value;
        case "class":
          return `.${value}`;
        case "raw":
          return value;
      }
    }
    throw new Error(`Unsupported selector type for Playwright: ${typeof selector}`);
  }

  // Navigation
  async navigateTo(url?: string): Promise<void> {
    if (url) {
      logger.info(`Navigating to: ${url}`);
      await this.page.goto(url);
    }
  }

  // Element interactions
  async click(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Clicking element: ${sel}`);
    await this.page.click(sel);
  }

  async doubleClick(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Double clicking element: ${sel}`);
    await this.page.dblclick(sel);
  }

  async longPress(selector: TSelector, duration = 1000): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Long pressing element: ${sel} for ${duration}ms`);
    await this.page.dispatchEvent(sel, "mousedown");
    await this.page.waitForTimeout(duration);
    await this.page.dispatchEvent(sel, "mouseup");
  }

  // Input
  async typeText(selector: TSelector, text: string): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Typing text into element: ${sel}`);
    await this.page.fill(sel, text);
  }

  async clearText(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Clearing text from element: ${sel}`);
    await this.page.fill(sel, "");
  }

  async getText(selector: TSelector): Promise<string> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Getting text from element: ${sel}`);
    return (await this.page.textContent(sel)) || "";
  }

  /**
   * 获取元素属性
   * @param selector - 元素选择器
   * @param attrName - 可选，指定属性名则返回单个值(string)；不传则返回完整属性对象
   */
  async getAttributes(selector: TSelector): Promise<Record<string, unknown>>;
  async getAttributes(selector: TSelector, attrName: string): Promise<string>;
  async getAttributes(
    selector: TSelector,
    attrName?: string
  ): Promise<Record<string, unknown> | string> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Getting attributes from element: ${sel}`);
    if (attrName !== undefined) {
      return (await this.page.getAttribute(sel, attrName)) ?? "";
    }
    // 通过 evaluate 获取所有 DOM 属性
    const attrs = await this.page.evaluate((s: string) => {
      const el: any = document.querySelector(s);
      if (!el) {
        return {};
      }
      const result: Record<string, unknown> = {};
      for (const attr of el.attributes) {
        result[attr.name] = attr.value;
      }
      result.textContent = el.textContent || "";
      result.visible = !!el.offsetParent;
      return result;
    }, sel);
    return attrs;
  }

  // Assertions
  async waitForElement(selector: TSelector, timeout = 10000, isNotVisible = false): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Waiting for element${isNotVisible ? " to hide" : ""}: ${sel}`);
    await this.page.waitForSelector(sel, {
      state: isNotVisible ? "hidden" : "visible",
      timeout,
    });
  }

  async expectVisible(selector: TSelector, isNotVisible = false): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element${isNotVisible ? " not" : ""} visible: ${sel}`);
    await this.page.waitForSelector(sel, {
      state: isNotVisible ? "hidden" : "visible",
    });
  }

  async expectNotVisible(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element not visible: ${sel}`);
    await this.page.waitForSelector(sel, { state: "hidden" });
  }

  /**
   * 验证元素存在于 DOM 中（可能不可见）
   */
  async expectExist(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element to exist: ${sel}`);
    await this.page.waitForSelector(sel, { state: "attached" });
  }

  /**
   * 验证元素不存在于 DOM 中
   */
  async expectNotExist(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element to not exist: ${sel}`);
    await this.page.waitForSelector(sel, { state: "detached" });
  }

  async expectText(selector: TSelector, text: string | RegExp): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting text in element: ${sel}`);
    const actualText = (await this.page.textContent(sel)) || "";
    if (text instanceof RegExp) {
      if (!text.test(actualText)) {
        throw new Error(`Expected text to match /${text.source}/ but got "${actualText}"`);
      }
    } else {
      if (actualText !== text) {
        throw new Error(`Expected text "${text}" but got "${actualText}"`);
      }
    }
  }

  async expectContainsText(selector: TSelector, text: string): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element contains text: ${sel}`);
    const actualText = await this.page.textContent(sel);
    if (!actualText?.includes(text)) {
      throw new Error(`Expected text to contain "${text}" but got "${actualText}"`);
    }
  }

  async expectEnabled(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element enabled: ${sel}`);
    const isDisabled = await this.page.getAttribute(sel, "disabled");
    if (isDisabled !== null) {
      throw new Error(`Element ${sel} is disabled`);
    }
  }

  async expectDisabled(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element disabled: ${sel}`);
    const isDisabled = await this.page.getAttribute(sel, "disabled");
    if (isDisabled === null) {
      throw new Error(`Element ${sel} is enabled`);
    }
  }

  async expectNotText(selector: TSelector, text: string | RegExp): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting text NOT to match in element: ${sel}`);
    const actualText = (await this.page.textContent(sel)) || "";
    if (text instanceof RegExp) {
      if (text.test(actualText)) {
        throw new Error(
          `Assertion Failed: expectNotText\n  Selector: "${sel}"\n  Expected: NOT /${text.source}/\n  Actual:   "${actualText}"`
        );
      }
    } else {
      if (actualText === text) {
        throw new Error(
          `Assertion Failed: expectNotText\n  Selector: "${sel}"\n  Expected: NOT "${text}"\n  Actual:   "${actualText}"`
        );
      }
    }
  }

  async expectAttribute(
    selector: TSelector,
    attrName: string,
    expectedValue: string | RegExp
  ): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting attribute ${attrName} on element: ${sel}`);
    const actualValue = (await this.page.getAttribute(sel, attrName)) ?? "";
    if (expectedValue instanceof RegExp) {
      if (!expectedValue.test(actualValue)) {
        throw new Error(
          `Assertion Failed: expectAttribute\n  Selector:  "${sel}"\n  Attribute: "${attrName}"\n  Expected:  /${expectedValue.source}/\n  Actual:    "${actualValue}"`
        );
      }
    } else {
      if (actualValue !== expectedValue) {
        throw new Error(
          `Assertion Failed: expectAttribute\n  Selector:  "${sel}"\n  Attribute: "${attrName}"\n  Expected:  "${expectedValue}"\n  Actual:    "${actualValue}"`
        );
      }
    }
  }

  async expectValue(selector: TSelector, expectedValue: string): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting value on element: ${sel}`);
    const actualValue = (await this.page.inputValue(sel)) ?? "";
    if (actualValue !== expectedValue) {
      throw new Error(
        `Assertion Failed: expectValue\n  Selector: "${sel}"\n  Expected: "${expectedValue}"\n  Actual:   "${actualValue}"`
      );
    }
  }

  async expectCount(selector: TSelector, count: number): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element count: ${sel}`);
    const actualCount = await this.page.locator(sel).count();
    if (actualCount !== count) {
      throw new Error(
        `Assertion Failed: expectCount\n  Selector: "${sel}"\n  Expected: ${count}\n  Actual:   ${actualCount}`
      );
    }
  }

  async expectFocused(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element focused: ${sel}`);
    const isFocused = await this.page
      .locator(sel)
      .evaluate((el: any) => el === document.activeElement);
    if (!isFocused) {
      throw new Error(
        `Assertion Failed: expectFocused\n  Selector: "${sel}"\n  Element is not focused`
      );
    }
  }

  async expectNotFocused(selector: TSelector): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Expecting element not focused: ${sel}`);
    const isFocused = await this.page
      .locator(sel)
      .evaluate((el: any) => el === document.activeElement);
    if (isFocused) {
      throw new Error(
        `Assertion Failed: expectNotFocused\n  Selector: "${sel}"\n  Element is focused`
      );
    }
  }

  async waitForElementToExist(selector: TSelector, timeout = 10000): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Waiting for element to exist: ${sel}`);
    await this.page.waitForSelector(sel, { state: "attached", timeout });
  }

  async waitForElementToDisappear(selector: TSelector, timeout = 5000): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Waiting for element to disappear: ${sel}`);
    await this.page.waitForSelector(sel, { state: "hidden", timeout });
  }

  async waitForElementToBeEnabled(selector: TSelector, timeout = 10000): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Waiting for element to be enabled: ${sel}`);
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const isDisabled = await this.page.getAttribute(sel, "disabled");
      if (isDisabled === null) {
        return;
      }
      await this.page.waitForTimeout(200);
    }
    throw new Error(`Element did not become enabled within ${timeout}ms`);
  }

  async waitForText(selector: TSelector, text: string, timeout = 10000): Promise<void> {
    const sel = this.resolveSelector(selector);
    logger.debug(`Waiting for text "${text}" in element: ${sel}`);
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const actualText = (await this.page.textContent(sel)) || "";
      if (actualText.includes(text)) {
        return;
      }
      await this.page.waitForTimeout(200);
    }
    const finalText = (await this.page.textContent(sel)) || "";
    throw new Error(`Text "${text}" not found within ${timeout}ms. Actual text: "${finalText}"`);
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

  async scroll(toSelector: TSelector): Promise<void> {
    const sel = this.resolveSelector(toSelector);
    logger.debug(`Scrolling to element: ${sel}`);
    await this.page.locator(sel).scrollIntoViewIfNeeded();
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
    const sessionDir = process.env.OMNITEST_SESSION_DIR || "artifacts";
    const path = `${sessionDir}/screenshots/${name}_${Date.now()}.png`;
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
