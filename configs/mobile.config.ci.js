/**
 * OmniAutoTest 统一移动端配置文件 — CI 版本（Git 跟踪）
 * Unified Mobile Configuration — CI Baseline (Git Tracked)
 *
 * 优先级链：环境变量 > 本配置文件 > 代码内置默认值
 * Priority:  Env Vars  >  This Config  >  Built-in Defaults
 *
 * 说明：
 * - 此文件为 CI 基线配置，由 Git 跟踪，不应在本地修改。
 * - 本地调试请编辑 configs/mobile.config.js（不受 Git 跟踪）。
 * - CI 环境（process.env.CI=true）自动加载此文件。
 * - detox 区块：Detox CLI 所需的 apps / devices / configurations / behavior 等
 * - appium 区块：Appium server 连接信息 + Android/iOS capabilities + 通用 capabilities
 * - applications：iOS/Android 应用路径（统一管理，消除 .detoxrc 与 configs/*.json 重复）
 *
 * 注意：此文件为 CommonJS（.js），被 .detoxrc.js 和 MobileConfigLoader 直接 require，
 *       不经过 ts-jest transform，因此不要使用 ES Module 语法。
 */

const path = require("path");

module.exports = {
  // ============================================================
  // Detox 配置区块
  // ============================================================
  detox: {
    testRunner: {
      args: {
        $0: "jest",
        config: "configs/jest/ios.detox.config.js",
      },
      jest: {
        setupTimeout: 120000,
      },
    },

    // 应用构建产物 / 构建命令
    apps: {
      "ios.debug": {
        type: "ios.app",
        binaryPath: "ios/build/Build/Products/Debug-iphonesimulator/YourApp.app",
        build:
          "xcodebuild -workspace ios/YourApp.xcworkspace -scheme YourApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build",
      },
      "ios.release": {
        type: "ios.app",
        binaryPath: "ios/build/Build/Products/Release-iphonesimulator/YourApp.app",
        build:
          "xcodebuild -workspace ios/YourApp.xcworkspace -scheme YourApp -configuration Release -sdk iphonesimulator -derivedDataPath ios/build",
      },
      "android.debug": {
        type: "android.apk",
        binaryPath: "applications/TestGround/android-app/app-debug.apk",
        build:
          "cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug && cd ..",
      },
      "android.release": {
        type: "android.apk",
        binaryPath: "applications/TestGround/android-app/app-release.apk",
        build:
          "cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release && cd ..",
      },
    },

    // 设备 / 模拟器定义
    devices: {
      simulator: {
        type: "ios.simulator",
        device: {
          type: "Your ios simulator type",
        },
      },
      emulator: {
        type: "android.emulator",
        device: {
          avdName: "You android emulator name",
        },
      },
    },

    // configuration = device + app 组合
    configurations: {
      "ios.sim.debug": { device: "simulator", app: "ios.debug" },
      "ios.sim.release": { device: "simulator", app: "ios.release" },
      "android.emu.debug": { device: "emulator", app: "android.debug" },
      "android.emu.release": { device: "emulator", app: "android.release" },
    },

    // 行为配置
    behavior: {
      init: {
        reinstallApp: true,
        launchApp: false,
      },
      cleanup: {
        shutdownDevice: false,
      },
    },

    // Artifacts 产物配置（失败截图 + 录屏 + 日志）
    // 位置：Detox 顶层 artifacts 字段（官方规范，非 cli.configuration.artifacts）
    // screenshot.enabled 绑定 SCREENSHOT_ON_FAILURE，video.enabled 绑定 VIDEO_RECORDING，
    // 与 Appium 模式 / 框架 testLifecycle 开关统一。
    // .detoxrc.js require 时 process.env 已就绪，求值后返回静态对象给 Detox CLI。
    artifacts: {
      rootDir: "artifacts/detox",
      plugins: {
        log: {
          enabled: true,
          keepOnlyFailedTestsArtifacts: true,
        },
        screenshot: {
          enabled: process.env.SCREENSHOT_ON_FAILURE !== "false",
          shouldTakeAutomaticSnapshots: true,
          keepOnlyFailedTestsArtifacts: true,
        },
        video: {
          enabled: process.env.VIDEO_RECORDING === "true",
          keepOnlyFailedTestsArtifacts: true,
        },
      },
    },
  },

  // ============================================================
  // Appium 配置区块
  // ============================================================
  appium: {
    // Appium Server 连接
    server: {
      host: "0.0.0.0",
      port: 4723,
    },

    // Android (UiAutomator2) capabilities
    android: {
      automationName: "UiAutomator2",
      deviceName: "your android device name",
      platformVersion: "17",
      // 应用定位：优先使用 appPackage+appActivity，否则使用 app 路径
      // 如填写了 appPackage / appActivity，则忽略 app
      appPackage: "",
      appActivity: "",
      app: "", // 绝对路径或相对项目根的路径；留空则回退到 applications.androidApk
      systemPort: undefined, // 例如 8200
      // 额外 capabilities（键值对，会以 appium: 前缀输出）
      capabilities: {
        autoGrantPermissions: true,
      },
    },

    // iOS (XCUITest) capabilities
    ios: {
      automationName: "XCUITest",
      deviceName: "iPhone 17 Pro",
      platformVersion: "18.0",
      // 应用定位：优先 bundleId，否则 app 路径，否则回退到 applications.iosApp
      bundleId: "",
      app: "", // 绝对路径或相对项目根的路径；留空则回退到 applications.iosApp
      udid: "", // 真机或已启动的模拟器 UDID；留空则由设备检测自动填充
      deviceType: "simulator", // 'simulator' | 'real'
      // 真机签名（仅 deviceType='real' 时生效）
      xcodeSigningId: "iPhone Developer",
      xcodeOrgId: "", // Apple Team ID
      // 额外 capabilities（键值对，会以 appium: 前缀输出）
      capabilities: {
        autoAcceptAlerts: true,
        connectHardwareKeyboard: true,
      },
    },

    // 通用 capabilities（iOS / Android 共享）
    common: {
      noReset: false,
      fullReset: false,
      newCommandTimeout: 300,
      language: "", // 例如 'zh'
      locale: "", // 例如 'CN'
      orientation: "", // 'PORTRAIT' | 'LANDSCAPE' | '' (留空不设置)
    },
  },

  // ============================================================
  // 应用路径（统一管理，消除 .detoxrc 与 configs/*.json 重复）
  // ============================================================
  applications: {
    androidApk: "applications/TestGround/android-app/app-debug.apk",
    iosApp: "applications/TestGround/ios-app/TestingGround.app",
  },
};
