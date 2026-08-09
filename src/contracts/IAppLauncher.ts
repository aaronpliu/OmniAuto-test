/**
 * Driver-agnostic contract for launching / reloading the application under
 * test. Each automation driver (Detox today, others in the future) implements
 * this once; test suites depend only on the contract, never on a driver's
 * specific launch API.
 *
 * The option shape is intentionally minimal here — concrete adapters may
 * extend it with driver-specific fields (e.g. Detox permissions / deep links).
 */
export interface BaseLaunchOptions {
  /** Launch a fresh instance, clearing previous state. */
  newInstance?: boolean;
  /** Kill the app before launching. */
  delete?: boolean;
  /** Arbitrary launch arguments forwarded to the app. */
  launchArgs?: Record<string, string | number | boolean>;
}

export interface IAppLauncher {
  /** Launch the app under test, applying the given (driver-specific) options. */
  launchApp(options?: BaseLaunchOptions): Promise<void>;
  /** Return the app to a clean state (e.g. reload the runtime). */
  reloadApp(): Promise<void>;
}
