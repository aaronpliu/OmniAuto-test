/**
 * Centralized environment configuration.
 *
 * Single source of truth for every environment variable the framework reads.
 * Loading `.env` (via dotenv) is attempted once at import time so a local
 * `.env` file (copied from `.env.example`) is honored without extra setup.
 *
 * Call sites should import from here instead of touching `process.env`
 * directly — this keeps defaults, types, and platform-aware logic in one
 * place. `wdio.conf.ts` still executes before TS path aliases resolve, so it
 * imports this module via its relative path.
 */
import dotenv from "dotenv";

// Best-effort: ignore if no `.env` exists (variables may come from the shell).
dotenv.config();

export type DriverName = "detox" | "appium";
export type Platform = "ios" | "android";

const rawPlatform = (process.env.PLATFORM ?? "ios").toLowerCase();
const platform: Platform = rawPlatform === "android" ? "android" : "ios";

const rawDriver = process.env.E2E_DRIVER ?? "detox";
const driver: DriverName = rawDriver === "appium" ? "appium" : "detox";

// Which app's config/artifacts to use (Detox dispatcher + Appium app path).
const appAlias = process.env.E2E_APP ?? "mock";

// Platform-aware defaults keep the per-platform caps lean in wdio.conf.ts.
const DEFAULT_DEVICE_NAME: Record<Platform, string> = {
  ios: "iPhone 15 Pro",
  android: "Pixel_6_API_34",
};
const DEFAULT_PLATFORM_VERSION: Record<Platform, string> = {
  ios: "17.0",
  android: "14.0",
};
const ARTIFACTS = `apps/${appAlias}/artifacts`;
const DEFAULT_APP_PATH: Record<Platform, string> = {
  ios: `${ARTIFACTS}/ios/TestingGround.app`,
  android: `${ARTIFACTS}/android/app-release.apk`,
};

export const env = {
  /** App alias selecting which config/artifacts to use (default `mock`). */
  E2E_APP: appAlias,
  /** Active automation framework. */
  E2E_DRIVER: driver,
  // --- Detox runtime overrides (read by .detoxrc.js dispatcher) -------------
  /** Configuration name to run, instead of retyping --configuration. */
  DETOX_CONFIG: process.env.DETOX_CONFIG || undefined,
  /** Device alias override (simulator | emulator | android.device). */
  DETOX_DEVICE: process.env.DETOX_DEVICE || undefined,
  /** Device name/AVD/UDID override inside the chosen device. */
  DETOX_DEVICE_NAME: process.env.DETOX_DEVICE_NAME || undefined,
  /** App binary path override (iOS .app or Android .apk) — local debug. */
  DETOX_BINARY_PATH: process.env.DETOX_BINARY_PATH || undefined,
  /** Android instrumentation test APK path override. */
  DETOX_TEST_BINARY_PATH: process.env.DETOX_TEST_BINARY_PATH || undefined,
  /** adb serial for a real attached Android device. */
  DETOX_ANDROID_DEVICE: process.env.DETOX_ANDROID_DEVICE || undefined,
  /** Target platform for Appium capability selection. */
  PLATFORM: platform,
  /** Device/emulator name reported to the driver. */
  DEVICE_NAME: process.env.DEVICE_NAME ?? DEFAULT_DEVICE_NAME[platform],
  /** OS version of the target device/emulator. */
  PLATFORM_VERSION: process.env.PLATFORM_VERSION ?? DEFAULT_PLATFORM_VERSION[platform],
  /** (iOS only) Specific simulator UDID; undefined lets Appium pick default. */
  UDID: process.env.UDID || undefined,
  /** (Android only) AVD to launch when no device is connected. */
  AVD_NAME: process.env.AVD_NAME ?? "Pixel_6_API_34",
  /** Override the built app binary path. */
  APPIUM_APP_PATH: process.env.APPIUM_APP_PATH ?? DEFAULT_APP_PATH[platform],
  /** (Android only) App package when not auto-detected. */
  APPIUM_APP_PACKAGE: process.env.APPIUM_APP_PACKAGE ?? "com.testingground",
  /** (Android only) App activity when not auto-detected. */
  APPIUM_APP_ACTIVITY: process.env.APPIUM_APP_ACTIVITY ?? "com.testingground.MainActivity",
  /** Smoke reporter output dir; defaults to an app-scoped folder so concurrent
   *  runs of different apps don't overwrite each other. Set explicitly to override. */
  REPORT_DIR: process.env.REPORT_DIR || `reports/${appAlias}/smoke`,
  /** Console log level (trace|debug|info|warn|error). */
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  /** Session dir for file logging. Defaults to an app-scoped, per-run folder so
   *  concurrent runs of different apps on one machine get isolated logs. An
   *  explicit value (e.g. from global setup or CI) still wins. */
  OMNITEST_SESSION_DIR: process.env.OMNITEST_SESSION_DIR || `reports/${appAlias}/run-${Date.now()}`,
} as const;

export default env;
