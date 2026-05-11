import { Logger } from '../utils/logger';
import { config } from '../utils/config';

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
  
  logger.info('=== Global Test Setup Completed ===');
}
