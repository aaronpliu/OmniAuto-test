import { BaseActions } from "@contracts/BaseActions";
import type { IActions } from "@contracts/IActions";
import type { Direction, Edge, ElementAttributes, GestureSpeed, Point } from "@contracts/types";
import { Logger } from "@utils/logger";

const logger = Logger.getInstance();

/* -------------------------------------------------------------------------- */
/* Minimal local types for the WebdriverIO (Appium) client.                   */
/* We deliberately avoid importing `@types/wdio` so the adapter compiles even */
/* when Appium is not installed in the host project; the real client is        */
/* required lazily at runtime (see `getDriver`).                              */
/* -------------------------------------------------------------------------- */

interface AppiumElement {
  click(opts?: { x?: number; y?: number }): Promise<void>;
  touchAction(actions: AppiumTouchAction[]): Promise<void>;
  setValue(value: string): Promise<void>;
  addValue(value: string): Promise<void>;
  clearValue(): Promise<void>;
  getText(): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
  getValue(): Promise<string>;
  isDisplayed(): Promise<boolean>;
  isExisting(): Promise<boolean>;
  isFocused(): Promise<boolean>;
  saveScreenshot(path: string): Promise<string>;
  waitForExist(opts?: { timeout?: number }): Promise<boolean>;
  elementId: string;
}

interface AppiumTouchAction {
  action: "press" | "longPress" | "tap" | "move" | "wait" | "release";
  x?: number;
  y?: number;
  count?: number;
  duration?: number;
  element?: AppiumElement;
}

interface AppiumDriver {
  $(selector: string): Promise<AppiumElement>;
  touchAction(elem: AppiumElement, actions: AppiumTouchAction[]): Promise<void>;
  keys(key: string): Promise<void>;
  execute(script: string, args: unknown): Promise<unknown>;
  capabilities?: { platformName?: string };
  launchApp(): Promise<void>;
  restartApp?(): Promise<void>;
  // WebdriverIO's declarative wait — the Appium equivalent of Detox's
  // waitFor(element).toBeVisible().withTimeout(ms). Re-runs condition until it
  // holds or `timeout` elapses; rejects (TimeoutError) on timeout.
  waitUntil(
    condition: () => Promise<boolean>,
    options: { timeout?: number; timeoutMsg?: string; interval?: number }
  ): Promise<boolean>;
}

/** Resolve the global WebdriverIO `driver` (set by the wdio runner). */
function getDriver(): AppiumDriver {
  const driver = (globalThis as { driver?: AppiumDriver }).driver;
  if (!driver) {
    throw new Error(
      "[AppiumActions] WebdriverIO `driver` is not available — run under the wdio runner"
    );
  }
  return driver;
}

/** Best-effort platform detection for selector construction. */
function isIOS(): boolean {
  const platform = getDriver().capabilities?.platformName?.toLowerCase() ?? "";
  return platform.includes("ios");
}

/**
 * Appium (WebdriverIO) implementation of the driver-agnostic {@link IActions}
 * contract.
 *
 * The element handle is fetched lazily from the selector on first use, so
 * {@link resolve} can stay synchronous (matching the {@link IMatcherFactory}
 * shape) even though WebdriverIO resolves elements asynchronously.
 *
 * Methods the WebdriverIO client cannot perform natively (pinch, date-picker,
 * slider…) throw {@link NotSupportedError} rather than silently no-op, keeping
 * contract failures visible.
 */
export class AppiumActions extends BaseActions {
  private readonly selector: string;

  protected readonly adapterName = "AppiumActions";

  constructor(selector: string, description: string) {
    super(description);
    this.selector = selector;
  }

  protected resolve(): unknown {
    // The "native handle" is just the selector; the real element is fetched on
    // demand via {@link element}.
    return this.selector;
  }

  /** Fetch the live WebdriverIO element for this selector. */
  async element(): Promise<AppiumElement> {
    return getDriver().$(this.selector);
  }

  /* --------------------------- tap / press ------------------------------ */

  async tap(point?: Point): Promise<void> {
    logger.debug(`tap(${JSON.stringify(point)}) on ${this.description}`);
    const elem = await this.element();
    if (point) {
      await getDriver().touchAction(elem, [{ action: "tap", x: point.x, y: point.y }]);
    } else {
      await elem.click();
    }
  }

