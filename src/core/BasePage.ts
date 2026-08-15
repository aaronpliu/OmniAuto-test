/**
 * Driver-neutral base class for page objects.
 *
 * Every page shares the same element-resolution plumbing: turn a neutral
 * {@link ILocator} into a driver-agnostic {@link IActions} via the active
 * driver's matcher factory. `BasePage` centralizes that logic so concrete
 * pages (LoginPage, HomePage, …) only declare business flow — none of them
 * repeat the `find`/`locate` boilerplate.
 *
 * `find` is private (page-internal steps); `locate` is public so specs can
 * assert directly on an element. Both resolve through the env-selected driver
 * (Detox by default, Appium via `E2E_DRIVER`), keeping pages identical across
 * frameworks.
 */
import type { IActions } from "@contracts/index";
import type { ILocator } from "./ILocator";
import { getDriver } from "./index";

export abstract class BasePage {
  /**
   * Resolve a neutral locator into a contract-compliant {@link IActions}.
   * Delegates to the active driver's {@link IMatcherFactory}, so subclasses
   * stay driver-agnostic.
   */
  protected find(locator: ILocator): IActions {
    return getDriver().matcher.resolve(locator);
  }

  /**
   * Public locator entry point for specs that need to assert directly on an
   * element (e.g. visibility checks in a smoke suite). Internal page steps use
   * the protected {@link find} helper.
   */
  locate(locator: ILocator): IActions {
    return this.find(locator);
  }
}
