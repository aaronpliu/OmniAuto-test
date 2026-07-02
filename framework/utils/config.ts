import * as fs from 'fs';
import * as path from 'path';
import { EnvironmentConfig, FrameworkConfig } from '../types/config';
import { Logger } from './logger';
import { unifiedConfig } from './unifiedConfig';

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

    // 从 configs/environments/ 目录加载指定环境的配置文件
    let configPath = path.join(process.cwd(), 'configs', 'environments', `${environment}.json`);

    // 如果文件不存在，回退到 development.json
    if (!fs.existsSync(configPath)) {
      logger.warn(`Configuration file not found: ${configPath}`);
      logger.info(`Falling back to development configuration`);
      configPath = path.join(process.cwd(), 'configs', 'environments', 'development.json');

      // 如果 development.json 也不存在，则报错
      if (!fs.existsSync(configPath)) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }
    }

    const configData = fs.readFileSync(configPath, 'utf-8');
    this.config = JSON.parse(configData) as EnvironmentConfig;

    logger.info(`Configuration loaded successfully from ${path.basename(configPath)}`);
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
      const behavior = unifiedConfig.getFrameworkBehaviorConfig();
      this.frameworkConfig = {
        environment: process.env.NODE_ENV || 'development',
        platform: (process.env.TEST_PLATFORM || 'ios') as 'ios' | 'android' | 'web',
        headless: behavior.headless,
        screenshotOnFailure: behavior.screenshotOnFailure,
        videoRecording: behavior.videoRecording,
        allureEnabled: behavior.allureEnabled
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
