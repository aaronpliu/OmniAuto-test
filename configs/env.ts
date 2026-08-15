/**
 * Centralized configuration.
 *
 * Design
 * ------
 * There is ONE config per app, dynamically selected by `E2E_APP`
 * (default `mock`). Each framework reads its own config file:
 *
 *   Detox  → configs/<E2E_APP>.detoxrc.js   (apps, devices, configurations)
 *   Appium → wdio.conf.ts                   (capabilities, keyed by E2E_APP)
 *
 * `env.ts` centralizes the shared values both frameworks consume (app alias,
 * platform, device selectors, report/session dirs) and derives the app binary
 * path from E2E_APP. Appium-specific per-app values (Android package/activity)
 * live in wdio.conf.ts — no separate *.config.json file is needed.
 *
 * `.env` is reserved for SHARED/global values only (secrets, LOG_LEVEL, ...).
 * It intentionally does NOT define app-specific keys, so concurrent runs of
 * different apps stay isolated and the shared `.env` can never leak app-specific
 * values across runs.
 *
 * Resolution precedence for overridable values:
 *   explicit CLI/shell env var  >  framework config (per-app)  >  default
 *
 * Call sites import from here instead of touching `process.env` directly.
 * `wdio.conf.ts` still executes before TS path aliases resolve, so it imports
 * this module via its relative path. `.env` is loaded via dotenv (best-effort;
 * variables may also come from the shell).
 */
import dotenv from "dotenv";
import type { DriverName } from "../src/core/IDriver";

// Load shared/global .env (best-effort; ignored if the file is absent).
dotenv.config();

// `DriverName` is the single source of truth, owned by `src/core/IDriver`.
// Imported here via a relative path because this module also loads inside
// wdio.conf.ts before TS path aliases are resolved.
export type Platform = "ios" | "android";

const rawPlatform = (process.env.PLATFORM ?? "ios").toLowerCase();
const platform: Platform = rawPlatform === "android" ? "android" : "ios";

const rawDriver = process.env.E2E_DRIVER ?? "detox";
const driver: DriverName = rawDriver === "appium" ? "appium" : "detox";

// Which app's config/artifacts to load. Drives both the Detox dispatcher and the
// Appium app path. Switch apps with NO config edits — just set E2E_APP.
const appAlias = process.env.E2E_APP ?? "mock";

// --- Framework-level defaults (platform aware) -------------------------------
const DEFAULT_DEVICE_NAME: Record<Platform, string> = {
  ios: "iPhone 15 Pro",
  android: "Pixel_6_API_34",
};
const DEFAULT_PLATFORM_VERSION: Record<Platform, string> = {
  ios: "17.0",
  android: "14.0",
};
const ARTIFACTS = `apps/${appAlias}/artifacts`;
// Default app binary path is derived deterministically from E2E_APP. Override
// per run via the CLI env var APPIUM_APP_PATH (Appium) / DETOX_BINARY_PATH (Detox).
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
  /** Built app binary path, derived from E2E_APP. Override via CLI env var. */
  APPIUM_APP_PATH: process.env.APPIUM_APP_PATH ?? DEFAULT_APP_PATH[platform],
  // (Android only) App package/activity. These are Appium-specific per-app values
  // and live in wdio.conf.ts (keyed by E2E_APP); a CLI env var here overrides them.
  APPIUM_APP_PACKAGE: process.env.APPIUM_APP_PACKAGE ?? "com.testingground",
  APPIUM_APP_ACTIVITY: process.env.APPIUM_APP_ACTIVITY ?? "com.testingground.MainActivity",
  /** Smoke reporter output dir; app-scoped so concurrent runs of different apps
   *  don't overwrite each other. Set explicitly (CLI/global .env) to override. */
  REPORT_DIR: process.env.REPORT_DIR || `reports/${appAlias}/smoke`,
  /** Console log level (trace|debug|info|warn|error). */
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  /** Session dir for file logging. App-scoped, per-run folder so concurrent runs
   *  on one machine stay isolated. An explicit value (CI/global .env) still wins. */
  OMNITEST_SESSION_DIR: process.env.OMNITEST_SESSION_DIR || `reports/${appAlias}/run-${Date.now()}`,
} as const;

export default env;
