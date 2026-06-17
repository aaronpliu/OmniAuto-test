import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

export default async function appiumSetup() {
  logger.info('========== 测试环境附加设置 ==========');
  logger.info(`当前环境: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Android 设备: ${process.env.ANDROID_DEVICE_NAME || '未指定'}`);
  logger.info(`设备类型: ${process.env.ANDROID_DEVICE_TYPE === 'emulator' ? '模拟器' : process.env.ANDROID_DEVICE_TYPE === 'real' ? '真机' : '未知'}`);
  logger.info('========== 测试环境附加设置完成 ==========');
}
