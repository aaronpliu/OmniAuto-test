import { Logger } from '../utils/logger';
import { config } from '../utils/config';
import { getAppiumServer } from '../utils/appiumServer';
import { getDeviceDetector } from '../utils/deviceDetector';

const logger = Logger.getInstance();

export default async function globalSetup() {
  logger.info('=== Global Test Setup Started ===');
  
  // Load configuration
  const envConfig = config.loadEnvironment();
  const fwConfig = config.getFrameworkConfig();
  
  logger.info(`Environment: ${fwConfig.environment}`);
  logger.info(`Platform: ${fwConfig.platform}`);
  
  // Create artifacts directories
  const fs = require('fs');
  const path = require('path');
  
  const dirs = [
    'artifacts/screenshots',
    'artifacts/logs',
    'artifacts/allure-results',
    'artifacts/videos'
  ];
  
  dirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
  
  // 如果是 Android 平台，自动启动 Appium server 并检测设备
  if (fwConfig.platform === 'android') {
    logger.info('检测到 Android 平台，正在启动 Appium server...');
    try {
      const appiumServer = getAppiumServer();
      await appiumServer.start();
      logger.info('✓ Appium server 启动成功');
    } catch (error: any) {
      logger.error(`Appium server 启动失败: ${error.message}`);
      logger.error('请检查 Appium 是否已安装 (npm install -g appium)');
      throw error;
    }
    
    // 检测 Android 设备
    logger.info('正在检测 Android 设备...');
    try {
      const deviceDetector = getDeviceDetector();
      const selectedDevice = await deviceDetector.detectAndSelectDevice();
      logger.info(`✓ 已选择设备: ${selectedDevice.udid} (${selectedDevice.model})`);
    } catch (error: any) {
      logger.warn(`设备检测失败: ${error.message}`);
      logger.warn('测试可能会失败，请确保 Android 设备已连接');
    }
  }
  
  logger.info('=== Global Test Setup Completed ===');
}
