/**
 * Detox configuration (v20.x).
 *
 * Structure:
 *   - `apps`       : reusable app builds, referenced by alias from configurations.
 *   - `devices`    : reusable device descriptors, referenced by alias.
 *   - `configurations`: one entry per (app × device × build-type) combo that
 *                       `detox test --configuration <name>` can target.
 *
 * Adjust `binaryPath` / `build` to match your native project layout.
 * See https://wix.github.io/Detox/docs/config/apps/ and .../config/devices/.
 */

/** @type {Detox.DetoxConfig} */
module.exports = {
  // Prebuilt app binaries are kept under `apps/<app>/artifacts/{ios,android}/`
  // (git-ignored — never committed). `build` rebuilds them into those paths.
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'apps/mock/artifacts/ios/OmniAutoTest.app',
      build:
        'xcodebuild -workspace ios/OmniAutoTest.xcworkspace -scheme OmniAutoTest -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build && ' +
        'cp -R ios/build/Build/Products/Debug-iphonesimulator/OmniAutoTest.app apps/mock/artifacts/ios/OmniAutoTest.app',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'apps/mock/artifacts/android/app-debug.apk',
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug && ' +
        'cp android/app/build/outputs/apk/debug/app-debug.apk apps/mock/artifacts/android/app-debug.apk',
      testBinaryPath:
        'apps/mock/artifacts/android/app-debug-androidTest.apk',
      // testBinaryPath is copied alongside the app APK during build:
      // cp android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk apps/mock/artifacts/android/app-debug-androidTest.apk
    },
  },

  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15',
        os: 'iOS 17.0',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_6_API_34',
      },
      gpuMode: 'swiftshader_indirect',
    },
  },

  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
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
