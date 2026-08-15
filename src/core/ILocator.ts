/**
 * Driver-neutral locator model.
 *
 * This is the real abstraction boundary between frameworks: *how you find an
 * element* differs most between Detox, Appium, Espresso, etc. Actions (tap,
 * typeText, …) are similar across drivers, but locators are not. Each adapter
 * implements {@link IMatcherFactory} to translate a neutral {@link ILocator}
 * into its own element handle, wrapped as the driver-agnostic {@link IActions}.
 *
 * A locator is expressed as an explicit `strategy` + `value` pair. The
 * discriminator (`strategy`) makes {@link IMatcherFactory.buildSelector}
 * a clean `switch` and keeps adding a new lookup strategy a one-line change in
 * each adapter — no more guessing which loose field was set.
 *
 * The `id` strategy is universal (Detox `by.id`, Appium `accessibility id`), so
 * `testID`-based locators work for free in every driver. Driver-specific escapes
 * use `strategy: "raw"` with a `{ ios, android }` value. `traits` is an optional
 * Detox-only composition modifier and is ignored by adapters that lack an
 * equivalent.
 */
import type { IActions } from "@contracts/index";

/** Supported neutral lookup strategies. Add new ones here, then handle in each matcher factory. */
export type LocatorStrategy = "id" | "text" | "label" | "traits" | "raw";

export interface ILocator {
  /** How to find the element. The discriminator that each matcher factory switches on. */
  strategy: LocatorStrategy;
  /**
   * The lookup value. A string for `id`/`text`/`label`; an `{ ios, android }`
   * selector pair for `raw` escapes; a comma-free value for `traits`.
   */
  value: string | { ios?: unknown; android?: unknown };
  /** Optional Detox-only composition modifier (button/link). Adapters may ignore. */
  traits?: string[];
}

/**
 * Small helper to keep locator definitions terse and typo-safe:
 *
 * ```ts
 * export const username = byId("login.username");
 * ```
 */
export function byId(value: string, traits?: string[]): ILocator {
  return { strategy: "id", value, traits };
}
export function byText(value: string, traits?: string[]): ILocator {
  return { strategy: "text", value, traits };
}
export function byLabel(value: string, traits?: string[]): ILocator {
  return { strategy: "label", value, traits };
}
export function byRaw(value: { ios?: unknown; android?: unknown }, traits?: string[]): ILocator {
  return { strategy: "raw", value, traits };
}

/**
 * Translates a neutral {@link ILocator} into a driver element handle, exposed as
 * the driver-agnostic {@link IActions} contract. Implemented once per adapter.
 */
export interface IMatcherFactory {
  /** Resolve a locator into a contract-compliant {@link IActions}. */
  resolve(locator: ILocator): IActions;
}
