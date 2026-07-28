import * as path from "path";
import * as fs from "fs";
import { Logger } from "../utils/logger";
import { config } from "../utils/config";
import { mobileConfig } from "../utils/mobileConfig";
import { getAppiumServer } from "../utils/appiumServer";
import { getDeviceDetector } from "../utils/deviceDetector";
import { getIOSDeviceDetector } from "../utils/iosDeviceDetector";
import { ensureSessionDir } from "../utils/sessionDir";

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
      // 只清理 Allure 结果文件和步骤暂存文件，保留目录本身
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
  } catch (error: any) {
    logger.warn(`清理 allure-results 失败: ${error.message}`);
  }
}

export default async function globalSetup() {
  logger.info("=== Global Test Setup Started ===");

  // 清理上一次运行的 Allure 结果，防止新旧数据混合
  cleanAllureResults();

  // Load configuration
  config.loadEnvironment();
  const fwConfig = config.getFrameworkConfig();

  logger.info(`Environment: ${fwConfig.environment}`);
  logger.info(`Platform: ${fwConfig.platform}`);

  // 初始化会话目录（日志、截图、视频等）
  ensureSessionDir(fwConfig.platform);

  // Android 平台：启动 Appium server 并检测设备
  if (fwConfig.platform === "android") {
    logger.info("检测到 Android 平台，正在启动 Appium server...");
    try {
      const appiumServer = getAppiumServer();
      await appiumServer.start();
      logger.info("✓ Appium server 启动成功");
    } catch (error: any) {
      logger.error(`Appium server 启动失败: ${error.message}`);
      logger.error("请检查 Appium 是否已安装 (npm install -g appium)");
      throw error;
    }

    // 检测 Android 设备
    logger.info("正在检测 Android 设备...");
    try {
      const deviceDetector = getDeviceDetector();
      const selectedDevice = await deviceDetector.detectAndSelectDevice();
      logger.info(`✓ 已选择设备: ${selectedDevice.udid} (${selectedDevice.model})`);
    } catch (error: any) {
      logger.warn(`设备检测失败: ${error.message}`);
      logger.warn("测试可能会失败，请确保 Android 设备已连接");
    }
  }

  // iOS Appium 模式：启动 Appium server 并检测 iOS 设备
  if (fwConfig.platform === "ios" && process.env.IOS_AUTOMATION_MODE === "appium") {
    logger.info("检测到 iOS (Appium) 平台，正在启动 Appium server...");
    try {
      const appiumServer = getAppiumServer();
      await appiumServer.start();
      logger.info("✓ Appium server 启动成功");
    } catch (error: any) {
      logger.error(`Appium server 启动失败: ${error.message}`);
      logger.error("请检查 Appium 是否已安装 (npm install -g appium)");
      throw error;
    }

    // 检测 iOS 设备
    logger.info("正在检测 iOS 设备/模拟器...");
    try {
      const iosDeviceDetector = getIOSDeviceDetector();
      const selectedDevice = await iosDeviceDetector.detectAndSelectDevice();
      logger.info(`✓ 已选择设备: ${selectedDevice.name} (iOS ${selectedDevice.version})`);
    } catch (error: any) {
      logger.warn(`iOS 设备检测失败: ${error.message}`);
      logger.warn("测试可能会失败，请确保 Xcode 已安装且有可用的 iOS 模拟器");
    }

    // 从统一移动端配置读取 iOS 应用路径
    try {
      const apps = mobileConfig.getApplications();
      if (apps.iosApp) {
        const appPath = path.resolve(process.cwd(), apps.iosApp);
        process.env.IOS_APP_PATH = appPath;
        logger.info(`使用统一配置中的 iOS 应用路径: ${appPath}`);
      }
    } catch (error) {
      logger.warn("无法从统一移动端配置读取 iOS 应用路径");
    }
  }

  logger.info("=== Global Test Setup Completed ===");
}
