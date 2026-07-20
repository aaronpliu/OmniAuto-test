export interface AppConfig {
  baseUrl: string;
  apiBaseUrl: string;
  timeout: number;
  implicitWait: number;
  retryAttempts: number;
}

export interface ApplicationsConfig {
  androidApk?: string;
  iosApp?: string;
}

export interface EnvironmentConfig {
  name: string;
  app: AppConfig;
  credentials: {
    username: string;
    password: string;
  };
  applications?: ApplicationsConfig;
}

export interface FrameworkConfig {
  environment: string;
  platform: "ios" | "android" | "web";
  headless: boolean;
  screenshotOnFailure: boolean;
  videoRecording: boolean;
  allureEnabled: boolean;
}

// ============================================================
// 统一移动端配置类型（MobileConfig）
// 与 configs/mobile.config.local.js 结构一一对应
// ============================================================

/** Detox 应用定义 */
export interface DetoxAppConfig {
  type: string;
  binaryPath: string;
  build?: string;
}

/** Detox 设备定义 */
export interface DetoxDeviceConfig {
  type: string;
  device: Record<string, any>;
}

/** Detox configuration（device + app 组合） */
export interface DetoxConfiguration {
  device: string;
  app: string;
}

/** Detox 行为配置 */
export interface DetoxBehaviorConfig {
  init?: {
    reinstallApp?: boolean;
    launchApp?: boolean;
  };
  cleanup?: {
    shutdownDevice?: boolean;
  };
}

/** Detox 配置区块 */
export interface DetoxConfig {
  testRunner?: {
    args?: Record<string, any>;
    jest?: Record<string, any>;
  };
  apps: Record<string, DetoxAppConfig>;
  devices: Record<string, DetoxDeviceConfig>;
  configurations: Record<string, DetoxConfiguration>;
  behavior?: DetoxBehaviorConfig;
  cli?: Record<string, any>;
}

/** Appium Server 连接配置 */
export interface AppiumServerConfig {
  host: string;
  port: number;
}

/** Appium Android capabilities 配置 */
export interface AppiumAndroidCapabilitiesConfig {
  automationName: string;
  deviceName: string;
  platformVersion: string;
  appPackage: string;
  appActivity: string;
  app: string;
  systemPort?: number;
  capabilities: Record<string, any>;
}

/** Appium iOS capabilities 配置 */
export interface AppiumIosCapabilitiesConfig {
  automationName: string;
  deviceName: string;
  platformVersion: string;
  bundleId: string;
  app: string;
  udid: string;
  deviceType: "simulator" | "real";
  xcodeSigningId: string;
  xcodeOrgId: string;
  capabilities: Record<string, any>;
}

/** Appium 通用 capabilities（iOS/Android 共享） */
export interface AppiumCommonCapabilitiesConfig {
  noReset: boolean;
  fullReset: boolean;
  newCommandTimeout: number;
  /** 隐式等待超时(ms)，0=关闭，默认 0。框架用显式 waitForElement* 控制等待 */
  implicitWaitMs?: number;
  language: string;
  locale: string;
  orientation: string;
}

/** Appium 配置区块 */
export interface AppiumConfig {
  server: AppiumServerConfig;
  android: AppiumAndroidCapabilitiesConfig;
  ios: AppiumIosCapabilitiesConfig;
  common: AppiumCommonCapabilitiesConfig;
}

/** 应用路径（统一管理） */
export interface MobileApplicationsConfig {
  androidApk: string;
  iosApp: string;
}

/** 统一移动端配置顶层接口 */
export interface MobileConfig {
  detox: DetoxConfig;
  appium: AppiumConfig;
  applications: MobileApplicationsConfig;
}

// ============================================================
// Web / API / 框架行为配置类型
// 与 configs/web.config.local.js / api.config.local.js / framework.config.local.js 对应
// ============================================================

/** Web 项目（浏览器）配置 */
export interface WebProjectConfig {
  name: string;
  browser?: string;
  device?: string;
  viewport?: { width: number; height: number };
}

/** Web 模式配置（Playwright） */
export interface WebConfig {
  baseURL: string;
  timeout: number;
  expectTimeout: number;
  retries: number;
  workers: number | undefined;
  trace: string;
  screenshot: string;
  video: string;
  outputDir: string;
  reporter: any[];
  projects: WebProjectConfig[];
}

/** API 模式配置 */
export interface ApiConfig {
  timeout: number;
  headers: Record<string, string>;
  retryAttempts: number;
  retryDelay: number;
  baseURL: string;
}

/** 框架行为配置（截图/录制/无头/报告开关） */
export interface FrameworkBehaviorConfig {
  screenshotOnFailure: boolean;
  videoRecording: boolean;
  headless: boolean;
  allureEnabled: boolean;
}
