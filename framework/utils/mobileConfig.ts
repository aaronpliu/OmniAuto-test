import * as path from "path";
import { MobileConfig, DetoxConfig, AppiumConfig, AppiumServerConfig } from "../types/config";
import { Logger } from "./logger";

const logger = Logger.getInstance();

/**
 * 统一移动端配置加载器（单例）
 *
 * 加载策略：
 *   CI 环境（CI=true） → configs/mobile.config.ci.js
 *   本地环境            → configs/mobile.config.local.js
 *   加载失败            → 内置默认值兜底
 *
 * 所有配置值直接从上述文件读取，不再通过环境变量覆盖。
 * 如需切换配置项，直接编辑对应的 .js 文件。
 *
 * 使用方式：
 *   import { mobileConfig } from '@framework/utils/mobileConfig';
 *   const detox = mobileConfig.getDetoxConfig();
 *   const caps = mobileConfig.getAppiumCapabilities('android');
 *   const server = mobileConfig.getAppiumServerConfig();
 */
export class MobileConfigLoader {
  private static instance: MobileConfigLoader;
  private config: MobileConfig | null = null;
  private configPath: string = "";

  private constructor() {}

  static getInstance(): MobileConfigLoader {
    if (!MobileConfigLoader.instance) {
      MobileConfigLoader.instance = new MobileConfigLoader();
    }
    return MobileConfigLoader.instance;
  }

  /** 根据运行环境选择配置文件 */
  private resolveConfigPath(): string {
    const isCI = process.env.CI === "true";
    const configFile = isCI ? "mobile.config.ci.js" : "mobile.config.local.js";
    return path.join(process.cwd(), "configs", configFile);
  }

  /**
   * 加载并缓存统一配置文件
   */
  load(): MobileConfig {
    if (this.config) {
      return this.config;
    }

    this.configPath = this.resolveConfigPath();

    try {
      // 清除 require 缓存，确保获取最新配置（开发时热更新）
      delete require.cache[require.resolve(this.configPath)];
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- dynamic config path resolved at runtime
      this.config = require(this.configPath) as MobileConfig;
      logger.info(`Mobile config loaded from: ${this.configPath}`);
    } catch (error: any) {
      logger.warn(`Failed to load mobile config from ${this.configPath}: ${error.message}`);
      logger.warn("Falling back to built-in defaults");
      this.config = this.getBuiltInDefaults();
    }

    return this.config;
  }

  /** 获取 Detox 配置区块 */
  getDetoxConfig(): DetoxConfig {
    return this.load().detox;
  }

  /** 获取 Appium 配置区块 */
  getAppiumConfig(): AppiumConfig {
    return this.load().appium;
  }

  /** 获取 Appium Server 配置（直接来自配置文件） */
  getAppiumServerConfig(): AppiumServerConfig {
    return this.load().appium.server;
  }

  /**
   * 获取应用路径（相对路径，调用方自行 resolve）
   */
  getApplications(): { androidApk: string; iosApp: string } {
    return this.load().applications;
  }

