import { device } from "detox";
import type { BaseLaunchOptions, IAppLauncher } from "@contracts/IAppLauncher";
import { Logger } from "@utils/logger";

const logger = Logger.getInstance();

/**
 * Detox-specific launch options. Extends the driver-agnostic
 * {@link BaseLaunchOptions} with the extras Detox's `device.launchApp` supports.
 */
export type DetoxLaunchOptions = BaseLaunchOptions &
  Partial<Parameters<typeof device.launchApp>[0]>;

/** Sensible defaults so individual suites rarely need to pass anything. */
const DEFAULT_OPTIONS: DetoxLaunchOptions = {
  newInstance: true,
  delete: true,
};

/**
 * Detox implementation of {@link IAppLauncher}. Wraps `device.launchApp` /
 * `device.reloadReactNative` so test suites never touch Detox globals directly.
 *
 * Other drivers (e.g. Appium) can provide their own `IAppLauncher` with a
 * respective launch approach, and the rest of the framework stays untouched.
 */
export class DetoxAppLauncher implements IAppLauncher {
  async launchApp(options: DetoxLaunchOptions = {}): Promise<void> {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    logger.info(
      `launching app via Detox (newInstance=${merged.newInstance}, delete=${merged.delete})`
    );
    await device.launchApp(merged);
  }

  async reloadApp(): Promise<void> {
    if (typeof device.reloadReactNative === "function") {
      logger.debug("reloading React Native runtime");
      await device.reloadReactNative();
    }
  }
}

/** Shared Detox launcher instance for test suites to import. */
export const detoxAppLauncher: IAppLauncher = new DetoxAppLauncher();
