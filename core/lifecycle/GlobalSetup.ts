/**
 * 全局测试初始化
 * Global Test Setup
 *
 * 框架级职责：清理 Allure 结果、加载配置、创建会话目录。
 * 插件级职责：通过 PluginRegistry + LifecycleManager 编排各插件的 beforeAll 钩子。
 *
 * 平台特定逻辑（Appium server 启动、设备检测等）已委托给 AppiumPlugin.beforeAll()。
 */
import * as path from "path";
import * as fs from "fs";
import { Logger } from "../utils/Logger";
import { config } from "../config/ConfigManager";
import { ensureSessionDir } from "../utils/SessionDir";
import { PluginRegistry } from "../../core/registry/PluginRegistry";
import { LifecycleManager } from "../../core/lifecycle/LifecycleManager";
import { AppiumPlugin } from "../../plugins/appium/AppiumPlugin";
import { DetoxPlugin } from "../../plugins/detox/DetoxPlugin";
import { PlaywrightPlugin } from "../../plugins/playwright/PlaywrightPlugin";
import { ApiPlugin } from "../../plugins/api/ApiPlugin";

const logger = Logger.getInstance();

/**
 * 清理 allure-results 目录中的旧文件，避免多次运行的结果混合导致
 * Allure 报告出现重复测试用例或 "Unknown" 条目。
 */
function cleanAllureResults(): void {
  const resultsDir = path.join(process.cwd(), "artifacts", "allure-results");
  if (!fs.existsSync(resultsDir)) {
    return;
  }
  try {
    const files = fs.readdirSync(resultsDir);
    for (const file of files) {
      if (
        file.endsWith("-result.json") ||
        file.endsWith("-container.json") ||
        file.endsWith("-attachment.png") ||
        file.endsWith("-attachment.txt") ||
        file.endsWith("-attachment.md") ||
        file.endsWith("-attachment.webm") ||
        file.endsWith("-attachment.zip") ||
        file === ".pending-steps.jsonl" ||
        file === ".pending-attach.jsonl"
      ) {
        fs.unlinkSync(path.join(resultsDir, file));
      }
    }
    logger.info("已清理 allure-results 目录中的旧结果文件");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`清理 allure-results 失败: ${msg}`);
  }
}

/**
 * 根据环境变量注册对应平台的插件
 */
function registerPlatformPlugins(registry: PluginRegistry): void {
  const platform = process.env.TEST_PLATFORM || "ios";

  if (platform === "android" || platform === "ios") {
    const iosMode = process.env.IOS_AUTOMATION_MODE || "detox";
    const androidMode = process.env.ANDROID_AUTOMATION_MODE || "appium";

    const useAppium =
      (platform === "android" && androidMode === "appium") ||
      (platform === "ios" && iosMode === "appium");

    const useDetox =
      (platform === "android" && androidMode === "detox") ||
      (platform === "ios" && iosMode !== "appium");

    if (useAppium && !registry.hasPlugin("appium")) {
      registry.register(new AppiumPlugin());
      logger.info("Registered plugin: appium");
    }
    if (useDetox && !registry.hasPlugin("detox")) {
      registry.register(new DetoxPlugin());
      logger.info("Registered plugin: detox");
    }
  }

  if (platform === "web" && !registry.hasPlugin("playwright")) {
    registry.register(new PlaywrightPlugin());
    logger.info("Registered plugin: playwright");
  }

  if (!registry.hasPlugin("api")) {
    registry.register(new ApiPlugin());
    logger.info("Registered plugin: api");
  }
}

export default async function globalSetup() {
  logger.info("=== Global Test Setup Started ===");

  // ---- 框架级初始化 ----
  cleanAllureResults();

  config.loadEnvironment();
  const fwConfig = config.getFrameworkConfig();

  logger.info(`Environment: ${fwConfig.environment}`);
  logger.info(`Platform: ${fwConfig.platform}`);

  ensureSessionDir(fwConfig.platform);

  // ---- 插件级初始化 ----
  const registry = PluginRegistry.getInstance();
  registerPlatformPlugins(registry);

  const lifecycleManager = LifecycleManager.getInstance(registry);
  await registry.initializeAll({
    environment: fwConfig.environment,
    isCI: !!process.env.CI,
    options: {},
  });
  await lifecycleManager.runBeforeAll();

  logger.info("=== Global Test Setup Completed ===");
}