  /**
   * 构建指定平台的 Appium capabilities（数据全部来自配置文件）
   *
   * @param platform 'android' | 'ios'
   * @returns WebdriverIO RemoteOptions['capabilities'] 格式的 capabilities 对象
   */
  getAppiumCapabilities(platform: "android" | "ios"): Record<string, any> {
    const appiumConfig = this.getAppiumConfig();
    const capabilities: Record<string, any> = {};

    capabilities.platformName = platform === "ios" ? "iOS" : "Android";

    const common = appiumConfig.common;

    if (platform === "android") {
      const android = appiumConfig.android;
      capabilities["appium:automationName"] = android.automationName;
      capabilities["appium:deviceName"] = android.deviceName;
      capabilities["appium:platformVersion"] = android.platformVersion;

      // 应用定位：优先 appPackage+appActivity，其次 app 路径，最后回退 applications.androidApk
      if (android.appPackage && android.appActivity) {
        capabilities["appium:appPackage"] = android.appPackage;
        capabilities["appium:appActivity"] = android.appActivity;
      } else if (android.app) {
        capabilities["appium:app"] = path.resolve(process.cwd(), android.app);
      } else {
        const apkRel = this.getApplications().androidApk;
        if (apkRel) {
          capabilities["appium:app"] = path.resolve(process.cwd(), apkRel);
          logger.info(`Using APK from mobile config: ${capabilities["appium:app"]}`);
        }
      }

      if (android.systemPort) {
        capabilities["appium:systemPort"] = android.systemPort;
      }

      this.mergeExtraCapabilities(capabilities, android.capabilities);
    }

    if (platform === "ios") {
      const ios = appiumConfig.ios;
      capabilities["appium:automationName"] = ios.automationName;
      capabilities["appium:deviceName"] = ios.deviceName;
      capabilities["appium:platformVersion"] = ios.platformVersion;

      if (ios.udid) {
        capabilities["appium:udid"] = ios.udid;
      }

      // 应用定位：优先 bundleId，其次 app 路径，最后回退 applications.iosApp
      if (ios.bundleId) {
        capabilities["appium:bundleId"] = ios.bundleId;
      } else if (ios.app) {
        capabilities["appium:app"] = path.resolve(process.cwd(), ios.app);
      } else {
        const iosAppRel = this.getApplications().iosApp;
        if (iosAppRel) {
          capabilities["appium:app"] = path.resolve(process.cwd(), iosAppRel);
          logger.info(`Using iOS app from mobile config: ${capabilities["appium:app"]}`);
        }
      }

      // 真机签名
      if (ios.deviceType === "real") {
        capabilities["appium:xcodeSigningId"] = ios.xcodeSigningId;
        if (ios.xcodeOrgId) {
          capabilities["appium:xcodeOrgId"] = ios.xcodeOrgId;
        }
      }

      this.mergeExtraCapabilities(capabilities, ios.capabilities);
    }

    // ---------- 通用 capabilities（直接来自配置文件） ----------
    if (common.noReset) {
      capabilities["appium:noReset"] = common.noReset;
    }
    if (common.fullReset) {
      capabilities["appium:fullReset"] = common.fullReset;
    }
    if (common.newCommandTimeout) {
      capabilities["appium:newCommandTimeout"] = common.newCommandTimeout;
    }
    // 使用 W3C 标准 timeouts.implicit 而非 appium:implicitWaitMs（Appium 3.0 兼容）
    if (common.implicitWaitMs !== undefined) {
      capabilities.timeouts = {
        ...(capabilities.timeouts || {}),
        implicit: common.implicitWaitMs,
      };
    }
    if (common.language) {
      capabilities["appium:language"] = common.language;
    }
    if (common.locale) {
      capabilities["appium:locale"] = common.locale;
    }
    if (common.orientation) {
      capabilities["appium:orientation"] = common.orientation;
    }

    logger.debug("Built capabilities from mobile config: " + JSON.stringify(capabilities, null, 2));
    return capabilities;
  }

  /**
   * 将配置文件中的额外 capabilities 键值对合并到 capabilities 对象
   * 自动添加 appium: 前缀（如果键名没有前缀的话）
   */
  private mergeExtraCapabilities(
    capabilities: Record<string, any>,
    extra: Record<string, any>
  ): void {
    if (!extra || typeof extra !== "object") {
      return;
    }
    for (const [key, value] of Object.entries(extra)) {
      const prefixedKey =
        key.startsWith("appium:") || key === "platformName" ? key : `appium:${key}`;
      capabilities[prefixedKey] = value;
    }
  }

  /**
   * 内置默认配置（配置文件加载失败时兜底）
   */
  private getBuiltInDefaults(): MobileConfig {
    return {
      detox: {
        apps: {},
        devices: {},
        configurations: {},
      },
      appium: {
        server: { host: "0.0.0.0", port: 4723 },
        android: {
          automationName: "UiAutomator2",
          deviceName: "Pixel_10_Pro_XL",
          platformVersion: "17",
          appPackage: "",
          appActivity: "",
          app: "",
          capabilities: {},
        },
        ios: {
          automationName: "XCUITest",
          deviceName: "iPhone 17 Pro",
          platformVersion: "18.0",
          bundleId: "",
          app: "",
          udid: "",
          deviceType: "simulator",
          xcodeSigningId: "iPhone Developer",
          xcodeOrgId: "",
          capabilities: {},
        },
        common: {
          noReset: false,
          fullReset: false,
          newCommandTimeout: 300,
          implicitWaitMs: 0,
          language: "",
          locale: "",
          orientation: "",
        },
      },
      applications: {
        androidApk: "",
        iosApp: "",
      },
    };
  }
}

// 导出单例
export const mobileConfig = MobileConfigLoader.getInstance();
