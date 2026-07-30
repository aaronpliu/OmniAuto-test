/**
 * Action 分发器
 * Action Dispatcher
 *
 * 替代原有 ActionFactory 的硬编码 switch 分发。
 * 通过 PluginRegistry 查找对应平台的插件，委托插件创建 Actions 实例。
 *
 * 使用方式：
 *   const dispatcher = new ActionDispatcher(registry);
 *   const actions = dispatcher.create({ platform: "android" });
 */

import { IActions } from "../interfaces/IActions";
import { ActionConfig } from "../interfaces/IConfigProvider";
import { PluginRegistry } from "./PluginRegistry";

export class ActionDispatcher {
  private registry: PluginRegistry;

  constructor(registry: PluginRegistry) {
    this.registry = registry;
  }

  /**
   * 根据配置创建 Actions 实例
   *
   * @param config 操作实例配置
   * @returns 对应平台的 Actions 实例（经 Proxy 包装）
   */
  create(config: ActionConfig): IActions {
    const plugin = this.registry.getPluginForPlatform(config.platform);
    return plugin.createActions(config);
  }

  /**
   * 便捷方法：为移动端创建 Actions 实例
   */
  createForMobile(platform: "ios" | "android", capabilities?: Record<string, unknown>): IActions {
    return this.create({ platform, capabilities });
  }

  /**
   * 便捷方法：为 Web 端创建 Actions 实例
   */
  createForWeb(page: unknown, browser?: unknown): IActions {
    return this.create({ platform: "web", page, browser });
  }
}
