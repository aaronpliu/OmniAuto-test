/**
 * Detox configuration (v20.x).
 *
 * Structure:
 *   - `apps`       : reusable app descriptors (just the binary path — no build
 *                    step; supply a prebuilt app via `binaryPath`).
 *   - `devices`    : reusable device descriptors (simulator / emulator / real),
 *                    referenced by alias.
 *   - `configurations`: one entry per (app × device) combo that
 *                       `detox test --configuration <name>` can target.
 *
 * `apps` only declare `binaryPath` (prebuilt binaries live under
 * `apps/<app>/artifacts/{ios,android}/`, git-ignored). There is intentionally
 * no `build` step — build/install the app separately, then point Detox at the
 * artifact. See https://wix.github.io/Detox/docs/config/apps/ and .../devices/.
 */

/** @type {Detox.DetoxConfig} */
module.exports = {
  apps: {
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'apps/mock/artifacts/ios/TestingGround.app',
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'apps/mock/artifacts/android/app-release.apk',
      testBinaryPath: 'apps/mock/artifacts/android/app-release-androidTest.apk',
    },
  },

  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15 Pro',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_6_API_34',
      },
      gpuMode: 'swiftshader_indirect',
    },
    'android.device': {
      type: 'android.attached',
      device: "*",
    },
  },

  configurations: {
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
    'android.device.release': {
      device: 'android.device',
      app: 'android.release',
    },
  },

  // Reuse the same driver & artifacts settings across all configurations.
  behavior: {
    init: {
      // Retry launching the app if the first attempt fails (flakiness guard).
      exposeGlobals: true,
      reinstallApp: true,
      launchArgs: {
        detoxURLBlacklistRegex:
          '.*(https://example.com|wss://example.com).*',
      },
    },
    cleanup: {
      shutdownDevice: false,
    },
  },

  artifacts: {
    plugins: {
      log: 'failing',
      screenshot: 'failing',
      video: 'failing',
      instruments: 'failing',
    },
  },

  logger: {
    level: 'info',
    options: {
      showDate: true,
      showLoggerName: true,
    },
  },
};
