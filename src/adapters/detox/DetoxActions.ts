import { BaseActions } from "@contracts/BaseActions";
import type { IActions } from "@contracts/IActions";
import type {
  DateFormat,
  Direction,
  Edge,
  ElementAttributes,
  GestureSpeed,
  Point,
} from "@contracts/types";

// Detox is shipped as `export = Detox`, so we import the namespace as a type
// and reference its real element/type definitions instead of re-declaring a
// duplicate structural interface.
import { Logger } from "@utils/logger";

// Module-level logger; shared singleton from @utils/logger.
const logger = Logger.getInstance();

/**
 * `DetoxActions` adapts the platform-agnostic {@link IActions} contract to
 * Detox's native element API.
 *
 * Detox's fluent API returns the element (or an expectation) from every call,
 * and the action is dispatched when the returned promise is awaited. This
 * adapter simply awaits those promises. Assertions are routed through Detox's
 * `expect(element)` facade (e.g. `element.toBeVisible()` does not exist on the
 * element itself).
 */
export class DetoxActions extends BaseActions {
  protected readonly adapterName = "DetoxActions";

  /** The underlying Detox element handle. */
  private readonly native: Detox.NativeElement;

  /** Detox's `expect` facade, resolved lazily from the `detox` module. */
  private expectFacade: Detox.ExpectFacade | undefined;

  constructor(native: Detox.NativeElement, description: string) {
    super(description);
    this.native = native;
  }

  protected resolve(): unknown {
    return this.native;
  }

