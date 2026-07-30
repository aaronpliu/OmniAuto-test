/**
 * 插件生命周期接口
 * Plugin Lifecycle Interface
 *
 * 定义插件的标准生命周期：初始化 → 创建操作实例 → 生命周期钩子 → 销毁。
 * 所有测试工具插件（Detox、Appium、Playwright、API）必须实现此接口。
 */

import { IActions } from "./IActions";
import { IMediaProvider } from "./IMediaProvider";
import { IDeviceProvider } from "./IDeviceProvider";
import { PluginConfig, ActionConfig } from "./IConfigProvider";
import { TestResultContext } from "./IReporter";

/** 插件生命周期钩子 */
export interface LifecycleHooks {
  /** 全局初始化（globalSetup 阶段调用） */
  beforeAll?: () => Promise<void>;
  /** 每个测试开始前（beforeEach 阶段调用） */
  beforeEach?: () => Promise<void>;
  /** 每个测试结束后（afterEach 阶段调用） */
  afterEach?: (context: TestResultContext) => Promise<void>;
  /** 全局清理（globalTeardown 阶段调用） */
  afterAll?: () => Promise<void>;
}

/** 插件信息（用于 listPlugins 展示） */
export interface PluginInfo {
  /** 插件名称 */
  name: string;
  /** 支持的平台列表 */
  platforms: string[];
  /** 插件版本 */
  version: string;
  /** 是否已启用 */
  enabled: boolean;
}

/**
 * 插件接口 — 所有测试工具插件必须实现此接口。
 *
 * @example
 * ```typescript
 * class AppiumPlugin implements IPlugin {
 *   readonly name = "appium";
 *   readonly platforms = ["ios", "android"];
 *   readonly version = "1.0.0";
 *
 *   async initialize(config: PluginConfig): Promise<void> { ... }
 *   createActions(config: ActionConfig): IActions { ... }
 *   getLifecycleHooks(): LifecycleHooks { ... }
 *   getMediaProvider(): IMediaProvider { ... }
 *   async destroy(): Promise<void> { ... }
 * }
 * ```
 */
export interface IPlugin {
  /** 插件唯一标识（如 "detox", "appium", "playwright", "api"） */
  readonly name: string;

  /** 插件支持的 platform 标识列表（如 ["ios", "android"]） */
  readonly platforms: string[];

  /** 插件版本 */
  readonly version: string;

  /**
   * 初始化插件（globalSetup 阶段调用）
   * @param config 插件配置
   */
  initialize(config: PluginConfig): Promise<void>;

  /**
   * 创建操作实例
   * @param config 操作实例配置
   */
  createActions(config: ActionConfig): IActions;

  /**
   * 获取设备管理器（可选，仅移动端插件需要）
   */
  getDeviceProvider?(): IDeviceProvider;

  /**
   * 获取媒体能力提供者（截图/录屏，可选）
   */
  getMediaProvider?(): IMediaProvider;

  /**
   * 获取插件专属生命周期钩子
   */
  getLifecycleHooks(): LifecycleHooks;

  /**
   * 销毁插件（globalTeardown 阶段调用）
   */
  destroy(): Promise<void>;
}
