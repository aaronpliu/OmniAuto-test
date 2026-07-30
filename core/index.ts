/**
 * OmniAutoTest Core — 公开 API
 *
 * 框架核心的统一导出入口。
 * 插件开发者和高级用户可直接引用 @omnitest/core 访问所有核心模块。
 *
 * 使用方式：
 *   import { PluginRegistry, ActionDispatcher, ReportManager } from '@omnitest/core';
 */

// ---- Interfaces ----
export type {
  IActions,
  IMediaProvider,
  IDeviceProvider,
  DeviceInfo,
  IConfigProvider,
  PluginConfig,
  ActionConfig,
  IReporter,
  StepRecord,
  StepStatus,
  LogLevel,
  TestResultContext,
  IPlugin,
  LifecycleHooks,
  PluginInfo,
} from "./interfaces";

// ---- Registry ----
export { PluginRegistry, ActionDispatcher } from "./registry";

// ---- Reporting ----
export { ReportManager, StepRecorder, ScreenshotService, RecordingService } from "./reporting";

// ---- Lifecycle ----
export { LifecycleManager } from "./lifecycle";

// ---- Utils ----
export { Logger } from "./utils/Logger";
export { SoftAssert, createSoftAssert } from "./utils/SoftAssert";
export { Helpers } from "./utils/Helpers";

// ---- Selector ----
export { by } from "./selector";

// ---- Config ----
export { config } from "./config/ConfigManager";
export { mobileConfig } from "./config/MobileConfigLoader";
export { unifiedConfig } from "./config/UnifiedConfigLoader";
