import type { BaseLaunchOptions, IAppLauncher } from "@contracts/IAppLauncher";
import { Logger } from "@utils/logger";

const logger = Logger.getInstance();

/** Appium (WebdriverIO) launch options. Capabilities drive the session. */
export interface AppiumLaunchOptions extends BaseLaunchOptions {
  /** Appium capability bundle (or path to a wdio capability object). */
  capabilities?: Record<string, unknown>;
}

/** Resolve the global WebdriverIO `driver` (set by the wdio runner). */
function getDriver(): {
  launchApp(): Promise<void>;
  restartApp?(): Promise<void>;
} {
  const driver = (globalThis as { driver?: any }).driver;
  if (!driver) {
    throw new Error(
      "[AppiumAppLauncher] WebdriverIO `driver` is not available — run under the wdio runner"
    );
  }
  return driver;
}

/**
 * Appium (WebdriverIO) implementation of {@link IAppLauncher}.
 *
 * Unlike Detox, Appium sessions are described entirely by capabilities supplied
 * to the wdio runner; this launcher mainly (re)starts the app under test via
 * the mobile `launchApp` / `restartApp` commands, keeping test suites free of
 * driver-specific globals.
 */
export class AppiumAppLauncher implements IAppLauncher {
  async launchApp(options: AppiumLaunchOptions = {}): Promise<void> {
    logger.info(`launching app via Appium (newInstance=${options.newInstance ?? true})`);
    const driver = getDriver();
    if (options.newInstance && typeof driver.restartApp === "function") {
      await driver.restartApp();
    } else {
      await driver.launchApp();
    }
  }

  async reloadApp(): Promise<void> {
    const driver = getDriver();
    logger.debug("reloading app (Appium restartApp)");
    if (typeof driver.restartApp === "function") {
      await driver.restartApp();
    } else {
      await driver.launchApp();
    }
  }
}

/** Shared Appium launcher instance for test suites to import. */
export const appiumAppLauncher: IAppLauncher = new AppiumAppLauncher();
