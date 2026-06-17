import { Logger } from '../utils/logger';
import { getAppiumServer } from '../utils/appiumServer';

const logger = Logger.getInstance();

export default async function globalTeardown() {
  logger.info('========== 测试环境清理开始 ==========');
  
  try {
    // 停止 Appium server
    logger.info('正在停止 Appium server...');
    const appiumServer = getAppiumServer();
    await appiumServer.stop();
    
    // 清理环境变量
    logger.info('正在清理环境变量...');
    delete process.env.ANDROID_DEVICE_NAME;
    delete process.env.ANDROID_PLATFORM_VERSION;
    delete process.env.ANDROID_DEVICE_TYPE;
    
    logger.info('========== 测试环境清理完成 ==========');
  } catch (error: any) {
    logger.error(`环境清理失败: ${error.message}`);
  }
}
