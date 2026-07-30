import { device, element, by, expect as detoxExpect } from "detox";
import { BaseActions } from "./BaseActions";
import { Logger } from "../utils/logger";
import { resizeScreenshot } from "../utils/imageResizer";
import {
  parseSelector,
  isIndexedSelector,
  isPlatformSelector,
  resolvePlatformSelector,
  isChainableSelector,
} from "../utils/SelectorBuilder";
import { ChainableSelectorLike, CompoundSelectorNode, TSelector } from "../types/actions";

const logger = Logger.getInstance();

// 模块级平台变量，由 DetoxActions 构造函数设置
// Module-level platform variable, set by DetoxActions constructor
let currentPlatform: "ios" | "android" = "ios";

/**
 * Detox-specific selector type
 * Supports:
 * - String (no prefix): treated as test ID (by.id)
 * - String (with prefix): parsed as unified selector (id:, text:, label:, etc.)
 * - NativeElement: already wrapped element (element(by.xxx))
 * - Matcher: raw matcher that needs wrapping (by.text(), by.label(), etc.)
 * - ChainableSelectorLike: compound/chainable selector (by.type("X").withDescendant(...))
 */
export type DetoxSelector =
  | string
  | ReturnType<typeof element>
  | ReturnType<typeof by.id>
  | ChainableSelectorLike;

// Type guard to check if something is a NativeElement
function isNativeElement(obj: any): obj is ReturnType<typeof element> {
  return obj && typeof obj === "object" && "tap" in obj && typeof obj.tap === "function";
}

// Type guard to check if something is a Detox matcher (not yet wrapped in element())
function isDetoxMatcher(obj: any): boolean {
  // Detox matchers have specific internal structure
  // They are objects with 'and', 'or', 'withAncestor', etc. methods
  return (
    obj &&
    typeof obj === "object" &&
    !isNativeElement(obj) &&
    ("and" in obj || "or" in obj || "withAncestor" in obj || "withDescendant" in obj)
  );
}

// Helper: convert unified selector string to Detox matcher
function selectorToDetoxMatcher(selector: string): any {
  const { type, value } = parseSelector(selector);
  switch (type) {
    case "id":
      return by.id(value);
    case "text":
      return by.text(value);
    case "label":
      return by.label(value);
    case "xpath":
      // Detox 不直接支持 XPath，记录警告并降级为 id
      logger.warn(`Detox does not natively support XPath selectors, falling back to id: ${value}`);
      return by.id(value);
    case "css":
      logger.warn(`Detox does not support CSS selectors, falling back to id: ${value}`);
      return by.id(value);
    case "class":
      return by.type(value);
    case "type":
      return by.type(value);
    case "raw":
      return by.id(value);
  }
}

/**
 * 将 CompoundSelectorNode 树转换为 Detox NativeMatcher
 * Convert CompoundSelectorNode tree to Detox NativeMatcher
 *
 * 递归解析原子和复合选择器节点，生成 Detox 原生 matcher。
 * Recursively resolves atomic and compound nodes into Detox native matchers.
 */
function resolveCompoundForDetox(node: CompoundSelectorNode): any {
  if (node.type === "atomic") {
    const { selectorType, value } = node.atomic!;
    return selectorToDetoxMatcher(`${selectorType}:${value}`);
  }
  // compound node
  const left = resolveCompoundForDetox(node.left!);
  const right = resolveCompoundForDetox(node.right!);

  switch (node.relation) {
    case "descendant":
      return left.withDescendant(right);
    case "ancestor":
      return left.withAncestor(right);
    case "and":
      return left.and(right);
    default:
      throw new Error(`Unknown compound relation: ${node.relation}`);
  }
}

