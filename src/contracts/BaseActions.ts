import type {
  DateFormat,
  Direction,
  Edge,
  ElementAttributes,
  GestureSpeed,
  Point,
} from './types';
import type { IActions } from './IActions';
import { Logger } from '@utils/logger';

// Module-level logger; shared singleton from @utils/logger.
const logger = Logger.getInstance();

/**
 * `BaseActions` is an abstract, driver-agnostic implementation of
 * {@link IActions}. It provides:
 *
 *  1. A single extension point — {@link resolve} — that concrete adapters
 *     override to return the driver-native element handle.
 *  2. Lightweight parameter normalization (e.g. massaging optional args into
 *     the `NaN`-based convention Detox expects) so subclasses stay thin.
 *  3. Common guards (argument validation) shared by every adapter.
 *
 * Concrete adapters (e.g. `DetoxActions`) only need to implement
 * {@link resolve} plus any platform-specific methods they can service
 * natively; everything else is delegated here.
 */
export abstract class BaseActions implements IActions {
  /** Human-readable description used in logs / error messages. */
  protected readonly description: string;

  protected constructor(description: string) {
    this.description = description;
  }

  /**
   * Return the driver-native element handle (e.g. Detox's `Element`).
   * Subclasses MUST implement this. The returned object is what concrete
   * action methods call `.tap()`, `.typeText()` … on.
   */
  protected abstract resolve(): unknown;

  /* --------------------------- guard helpers ---------------------------- */

  protected assertPositive(value: number, name: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`[${this.description}] ${name} must be a non-negative number, got ${value}`);
    }
  }

  protected assertGreaterThanOrEqual(value: number, min: number, name: string): void {
    if (!Number.isFinite(value) || value < min) {
      throw new Error(`[${this.description}] ${name} must be >= ${min}, got ${value}`);
    }
  }

  protected assertInRange(value: number, min: number, max: number, name: string): void {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`[${this.description}] ${name} must be within [${min}, ${max}], got ${value}`);
    }
  }

  protected assertNonEmpty(value: string, name: string): void {
    if (!value || value.trim().length === 0) {
      throw new Error(`[${this.description}] ${name} must be a non-empty string`);
    }
  }

  /* --------------------------- tap / press ------------------------------ */

  abstract tap(point?: Point): Promise<void>;

  /**
   * Tap the element only if it is currently visible; otherwise do nothing.
   * The default implementation probes with {@link isVisible} then calls
   * {@link tap}, so adapters only need to implement those two primitives.
   * Never throws when the element is absent. Returns whether the tap happened.
   */
  async tapIfExists(): Promise<boolean> {
    const visible = await this.isVisible();
    if (!visible) {
      logger.debug(`tapIfExists skipped on ${this.description} (not visible)`);
      return false;
    }
    await this.tap();
    return true;
  }

  abstract multiTap(times: number): Promise<void>;
  abstract longPress(point?: Point, duration?: number): Promise<void>;
  abstract longPressAndDrag(
    duration: number,
    sourceX: number,
    sourceY: number,
    target: IActions,
    targetX: number,
    targetY: number,
    speed?: GestureSpeed,
    holdDuration?: number,
  ): Promise<void>;

  /* ----------------------------- gestures ------------------------------- */

  abstract swipe(
    direction: Direction,
    speed?: GestureSpeed,
    normalizedOffset?: number,
    startX?: number,
    startY?: number,
  ): Promise<void>;

  abstract pinch(scale: number, speed?: GestureSpeed, angle?: number): Promise<void>;

  /* ------------------------------ scroll -------------------------------- */

  abstract scroll(offset: number, direction: Direction, startX?: number, startY?: number): Promise<void>;
  abstract scrollTo(edge: Edge, startX?: number, startY?: number): Promise<void>;
  abstract scrollToIndex(index: number): Promise<void>;

  /* ---------------------------- text input ------------------------------ */

  abstract typeText(text: string): Promise<void>;
  abstract replaceText(text: string): Promise<void>;
  abstract clearText(): Promise<void>;
  abstract tapReturnKey(): Promise<void>;
  abstract tapBackspaceKey(): Promise<void>;

  /* -------------------------- pickers / sliders ------------------------- */

  abstract setColumnToValue(column: number, value: string): Promise<void>;
  abstract setDatePickerDate(dateString: string, dateFormat: DateFormat): Promise<void>;
  abstract adjustSliderToPosition(normalizedPosition: number): Promise<void>;

  /* ------------------------------- misc --------------------------------- */

  abstract performAccessibilityAction(actionName: string): Promise<void>;
  abstract takeScreenshot(name: string): Promise<string>;
  abstract getAttributes(): Promise<ElementAttributes>;

  /* ---------------------------- expectations ---------------------------- */

  /** Probe whether the element is currently visible, without asserting. */
  abstract isVisible(): Promise<boolean>;

  abstract toBeVisible(percent?: number): Promise<void>;
  abstract toExist(): Promise<void>;
  abstract toBeFocused(): Promise<void>;
  abstract toHaveText(text: string): Promise<void>;
  abstract toHaveLabel(label: string): Promise<void>;
  abstract toHaveId(id: string): Promise<void>;
  abstract toHaveValue(value: string): Promise<void>;
  abstract toHaveSliderPosition(normalizedPosition: number, tolerance?: number): Promise<void>;
  abstract toHaveToggleValue(value: boolean): Promise<void>;
}
