import * as path from 'path';
import {
  MobileConfig,
  DetoxConfig,
  AppiumConfig,
  AppiumServerConfig,
  AppiumCommonCapabilitiesConfig,
} from '../types/config';
import { Logger } from './logger';

const logger = Logger.getInstance();

/**
 * 统一移动端配置加载器（单例）
 *
 * 优先级链：环境变量 > configs/mobile.config.js > 内置默认值
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
  private configPath: string;

  private constructor() {
    this.configPath = path.join(process.cwd(), 'configs', 'mobile.config.js');
  }

  static getInstance(): MobileConfigLoader {
    if (!MobileConfigLoader.instance) {
      MobileConfigLoader.instance = new MobileConfigLoader();
    }
    return MobileConfigLoader.instance;
  }

  /**
   * 加载并缓存统一配置文件
   * 允许外部传入已加载的配置（主要用于 .detoxrc.js 等场景避免循环依赖）
   */
  load(): MobileConfig {
    if (this.config) {
      return this.config;
    }

    try {
      // 清除 require 缓存，确保获取最新配置（开发时热更新）
      delete require.cache[require.resolve(this.configPath)];
      this.config = require(this.configPath) as MobileConfig;
      logger.info(`Mobile config loaded from: ${this.configPath}`);
    } catch (error: any) {
      logger.warn(`Failed to load mobile config from ${this.configPath}: ${error.message}`);
      logger.warn('Falling back to built-in defaults');
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

  /**
   * 获取 Appium Server 配置（环境变量优先）
   * 优先级：APPIUM_HOST/APPIUM_PORT 环境变量 > 配置文件 > 默认值
   */
  getAppiumServerConfig(): AppiumServerConfig {
    const fileConfig = this.load().appium.server;
    return {
      host: process.env.APPIUM_HOST || fileConfig.host || '0.0.0.0',
      port: parseInt(process.env.APPIUM_PORT || String(fileConfig.port) || '4723', 10),
    };
  }

  /**
   * 获取应用路径（相对路径，调用方自行 resolve）
   */
  getApplications(): { androidApk: string; iosApp: string } {
    return this.load().applications;
  }

  /**
   * 构建指定平台的 Appium capabilities（环境变量作为覆盖层）
   *
   * 优先级：环境变量 > 配置文件 > 内置默认值
   *
   * @param platform 'android' | 'ios'
   * @returns WebdriverIO RemoteOptions['capabilities'] 格式的 capabilities 对象
   */
  getAppiumCapabilities(platform: 'android' | 'ios'): Record<string, any> {
    const appiumConfig = this.getAppiumConfig();
    const capabilities: Record<string, any> = {};

    // ---------- 通用 capabilities ----------
    const common = appiumConfig.common;
    capabilities.platformName = platform === 'ios' ? 'iOS' : 'Android';

    // ---------- 平台特定 capabilities ----------
    if (platform === 'android') {
      const android = appiumConfig.android;
      capabilities['appium:automationName'] =
        process.env.ANDROID_AUTOMATION_NAME || android.automationName;
      capabilities['appium:deviceName'] =
        process.env.ANDROID_DEVICE_NAME || android.deviceName;
      capabilities['appium:platformVersion'] =
        process.env.ANDROID_PLATFORM_VERSION || android.platformVersion;

      // 应用定位：环境变量 > 配置文件 appPackage/appActivity > 配置文件 app > applications.androidApk
      const envAppPackage = process.env.ANDROID_APP_PACKAGE;
      const envAppActivity = process.env.ANDROID_APP_ACTIVITY;
      const envAppPath = process.env.ANDROID_APP_PATH;
      const cfgAppPackage = android.appPackage;
      const cfgAppActivity = android.appActivity;
      const cfgApp = android.app;

      if (envAppPackage && envAppActivity) {
        capabilities['appium:appPackage'] = envAppPackage;
        capabilities['appium:appActivity'] = envAppActivity;
      } else if (envAppPath) {
        capabilities['appium:app'] = envAppPath;
      } else if (cfgAppPackage && cfgAppActivity) {
        capabilities['appium:appPackage'] = cfgAppPackage;
        capabilities['appium:appActivity'] = cfgAppActivity;
      } else if (cfgApp) {
        capabilities['appium:app'] = path.resolve(process.cwd(), cfgApp);
      } else {
        // 回退到 applications.androidApk
        const apkRel = this.getApplications().androidApk;
        if (apkRel) {
          capabilities['appium:app'] = path.resolve(process.cwd(), apkRel);
          logger.info(`Using APK from mobile config: ${capabilities['appium:app']}`);
        }
      }

      // systemPort
      const systemPort =
        process.env.ANDROID_SYSTEM_PORT
          ? parseInt(process.env.ANDROID_SYSTEM_PORT, 10)
          : android.systemPort;
      if (systemPort) {
        capabilities['appium:systemPort'] = systemPort;
      }

      // 额外 capabilities（配置文件中的 android.capabilities 键值对）
      this.mergeExtraCapabilities(capabilities, android.capabilities);

      // 环境变量覆盖：autoGrantPermissions
      if (process.env.AUTO_GRANT_PERMISSIONS !== undefined) {
        capabilities['appium:autoGrantPermissions'] = process.env.AUTO_GRANT_PERMISSIONS === 'true';
      }
    }

    if (platform === 'ios') {
      const ios = appiumConfig.ios;
      capabilities['appium:automationName'] =
        process.env.IOS_AUTOMATION_NAME || ios.automationName;
      capabilities['appium:deviceName'] =
        process.env.IOS_DEVICE_NAME || ios.deviceName;
      capabilities['appium:platformVersion'] =
        process.env.IOS_PLATFORM_VERSION || ios.platformVersion;

      // UDID（环境变量 > 配置文件）
      const udid = process.env.IOS_UDID || ios.udid;
      if (udid) {
        capabilities['appium:udid'] = udid;
      }

      // deviceType
      const deviceType = process.env.IOS_DEVICE_TYPE || ios.deviceType;

      // 应用定位：环境变量 bundleId > 环境变量 app > 配置文件 bundleId > 配置文件 app > applications.iosApp
      const envBundleId = process.env.IOS_BUNDLE_ID;
      const envAppPath = process.env.IOS_APP_PATH;
      const cfgBundleId = ios.bundleId;
      const cfgApp = ios.app;

      if (envBundleId) {
        capabilities['appium:bundleId'] = envBundleId;
      } else if (envAppPath) {
        capabilities['appium:app'] = envAppPath;
      } else if (cfgBundleId) {
        capabilities['appium:bundleId'] = cfgBundleId;
      } else if (cfgApp) {
        capabilities['appium:app'] = path.resolve(process.cwd(), cfgApp);
      } else {
        const iosAppRel = this.getApplications().iosApp;
        if (iosAppRel) {
          capabilities['appium:app'] = path.resolve(process.cwd(), iosAppRel);
          logger.info(`Using iOS app from mobile config: ${capabilities['appium:app']}`);
        }
      }

      // 真机签名
      if (deviceType === 'real') {
        capabilities['appium:xcodeSigningId'] =
          process.env.IOS_XCODE_SIGNING_ID || ios.xcodeSigningId;
        const teamId = process.env.IOS_TEAM_ID || ios.xcodeOrgId;
        if (teamId) {
          capabilities['appium:xcodeOrgId'] = teamId;
        }
      }

      // 额外 capabilities（配置文件中的 ios.capabilities 键值对）
      this.mergeExtraCapabilities(capabilities, ios.capabilities);

      // 环境变量覆盖
      if (process.env.AUTO_ACCEPT_ALERTS !== undefined) {
        capabilities['appium:autoAcceptAlerts'] = process.env.AUTO_ACCEPT_ALERTS === 'true';
      }
      if (process.env.IOS_CONNECT_HARDWARE_KEYBOARD !== undefined) {
        capabilities['appium:connectHardwareKeyboard'] =
          process.env.IOS_CONNECT_HARDWARE_KEYBOARD === 'true';
      }
    }

    // ---------- 通用 capabilities（环境变量覆盖） ----------
    if (process.env.NO_RESET !== undefined) {
      capabilities['appium:noReset'] = process.env.NO_RESET === 'true';
    } else if (common.noReset) {
      capabilities['appium:noReset'] = common.noReset;
    }

    if (process.env.FULL_RESET !== undefined) {
      capabilities['appium:fullReset'] = process.env.FULL_RESET === 'true';
    } else if (common.fullReset) {
      capabilities['appium:fullReset'] = common.fullReset;
    }

    if (process.env.NEW_COMMAND_TIMEOUT !== undefined) {
      capabilities['appium:newCommandTimeout'] = parseInt(process.env.NEW_COMMAND_TIMEOUT, 10);
    } else if (common.newCommandTimeout) {
      capabilities['appium:newCommandTimeout'] = common.newCommandTimeout;
    }

    if (process.env.LANGUAGE || common.language) {
      capabilities['appium:language'] = process.env.LANGUAGE || common.language;
    }
    if (process.env.LOCALE || common.locale) {
      capabilities['appium:locale'] = process.env.LOCALE || common.locale;
    }
    if (process.env.ORIENTATION || common.orientation) {
      capabilities['appium:orientation'] = process.env.ORIENTATION || common.orientation;
    }

    logger.debug('Built capabilities from mobile config + env overrides:', JSON.stringify(capabilities, null, 2));
    return capabilities;
  }

  /**
   * 将配置文件中的额外 capabilities 键值对合并到 capabilities 对象
   * 自动添加 appium: 前缀（如果键名没有前缀的话）
   */
  private mergeExtraCapabilities(
    capabilities: Record<string, any>,
    extra: Record<string, any>,
  ): void {
    if (!extra || typeof extra !== 'object') {
      return;
    }
    for (const [key, value] of Object.entries(extra)) {
      const prefixedKey = key.startsWith('appium:') || key === 'platformName'
        ? key
        : `appium:${key}`;
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
        server: { host: '0.0.0.0', port: 4723 },
        android: {
          automationName: 'UiAutomator2',
          deviceName: 'Pixel_10_Pro_XL',
          platformVersion: '17',
          appPackage: '',
          appActivity: '',
          app: '',
          capabilities: {},
        },
        ios: {
          automationName: 'XCUITest',
          deviceName: 'iPhone 17 Pro',
          platformVersion: '18.0',
          bundleId: '',
          app: '',
          udid: '',
          deviceType: 'simulator',
          xcodeSigningId: 'iPhone Developer',
          xcodeOrgId: '',
          capabilities: {},
        },
        common: {
          noReset: false,
          fullReset: false,
          newCommandTimeout: 300,
          language: '',
          locale: '',
          orientation: '',
        },
      },
      applications: {
        androidApk: '',
        iosApp: '',
      },
    };
  }
}

// 导出单例
export const mobileConfig = MobileConfigLoader.getInstance();
