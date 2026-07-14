import { Logger } from "../utils/logger";
import { getAppiumServer } from "../utils/appiumServer";
import { mobileConfig } from "../utils/mobileConfig";

const logger = Logger.getInstance();

export default async function globalTeardown() {
  logger.info("========== 测试环境清理开始 ==========");

  try {
    // 1) 强制杀掉 Appium session，释放 WebdriverIO 的 pending 请求
    //    （避免 Jest 环境 teardown 后 WebdriverIO 内部持续 import 报错）
    try {
      const serverConfig = mobileConfig.getAppiumServerConfig();
      const host = process.env.APPIUM_HOST || serverConfig.host || "0.0.0.0";
      const port = process.env.APPIUM_PORT || String(serverConfig.port) || "4723";
      const sessionBase = `http://${host}:${port}/session`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const resp = await fetch(`${sessionBase}s`, { signal: controller.signal });
        const body = JSON.parse(await resp.text());
        const sessions = (body.value ?? []) as Array<{ id: string }>;
        for (const s of sessions) {
          await fetch(`${sessionBase}/${s.id}`, {
            method: "DELETE",
            signal: controller.signal,
          }).catch(() => {});
        }
      } catch {
        /* fetch 失败说明 Appium 已不在运行 */
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      /* ignore — getAppiumServer 可能未初始化 */
    }

    // 2) 停止 Appium server
    logger.info("正在停止 Appium server...");
    const appiumServer = getAppiumServer();
    await appiumServer.stop();

    // 3) 清理环境变量
    logger.info("正在清理环境变量...");
    delete process.env.ANDROID_DEVICE_NAME;
    delete process.env.ANDROID_PLATFORM_VERSION;
    delete process.env.ANDROID_DEVICE_TYPE;
    delete process.env.IOS_DEVICE_NAME;
    delete process.env.IOS_PLATFORM_VERSION;
    delete process.env.IOS_UDID;
    delete process.env.IOS_DEVICE_TYPE;

    logger.info("========== 测试环境清理完成 ==========");
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`环境清理失败: ${errMsg}`);
  }
}
