/**
 * Adapter entry point. Importing this module registers every available driver
 * with {@link registerDriver}; consumers then resolve one via `getDriver()`.
 *
 * Each framework lives under its own subfolder implementing the shared
 * contracts (IMatcherFactory + IAppLauncher). Add a new framework by creating
 * `./<driver>/` and registering it below — no page or test needs to change.
 */
import { registerDriver, type IDriver } from '@core/Driver';
import { DetoxMatcherFactory } from './detox/DetoxMatcher';
import { detoxAppLauncher } from './detox/DetoxAppLauncher';
import { AppiumMatcherFactory } from './appium/AppiumMatcherFactory';
import { appiumAppLauncher } from './appium/AppiumAppLauncher';

// Register the Detox driver.
registerDriver('detox', (): IDriver => ({
  name: 'detox',
  matcher: new DetoxMatcherFactory(),
  launcher: detoxAppLauncher,
}));

// Register the Appium driver. Each framework registers itself the same way;
// pages and tests never need to change when a new driver is added.
registerDriver('appium', (): IDriver => ({
  name: 'appium',
  matcher: new AppiumMatcherFactory(),
  launcher: appiumAppLauncher,
}));

// Re-export the concrete adapters for direct imports where useful.
export * from './detox';
export * from './appium';

