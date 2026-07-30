/**
 * 全局测试清理
 * Global Test Teardown
 *
 * 框架级职责：调用 LifecycleManager.runAfterAll() 编排各插件的清理逻辑，
 * 然后销毁 PluginRegistry。
 *
 * 插件级职责（通过 afterAll 钩子）：
 *   AppiumPlugin: 清理 session + 停止 server + 清理环境变量
 *   DetoxPlugin: 由 Detox CLI 管理（此处无操作）
 */
import { Logger } from "../utils/Logger";
import { PluginRegistry } from "../../core/registry/PluginRegistry";
import { LifecycleManager } from "../../core/lifecycle/LifecycleManager";

const logger = Logger.getInstance();

export default async function globalTeardown() {
  logger.info("========== 测试环境清理开始 ==========");

  try {
    const registry = PluginRegistry.getInstance();
    if (registry.isInitialized) {
      const lifecycleManager = LifecycleManager.getInstance(registry);
      await lifecycleManager.runAfterAll();
      await registry.destroyAll();
    }

    logger.info("========== 测试环境清理完成 ==========");
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`环境清理失败: ${errMsg}`);
  }
}
