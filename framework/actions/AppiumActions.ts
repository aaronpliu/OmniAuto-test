import { remote, RemoteOptions } from "webdriverio";
import { BaseActions } from "./BaseActions";
import { TSelector } from "../types/actions";
import { Logger } from "../utils/logger";
import { mobileConfig } from "../utils/mobileConfig";
import { TestSessionState } from "../utils/testSessionState";
import {
  parseSelector,
  isIndexedSelector,
  isPlatformSelector,
  resolvePlatformSelector,
  isChainableSelector,
} from "../utils/SelectorBuilder";
import { CompoundSelectorNode } from "../types/actions";
import { resizeScreenshot } from "../utils/imageResizer";

const logger = Logger.getInstance();

/**
 * Appium-specific selector type
 * Extends the base TSelector type with WebdriverIO Element support
 */
export type AppiumSelector = TSelector | WebdriverIO.Element;

export class AppiumActions extends BaseActions {
  private driver: WebdriverIO.Browser | null = null;
  private capabilities: RemoteOptions["capabilities"];
  private platform: "android" | "ios";

  constructor(capabilities?: RemoteOptions["capabilities"]) {
    super();
    // If no capabilities provided, build from environment variables
    this.capabilities = capabilities || this.buildDefaultCapabilities();
    // Determine platform from capabilities
    const p = (this.capabilities as any)?.platformName?.toLowerCase() || "android";
    this.platform = p === "ios" ? "ios" : "android";
  }

  /**
   * Convert unified selector string to Appium/Wdio selector
   *
   * 选择器策略参照 WebdriverIO 官方文档：
   * https://webdriver.io/zh/docs/selectors#%E6%97%A0%E9%9A%9C%E7%A2%8D-id
   *
   * 策略优先级 / Strategy priority:
   *   1. Accessibility ID (`~`)      — 跨平台最佳，iOS=accessibilityIdentifier, Android=content-desc
   *   2. Android UiAutomator          — Android 原生 UiSelector，性能最优
   *   3. iOS Predicate String         — iOS 条件筛选，支持 ==、CONTAINS 等
   *   4. iOS Class Chain               — iOS 层级查询，性能优于 XPath
   *   5. XPath                         — 通用兜底，但性能最差且可能脆弱
   */
  private selectorToAppiumString(selector: string): string {
    const { type, value } = parseSelector(selector);
    switch (type) {
      case "id":
        // iOS: accessibilityIdentifier; Android: resourceIdMatches 后缀匹配（RN testID → resource-id）
        if (this.platform === "android") {
          return `android=new UiSelector().resourceIdMatches(".*${value}$")`;
        }
        return `~${value}`;
      case "text":
        // 按显示文本匹配
        // Android: UiSelector().text() / iOS: predicate string label ==
        if (this.platform === "android") {
          return `android=new UiSelector().text("${value}")`;
        } else {
          return `-ios predicate string:label == "${value}"`;
        }
      case "label":
        // 按 accessibility label 匹配（注意：不是 accessibility ID）
        // Android: content-desc = UiSelector().description()
        // iOS: accessibilityLabel = predicate string label ==
        if (this.platform === "android") {
          return `android=new UiSelector().description("${value}")`;
        } else {
          return `-ios predicate string:label == "${value}"`;
        }
      case "xpath":
        return value;
      case "css":
        return value;
      case "class":
        // 按类名匹配
        // Android: UiSelector().className() / iOS: class chain
        if (this.platform === "android") {
          return `android=new UiSelector().className("${value}")`;
        } else {
          return `-ios class chain:**/${value}[1]`;
        }
      case "type":
        // type 与 class 策略相同
        if (this.platform === "android") {
          return `android=new UiSelector().className("${value}")`;
        } else {
          return `-ios class chain:**/${value}[1]`;
        }
      case "raw":
        // raw — 作为 accessibility ID 处理（向后兼容）
        return `~${value}`;
    }
  }

