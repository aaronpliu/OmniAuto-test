// @ts-nocheck
// Detox loads this file as a plain Node CommonJS module (via `module.exports`).
// It is intentionally NOT type-checked: it must stay CommonJS (ESM `export` would
// break Detox's config loader), and the `@ts-nocheck` silences the IDE's
// "CommonJS module may be converted to ESM" hint without changing runtime behavior.
/**
 * Detox config DISPATCHER (v20.x).
 *
 * This file is the single entry point Detox loads — it is intentionally tiny
 * and STATIC. It never needs editing for local/CI runs. It:
 *   1. Selects the per-app base config via `env.E2E_APP` (default `mock`).
 *   2. Deep-merges OVERRIDES (from `configs/env.ts`) on top of that base config,
 *      so users can switch app / device / binary path locally or in CI without
 *      touching any config file. This is the "dynamically load the modified part".
 *
 * All environment variables — including the `.env` file — are resolved by
 * `configs/env.ts` (the single source of truth). This file reads `env.*` only
 * and never calls `process.env` directly. `.env` is loaded automatically by
 * `configs/env.ts` on import (see `.env.example` for the full variable list):
 *   E2E_APP / E2E_DRIVER / DETOX_CONFIG / DETOX_DEVICE / DETOX_DEVICE_NAME /
 *   DETOX_BINARY_PATH / DETOX_TEST_BINARY_PATH / DETOX_ANDROID_DEVICE / …
 *
 * Local dev:  set vars in `.env` (cp .env.example .env) or the shell.
 * CI:         pass them as pipeline env vars — same code path as local.
 */

// Register a TypeScript loader so this plain-JS config can require the typed
// `configs/env.ts` (single source of truth). We use the typed `tsx/cjs/api`
// entry (`register()`) instead of the untyped `tsx/cjs` side-effect subpath,
// which avoids an implicit-`any` error in strict mode. No extra build step needed.
require('tsx/cjs/api').register();
const { env } = require('./configs/env');

/** @type {Detox.DetoxConfig} */
function buildConfig() {
  const base = require(`./configs/${env.E2E_APP}.detoxrc.js`);

  const override = (cfg) => {
    const targetApp = base.configurations[cfg] && base.configurations[cfg].app;

    // --- binary path overrides (local debug / CI artifacts) ---
    if (env.DETOX_BINARY_PATH && targetApp && base.apps[targetApp]) {
      base.apps[targetApp].binaryPath = env.DETOX_BINARY_PATH;
    }
    if (env.DETOX_TEST_BINARY_PATH && targetApp &&
        base.apps[targetApp] && base.apps[targetApp].type === 'android.apk') {
      base.apps[targetApp].testBinaryPath = env.DETOX_TEST_BINARY_PATH;
    }

    // --- device alias / name overrides ---
    if (env.DETOX_DEVICE && base.devices[env.DETOX_DEVICE]) {
      base.configurations[cfg].device = env.DETOX_DEVICE;
    }
    if (env.DETOX_DEVICE_NAME) {
      const dev = base.devices[base.configurations[cfg].device];
      if (dev) {
        dev.device = dev.device && typeof dev.device === 'object'
          ? { ...dev.device, type: env.DETOX_DEVICE_NAME, avdName: env.DETOX_DEVICE_NAME }
          : env.DETOX_DEVICE_NAME;
      }
    }
    if (env.DETOX_ANDROID_DEVICE && base.devices['android.device']) {
      base.devices['android.device'].device = env.DETOX_ANDROID_DEVICE;
    }
    return base;
  };

  const chosen = env.DETOX_CONFIG;
  if (chosen && base.configurations[chosen]) {
    return override(chosen);
  }
  // No explicit config → apply overrides to the first configuration.
  return override(Object.keys(base.configurations)[0]);
}

module.exports = buildConfig();
