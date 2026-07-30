/**
 * Core Interfaces — 统一导出
 *
 * 所有插件接口的集中导出入口。
 */

export type { IActions } from "./IActions";
export type { IMediaProvider } from "./IMediaProvider";
export type { IDeviceProvider, DeviceInfo } from "./IDeviceProvider";
export type { IConfigProvider, PluginConfig, ActionConfig } from "./IConfigProvider";
export type { IReporter, StepRecord, StepStatus, LogLevel, TestResultContext } from "./IReporter";
export type { IPlugin, LifecycleHooks, PluginInfo } from "./IPlugin";
