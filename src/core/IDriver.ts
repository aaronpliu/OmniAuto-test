/**
 * Driver-neutral facade types handed to pages and tests.
 *
 * Pages/tests consume {@link IDriver} (matcher + launcher) and never import a
 * concrete adapter (Detox, Appium, …) directly. The active driver is selected
 * by `E2E_DRIVER` (defaults to `detox`) in {@link getDriver}.
 */
import type { IMatcherFactory } from './ILocator';
import type { IAppLauncher } from '@contracts/IAppLauncher';

/** The set of drivers this project knows how to run. */
export type DriverName = 'detox' | 'appium';

/** Driver-neutral facade handed to pages/tests. */
export interface IDriver {
  name: DriverName;
  /** Resolves neutral locators into driver-agnostic {@link IActions}. */
  matcher: IMatcherFactory;
  /** Launches / reloads the app under test. */
  launcher: IAppLauncher;
}
