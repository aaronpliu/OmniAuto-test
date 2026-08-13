/**
 * Detox config DISPATCHER (v20.x).
 *
 * This file is the single entry point Detox loads — it is intentionally tiny
 * and STATIC. It never needs editing for local/CI runs. It:
 *   1. Selects the per-app base config via `E2E_APP` (default `mock`).
 *   2. Deep-merges env-var OVERRIDES on top of that base config, so users can
 *      switch app / device / binary path locally or in CI without touching any
 *      config file. This is the "dynamically load the modified part" mechanism.
 *
 * Override env vars (all optional, documented in .env.example):
 *   E2E_APP                  App alias → loads configs/<E2E_APP>.detoxrc.js
 *   DETOX_CONFIG             Configuration name to run (e.g. android.emu.release)
 *   DETOX_DEVICE             Device alias override (simulator|emulator|android.device)
 *   DETOX_DEVICE_NAME        Device name/AVD/UDID override inside the chosen device
 *   DETOX_BINARY_PATH        Override the app binary path (iOS .app / Android .apk)
 *   DETOX_TEST_BINARY_PATH   Override the Android test APK path
 *   DETOX_ANDROID_DEVICE     adb serial for a real attached Android device
 *
 * Local dev:  set these in `.env` (cp .env.example .env).
 * CI:         pass them as pipeline env vars — same code path as local.
 */

/** @type {Detox.DetoxConfig} */
function buildConfig() {
  const app = process.env.E2E_APP || 'mock';
  const base = require(`./configs/${app}.detoxrc.js`);

  const override = (cfg) => {
    const targetApp = base.configurations[cfg] && base.configurations[cfg].app;
    // --- binary path overrides (local debug / CI artifacts) ---
    if (process.env.DETOX_BINARY_PATH && targetApp && base.apps[targetApp]) {
      base.apps[targetApp].binaryPath = process.env.DETOX_BINARY_PATH;
    }
    if (process.env.DETOX_TEST_BINARY_PATH && targetApp &&
        base.apps[targetApp] && base.apps[targetApp].type === 'android.apk') {
      base.apps[targetApp].testBinaryPath = process.env.DETOX_TEST_BINARY_PATH;
    }

    // --- device alias / name overrides ---
    if (process.env.DETOX_DEVICE && base.devices[process.env.DETOX_DEVICE]) {
      base.configurations[cfg].device = process.env.DETOX_DEVICE;
    }
    if (process.env.DETOX_DEVICE_NAME) {
      const dev = base.devices[base.configurations[cfg].device];
      if (dev) {
        dev.device = dev.device && typeof dev.device === 'object'
          ? { ...dev.device, type: process.env.DETOX_DEVICE_NAME, avdName: process.env.DETOX_DEVICE_NAME }
          : process.env.DETOX_DEVICE_NAME;
      }
    }
    if (process.env.DETOX_ANDROID_DEVICE) {
      if (base.devices['android.device']) {
        base.devices['android.device'].device = process.env.DETOX_ANDROID_DEVICE;
      }
    }
    return base;
  };

  const chosen = process.env.DETOX_CONFIG;
  if (chosen && base.configurations[chosen]) {
    return override(chosen);
  }
  // No explicit config → apply overrides to the first configuration.
  const firstCfg = Object.keys(base.configurations)[0];
  return override(firstCfg);
}

module.exports = buildConfig();
