import type { DateFormat, Direction, Edge, GestureSpeed, Point } from "./types";

/**
 * Driver-OPTIONAL actions. Not every automation framework can service these
 * natively (e.g. WebdriverIO/Appium cannot do `pinch`, date-pickers, or sliders
 * without platform-specific workarounds). They are kept OUT of {@link IActions}
 * so a new driver is not forced to implement methods it does not support.
 *
 * {@link BaseActions} provides a default `NotSupportedError` for every method
 * here, so adapters only override the ones they can service. Pages/tests that
 * need an optional action should narrow the resolved element to
 * `IOptionalActions` (or check support) before calling.
 */
export interface IOptionalActions {
  /** Pinch (iOS only). scale < 1 zooms out, > 1 zooms in. */
  pinch(scale: number, speed?: GestureSpeed, angle?: number): Promise<void>;

  /** Scroll a list-like element to the item at `index` (Android only). */
  scrollToIndex(index: number): Promise<void>;

  /** Set the value of a non-date picker column (iOS only). */
  setColumnToValue(column: number, value: string): Promise<void>;

  /** Set a date picker's value. */
  setDatePickerDate(dateString: string, dateFormat: DateFormat): Promise<void>;

  /** Move a slider to a normalized position (0.0–1.0). */
  adjustSliderToPosition(normalizedPosition: number): Promise<void>;

  /** Trigger an accessibility action by name. */
  performAccessibilityAction(actionName: string): Promise<void>;

  /** Assert a slider's normalized position, with optional tolerance. */
  toHaveSliderPosition(normalizedPosition: number, tolerance?: number): Promise<void>;

  /** Assert a toggle (switch/checkbox) is on/off. */
  toHaveToggleValue(value: boolean): Promise<void>;
}