  async multiTap(times: number): Promise<void> {
    this.assertGreaterThanOrEqual(times, 1, "times");
    const elem = await this.element();
    await getDriver().touchAction(elem, [{ action: "tap", count: times }]);
  }

  async longPress(point?: Point, duration?: number): Promise<void> {
    const elem = await this.element();
    const actions: AppiumTouchAction[] = [
      {
        action: "longPress",
        ...(point ? { x: point.x, y: point.y } : {}),
        ...(duration !== undefined ? { duration } : {}),
      },
    ];
    await getDriver().touchAction(elem, actions);
  }

  async longPressAndDrag(
    duration: number,
    sourceX: number,
    sourceY: number,
    target: IActions,
    targetX: number,
    targetY: number
  ): Promise<void> {
    this.assertPositive(duration, "duration");
    const source = await this.element();
    const targetElem = await (target as AppiumActions).element();
    await getDriver().touchAction(source, [
      { action: "longPress", x: sourceX, y: sourceY, duration },
      { action: "move", element: targetElem, x: targetX, y: targetY },
      { action: "release" },
    ]);
  }

  /* ----------------------------- gestures ------------------------------- */

  async swipe(
    direction: Direction,
    speed?: GestureSpeed,
    normalizedOffset?: number,
    startX?: number,
    startY?: number
  ): Promise<void> {
    void speed;
    const elem = await this.element();
    const offset = (normalizedOffset ?? 0.75) * 100;
    const x = startX ?? 50;
    const y = startY ?? 50;
    const delta: Record<Direction, { x: number; y: number }> = {
      left: { x: -offset, y: 0 },
      right: { x: offset, y: 0 },
      up: { x: 0, y: -offset },
      down: { x: 0, y: offset },
    };
    const d = delta[direction];
    await getDriver().touchAction(elem, [
      { action: "press", x, y },
      { action: "move", x: x + d.x, y: y + d.y },
      { action: "release" },
    ]);
  }

  /* ------------------------------ scroll -------------------------------- */

  async scroll(offset: number, direction: Direction): Promise<void> {
    this.assertPositive(offset, "offset");
    // Map swipe-style Direction onto scroll-style Edge.
    const edge: Edge = direction === "up" ? "top" : direction === "down" ? "bottom" : direction;
    await this.scrollTo(edge);
  }

  async scrollTo(edge: Edge): Promise<void> {
    const elem = await this.element();
    const wdioEdge = edge === "top" ? "up" : edge === "bottom" ? "down" : edge;
    await getDriver().execute("mobile: scroll", {
      elementId: elem.elementId,
      direction: wdioEdge,
    });
  }

  /* ---------------------------- text input ------------------------------ */

  async typeText(text: string): Promise<void> {
    this.assertNonEmpty(text, "text");
    logger.debug(`typeText on ${this.description}`);
    const elem = await this.element();
    await elem.setValue(text);
  }

  async replaceText(text: string): Promise<void> {
    const elem = await this.element();
    await elem.setValue(text);
  }

  async clearText(): Promise<void> {
    const elem = await this.element();
    await elem.clearValue();
  }

  async tapReturnKey(): Promise<void> {
    await getDriver().keys("Enter");
  }

  async tapBackspaceKey(): Promise<void> {
    await getDriver().keys("Backspace");
  }

  /* -------------------------- pickers / sliders ------------------------- */
  // pinch / scrollToIndex / setColumnToValue / setDatePickerDate /
  // adjustSliderToPosition are optional actions inherited from BaseActions as
  // NotSupportedError (WebdriverIO/Appium cannot service them natively).

  /* ------------------------------- misc --------------------------------- */
  // performAccessibilityAction is an optional action inherited from BaseActions
  // as NotSupportedError (WebdriverIO/Appium cannot service it natively).

  async takeScreenshot(name: string): Promise<string> {
    this.assertNonEmpty(name, "name");
    const elem = await this.element();
    return elem.saveScreenshot(`${name}.png`);
  }

