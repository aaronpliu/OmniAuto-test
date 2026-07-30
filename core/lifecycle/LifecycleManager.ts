/**
 * 生命周期管理器
 * Lifecycle Manager
 *
 * 编排各插件的 LifecycleHooks，替代 globalSetup.ts 中的硬编码 if-else。
 * 阶段三将从 hooks/ 迁移到此处的完整实现。
 *
 * 执行顺序：
 *   beforeAll: 按注册顺序执行所有插件的 beforeAll
 *   beforeEach: 按注册顺序执行所有插件的 beforeEach
 *   afterEach: 按注册逆序执行所有插件的 afterEach
 *   afterAll: 按注册逆序执行所有插件的 afterAll
 */

import { LifecycleHooks } from "../interfaces/IPlugin";
import { TestResultContext } from "../interfaces/IReporter";
import { PluginRegistry } from "../registry/PluginRegistry";

export class LifecycleManager {
  private static instance: LifecycleManager;
  private registry: PluginRegistry;
  private hooks: LifecycleHooks[] = [];

  constructor(registry: PluginRegistry) {
    this.registry = registry;
  }

  static getInstance(registry?: PluginRegistry): LifecycleManager {
    if (!LifecycleManager.instance) {
      if (!registry) {
        throw new Error("LifecycleManager requires a PluginRegistry on first initialization");
      }
      LifecycleManager.instance = new LifecycleManager(registry);
    }
    return LifecycleManager.instance;
  }

  /** 刷新钩子列表（插件注册/销毁后调用） */
  refreshHooks(): void {
    this.hooks = this.registry.collectLifecycleHooks();
  }

  /** 执行所有插件的 beforeAll */
  async runBeforeAll(): Promise<void> {
    this.refreshHooks();
    for (const hook of this.hooks) {
      if (hook.beforeAll) {
        await hook.beforeAll();
      }
    }
  }

  /** 执行所有插件的 beforeEach */
  async runBeforeEach(): Promise<void> {
    for (const hook of this.hooks) {
      if (hook.beforeEach) {
        await hook.beforeEach();
      }
    }
  }

  /** 执行所有插件的 afterEach（逆序） */
  async runAfterEach(context: TestResultContext): Promise<void> {
    const reversed = [...this.hooks].reverse();
    for (const hook of reversed) {
      if (hook.afterEach) {
        await hook.afterEach(context);
      }
    }
  }

  /** 执行所有插件的 afterAll（逆序） */
  async runAfterAll(): Promise<void> {
    const reversed = [...this.hooks].reverse();
    for (const hook of reversed) {
      if (hook.afterAll) {
        await hook.afterAll();
      }
    }
  }
}
