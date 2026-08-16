/**
 * Driver bootstrap (entry point for `@core`).
 *
 * Importing this module (for its `getDriver` re-export) also imports
 * `@adapters`, which registers every available driver via `registerDriver`.
 * This guarantees the registry is populated before any `getDriver()` call —
 * pages and tests should import `getDriver` from `@core` (or `@core/index`),
 * not directly from a concrete module.
 */
import "@adapters";

export { getDriver, registerDriver } from "./Driver";
export { BasePage } from "./BasePage";

export type { IDriver, DriverName } from "./IDriver";
export type {
  ILocator,
  LocatorStrategy,
  ISingleLocator,
  IAllOfLocator,
  IAnyOfLocator,
} from "./ILocator";
export {
  byId,
  byText,
  byLabel,
  byRaw,
  allOf,
  anyOf,
  isSingleLocator,
  isAllOfLocator,
  isAnyOfLocator,
} from "./ILocator";
