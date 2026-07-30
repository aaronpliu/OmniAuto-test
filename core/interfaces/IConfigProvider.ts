/**
 * 配置提供者接口
 * Config Provider Interface
 *
 * 抽象配置访问能力，插件可通过此接口获取自身所需的配置。
 * 实际配置加载仍由 core/config/ 中的 MobileConfigLoader 和 UnifiedConfigLoader 负责。
 */

/** 插件配置（初始化时传入） */
export interface PluginConfig {
  /** 当前运行环境 */
  environment: string;
  /** 是否为 CI 环境 */
  isCI: boolean;
  /** 插件专属配置段（从配置文件读取） */
  options: Record<string, unknown>;
}

/** 操作实例配置（创建 Actions 时传入） */
export interface ActionConfig {
  /** 目标平台 */
  platform: string;
  /** Appium capabilities（Appium 插件使用） */
  capabilities?: Record<string, unknown>;
  /** Playwright Page 对象（Playwright 插件使用） */
  page?: unknown;
  /** Playwright Browser 对象（Playwright 插件使用） */
  browser?: unknown;
}

/** 配置提供者 */
export interface IConfigProvider {
  /** 获取插件初始化配置 */
  getPluginConfig(): PluginConfig;

  /** 获取操作实例配置 */
  getActionConfig(platform: string): ActionConfig;
}