// Helper function to resolve selector to NativeElement
function resolveElement(selector: DetoxSelector): ReturnType<typeof element> {
  // IndexedSelector: { selector, index } — 按索引选取第N个匹配 / Select Nth match by index
  if (isIndexedSelector(selector)) {
    const inner = selector.selector;
    const idx = selector.index;

    // 内层为 PlatformSelector → 先按平台解析，再递归
    if (isPlatformSelector(inner)) {
      const resolved = resolvePlatformSelector(inner, currentPlatform);
      return resolveElement({ selector: resolved, index: idx } as unknown as DetoxSelector);
    }

    // 内层为字符串 → 转到 matcher → element(matcher).atIndex(n)
    if (typeof inner === "string") {
      const { type } = parseSelector(inner);
      const matcher = type !== "raw" ? selectorToDetoxMatcher(inner) : by.id(inner);
      // Detox 20.x: atIndex() 在 element() 返回的 IndexableNativeElement 上，不在 NativeMatcher 上
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
      return (element as any)(matcher).atIndex(idx);
    }

    // 内层为 ChainableSelector → 先解析为 Detox matcher，再 element(matcher).atIndex(n)
    if (isChainableSelector(inner)) {
      const matcher = resolveCompoundForDetox(inner.toNode());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
      return (element as any)(matcher).atIndex(idx);
    }

    // 内层为已解析的 matcher → element(matcher).atIndex(n)
    if (isDetoxMatcher(inner)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
      return (element as any)(inner as any).atIndex(idx);
    }

    // 内层为 NativeElement → 不支持索引（已经是单个对象），降级返回
    logger.warn(
      "atIndex() is not applicable to an already-resolved NativeElement; returning the element as-is"
    );
    return inner as ReturnType<typeof element>;
  }

  // PlatformSelector: { ios: ..., android: ... } — 按当前平台解析
  if (isPlatformSelector(selector)) {
    const resolved = resolvePlatformSelector(selector, currentPlatform);
    return resolveElement(resolved as DetoxSelector);
  }

  // ChainableSelector: by.type("X").withDescendant(by.type("Y"))
  if (isChainableSelector(selector)) {
    const matcher = resolveCompoundForDetox(selector.toNode());
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return element(matcher);
  }

  // Case 1: Already a NativeElement (wrapped with element())
  if (isNativeElement(selector)) {
    return selector;
  }

  // Case 2: Raw matcher (by.text(), by.label(), etc.) - needs to be wrapped
  if (isDetoxMatcher(selector)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Detox matcher type is dynamic
    return element(selector as any);
  }

  // Case 3: String - check for prefix (unified selector format)
  if (typeof selector === "string") {
    const { type } = parseSelector(selector);
    if (type !== "raw") {
      // Has a prefix, use unified selector parsing
      const matcher = selectorToDetoxMatcher(selector);
      logger.debug(`Resolved unified selector: ${selector} → Detox ${type} matcher`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Detox matcher type is dynamic
      return element(matcher);
    }
    // No prefix, treat as test ID (backward compatible)
    return element(by.id(selector));
  }

  // This should never happen due to TypeScript types, but handle it gracefully
  logger.warn(
    `Unexpected selector type: ${typeof selector}. Converting to string and using by.id()`
  );
  return element(by.id(String(selector)));
}

export class DetoxActions extends BaseActions {
  private platform: "ios" | "android";

  constructor() {
    super();
    const p = (process.env.TEST_PLATFORM || "ios").toLowerCase();
    this.platform = p === "android" ? "android" : "ios";
    currentPlatform = this.platform;
    logger.debug(`[DetoxActions] platform = ${this.platform}`);
  }

  // Navigation
  async navigateTo(_url?: string): Promise<void> {
    logger.info("Launching app with Detox");
    await device.launchApp({
      newInstance: true,
      launchArgs: {
        detoxURLBlacklistRegex: '\\("https://client3.google.com*")',
        detoxEnableSynchronization: 0,
      },
      permissions: {
        location: "always",
        notifications: "YES",
        photos: "YES",
        microphone: "YES",
        calendar: "YES",
      },
    });
  }

  // Element interactions
  async click(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(`Clicking element: ${typeof selector === "string" ? selector : "custom matcher"}`);
    await elem.tap();
  }

  async doubleClick(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Double clicking element: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    await elem.multiTap(2);
  }

  async longPress(selector: DetoxSelector, duration = 1000): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Long pressing element: ${typeof selector === "string" ? selector : "custom matcher"} for ${duration}ms`
    );
    await elem.longPress(duration);
  }

  // Input
  async typeText(selector: DetoxSelector, text: string): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Typing text into element: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    await elem.replaceText(text);
  }

  async clearText(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Clearing text from element: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    await elem.clearText();
  }

  async getText(selector: DetoxSelector): Promise<string> {
    const elem = resolveElement(selector);
    logger.debug(
      `Getting text from element: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    const attribute = await elem.getAttributes();
    return (attribute as any).text || "";
  }

  /**
   * 获取元素属性
   * @param selector - 元素选择器
   * @param attrName - 可选，指定属性名则返回单个值(string)；不传则返回完整属性对象
   */
  async getAttributes(selector: TSelector): Promise<Record<string, unknown>>;
  async getAttributes(selector: TSelector, attrName: string): Promise<string>;
  async getAttributes(
    selector: DetoxSelector,
    attrName?: string
  ): Promise<Record<string, unknown> | string> {
    const elem = resolveElement(selector);
    logger.debug(
      `Getting attributes from element: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    const attrs = await elem.getAttributes();
    if (attrName !== undefined) {
      return String((attrs as any)[attrName] ?? "");
    }
    return attrs as Record<string, unknown>;
  }

  // Assertions
  /**
   * Wait for element to be visible (default) or not visible
   * @param selector - Element selector
   * @param timeout - Timeout in milliseconds (default: 10000)
   * @param isNotVisible - If true, wait for element to NOT be visible (default: false)
   */
  async waitForElement(
    selector: DetoxSelector,
    timeout = 10000,
    isNotVisible = false
  ): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Waiting for element to be ${isNotVisible ? "not " : ""}visible: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    if (isNotVisible) {
      await waitFor(elem).not.toBeVisible().withTimeout(timeout);
    } else {
      await waitFor(elem).toBeVisible().withTimeout(timeout);
    }
  }

  /**
   * Wait for element to exist in the UI hierarchy (may not be visible)
   * @param selector - Element selector
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForElementToExist(selector: DetoxSelector, timeout = 10000): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Waiting for element to exist: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
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
    direction: "up" | "down" | "left" | "right" = "down",
    _scrollAmount: number = 50,
    timeout = 15000
  ): Promise<void> {
    const targetElem = resolveElement(targetSelector);
    logger.debug(`Waiting for element while scrolling ${direction}`);

    // Resolve scroll container to a Detox NativeMatcher
    // whileElement requires a matcher object, not an element (Detox API limitation)
    const scrollMatcher: Detox.NativeMatcher = (() => {
      if (isChainableSelector(scrollContainerSelector)) {
        return resolveCompoundForDetox(
          scrollContainerSelector.toNode()
        ) as unknown as Detox.NativeMatcher;
      }
      if (typeof scrollContainerSelector === "string") {
        return selectorToDetoxMatcher(scrollContainerSelector) as Detox.NativeMatcher;
      }
      return scrollContainerSelector as unknown as Detox.NativeMatcher;
    })();
    await waitFor(targetElem)
      .toBeVisible()
      .whileElement(scrollMatcher)
      .scroll(_scrollAmount, direction);
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
      condition?: "visible" | "exist" | "enabled";
    } = {}
  ): Promise<void> {
    const { timeout = 10000, pollingInterval = 500, condition = "visible" } = options;
    const elem = resolveElement(selector);
    const startTime = Date.now();

    logger.debug(
      `Waiting for element with retry (${condition}): ${typeof selector === "string" ? selector : "custom matcher"}`
    );

    while (Date.now() - startTime < timeout) {
      try {
        const attributes = await elem.getAttributes();

        switch (condition) {
          case "visible":
            if ((attributes as any).visible !== false) {
              logger.debug("Element is visible");
              return;
            }
            break;
          case "exist":
            if (attributes) {
              logger.debug("Element exists");
              return;
            }
            break;
          case "enabled":
            if ((attributes as any).enabled !== false) {
              logger.debug("Element is enabled");
              return;
            }
            break;
        }
      } catch (error) {
        // Element not found yet, continue polling
        logger.debug("Element not ready, retrying...");
      }

      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
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
        throw new Error(
          `Failed to wait for element ${index + 1}: ${error instanceof Error ? error.message : String(error)}`
        );
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
      await new Promise((resolve) => setTimeout(resolve, 100));
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
    logger.debug(
      `Waiting for element to disappear: ${typeof selector === "string" ? selector : "custom matcher"}`
    );

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        await detoxExpect(elem).not.toBeVisible();
        logger.debug("Element is not visible");
        return;
      } catch (error) {
        // Element still visible, continue waiting
        await new Promise((resolve) => setTimeout(resolve, 100));
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
        const actualText = (attributes as any).text || "";

        if (actualText.includes(expectedText)) {
          logger.debug(`Found expected text: "${expectedText}"`);
          return;
        }
      } catch (error) {
        // Element not ready or text not available yet
        logger.debug("Text not available yet, retrying...");
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
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
          logger.debug("Element is enabled");
          return;
        }
      } catch (error) {
        logger.debug("Element not ready, retrying...");
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error(`Element did not become enabled within ${timeout}ms`);
  }

  async expectVisible(selector: DetoxSelector, isNotVisible = false): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Expecting element ${isNotVisible ? "not " : ""}visible: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    if (isNotVisible) {
      await detoxExpect(elem).not.toBeVisible();
    } else {
      await detoxExpect(elem).toBeVisible();
    }
  }

  async expectNotVisible(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Expecting element not visible: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    await detoxExpect(elem).not.toBeVisible();
  }

  /**
   * 验证元素存在于 UI 层级中（可能不可见）
   */
  async expectExist(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Expecting element to exist: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    await detoxExpect(elem).toExist();
  }

  /**
   * 验证元素不存在于 UI 层级中
   */
  async expectNotExist(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Expecting element to not exist: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    await detoxExpect(elem).not.toExist();
  }

  async expectText(selector: DetoxSelector, text: string | RegExp): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Expecting text in element: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    if (text instanceof RegExp) {
      // Detox 不支持正则断言，用 getAttributes 获取实际文本后自行匹配
      const attrs = await elem.getAttributes();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const actual = String((attrs as any).text ?? "");
      if (!text.test(actual)) {
        throw new Error(`Expected text to match /${text.source}/ but got "${actual}"`);
      }
    } else {
      await detoxExpect(elem).toHaveText(text);
    }
  }

  async expectContainsText(selector: DetoxSelector, text: string): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Expecting element contains text: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    await detoxExpect(elem).toHaveLabel(text);
  }

  async expectEnabled(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Expecting element enabled: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    const attribute = await elem.getAttributes();
    const isEnabled = (attribute as any).enabled !== false;
    if (!isEnabled) {
      throw new Error(`Element is not enabled`);
    }
  }

  async expectDisabled(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    logger.debug(
      `Expecting element disabled: ${typeof selector === "string" ? selector : "custom matcher"}`
    );
    const attribute = await elem.getAttributes();
    const isEnabled = (attribute as any).enabled !== false;
    if (isEnabled) {
      throw new Error(`Element is not disabled`);
    }
  }

  async expectNotText(selector: DetoxSelector, text: string | RegExp): Promise<void> {
    const elem = resolveElement(selector);
    const selName = typeof selector === "string" ? selector : "custom matcher";
    logger.debug(`Expecting text NOT to match in element: ${selName}`);
    if (text instanceof RegExp) {
      const attrs = await elem.getAttributes();
      const actual = String((attrs as any).text ?? "");
      if (text.test(actual)) {
        throw new Error(
          `Assertion Failed: expectNotText\n  Selector: "${selName}"\n  Expected: NOT /${text.source}/\n  Actual:   "${actual}"`
        );
      }
    } else {
      // 使用 detoxExpect + not 来断言文本不匹配
      try {
        await detoxExpect(elem).toHaveText(text);
        // 如果没抛错，说明文本匹配了，断言失败
        throw new Error(
          `Assertion Failed: expectNotText\n  Selector: "${selName}"\n  Expected: NOT "${text}"\n  Actual:   "${text}"`
        );
      } catch (e: any) {
        // 如果是因为 toHaveText 断言失败（即文本不匹配），则断言成功
        if (e.message && e.message.includes("expectNotText")) {
          throw e;
        }
        // toHaveText 断言失败 = 文本不匹配 = 断言成功
      }
    }
  }

  async expectAttribute(
    selector: DetoxSelector,
    attrName: string,
    expectedValue: string | RegExp
  ): Promise<void> {
    const elem = resolveElement(selector);
    const selName = typeof selector === "string" ? selector : "custom matcher";
    logger.debug(`Expecting attribute ${attrName} on element: ${selName}`);
    const attrs = await elem.getAttributes();
    const actualValue = String((attrs as any)[attrName] ?? "");
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

  async expectValue(selector: DetoxSelector, expectedValue: string): Promise<void> {
    const elem = resolveElement(selector);
    const selName = typeof selector === "string" ? selector : "custom matcher";
    logger.debug(`Expecting value on element: ${selName}`);
    const attrs = await elem.getAttributes();
    const actualValue = String((attrs as any).value ?? (attrs as any).text ?? "");
    if (actualValue !== expectedValue) {
      throw new Error(
        `Assertion Failed: expectValue\n  Selector: "${selName}"\n  Expected: "${expectedValue}"\n  Actual:   "${actualValue}"`
      );
    }
  }

  async expectCount(selector: DetoxSelector, count: number): Promise<void> {
    const selName = typeof selector === "string" ? selector : "custom matcher";
    logger.debug(`Expecting element count: ${selName}`);
    // Detox 不支持直接查询匹配元素数量，通过尝试解析元素判断是否存在
    // 对于精确计数场景，使用 atIndex 逐个探测
    let actualCount = 0;
    if (typeof selector === "string") {
      // 尝试逐步索引探测
      for (let i = 0; i < count + 5; i++) {
        try {
          const elem = element(by.id(selector)).atIndex(i);
          await detoxExpect(elem).toExist();
          actualCount++;
        } catch {
          break;
        }
      }
    } else {
      // 非字符串选择器，尝试单个元素探测
      try {
        const elem = resolveElement(selector);
        await detoxExpect(elem).toExist();
        actualCount = 1;
      } catch {
        actualCount = 0;
      }
    }
    if (actualCount !== count) {
      throw new Error(
        `Assertion Failed: expectCount\n  Selector: "${selName}"\n  Expected: ${count}\n  Actual:   ${actualCount}`
      );
    }
  }

  async expectFocused(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    const selName = typeof selector === "string" ? selector : "custom matcher";
    logger.debug(`Expecting element focused: ${selName}`);
    const attrs = await elem.getAttributes();
    const isFocused = (attrs as any).focused === true;
    if (!isFocused) {
      throw new Error(
        `Assertion Failed: expectFocused\n  Selector: "${selName}"\n  Element is not focused`
      );
    }
  }

  async expectNotFocused(selector: DetoxSelector): Promise<void> {
    const elem = resolveElement(selector);
    const selName = typeof selector === "string" ? selector : "custom matcher";
    logger.debug(`Expecting element not focused: ${selName}`);
    const attrs = await elem.getAttributes();
    const isFocused = (attrs as any).focused === true;
    if (isFocused) {
      throw new Error(
        `Assertion Failed: expectNotFocused\n  Selector: "${selName}"\n  Element is focused`
      );
    }
  }

  // Gestures
  async swipe(direction: "up" | "down" | "left" | "right", _distance?: number): Promise<void> {
    logger.debug(`Swiping ${direction}`);
    await element(by.type("UIScrollView")).swipe(direction, "fast", NaN, 0.5, 0.5);
  }

  async scroll(toSelector: DetoxSelector): Promise<void> {
    const elem = resolveElement(toSelector);
    logger.debug(
      `Scrolling to element: ${typeof toSelector === "string" ? toSelector : "custom matcher"}`
    );
    await elem.scrollTo("bottom");
  }

  async pinch(scale: number, speed: "slow" | "fast" = "fast", angle: number = 0): Promise<void> {
    logger.debug(`Pinching with scale: ${scale}, speed: ${speed}, angle: ${angle}`);
    await element(by.type("UIView")).pinch(scale, speed, angle);
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Detox matcher type is dynamic
      combined = combined.and(matcher);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Detox matcher type is dynamic
    return element(combined);
  }

  // Utilities
  async takeScreenshot(name: string): Promise<string> {
    logger.debug(`Taking screenshot: ${name}`);
    const path = await device.takeScreenshot(name);
    return await resizeScreenshot(path);
  }

  /**
   * Detox 录屏由 artifacts video 插件接管（configs/mobile.config.local.js detox.artifacts.plugins.video），
   * 此方法为接口兼容占位，实际录屏产物（.mp4）由 DetoxAllureReporter 在 onRunComplete 收集。
   */
  async startRecording(): Promise<void> {
    logger.debug("[Detox] 录屏由 artifacts video 插件接管，startRecording 为 no-op");
    return Promise.resolve();
  }

  /**
   * Detox 录屏由 artifacts video 插件接管，此方法为接口兼容占位。
   * 实际录屏产物（.mp4）由 DetoxAllureReporter 在 onRunComplete 从 artifacts/detox 收集。
   */
  async stopRecording(): Promise<Buffer | null> {
    logger.debug("[Detox] 录屏由 artifacts video 插件接管，stopRecording 为 no-op");
    return Promise.resolve(null);
  }

  async reload(): Promise<void> {
    logger.info("Reloading app");
    await device.reloadReactNative();
  }

  async back(): Promise<void> {
    logger.info("Going back");
    await device.pressBack();
  }

  async close(): Promise<void> {
    logger.info("Closing app");
    await device.terminateApp();
  }

  // Device
  async setOrientation(orientation: "portrait" | "landscape"): Promise<void> {
    logger.info(`Setting orientation to: ${orientation}`);
    await device.setOrientation(orientation);
  }

  async setLocation(latitude: number, longitude: number): Promise<void> {
    logger.info(`Setting location to: ${latitude}, ${longitude}`);
    await device.setLocation(latitude, longitude);
  }
}
