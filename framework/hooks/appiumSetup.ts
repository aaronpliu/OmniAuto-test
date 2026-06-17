import { Logger } from '../utils/logger';
import { getAppiumServer } from '../utils/appiumServer';
import { getDeviceDetector } from '../utils/deviceDetector';

const logger = Logger.getInstance();

export default async function appiumSetup() {
  logger.info('========== Appium 测试环境设置开始 ==========');
  
  try {
    // 1. 自动检测并启动 Appium server
    logger.info('步骤 1/2: 检查 Appium server...');
    const appiumServer = getAppiumServer();
    await appiumServer.start();
    logger.info('✓ Appium server 已就绪');
    
    // 2. 自动检测并选择 Android 设备
    logger.info('步骤 2/2: 检测 Android 设备...');
    const deviceDetector = getDeviceDetector();
    const selectedDevice = await deviceDetector.detectAndSelectDevice();
    logger.info(`✓ 已选择设备: ${selectedDevice.udid} (${selectedDevice.model})`);
    
    logger.info('========== Appium 测试环境设置完成 ==========');
  } catch (error: any) {
    logger.error(`环境设置失败: ${error.message}`);
    logger.error('请检查：');
    logger.error('  1. Appium 是否已安装 (npm install -g appium)');
    logger.error('  2. Android 设备是否已连接并授权');
    logger.error('  3. adb 是否已正确安装并添加到 PATH');
    throw error;
  }
}
