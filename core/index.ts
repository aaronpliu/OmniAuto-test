/**
 * OmniAutoTest Core — 公开 API
 *
 * 框架核心的统一导出入口。
 */

// ---- Types ----
export type {
  TSelector,
  SelectorValue,
  PlatformSelector,
  IndexedSelector,
  ChainableSelectorLike,
  CompoundSelectorNode,
  CompoundRelation,
  Platform,
  IosAutomationMode,
  AndroidAutomationMode,
  ActionFactoryConfig,
} from "./types/actions";
export type {
  AppConfig,
  ApplicationsConfig,
  EnvironmentConfig,
  FrameworkConfig,
  MobileConfig,
  DetoxConfig,
  AppiumConfig,
  WebConfig,
  ApiConfig,
  FrameworkBehaviorConfig,
} from "./types/config";
export type { TestContext as TestContextType, TestResult } from "./types/test";

// ---- Actions ----
export { BaseActions } from "./actions/BaseActions";
export {
  ActionFactory,
  isDetoxActions,
  isAppiumActions,
  isPlaywrightActions,
} from "./actions/ActionFactory";
export { createActionProxy, tryAction } from "./actions/ActionProxy";

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
export {
  ReportManager,
  StepRecorder,
  ScreenshotService,
  RecordingService,
  step,
  stepSync,
  resizeScreenshot,
} from "./reporting";

// ---- Lifecycle ----
export { LifecycleManager } from "./lifecycle";

// ---- Utils ----
export { Logger } from "./utils/Logger";
export { SoftAssert, createSoftAssert } from "./utils/SoftAssert";
export { Helpers } from "./utils/Helpers";
export { TestContext } from "./utils/TestContext";
export { TestSessionState } from "./utils/TestSessionState";
export { generateSessionDirName, ensureSessionDir, moveDetoxArtifacts } from "./utils/SessionDir";

// ---- Selector ----
export { by } from "./selector";

// ---- Config ----
export { config } from "./config/ConfigManager";
export { mobileConfig } from "./config/MobileConfigLoader";
export { unifiedConfig } from "./config/UnifiedConfigLoader";
