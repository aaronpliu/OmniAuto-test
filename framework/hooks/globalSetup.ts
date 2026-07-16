import * as fs from "fs";
import * as path from "path";
import { Logger } from "../utils/logger";
import { config } from "../utils/config";
import { mobileConfig } from "../utils/mobileConfig";
import { getAppiumServer } from "../utils/appiumServer";
import { getDeviceDetector } from "../utils/deviceDetector";
import { getIOSDeviceDetector } from "../utils/iosDeviceDetector";

const logger = Logger.getInstance();

/** 生成会话目录名：omnitest-2026-07-16T15-49-37+0800 */
function generateSessionDirName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absMin = Math.abs(offset);
  const tzStr = `${sign}${pad(Math.floor(absMin / 60))}${pad(absMin % 60)}`;

  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hour = pad(now.getHours());
  const minute = pad(now.getMinutes());
  const second = pad(now.getSeconds());

  return `omnitest-${year}-${month}-${day}T${hour}-${minute}-${second}${tzStr}`;
}

export default async function globalSetup() {
  logger.info("=== Global Test Setup Started ===");

  // Load configuration
  config.loadEnvironment();
  const fwConfig = config.getFrameworkConfig();

  logger.info(`Environment: ${fwConfig.environment}`);
  logger.info(`Platform: ${fwConfig.platform}`);

  // 生成本次执行的会话目录并写入环境变量
  const sessionDirName = generateSessionDirName();
  const sessionDir = path.join(process.cwd(), "artifacts", "logs", sessionDirName);
  process.env.OMNITEST_SESSION_DIR = sessionDir;
  // 将会话目录绑定到 Logger 的 file transport（解决 Logger 在 globalSetup 之前实例化的问题）
  logger.ensureFileLogging(sessionDir);
  logger.info(`Session directory: ${sessionDir}`);

  // Create artifacts directories（会话目录 + allure-results）
  const dirs = [
    path.join(sessionDir, "screenshots"),
    path.join(sessionDir, "videos"),
    "artifacts/allure-results",
  ];

  dirs.forEach((dir) => {
    const fullPath = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });

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
