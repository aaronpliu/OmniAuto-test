import { Logger } from "../utils/logger";

const logger = Logger.getInstance();

/**
 * 全局 unhandledRejection 处理器
 * 抑制 Jest 环境 teardown 后 WebdriverIO 内部轮询产生的 ReferenceError
 * 这些错误是预期的：测试超时后 WebdriverIO 的 waitUntil 循环仍在发 HTTP 请求
 */
function suppressTornDownErrors(): void {
  process.on("unhandledRejection", (reason: unknown) => {
    if (reason instanceof ReferenceError) {
      const msg = reason.message || "";
      if (msg.includes("after the Jest environment has been torn down")) {
        logger.debug("[suppressed] WebdriverIO post-teardown rejection");
        return;
      }
    }
    const reasonStr = reason instanceof Error ? reason.message : String(reason);
    logger.warn(`[unhandledRejection] ${reasonStr}`);
  });
}

export default function appiumSetup(): Promise<void> {
  suppressTornDownErrors();

  const platform = process.env.TEST_PLATFORM || "android";
  logger.info("========== 测试环境附加设置 ==========");
  logger.info(`当前环境: ${process.env.NODE_ENV || "development"}`);
  logger.info(`测试平台: ${platform}`);

  if (platform === "android") {
    logger.info(`Android 设备: ${process.env.ANDROID_DEVICE_NAME || "未指定"}`);
    logger.info(
      `设备类型: ${process.env.ANDROID_DEVICE_TYPE === "emulator" ? "模拟器" : process.env.ANDROID_DEVICE_TYPE === "real" ? "真机" : "未知"}`
    );
  }

  if (platform === "ios") {
    const iosMode = process.env.IOS_AUTOMATION_MODE || "detox";
    logger.info(`iOS 自动化模式: ${iosMode}`);
    if (iosMode === "appium") {
      logger.info(`iOS 设备: ${process.env.IOS_DEVICE_NAME || "未指定"}`);
      logger.info(
        `设备类型: ${process.env.IOS_DEVICE_TYPE === "simulator" ? "模拟器" : process.env.IOS_DEVICE_TYPE === "real" ? "真机" : "未知"}`
      );
      logger.info(`应用路径: ${process.env.IOS_APP_PATH || "未指定"}`);
    }
  }

  logger.info("========== 测试环境附加设置完成 ==========");
  return Promise.resolve();
}
