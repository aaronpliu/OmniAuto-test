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

// Register the Detox driver. Appium (and others) register themselves the same
// way once their adapter folder exists.
registerDriver('detox', (): IDriver => ({
  name: 'detox',
  matcher: new DetoxMatcherFactory(),
  launcher: detoxAppLauncher,
}));

// Re-export the concrete adapters for direct imports where useful.
export * from './detox';
