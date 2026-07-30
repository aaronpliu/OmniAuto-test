/**
 * 插件注册中心
 * Plugin Registry
 *
 * 管理所有已注册插件的注册、发现、初始化和销毁。
 * 替代原有 ActionFactory 中的硬编码 switch 分发。
 *
 * 使用方式：
 *   const registry = PluginRegistry.getInstance();
 *   registry.register(new AppiumPlugin());
 *   registry.register(new DetoxPlugin());
 *   await registry.initializeAll(config);
 *   const plugin = registry.getPluginForPlatform("android");
 *   const actions = plugin.createActions(actionConfig);
 */

import { IPlugin, PluginInfo, LifecycleHooks } from "../interfaces/IPlugin";
import { PluginConfig } from "../interfaces/IConfigProvider";
import { IMediaProvider } from "../interfaces/IMediaProvider";

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins = new Map<string, IPlugin>();
  private initialized = false;

  private constructor() {}

  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * 注册插件
   * @throws 如果插件名称已存在
   */
  register(plugin: IPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * 按 platform 获取插件（遍历所有插件的 platforms 列表）
   * @throws 如果没有插件支持该平台
   */
  getPluginForPlatform(platform: string): IPlugin {
    for (const plugin of this.plugins.values()) {
      if (plugin.platforms.includes(platform)) {
        return plugin;
      }
    }
    throw new Error(`No plugin registered for platform: "${platform}"`);
  }

  /** 按名称获取插件 */
  getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  /** 检查插件是否已注册 */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /** 列出所有已注册插件 */
  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.name,
      platforms: p.platforms,
      version: p.version,
      enabled: true,
    }));
  }

  /** 获取插件的媒体能力提供者（如果存在） */
  getMediaProvider(pluginName: string): IMediaProvider | undefined {
    const plugin = this.plugins.get(pluginName);
    return plugin?.getMediaProvider?.();
  }

  /** 初始化所有已注册的插件 */
  async initializeAll(config: PluginConfig): Promise<void> {
    if (this.initialized) {
      return;
    }

    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.initialize(config);
      } catch (error) {
        throw new Error(
          `Failed to initialize plugin "${name}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    this.initialized = true;
  }

  /** 销毁所有插件（逆序，后注册的先销毁） */
  async destroyAll(): Promise<void> {
    const entries = Array.from(this.plugins.entries()).reverse();
    for (const [name, plugin] of entries) {
      try {
        await plugin.destroy();
      } catch (error) {
        // 销毁失败不阻塞其他插件
        console.warn(`Plugin "${name}" destroy failed:`, error);
      }
    }
    this.initialized = false;
  }

  /** 收集所有插件的生命周期钩子 */
  collectLifecycleHooks(): LifecycleHooks[] {
    const hooks: LifecycleHooks[] = [];
    for (const plugin of this.plugins.values()) {
      const pluginHooks = plugin.getLifecycleHooks();
      if (
        pluginHooks.beforeAll ||
        pluginHooks.beforeEach ||
        pluginHooks.afterEach ||
        pluginHooks.afterAll
      ) {
        hooks.push(pluginHooks);
      }
    }
    return hooks;
  }

  /** 是否已初始化 */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** 已注册插件数量 */
  get size(): number {
    return this.plugins.size;
  }
}
