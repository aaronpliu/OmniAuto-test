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
 *
 * Composition: a locator can be a single lookup OR a boolean combination of other
 * locators via `allOf` (AND) / `anyOf` (OR). This expresses multi-condition
 * matching (e.g. "id X AND text Y") in the neutral model without leaking
 * driver-specific predicate syntax into `apps/`. Each matcher factory translates
 * the tree into its own composition primitive (Detox `.and()`/`.or()`, Appium
 * compound selectors).
 */
import type { IActions } from "@contracts/index";

/** Supported neutral lookup strategies. Add new ones here, then handle in each matcher factory. */
export type LocatorStrategy = "id" | "text" | "label" | "traits" | "raw";

/** A single lookup, discriminated by `strategy`. */
export interface ISingleLocator {
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

/** All child locators must match (logical AND). */
export interface IAllOfLocator {
  allOf: ILocator[];
}

/** Any child locator may match (logical OR). */
export interface IAnyOfLocator {
  anyOf: ILocator[];
}

/**
 * A driver-neutral locator: either a single lookup or a boolean combination of
 * locators. The discriminator for factories is `strategy` for singles and
 * `allOf`/`anyOf` for composites.
 */
export type ILocator = ISingleLocator | IAllOfLocator | IAnyOfLocator;

/** Type guard: is this a single-strategy locator (vs. a composite)? */
export function isSingleLocator(locator: ILocator): locator is ISingleLocator {
  return "strategy" in locator;
}
/** Type guard: is this an AND composite? */
export function isAllOfLocator(locator: ILocator): locator is IAllOfLocator {
  return "allOf" in locator;
}
/** Type guard: is this an OR composite? */
export function isAnyOfLocator(locator: ILocator): locator is IAnyOfLocator {
  return "anyOf" in locator;
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
 * Compose locators with logical AND — every child must match. Use for
 * multi-condition matching without leaving the neutral model, e.g.:
 *
 * ```ts
 * const submit = allOf(byId("loginButton"), byText("Sign in"));
 * ```
 */
export function allOf(...locators: ILocator[]): ILocator {
  if (locators.length === 0) throw new Error("[allOf] requires at least one locator");
  return { allOf: locators };
}

/**
 * Compose locators with logical OR — any child may match. Use when an element is
 * reachable through alternative neutral locators, e.g.:
 *
 * ```ts
 * const promo = anyOf(byId("home.promoBanner"), byText("Today's offer"));
 * ```
 */
export function anyOf(...locators: ILocator[]): ILocator {
  if (locators.length === 0) throw new Error("[anyOf] requires at least one locator");
  return { anyOf: locators };
}

/**
 * Translates a neutral {@link ILocator} into a driver element handle, exposed as
 * the driver-agnostic {@link IActions} contract. Implemented once per adapter.
 */
export interface IMatcherFactory {
  /** Resolve a locator into a contract-compliant {@link IActions}. */
  resolve(locator: ILocator): IActions;
}
