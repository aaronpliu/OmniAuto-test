/**
 * Driver-neutral locator model.
 *
 * This is the real abstraction boundary between frameworks: *how you find an
 * element* differs most between Detox, Appium, Espresso, etc. Actions (tap,
 * typeText, …) are similar across drivers, but locators are not. Each adapter
 * implements {@link IMatcherFactory} to translate a neutral {@link ILocator}
 * into its own element handle, wrapped as the driver-agnostic {@link IActions}.
 *
 * Keep locators minimal and strategy-based. The `id` field is universal
 * (Detox `by.id`, Appium `accessibility id`), so `testID`-based locators work
 * for free in every driver. Driver-specific escapes go in `raw`.
 */
import type { IActions } from "@contracts/index";

/** A stable test identity, mapped to Detox `by.id` / Appium `accessibility id`. */
export interface ILocator {
  /** Stable test identity. Maps to Detox `by.id`, Appium `accessibility id`. */
  id?: string;
  /** Visible text. Maps to Detox `by.text`, Appium `name`/`-android uiautomator`. */
  text?: string;
  /** Accessibility label. */
  label?: string;
  /** Platform traits (button/link). Detox-specific; adapters may ignore. */
  traits?: string[];
  /**
   * Optional raw driver hints for escapes that have no neutral equivalent.
   * e.g. `{ ios: by.id('x'), android: by.id('y') }` or Appium `xpath`.
   */
  raw?: { ios?: unknown; android?: unknown };
}

/**
 * Translates a neutral {@link ILocator} into a driver element handle, exposed as
 * the driver-agnostic {@link IActions} contract. Implemented once per adapter.
 */
export interface IMatcherFactory {
  /** Resolve a locator into a contract-compliant {@link IActions}. */
  resolve(locator: ILocator): IActions;
}
