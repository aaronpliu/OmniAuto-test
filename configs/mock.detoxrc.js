/**
 * Detox config for the `mock` app — a STATIC base config.
 *
 * This file is loaded by the root `.detoxrc.js` dispatcher based on `E2E_APP`
 * (default `mock`). Do NOT edit it to change devices, binary paths, or config
 * names for local/CI runs — pass overrides via env vars instead (see
 * `.env.example` and the root `.detoxrc.js` dispatcher).
 *
 * See https://wix.github.io/Detox/docs/config/apps/ and .../config/devices/.
 */

/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: "jest",
      config: "jest.config.js",
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    "ios.release": {
      type: "ios.app",
      binaryPath: "apps/mock/artifacts/ios/TestingGround.app",
    },
    "android.release": {
      type: "android.apk",
      binaryPath: "apps/mock/artifacts/android/app-release.apk",
      testBinaryPath: "apps/mock/artifacts/android/app-release-androidTest.apk",
    },
  },

  devices: {
    simulator: {
      type: "ios.simulator",
      device: {
        type: "iPhone 15 Pro",
      },
    },
    emulator: {
      type: "android.emulator",
      device: {
        avdName: "Pixel_6_API_34",
      },
      gpuMode: "swiftshader_indirect",
    },
    "android.device": {
      type: "android.attached",
      device: "*",
    },
  },

  configurations: {
    "ios.sim.release": {
      device: "simulator",
      app: "ios.release",
    },
    "android.emu.release": {
      device: "emulator",
      app: "android.release",
    },
    "android.device.release": {
      device: "android.device",
      app: "android.release",
    },
  },
  // Reuse the same driver & artifacts settings across all configurations.
  behavior: {
    init: {
      // Retry launching the app if the first attempt fails (flakiness guard).
      exposeGlobals: true,
      reinstallApp: true,
      launchArgs: {
        detoxURLBlacklistRegex: ".*(https://example.com|wss://example.com).*",
      },
    },
    cleanup: {
      shutdownDevice: false,
    },
  },

  artifacts: {
    plugins: {
      log: "failing",
      screenshot: "failing",
      video: "failing",
      instruments: "failing",
    },
  },

  logger: {
    level: "info",
    options: {
      showDate: true,
      showLoggerName: true,
    },
  },
};