  /** Lazily obtain Detox's `expect` facade. */
  private get expect(): Detox.ExpectFacade {
    if (!this.expectFacade) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.expectFacade = require("detox").expect as Detox.ExpectFacade;
    }
    return this.expectFacade;
  }

  /** Detox's `waitFor` facade, resolved lazily from the `detox` module. */
  private waitForFacade: Detox.WaitForFacade | undefined;

  /** Lazily obtain Detox's `waitFor` facade. */
  private get waitFor(): Detox.WaitForFacade {
    if (!this.waitForFacade) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.waitForFacade = require("detox").waitFor as Detox.WaitForFacade;
    }
    return this.waitForFacade;
  }

  /* --------------------------- tap / press ------------------------------ */

  async tap(point?: Point): Promise<void> {
    logger.debug(`tap(${JSON.stringify(point)}) on ${this.description}`);
    await this.native.tap(point);
  }

  async multiTap(times: number): Promise<void> {
    this.assertGreaterThanOrEqual(times, 1, "times");
    await this.native.multiTap(times);
  }

  async longPress(point?: Point, duration?: number): Promise<void> {
    if (point !== undefined) {
      if (duration !== undefined) {
        await this.native.longPress(point, duration);
      } else {
        await this.native.longPress(point);
      }
    } else if (duration !== undefined) {
      this.assertPositive(duration, "duration");
      await this.native.longPress(duration);
    } else {
      await this.native.longPress();
    }
  }

  async longPressAndDrag(
    duration: number,
    sourceX: number,
    sourceY: number,
    target: IActions,
    targetX: number,
    targetY: number,
    speed?: GestureSpeed,
    holdDuration?: number
  ): Promise<void> {
    this.assertPositive(duration, "duration");
    const targetNative = (target as DetoxActions).native;
    await this.native.longPressAndDrag(
      duration,
      sourceX,
      sourceY,
      targetNative,
      targetX,
      targetY,
      speed ?? "fast",
      holdDuration ?? 0
    );
  }

  /* ----------------------------- gestures ------------------------------- */

  async swipe(
    direction: Direction,
    speed?: GestureSpeed,
    normalizedOffset?: number,
    startX?: number,
    startY?: number
  ): Promise<void> {
    await this.native.swipe(direction, speed, normalizedOffset, startX, startY);
  }

  async pinch(scale: number, speed?: GestureSpeed, angle?: number): Promise<void> {
    this.assertPositive(scale, "scale");
    await this.native.pinch(scale, speed, angle);
  }

  /* ------------------------------ scroll -------------------------------- */

  async scroll(
    offset: number,
    direction: Direction,
    startX?: number,
    startY?: number
  ): Promise<void> {
    this.assertPositive(offset, "offset");
    await this.native.scroll(offset, direction, startX, startY);
  }

  async scrollTo(edge: Edge, startX?: number, startY?: number): Promise<void> {
    await this.native.scrollTo(edge, startX, startY);
  }

  async scrollToIndex(index: number): Promise<void> {
    this.assertGreaterThanOrEqual(index, 0, "index");
    await this.native.scrollToIndex(index);
  }

  /* ---------------------------- text input ------------------------------ */

  async typeText(text: string): Promise<void> {
    this.assertNonEmpty(text, "text");
    logger.debug(`typeText on ${this.description}`);
    await this.native.typeText(text);
  }

  async replaceText(text: string): Promise<void> {
    await this.native.replaceText(text);
  }

  async clearText(): Promise<void> {
    await this.native.clearText();
  }

  async tapReturnKey(): Promise<void> {
    await this.native.tapReturnKey();
  }

  async tapBackspaceKey(): Promise<void> {
    await this.native.tapBackspaceKey();
  }

  /* -------------------------- pickers / sliders ------------------------- */

  async setColumnToValue(column: number, value: string): Promise<void> {
    this.assertGreaterThanOrEqual(column, 0, "column");
    this.assertNonEmpty(value, "value");
    await this.native.setColumnToValue(column, value);
  }

  async setDatePickerDate(dateString: string, dateFormat: DateFormat): Promise<void> {
    this.assertNonEmpty(dateString, "dateString");
    this.assertNonEmpty(dateFormat, "dateFormat");
    await this.native.setDatePickerDate(dateString, dateFormat);
  }

  async adjustSliderToPosition(normalizedPosition: number): Promise<void> {
    this.assertInRange(normalizedPosition, 0, 1, "normalizedPosition");
    await this.native.adjustSliderToPosition(normalizedPosition);
  }

  /* ------------------------------- misc --------------------------------- */

  async performAccessibilityAction(actionName: string): Promise<void> {
    this.assertNonEmpty(actionName, "actionName");
    await this.native.performAccessibilityAction(actionName);
  }

  async takeScreenshot(name: string): Promise<string> {
    this.assertNonEmpty(name, "name");
    return this.native.takeScreenshot(name);
  }

  async getAttributes(): Promise<ElementAttributes> {
    // Detox returns a platform-specific union; normalize to our contract type.
    return (await this.native.getAttributes()) as ElementAttributes;
  }

  /* ---------------------------- expectations ---------------------------- */

  async isVisible(timeoutMs = 2000): Promise<boolean> {
    // Detox rejects (via waitFor) when the element is not visible within the
    // timeout — that is a legitimate "not visible", so return false. BUT a bare
    // `catch { return false }` would also swallow real failures (detox not
    // initialized, invalid element handle, programming errors), masking bugs.
    // We therefore only treat a *visibility-condition* failure as "not visible"
    // and rethrow anything else.
    // NOTE: `.withTimeout()` belongs to `waitFor(...)`, not `expect(...)`.
    try {
      await this.waitFor(this.native).toBeVisible().withTimeout(timeoutMs);
      return true;
    } catch (err) {
      if (this.isVisibilityConditionFailure(err)) {
        logger.debug(`isVisible(${this.description}) -> false after ${timeoutMs}ms`);
        return false;
      }
      throw err;
    }
  }

  /**
   * Decide whether an error from `waitFor(...).toBeVisible().withTimeout()` is a
   * "condition not met" (element absent / not visible) versus a real failure.
   * Condition failures are Detox's own error classes or visibility-wait messages;
   * everything else (e.g. detox not initialized, bad handle) is rethrown.
   */
  private isVisibilityConditionFailure(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const e = err as { name?: string; message?: string };
    if ((e.name ?? "").includes("Detox")) return true;
    return /timed out|WaitFor|not (visible|found)|could not be (located|matched)/i.test(
      e.message ?? ""
    );
  }

  async toBeVisible(percent?: number): Promise<void> {
    if (percent !== undefined) this.assertInRange(percent, 1, 100, "percent");
    logger.debug(`expect toBeVisible(${percent ?? ""}) on ${this.description}`);
    await this.expect(this.native).toBeVisible(percent);
  }

  async toExist(): Promise<void> {
    await this.expect(this.native).toExist();
  }

  async toBeFocused(): Promise<void> {
    await this.expect(this.native).toBeFocused();
  }

  async toHaveText(text: string): Promise<void> {
    this.assertNonEmpty(text, "text");
    await this.expect(this.native).toHaveText(text);
  }

  async toHaveLabel(label: string): Promise<void> {
    this.assertNonEmpty(label, "label");
    await this.expect(this.native).toHaveLabel(label);
  }

  async toHaveId(id: string): Promise<void> {
    this.assertNonEmpty(id, "id");
    await this.expect(this.native).toHaveId(id);
  }

  async toHaveValue(value: string): Promise<void> {
    await this.expect(this.native).toHaveValue(value);
  }

  async toHaveSliderPosition(normalizedPosition: number, tolerance?: number): Promise<void> {
    this.assertInRange(normalizedPosition, 0, 1, "normalizedPosition");
    if (tolerance !== undefined) this.assertPositive(tolerance, "tolerance");
    await this.expect(this.native).toHaveSliderPosition(normalizedPosition, tolerance);
  }

  async toHaveToggleValue(value: boolean): Promise<void> {
    await this.expect(this.native).toHaveToggleValue(value);
  }
}