  async getAttributes(): Promise<ElementAttributes> {
    const elem = await this.element();
    const [text, label, value, identifier, visible, enabled] = await Promise.all([
      elem.getText().catch(() => undefined),
      elem.getAttribute(isIOS() ? "label" : "content-desc").catch(() => undefined),
      elem.getValue().catch(() => undefined),
      elem.getAttribute(isIOS() ? "name" : "resource-id").catch(() => undefined),
      elem.isDisplayed().catch(() => undefined),
      elem.isExisting().catch(() => undefined),
    ]);
    return {
      text,
      label: label ?? undefined,
      identifier: identifier ?? undefined,
      value,
      visible,
      enabled,
    } as ElementAttributes;
  }

  /* ---------------------------- expectations ---------------------------- */

  async isVisible(timeoutMs = 0): Promise<boolean> {
    // timeoutMs <= 0: probe the current state, no waiting.
    if (timeoutMs <= 0) {
      try {
        return await (await this.element()).isDisplayed();
      } catch (err) {
        if (this.isVisibilityConditionFailure(err)) return false;
        throw err; // real failure (driver not ready, bad handle) — do not mask
      }
    }

    // timeoutMs > 0: wait up to `timeoutMs` for the element to become displayed.
    // Use WebdriverIO's declarative `waitUntil` (the Appium equivalent of Detox's
    // waitFor(element).toBeVisible().withTimeout(ms)). It re-runs the condition
    // on its own interval — re-resolving the element each time — so it covers
    // BOTH "element not yet present" and "present but hidden", and only rejects
    // (TimeoutError) once the budget is exhausted. A hand-rolled sleep loop would
    // bail early on the first `no such element` from element() and never wait.
    try {
      await getDriver().waitUntil(async () => (await this.element()).isDisplayed(), {
        timeout: timeoutMs,
        timeoutMsg: `${this.description} to become visible`,
      });
      return true;
    } catch (err) {
      if (this.isVisibilityConditionFailure(err)) return false;
      throw err;
    }
  }

  /**
   * Whether an error means "element absent / not visible / wait timed out"
   * (-> return false) versus a real failure (driver not ready, invalid handle,
   * programming error) that must be rethrown so the root cause is not masked.
   * Covers both the immediate `element()` throw and a `waitUntil` timeout.
   */
  private isVisibilityConditionFailure(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const e = err as { name?: string; message?: string };
    const message = (e.message ?? "").toLowerCase();
    return /no such element|stale element|not (visible|found)|timed out|could not be (located|matched)|wait until|waituntil|to become visible/.test(
      message
    );
  }

  async toBeVisible(): Promise<void> {
    const elem = await this.element();
    if (!(await elem.isDisplayed())) {
      throw new Error(`[${this.description}] expected element to be visible`);
    }
  }

  async toExist(): Promise<void> {
    const elem = await this.element();
    if (!(await elem.waitForExist({ timeout: 2000 }))) {
      throw new Error(`[${this.description}] expected element to exist`);
    }
  }

  async toBeFocused(): Promise<void> {
    const elem = await this.element();
    if (!(await elem.isFocused())) {
      throw new Error(`[${this.description}] expected element to be focused`);
    }
  }

  async toHaveText(text: string): Promise<void> {
    this.assertNonEmpty(text, "text");
    const elem = await this.element();
    const actual = (await elem.getText()).trim();
    if (actual !== text) {
      throw new Error(`[${this.description}] expected text "${text}", got "${actual}"`);
    }
  }

  async toHaveLabel(label: string): Promise<void> {
    this.assertNonEmpty(label, "label");
    const elem = await this.element();
    const actual = (await elem.getAttribute(isIOS() ? "label" : "content-desc")) ?? "";
    if (actual !== label) {
      throw new Error(`[${this.description}] expected label "${label}", got "${actual}"`);
    }
  }

  async toHaveId(id: string): Promise<void> {
    this.assertNonEmpty(id, "id");
    const elem = await this.element();
    const actual = (await elem.getAttribute(isIOS() ? "name" : "resource-id")) ?? "";
    if (actual !== id) {
      throw new Error(`[${this.description}] expected id "${id}", got "${actual}"`);
    }
  }

  async toHaveValue(value: string): Promise<void> {
    const elem = await this.element();
    const actual = (await elem.getValue()) ?? "";
    if (actual !== value) {
      throw new Error(`[${this.description}] expected value "${value}", got "${actual}"`);
    }
  }

  // toHaveSliderPosition / toHaveToggleValue are optional actions inherited
  // from BaseActions as NotSupportedError (WebdriverIO/Appium cannot service
  // them natively).
}