  /**
   * 将原子选择器类型和值转换为 XPath 片段（不含 // 前缀）
   * Convert atomic selector type/value to XPath fragment (without // prefix)
   *
   * 仅用于复合选择器（withDescendant/withAncestor/and），
   * 简单原子选择器走 selectorToAppiumString 原生策略。
   *
   * XPath 属性映射（参照 WebdriverIO 选择器文档）：
   *   Android:
   *     - id (accessibility ID) → @content-desc 或 contains(@resource-id, value)
   *     - text                 → @text
   *     - label                → @content-desc
   *   iOS:
   *     - id (accessibility ID) → @name
   *     - text / label          → @label
   */
  private static atomicToXPathFragment(
    selectorType: string,
    value: string,
    platform: "ios" | "android"
  ): string {
    switch (selectorType) {
      case "id":
        // Accessibility ID
        // Android: content-desc 精确匹配 或 resource-id 后缀匹配
        // iOS: accessibilityIdentifier = @name 属性
        if (platform === "android") {
          return `*[contains(@resource-id, '${value}') or @content-desc='${value}']`;
        }
        return `*[@name='${value}']`;
      case "text":
        // 显示文本
        // Android: @text / iOS: @label
        if (platform === "android") {
          return `*[@text='${value}']`;
        }
        return `*[@label='${value}']`;
      case "label":
        // Accessibility Label（非 ID）
        // Android: @content-desc / iOS: @label
        if (platform === "android") {
          return `*[@content-desc='${value}']`;
        }
        return `*[@label='${value}']`;
      case "type":
      case "class":
        return `*[@class='${value}']`;
      case "xpath":
        // xpath value is a path expression, strip leading //
        return value.replace(/^\/\//, "");
      case "raw":
        // raw — 按 accessibility ID 处理
        if (platform === "android") {
          return `*[contains(@resource-id, '${value}') or @content-desc='${value}']`;
        }
        return `*[@name='${value}']`;
      default:
        if (platform === "android") {
          return `*[contains(@resource-id, '${value}') or @content-desc='${value}']`;
        }
        return `*[@name='${value}']`;
    }
  }

  /**
   * 将 CompoundSelectorNode 树转换为 Appium XPath 选择器字符串
   * Convert CompoundSelectorNode tree to Appium XPath selector string
   *
   * 递归解析原子和复合选择器节点，生成 XPath 表达式。
   * Recursively resolves atomic and compound nodes into XPath expressions.
   */
  private static resolveCompoundForAppium(
    node: CompoundSelectorNode,
    platform: "ios" | "android"
  ): string {
    if (node.type === "atomic") {
      const { selectorType, value } = node.atomic!;
      const frag = AppiumActions.atomicToXPathFragment(selectorType, value, platform);
      return `//${frag}`;
    }
    // compound node
    const left = AppiumActions.resolveCompoundForAppium(node.left!, platform);
    const right = AppiumActions.resolveCompoundForAppium(node.right!, platform);

    switch (node.relation) {
      case "descendant": {
        // A has descendant B: //A_XPath[.//B_XPath]
        // Strip leading // from right for nesting
        const rightDesc = right.replace(/^\/\//, "");
        return `${left}[.//${rightDesc}]`;
      }
      case "ancestor":
        // A has ancestor B: //B_XPath//A_XPath
        // Returns A (left) elements that are inside B (right)
        return `${right}//${left.replace(/^\/\//, "")}`;
      case "and": {
        // A AND B: 尝试合并条件 / Try to merge conditions
        // Simple case: //*[@cond1] and //*[@cond2] → //*[@cond1 and @cond2]
        const leftMatch = left.match(/^\/\/\*\[(.+)\]$/);
        const rightMatch = right.match(/^\/\/\*\[(.+)\]$/);
        if (leftMatch && rightMatch) {
          return `//*[${leftMatch[1]} and ${rightMatch[1]}]`;
        }
        // Fallback: use left XPath (complex compound selectors)
        logger.warn(
          `"and" compound with complex selectors, falling back to left selector: ${left}`
        );
        return left;
      }
      default:
        throw new Error(`Unknown compound relation: ${node.relation}`);
    }
  }

  /** Resolve selector to WebdriverIO Element */
  private async resolveElement(
    driver: WebdriverIO.Browser,
    selector: AppiumSelector
  ): Promise<WebdriverIO.Element> {
    // IndexedSelector: { selector, index } — 按索引选取第N个匹配 / Select Nth match by index
    if (isIndexedSelector(selector)) {
      const inner = selector.selector;
      const idx = selector.index;

      // 内层为 PlatformSelector → 先按平台解析，再递归
      if (isPlatformSelector(inner)) {
        const resolved = resolvePlatformSelector(inner, this.platform);
        return this.resolveElement(driver, { selector: resolved, index: idx });
      }

      // 内层为字符串 → $$()[idx]
      if (typeof inner === "string") {
        const { type } = parseSelector(inner);
        const wdioSelector = type !== "raw" ? this.selectorToAppiumString(inner) : `~${inner}`;
        const elements = await driver.$$(wdioSelector);
        if (idx >= elements.length) {
          throw new Error(
            `Index ${idx} out of bounds: selector "${wdioSelector}" matched ${elements.length} element(s)`
          );
        }
        logger.debug(`Resolved indexed selector: ${inner} [${idx}] → Appium element`);
        return elements[idx];
      }

      // 内层为 ChainableSelector → 先解析为 XPath，再 $$()[idx]
      if (isChainableSelector(inner)) {
        const xpath = AppiumActions.resolveCompoundForAppium(inner.toNode(), this.platform);
        const elements = await driver.$$(xpath);
        if (idx >= elements.length) {
          throw new Error(
            `Index ${idx} out of bounds: selector "${xpath}" matched ${elements.length} element(s)`
          );
        }
        logger.debug(`Resolved compound indexed selector [${idx}] → Appium element`);
        return elements[idx];
      }

      // 内层为 WebdriverIO Element → 不支持索引（已经是单个对象），降级
      logger.warn(
        "atIndex() is not applicable to an already-resolved WebdriverIO.Element; returning as-is"
      );
      return inner as WebdriverIO.Element;
    }

    // PlatformSelector: { ios: ..., android: ... } — 按 this.platform 解析
    if (isPlatformSelector(selector)) {
      const resolved = resolvePlatformSelector(selector, this.platform);
      return this.resolveElement(driver, resolved as AppiumSelector);
    }

    // ChainableSelector: by.id("foo"), by.type("X").withDescendant(by.type("Y"))
    if (isChainableSelector(selector)) {
      const node = selector.toNode();
      // 简单原子选择器（非复合）— 直接用原生 Appium 策略，不走 XPath
      // Simple atomic selector — use native Appium strategy for efficiency and correctness
      if (node.type === "atomic" && node.atomic) {
        const { selectorType, value } = node.atomic;

        // Android id：直接使用 resourceIdMatches 后缀匹配（RN testID → 裸 resource-id）
        // 不再先试 accessibility ID（content-desc），因为 RN 的 testID 在 Android
        // 上映射到 resource-id 而非 content-desc，Try 1 总是失败，徒增 HTTP 往返
        if (selectorType === "id" && this.platform === "android") {
          const resourceIdSel = `android=new UiSelector().resourceIdMatches(".*${value}$")`;
          logger.debug(`Resolved atomic selector → Appium (resourceIdMatches): ${resourceIdSel}`);
          return await driver.$(resourceIdSel);
        }

        const appiumStr = this.selectorToAppiumString(`${selectorType}:${value}`);
        logger.debug(`Resolved atomic selector → Appium: ${appiumStr}`);
        return await driver.$(appiumStr);
      }
      // 复合选择器 — 转换为 XPath
      const xpath = AppiumActions.resolveCompoundForAppium(node, this.platform);
      logger.debug(`Resolved compound selector → Appium XPath: ${xpath}`);
      return await driver.$(xpath);
    }

    // If it's already a WebdriverIO element, return it
    if (typeof selector !== "string" && typeof selector !== "number" && !Array.isArray(selector)) {
      if ("isExisting" in selector) {
        return selector;
      }
    }

    if (typeof selector === "string") {
      const { type } = parseSelector(selector);
      if (type !== "raw") {
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
   * 优先级链：环境变量 > configs/mobile.config.local.js > 内置默认值
   * 具体合并逻辑见 MobileConfigLoader.getAppiumCapabilities()
   */
  /**
   * 根据 LOG_LEVEL 环境变量计算 WebdriverIO logLevel
   * info  → "warn"  (抑制 COMMAND/DATA/RESULT)
   * debug → "info"  (输出 COMMAND/DATA/RESULT)
   * trace → "debug" (输出所有底层日志)
   */
  private resolveWdioLogLevel(): "debug" | "info" | "warn" {
    const level = process.env.LOG_LEVEL || "info";
    switch (level) {
      case "trace":
        return "debug";
      case "debug":
        return "info";
      default:
        return "warn";
    }
  }

  private buildDefaultCapabilities(): RemoteOptions["capabilities"] {
    const platformName = (process.env.TEST_PLATFORM || "android") as "android" | "ios";
    const capabilities = mobileConfig.getAppiumCapabilities(platformName);
    logger.debug("Built capabilities from mobile config: " + JSON.stringify(capabilities, null, 2));
    return capabilities;
  }

  private async getDriver(): Promise<WebdriverIO.Browser> {
    if (!TestSessionState.isActive) {
      throw new Error("Test session teardown: driver unavailable");
    }
    if (!this.driver) {
      const serverConfig = mobileConfig.getAppiumServerConfig();
      const host = process.env.APPIUM_HOST || serverConfig.host;
      const port = parseInt(process.env.APPIUM_PORT || String(serverConfig.port), 10);

      const deviceName =
        (this.capabilities as any)["appium:deviceName"] ||
        process.env.IOS_DEVICE_NAME ||
        process.env.ANDROID_DEVICE_NAME ||
        "Unknown";
      const platformVersion =
        (this.capabilities as any)["appium:platformVersion"] ||
        process.env.IOS_PLATFORM_VERSION ||
        process.env.ANDROID_PLATFORM_VERSION ||
        "Unknown";
      const deviceType =
        this.platform === "ios"
          ? process.env.IOS_DEVICE_TYPE || "unknown"
          : process.env.ANDROID_DEVICE_TYPE || "unknown";

      logger.info("========== Connecting to Appium Server ==========");
      logger.info(`Appium Server: ${host}:${port}`);
      logger.info(`Device: ${deviceName}`);
      if (this.platform === "ios") {
        logger.info(
          `Type: ${deviceType === "simulator" ? "Simulator" : deviceType === "real" ? "Real Device" : "Unknown"}`
        );
        logger.info(`OS: iOS ${platformVersion}`);
      } else {
        logger.info(
          `Type: ${deviceType === "emulator" ? "Emulator" : deviceType === "real" ? "Real Device" : "Unknown"}`
        );
        logger.info(`OS: Android ${platformVersion}`);
      }
      logger.info("===============================================");

      this.driver = await remote({
        hostname: host,
        port,
        path: "/",
        capabilities: this.capabilities,
        logLevel: this.resolveWdioLogLevel(),
        waitforTimeout: 5000,
      });

      // 显式通过 W3C timeouts 端点设置 implicit wait，确保 Appium 3.0 正确应用
      // 注意：UiAutomator2 驱动不识别 W3C timeouts 能力项，需通过 Settings API 控制
      await this.driver.setTimeout({ implicit: 0 });

      // 缩短 UiAutomator2 驱动的服务端超时：
      // waitForIdleTimeout —— 等待 App 空闲的超时（默认 10000ms）
      // waitForSelectorTimeout —— 元素选择器超时（默认 10000ms）
      // 不缩短 actionAcknowledgmentTimeout，避免手势操作被截断
      await this.driver.updateSettings({
        waitForIdleTimeout: 1000,
        waitForSelectorTimeout: 1000,
      });

      logger.info("✓ Connected to Appium Server");
    }
    return this.driver;
  }

  // Navigation
  async navigateTo(_url?: string): Promise<void> {
    logger.info("Starting app with Appium");
    const driver = await this.getDriver();
    // noReset=true 时，新建 session 不会杀掉 App 进程
    // 主动 terminateApp + activateApp 确保 App 被重新启动
    const appId =
      (this.capabilities as any)?.["appium:appPackage"] ||
      (this.capabilities as any)?.["appium:bundleId"];
    if (appId) {
      await driver.execute("mobile: terminateApp", { appId }).catch(() => {
        /* App 可能未在运行，忽略 */
      });
      await driver.execute("mobile: activateApp", { appId });
      logger.info(`App activated: ${appId}`);
    }
  }

  // Element interactions
  async click(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(`Clicking element: ${typeof selector === "string" ? selector : "custom element"}`);
    await el.click();
  }

  async doubleClick(selector: AppiumSelector, _duration = 1000): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Double clicking element: ${typeof selector === "string" ? selector : "custom element"}`
    );
    await el.doubleClick();
  }

  async longPress(selector: AppiumSelector, duration = 1000): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Long pressing element: ${typeof selector === "string" ? selector : "custom element"} for ${duration}ms`
    );
    await el.touchAction([
      { action: "press" },
      { action: "wait", ms: duration },
      { action: "release" },
    ]);
  }

  // Input
  async typeText(selector: AppiumSelector, text: string): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Typing text into element: ${typeof selector === "string" ? selector : "custom element"}`
    );
    await el.setValue(text);
  }

  async clearText(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Clearing text from element: ${typeof selector === "string" ? selector : "custom element"}`
    );
    await el.clearValue();
  }

  async getText(selector: AppiumSelector): Promise<string> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Getting text from element: ${typeof selector === "string" ? selector : "custom element"}`
    );
    return await el.getText();
  }

  /**
   * 获取元素属性
   * @param selector - 元素选择器
   * @param attrName - 可选，指定属性名则返回单个值(string)；不传则返回常用属性对象
   */
  async getAttributes(selector: TSelector): Promise<Record<string, unknown>>;
  async getAttributes(selector: TSelector, attrName: string): Promise<string>;
  async getAttributes(
    selector: AppiumSelector,
    attrName?: string
  ): Promise<Record<string, unknown> | string> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Getting attributes from element: ${typeof selector === "string" ? selector : "custom element"}`
    );
    if (attrName !== undefined) {
      return (await el.getAttribute(attrName)) ?? "";
    }
    // 聚合常用属性
    const attrs: Record<string, unknown> = {};
    try {
      attrs.text = await el.getText();
      attrs.enabled = await el.isEnabled();
      attrs.visible = await el.isDisplayed();
      attrs.existing = await el.isExisting();
      const resourceId = await el.getAttribute("resource-id");
      if (resourceId) {
        attrs["resource-id"] = resourceId;
      }
      const className = await el.getAttribute("class");
      if (className) {
        attrs["class"] = className;
      }
      const contentDesc = await el.getAttribute("content-desc");
      if (contentDesc) {
        attrs["content-desc"] = contentDesc;
      }
    } catch {
      // 属性获取失败不抛错，返回已获取的部分
    }
    return attrs;
  }

  // Assertions
  async waitForElement(
    selector: AppiumSelector,
    timeout = 10000,
    isNotVisible = false
  ): Promise<void> {
    const driver = await this.getDriver();
    logger.debug(
      `Waiting for element ${isNotVisible ? "not " : ""}visible: ${typeof selector === "string" ? selector : "custom element"}`
    );

    // 自控轮询（替代 WebdriverIO 原生 waitForDisplayed），每轮检查 teardown 状态
    // resolveElement 在循环内调用，避免 WebdriverIO 默认 waitforTimeout(30s) 放大每次重试的等待时间
    const deadline = Date.now() + timeout;
    const interval = 500;
    while (Date.now() < deadline) {
      if (!TestSessionState.isActive) {
        throw new Error("Test session teardown: waitForElement aborted");
      }
      try {
        const el = await this.resolveElement(driver, selector);
        const displayed = await el.isDisplayed();
        if (isNotVisible ? !displayed : displayed) {
          return;
        }
      } catch {
        // 元素可能尚未渲染，继续轮询
      }
      if (!TestSessionState.isActive) {
        throw new Error("Test session teardown: waitForElement aborted");
      }
      await new Promise((r) => setTimeout(r, Math.min(interval, deadline - Date.now())));
    }
    throw new Error(
      `Element ${isNotVisible ? "did not disappear" : "not visible"} after ${timeout}ms`
    );
  }

  async waitForElementToExist(selector: AppiumSelector, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    logger.debug(
      `Waiting for element to exist: ${typeof selector === "string" ? selector : "custom element"}`
    );

    // 自控轮询（替代 WebdriverIO 原生 waitForExist），每轮检查 teardown 状态
    // resolveElement 在循环内调用，避免 WebdriverIO 默认 waitforTimeout(30s) 放大每次重试的等待时间
    const deadline = Date.now() + timeout;
    const interval = 500;
    while (Date.now() < deadline) {
      if (!TestSessionState.isActive) {
        throw new Error("Test session teardown: waitForElementToExist aborted");
      }
      try {
        const el = await this.resolveElement(driver, selector);
        const exists = await el.isExisting();
        if (exists) {
          return;
        }
      } catch {
        // 忽略中间错误，继续轮询
      }
      if (!TestSessionState.isActive) {
        throw new Error("Test session teardown: waitForElementToExist aborted");
      }
      await new Promise((r) => setTimeout(r, Math.min(interval, deadline - Date.now())));
    }
    throw new Error(`Element did not exist after ${timeout}ms`);
  }

  async waitForElementWhileScrolling(
    targetSelector: AppiumSelector,
    scrollContainerSelector: AppiumSelector,
    direction: "up" | "down" | "left" | "right" = "down",
    _scrollAmount: number = 50,
    timeout = 15000
  ): Promise<void> {
    const driver = await this.getDriver();

    logger.debug(`Waiting for element while scrolling ${direction}`);

    // resolveElement 在循环内调用，避免 WebdriverIO 默认 waitforTimeout(30s) 放大每次重试的等待时间
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (!TestSessionState.isActive) {
        throw new Error("Test session teardown: waitForElementWhileScrolling aborted");
      }
      try {
        const targetElem = await this.resolveElement(driver, targetSelector);
        const isDisplayed = await targetElem.isDisplayed();
        if (isDisplayed) {
          logger.debug("Element is visible after scrolling");
          return;
        }
      } catch (error) {
        // Element not found yet, continue scrolling
      }

      if (!TestSessionState.isActive) {
        throw new Error("Test session teardown: waitForElementWhileScrolling aborted");
      }
      await this.scroll(scrollContainerSelector);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error(`Timed out waiting for element after scrolling for ${timeout}ms`);
  }

  async waitForElementWithRetry(
    selector: AppiumSelector,
    options: {
      timeout?: number;
      pollingInterval?: number;
      condition?: "visible" | "exist" | "enabled";
    } = {}
  ): Promise<void> {
    const { timeout = 10000, pollingInterval = 500, condition = "visible" } = options;
    const driver = await this.getDriver();
    const startTime = Date.now();

    logger.debug(
      `Waiting for element with retry (${condition}): ${typeof selector === "string" ? selector : "custom element"}`
    );

    while (Date.now() - startTime < timeout) {
      if (!TestSessionState.isActive) {
        throw new Error("Test session teardown: waitForElementWithRetry aborted");
      }
      try {
        const el = await this.resolveElement(driver, selector);

        switch (condition) {
          case "visible": {
            const isDisplayed = await el.isDisplayed();
            if (isDisplayed) {
              return;
            }
            break;
          }
          case "exist": {
            const exists = await el.isExisting();
            if (exists) {
              return;
            }
            break;
          }
          case "enabled": {
            const isEnabled = await el.isEnabled();
            if (isEnabled) {
              return;
            }
            break;
          }
        }
      } catch (error) {
        logger.debug("Element not ready, retrying...");
      }

      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
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
        throw new Error(
          `Failed to wait for element ${index + 1}: ${error instanceof Error ? error.message : String(error)}`
        );
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

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Timed out waiting for any element after ${timeout}ms`);
  }

  async waitForElementToDisappear(selector: AppiumSelector, timeout = 5000): Promise<void> {
    const driver = await this.getDriver();
    logger.debug(
      `Waiting for element to disappear: ${typeof selector === "string" ? selector : "custom element"}`
    );

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const el = await this.resolveElement(driver, selector);
        const isDisplayed = await el.isDisplayed();
        if (!isDisplayed) {
          logger.debug("Element is not visible");
          return;
        }
      } catch (error) {
        logger.debug("Element not found (disappeared)");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Element did not disappear within ${timeout}ms`);
  }

  async waitForText(
    selector: AppiumSelector,
    expectedText: string,
    timeout = 10000
  ): Promise<void> {
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
        logger.debug("Text not available yet, retrying...");
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error(`Text "${expectedText}" not found within ${timeout}ms`);
  }

  async waitForElementToBeEnabled(selector: AppiumSelector, timeout = 10000): Promise<void> {
    const driver = await this.getDriver();
    logger.debug("Waiting for element to be enabled");

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const el = await this.resolveElement(driver, selector);
        const isEnabled = await el.isEnabled();

        if (isEnabled) {
          logger.debug("Element is enabled");
          return;
        }
      } catch (error) {
        logger.debug("Element not ready, retrying...");
      }

      if (!TestSessionState.isActive) {
        throw new Error("Test session teardown: waitForElementWithRetry aborted");
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error(`Element did not become enabled within ${timeout}ms`);
  }

  async expectVisible(selector: AppiumSelector, isNotVisible = false): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Expecting element ${isNotVisible ? "not " : ""}visible: ${typeof selector === "string" ? selector : "custom element"}`
    );
    const isDisplayed = await el.isDisplayed();
    if (isNotVisible) {
      if (isDisplayed) {
        throw new Error(
          `Element is visible (expected not visible): ${typeof selector === "string" ? selector : "custom element"}`
        );
      }
    } else {
      if (!isDisplayed) {
        throw new Error(
          `Element is not visible: ${typeof selector === "string" ? selector : "custom element"}`
        );
      }
    }
  }

  async expectNotVisible(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Expecting element not visible: ${typeof selector === "string" ? selector : "custom element"}`
    );
    const isDisplayed = await el.isDisplayed();
    if (isDisplayed) {
      throw new Error(
        `Element is visible: ${typeof selector === "string" ? selector : "custom element"}`
      );
    }
  }

  /**
   * 验证元素存在于 UI 层级中（可能不可见）
   */
  async expectExist(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Expecting element to exist: ${typeof selector === "string" ? selector : "custom element"}`
    );
    const exists = await el.isExisting();
    if (!exists) {
      throw new Error(
        `Element does not exist: ${typeof selector === "string" ? selector : "custom element"}`
      );
    }
  }

  /**
   * 验证元素不存在于 UI 层级中
   */
  async expectNotExist(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Expecting element to not exist: ${typeof selector === "string" ? selector : "custom element"}`
    );
    const exists = await el.isExisting();
    if (exists) {
      throw new Error(
        `Element exists (expected not exist): ${typeof selector === "string" ? selector : "custom element"}`
      );
    }
  }

  async expectText(selector: AppiumSelector, text: string | RegExp): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Expecting text in element: ${typeof selector === "string" ? selector : "custom element"}`
    );
    const actualText = await el.getText();
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

  async expectContainsText(selector: AppiumSelector, text: string): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Expecting element contains text: ${typeof selector === "string" ? selector : "custom element"}`
    );
    const actualText = await el.getText();
    if (!actualText.includes(text)) {
      throw new Error(`Expected text to contain "${text}" but got "${actualText}"`);
    }
  }

  async expectEnabled(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Expecting element enabled: ${typeof selector === "string" ? selector : "custom element"}`
    );
    const isEnabled = await el.isEnabled();
    if (!isEnabled) {
      throw new Error(
        `Element is not enabled: ${typeof selector === "string" ? selector : "custom element"}`
      );
    }
  }

  async expectDisabled(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    logger.debug(
      `Expecting element disabled: ${typeof selector === "string" ? selector : "custom element"}`
    );
    const isEnabled = await el.isEnabled();
    if (isEnabled) {
      throw new Error(
        `Element is not disabled: ${typeof selector === "string" ? selector : "custom element"}`
      );
    }
  }

  async expectNotText(selector: AppiumSelector, text: string | RegExp): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    const selName = typeof selector === "string" ? selector : "custom element";
    logger.debug(`Expecting text NOT to match in element: ${selName}`);
    const actualText = await el.getText();
    if (text instanceof RegExp) {
      if (text.test(actualText)) {
        throw new Error(
          `Assertion Failed: expectNotText\n  Selector: "${selName}"\n  Expected: NOT /${text.source}/\n  Actual:   "${actualText}"`
        );
      }
    } else {
      if (actualText === text) {
        throw new Error(
          `Assertion Failed: expectNotText\n  Selector: "${selName}"\n  Expected: NOT "${text}"\n  Actual:   "${actualText}"`
        );
      }
    }
  }

  async expectAttribute(
    selector: AppiumSelector,
    attrName: string,
    expectedValue: string | RegExp
  ): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    const selName = typeof selector === "string" ? selector : "custom element";
    logger.debug(`Expecting attribute ${attrName} on element: ${selName}`);
    const actualValue = (await el.getAttribute(attrName)) ?? "";
    if (expectedValue instanceof RegExp) {
      if (!expectedValue.test(actualValue)) {
        throw new Error(
          `Assertion Failed: expectAttribute\n  Selector:  "${selName}"\n  Attribute: "${attrName}"\n  Expected:  /${expectedValue.source}/\n  Actual:    "${actualValue}"`
        );
      }
    } else {
      if (actualValue !== expectedValue) {
        throw new Error(
          `Assertion Failed: expectAttribute\n  Selector:  "${selName}"\n  Attribute: "${attrName}"\n  Expected:  "${expectedValue}"\n  Actual:    "${actualValue}"`
        );
      }
    }
  }

  async expectValue(selector: AppiumSelector, expectedValue: string): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    const selName = typeof selector === "string" ? selector : "custom element";
    logger.debug(`Expecting value on element: ${selName}`);
    const actualValue = (await el.getAttribute("value")) ?? "";
    if (actualValue !== expectedValue) {
      throw new Error(
        `Assertion Failed: expectValue\n  Selector: "${selName}"\n  Expected: "${expectedValue}"\n  Actual:   "${actualValue}"`
      );
    }
  }

  async expectCount(selector: AppiumSelector, count: number): Promise<void> {
    const driver = await this.getDriver();
    const selName = typeof selector === "string" ? selector : "custom element";
    logger.debug(`Expecting element count: ${selName}`);
    let actualCount: number;
    if (typeof selector === "string") {
      const selectorStr = this.selectorToAppiumString(selector);
      const elements = await driver.$$(selectorStr);
      actualCount = elements.length;
    } else {
      // 非字符串选择器（已解析的元素），计数始终为 1
      actualCount = 1;
    }
    if (actualCount !== count) {
      throw new Error(
        `Assertion Failed: expectCount\n  Selector: "${selName}"\n  Expected: ${count}\n  Actual:   ${actualCount}`
      );
    }
  }

  async expectFocused(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    const selName = typeof selector === "string" ? selector : "custom element";
    logger.debug(`Expecting element focused: ${selName}`);
    const activeEl = await driver.getActiveElement();
    const isFocused = activeEl === el.elementId;
    if (!isFocused) {
      throw new Error(
        `Assertion Failed: expectFocused\n  Selector: "${selName}"\n  Element is not focused`
      );
    }
  }

  async expectNotFocused(selector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, selector);
    const selName = typeof selector === "string" ? selector : "custom element";
    logger.debug(`Expecting element not focused: ${selName}`);
    const activeEl = await driver.getActiveElement();
    const isFocused = activeEl === el.elementId;
    if (isFocused) {
      throw new Error(
        `Assertion Failed: expectNotFocused\n  Selector: "${selName}"\n  Element is focused`
      );
    }
  }

  // Gestures
  async swipe(direction: "up" | "down" | "left" | "right", distance?: number): Promise<void> {
    logger.debug(`Swiping ${direction}`);
    const driver = await this.getDriver();
    const windowSize = await driver.getWindowSize();
    const startX = windowSize.width / 2;
    const startY = windowSize.height / 2;

    let endX = startX;
    let endY = startY;
    const swipeDistance = distance || 100;

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

    await driver.touchAction([
      { action: "press", x: startX, y: startY },
      { action: "wait", ms: 100 },
      { action: "moveTo", x: endX, y: endY },
      { action: "release" },
    ]);
  }

  async scroll(toSelector: AppiumSelector): Promise<void> {
    const driver = await this.getDriver();
    const el = await this.resolveElement(driver, toSelector);
    logger.debug(
      `Scrolling within element: ${typeof toSelector === "string" ? toSelector : "custom element"}`
    );
    // el.scrollIntoView() 是 Web 专有方法，Appium 不支持（405）
    // mobile: scroll 需要 strategy+selector 参数，不适合基于 elementId 的容器内滚动
    // 改用 mobile: scrollGesture（UiAutomator2 原生），在指定元素区域内执行滑动手势
    await driver.execute("mobile: scrollGesture", {
      elementId: el.elementId,
      direction: "down",
      percent: 0.8,
    });
  }

  async pinch(scale: number): Promise<void> {
    logger.debug(`Pinching with scale: ${scale}`);
    const driver = await this.getDriver();
    await driver.execute("mobile: pinchOpen", { scale });
  }

  // Utilities
  async takeScreenshot(name: string): Promise<string> {
    logger.debug(`Taking screenshot: ${name}`);
    const driver = await this.getDriver();
    const sessionDir = process.env.OMNITEST_SESSION_DIR || "artifacts";
    const path = `${sessionDir}/screenshots/${name}_${Date.now()}.png`;
    await driver.saveScreenshot(path);
    // 缩放截图至适合 Web 报告查看的尺寸
    return await resizeScreenshot(path);
  }

  /** 开始屏幕录制（基于 Appium 原生 API） */
  async startRecording(
    timeLimit = 180,
    quality: "low" | "medium" | "high" = "medium",
    fps = 10
  ): Promise<void> {
    const driver = await this.getDriver();
    logger.info("开始录屏...");
    const opts: Record<string, any> = {
      timeLimit,
      videoQuality: quality,
      videoFps: fps,
      videoType: "h264",
    };
    if (this.platform === "android") {
      opts.bitRate = 4000000;
      opts.videoSize = "720x1280";
    }
    await driver.startRecordingScreen(opts);
    logger.info("录屏已开始");
  }

  /** 停止屏幕录制并返回视频 Buffer */
  async stopRecording(): Promise<Buffer | null> {
    const driver = await this.getDriver();
    logger.info("停止录屏...");
    const base64 = await driver.stopRecordingScreen();
    if (!base64) {
      logger.warn("录屏返回空数据");
      return null;
    }
    const buf = Buffer.from(base64, "base64");
    logger.info(`录屏完成，大小: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
    return buf;
  }

  async reload(): Promise<void> {
    logger.info("Reloading app");
    const driver = await this.getDriver();
    // driver.reloadSession() 是 Web 专用方法，会重建整个 WebDriver session
    // 移动端应通过 terminateApp + activateApp 重启应用，保持 session 不变
    const appId =
      (this.capabilities as any)?.["appium:appPackage"] ||
      (this.capabilities as any)?.["appium:bundleId"];
    if (appId) {
      await driver.execute("mobile: terminateApp", { appId });
      await driver.execute("mobile: activateApp", { appId });
      logger.info("App restarted via mobile: terminateApp + activateApp");
    } else {
      // 兜底：无 appId 时尝试 closeApp + activateApp
      logger.warn("No appId found, falling back to closeApp/launchApp");
      try {
        await driver.closeApp();
        await driver.launchApp();
      } catch {
        logger.warn("closeApp/launchApp not available, skipping reload");
      }
    }
  }

  async back(): Promise<void> {
    logger.info("Going back");
    const driver = await this.getDriver();
    await driver.back();
  }

  async close(): Promise<void> {
    logger.info("Closing app");
    if (this.driver) {
      await this.driver.deleteSession();
      this.driver = null;
    }
  }

  // Device
  async setOrientation(orientation: "portrait" | "landscape"): Promise<void> {
    logger.info(`Setting orientation to: ${orientation}`);
    const driver = await this.getDriver();
    await driver.setOrientation(orientation === "portrait" ? "PORTRAIT" : "LANDSCAPE");
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
    const platform =
      (driver.capabilities as any)?.platformName?.toLowerCase() === "ios" ? "ios" : "android";
    if (platform === "android") {
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

  static async byCSS(
    driver: WebdriverIO.Browser,
    cssSelector: string
  ): Promise<WebdriverIO.Element> {
    return await driver.$(cssSelector);
  }
}
