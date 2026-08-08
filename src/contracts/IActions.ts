import type {
  DateFormat,
  Direction,
  Edge,
  ElementAttributes,
  GestureSpeed,
  Point,
} from './types';

/**
 * `IActions` defines the contract for every interaction that can be performed
 * against a resolved UI element, regardless of the underlying automation
 * driver (Detox, Appium, Espresso, XCUITest…).
 *
 * All methods are async because every real driver performs an over-the-wire
 * (or cross-process) round-trip to the device/simulator.
 */
export interface IActions {
  /* ---------------------------------------------------------------------- */
  /* Tap / press                                                            */
  /* ---------------------------------------------------------------------- */

  /** Tap the element's activation point. Optionally at a specific local point. */
  tap(point?: Point): Promise<void>;

  /** Tap the activation point `times` times as a single gesture. */
  multiTap(times: number): Promise<void>;

  /** Long press; optionally at a point and for a given duration (ms). */
  longPress(point?: Point, duration?: number): Promise<void>;

  /**
   * Long press and drag this element onto a target element.
   * Coordinates are normalized (0.0–1.0) relative to each element's size.
   */
  longPressAndDrag(
    duration: number,
    sourceX: number,
    sourceY: number,
    target: IActions,
    targetX: number,
    targetY: number,
    speed?: GestureSpeed,
    holdDuration?: number,
  ): Promise<void>;

  /* ---------------------------------------------------------------------- */
  /* Gestures                                                               */
  /* ---------------------------------------------------------------------- */

  /** Swipe in a direction. */
  swipe(
    direction: Direction,
    speed?: GestureSpeed,
    normalizedOffset?: number,
    startX?: number,
    startY?: number,
  ): Promise<void>;

  /** Pinch (iOS only). scale < 1 zooms out, > 1 zooms in. */
  pinch(scale: number, speed?: GestureSpeed, angle?: number): Promise<void>;

  /* ---------------------------------------------------------------------- */
  /* Scroll                                                                 */
  /* ---------------------------------------------------------------------- */

  /** Scroll by an absolute offset (points) in a direction. */
  scroll(offset: number, direction: Direction, startX?: number, startY?: number): Promise<void>;

  /** Scroll until the element reaches the given edge. */
  scrollTo(edge: Edge, startX?: number, startY?: number): Promise<void>;

  /** Scroll a list-like element to the item at `index` (Android only). */
  scrollToIndex(index: number): Promise<void>;

  /* ---------------------------------------------------------------------- */
  /* Text input                                                             */
  /* ---------------------------------------------------------------------- */

  /** Type text using the system keyboard. */
  typeText(text: string): Promise<void>;

  /** Replace text without using the keyboard. */
  replaceText(text: string): Promise<void>;

  /** Clear the current text. */
  clearText(): Promise<void>;

  /** Tap the keyboard return key. */
  tapReturnKey(): Promise<void>;

  /** Tap the keyboard backspace key. */
  tapBackspaceKey(): Promise<void>;

  /* ---------------------------------------------------------------------- */
  /* Pickers / sliders                                                      */
  /* ---------------------------------------------------------------------- */

  /** Set the value of a non-date picker column (iOS only). */
  setColumnToValue(column: number, value: string): Promise<void>;

  /** Set a date picker's value. */
  setDatePickerDate(dateString: string, dateFormat: DateFormat): Promise<void>;

  /** Move a slider to a normalized position (0.0–1.0). */
  adjustSliderToPosition(normalizedPosition: number): Promise<void>;

  /* ---------------------------------------------------------------------- */
  /* Misc                                                                   */
  /* ---------------------------------------------------------------------- */

  /** Trigger an accessibility action by name. */
  performAccessibilityAction(actionName: string): Promise<void>;

  /** Capture a screenshot of the element. Returns the path/identifier. */
  takeScreenshot(name: string): Promise<string>;

  /** Read the element's runtime attributes. */
  getAttributes(): Promise<ElementAttributes>;

  /* ---------------------------------------------------------------------- */
  /* Expectations / assertions                                              */
  /* ---------------------------------------------------------------------- */

  /** Assert the element is visible (optionally with a 1–100 visibility %). */
  toBeVisible(percent?: number): Promise<void>;

  /** Assert the element exists in the view hierarchy. */
  toExist(): Promise<void>;

  /** Assert the element is the current focus. */
  toBeFocused(): Promise<void>;

  /** Assert the element's text equals `text`. */
  toHaveText(text: string): Promise<void>;

  /** Assert the element's accessibility label equals `label`. */
  toHaveLabel(label: string): Promise<void>;

  /** Assert the element's identifier/testID equals `id`. */
  toHaveId(id: string): Promise<void>;

  /** Assert the element's accessibility value equals `value`. */
  toHaveValue(value: string): Promise<void>;

  /** Assert a slider's normalized position, with optional tolerance. */
  toHaveSliderPosition(normalizedPosition: number, tolerance?: number): Promise<void>;

  /** Assert a toggle (switch/checkbox) is on/off. */
  toHaveToggleValue(value: boolean): Promise<void>;
}
