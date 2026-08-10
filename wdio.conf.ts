/**
 * WebdriverIO configuration for running the E2E suite with the **Appium**
 * adapter instead of Detox.
 *
 * Usage:
 *   E2E_DRIVER=appium npx wdio wdio.conf.ts
 *   # or: npm run test:appium
 *
 * The same `tests/**\/*.e2e.ts` specs run unchanged — the only difference is
 * which driver {@link getDriver} resolves (`E2E_DRIVER` env). WebdriverIO
 * injects the session `driver` into `globalThis.driver` so the Appium adapter
 * (AppiumActions / AppiumAppLauncher) can reach it without importing wdio.
 *
 * NOTE: WebdriverIO v9 dropped the dedicated jest-runner; the supported
 * frameworks are Mocha / Jasmine / Cucumber. Our specs only use the shared
 * `describe`/`it`/`beforeAll`/`beforeEach` globals (assertions live inside the
 * driver-agnostic `IActions` layer), so they run unchanged under Mocha.
 */
import type { Options } from '@wdio/types';

const CAPS = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': process.env.DEVICE_NAME ?? 'iPhone 15 Pro',
  'appium:platformVersion': process.env.PLATFORM_VERSION ?? '17.0',
  // Override with the absolute path to your built app bundle / .app / .apk.
  'appium:app': process.env.APPIUM_APP_PATH ?? '',
  'appium:newCommandTimeout': 240,
} as const;

// NOTE: wdio v9's `Options.Testrunner` type does not declare every runtime
// field we use (notably `capabilities`, `port`, `hostname`). These are valid at
// runtime — the assertion below tolerates them while still giving us
// autocomplete/safety on the documented fields.
export const config = {
  // Mocha is the only maintained runner that reuses the same describe/it globals
  // our specs already use (jest-runner was removed in wdio v9).
  framework: 'mocha',
  runner: 'local',

  specs: ['./tests/**/*.e2e.ts'],

  // Transpile TypeScript on the fly so the *.e2e.ts specs run without a build step.
  // wdio v9 uses `tsConfigPath` (pointing at a tsconfig) for on-the-fly TS.
  tsConfigPath: './tsconfig.json',

  // Mocha-specific options.
  mochaOpts: {
    timeout: 120000,
    ui: 'bdd',
  },

  // --- Capabilities -------------------------------------------------------
  capabilities: [CAPS],

  // --- Services -----------------------------------------------------------
  // `appium` service spins up a local Appium server; remove if you run your
  // own server and set `hostname`/`port` instead.
  services: ['appium'],
  port: 4723,
  hostname: '127.0.0.1',

  // --- Hooks --------------------------------------------------------------
  /**
   * Expose the WebdriverIO session as `globalThis.driver` so the Appium adapter
   * can talk to the device without a direct wdio import. This is the bridge the
   * adapter's `getDriver()` (in AppiumAppLauncher / AppiumActions) relies on.
   */
  before: async function (_, __, context) {
    const driver = (context as { driver?: unknown }).driver ?? (globalThis as { browser?: unknown }).browser;
    (globalThis as { driver?: unknown }).driver = driver;
  },

  logLevel: 'info',
} as Options.Testrunner;
