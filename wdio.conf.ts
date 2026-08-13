/**
 * WebdriverIO configuration for running the E2E suite with the **Appium**
 * adapter instead of Detox. Supports BOTH iOS and Android.
 *
 * Usage:
 *   E2E_DRIVER=appium PLATFORM=ios     npx wdio wdio.conf.ts   # or: npm run test:appium
 *   E2E_DRIVER=appium PLATFORM=android npx wdio wdio.conf.ts   # or: npm run test:appium:android
 *
 * The same `tests/**\/*.e2e.ts` specs run unchanged — only the resolved driver
 * (`E2E_DRIVER`, defaults to `detox`) and the Appium capability (selected by
 * `PLATFORM`) differ. WebdriverIO injects the session `driver` into
 * `globalThis.driver` so the Appium adapter (AppiumActions / AppiumAppLauncher)
 * can reach it without importing wdio.
 *
 * NOTE: WebdriverIO v9 dropped the dedicated jest-runner; supported frameworks
 * are Mocha / Jasmine / Cucumber. Our specs only use the shared
 * `describe`/`it`/`beforeAll`/`beforeEach` globals (assertions live inside the
 * driver-agnostic `IActions` layer), so they run unchanged under Mocha.
 *
 * App binaries are expected under the same paths Detox uses (git-ignored):
 *   iOS    : apps/mock/artifacts/ios/TestingGround.app
 *   Android: apps/mock/artifacts/android/app-release.apk
 * Override with `APPIUM_APP_PATH` if your build outputs elsewhere.
 */
import type { Options } from "@wdio/types";
import { env } from "./configs/env";

const PLATFORM = env.PLATFORM;

// --- Per-app Appium settings -------------------------------------------------
// Appium-specific per-app values (Android package/activity) live here, keyed by
// E2E_APP. No separate *.config.json needed — wdio.conf.ts IS the Appium config.
// A CLI env var (APPIUM_APP_PACKAGE / APPIUM_APP_ACTIVITY) still overrides these.
interface AppiumAppSettings {
  appPackage: string;
  appActivity: string;
}
const APPIUM_APPS: Record<string, AppiumAppSettings> = {
  mock: { appPackage: "com.testingground", appActivity: "com.testingground.MainActivity" },
};
const appiumApp = APPIUM_APPS[env.E2E_APP] ?? APPIUM_APPS.mock;

// --- iOS (XCUITest) -------------------------------------------------------
const IOS_CAPS = {
  platformName: "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": env.DEVICE_NAME,
  "appium:platformVersion": env.PLATFORM_VERSION,
  // Simulator UDID (optional — omit to let Appium pick the default simulator).
  ...(env.UDID ? { "appium:udid": env.UDID } : {}),
  // Absolute path to the built .app bundle.
  "appium:app": env.APPIUM_APP_PATH,
  "appium:newCommandTimeout": 240,
  // Keep app data between sessions; flip to true for a clean install each run.
  "appium:noReset": true,
} as const;

// --- Android (UiAutomator2) ----------------------------------------------
const ANDROID_CAPS = {
  platformName: "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": env.DEVICE_NAME,
  "appium:platformVersion": env.PLATFORM_VERSION,
  // AVD to launch if no device is connected. Matches Detox's emulator config.
  "appium:avd": env.AVD_NAME,
  // Absolute path to the built .apk.
  "appium:app": env.APPIUM_APP_PATH,
  // Per-app package/activity from wdio.conf.ts (keyed by E2E_APP); CLI env overrides.
  "appium:appPackage": env.APPIUM_APP_PACKAGE ?? appiumApp.appPackage,
  "appium:appActivity": env.APPIUM_APP_ACTIVITY ?? appiumApp.appActivity,
  "appium:newCommandTimeout": 240,
  "appium:noReset": true,
} as const;

const ACTIVE_CAPS = PLATFORM === "android" ? ANDROID_CAPS : IOS_CAPS;

// NOTE: wdio v9's `Options.Testrunner` type does not declare every runtime
// field we use (notably `capabilities`, `port`, `hostname`). These are valid at
// runtime — the assertion below tolerates them while still giving us
// autocomplete/safety on the documented fields.
export const config = {
  // Mocha is the only maintained runner that reuses the same describe/it globals
  // our specs already use (jest-runner was removed in wdio v9).
  framework: "mocha",
  runner: "local",

  specs: ["./tests/**/*.e2e.ts"],

  // Transpile TypeScript on the fly so the *.e2e.ts specs run without a build step.
  // wdio v9 uses `tsConfigPath` (pointing at a tsconfig) for on-the-fly TS.
  tsConfigPath: "./tsconfig.json",

  // Mocha-specific options.
  mochaOpts: {
    timeout: 120000,
    ui: "bdd",
  },

  // --- Capabilities (selected by PLATFORM) --------------------------------
  capabilities: [ACTIVE_CAPS],

  // --- Services -----------------------------------------------------------
  // `appium` service spins up a local Appium server; remove if you run your
  // own server and set `hostname`/`port` instead.
  services: ["appium"],
  port: 4723,
  hostname: "127.0.0.1",

  // --- Hooks --------------------------------------------------------------
  /**
   * Expose the WebdriverIO session as `globalThis.driver` so the Appium adapter
   * can talk to the device without a direct wdio import. This is the bridge the
   * adapter's `getDriver()` (in AppiumAppLauncher / AppiumActions) relies on.
   */
  before: async function (_, __, context) {
    const driver =
      (context as { driver?: unknown }).driver ?? (globalThis as { browser?: unknown }).browser;
    (globalThis as { driver?: unknown }).driver = driver;
  },

  logLevel: "info",
} as Options.Testrunner;
