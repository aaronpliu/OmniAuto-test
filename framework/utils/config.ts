import * as fs from 'fs';
import * as path from 'path';
import { EnvironmentConfig, FrameworkConfig } from '../types/config';
import { Logger } from './logger';

const logger = Logger.getInstance();

export class ConfigManager {
  private static instance: ConfigManager;
  private config: EnvironmentConfig | null = null;
  private frameworkConfig: FrameworkConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  loadEnvironment(env?: string): EnvironmentConfig {
    const environment = env || process.env.NODE_ENV || 'development';
    logger.info(`Loading configuration for environment: ${environment}`);

    const configPath = path.join(process.cwd(), 'configs', `${environment}.json`);
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const configData = fs.readFileSync(configPath, 'utf-8');
    this.config = JSON.parse(configData) as EnvironmentConfig;
    
    logger.info(`Configuration loaded successfully for ${environment}`);
    return this.config;
  }

  getConfig(): EnvironmentConfig {
    if (!this.config) {
      return this.loadEnvironment();
    }
    return this.config;
  }

  getFrameworkConfig(): FrameworkConfig {
    if (!this.frameworkConfig) {
      this.frameworkConfig = {
        environment: process.env.NODE_ENV || 'development',
        platform: (process.env.TEST_PLATFORM || 'ios') as 'ios' | 'android' | 'web',
        headless: process.env.HEADLESS === 'true',
        screenshotOnFailure: process.env.SCREENSHOT_ON_FAILURE !== 'false',
        videoRecording: process.env.VIDEO_RECORDING === 'true',
        allureEnabled: process.env.ALLURE_ENABLED !== 'false'
      };
    }
    return this.frameworkConfig;
  }

  getBaseUrl(): string {
    return this.getConfig().app.baseUrl;
  }

  getApiBaseUrl(): string {
    return this.getConfig().app.apiBaseUrl;
  }

  getCredentials(): { username: string; password: string } {
    return this.getConfig().credentials;
  }
}

export const config = ConfigManager.getInstance();
