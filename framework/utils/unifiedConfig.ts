import * as path from "path";
import { Logger } from "./logger";
import { WebConfig, ApiConfig, FrameworkBehaviorConfig } from "../types/config";

const logger = Logger.getInstance();

/** configs/index.js require 后的原始结构 */
interface RawPlatformConfigs {
  mobile: any;
  web: any;
  api: any;
  framework: any;
}

/**
 * 统一配置加载器
 *
 * 聚合 configs/ 目录下所有模式配置（mobile / web / api / framework），
 * 提供"环境变量 > 配置文件 > 内置默认值"的优先级链访问。
 *
 * - 移动端配置继续由 MobileConfigLoader（mobileConfig.ts）管理
 * - 本加载器负责 web / api / framework 三大区块的类型化访问
 */
export class UnifiedConfigLoader {
  private static instance: UnifiedConfigLoader;
  private raw: RawPlatformConfigs | null = null;

  private constructor() {}

  static getInstance(): UnifiedConfigLoader {
    if (!UnifiedConfigLoader.instance) {
      UnifiedConfigLoader.instance = new UnifiedConfigLoader();
    }
    return UnifiedConfigLoader.instance;
  }

  /** 加载 configs/index.js 聚合配置（懒加载，仅一次） */
  private load(): RawPlatformConfigs {
    if (this.raw) {
      return this.raw;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- dynamic config path resolved at runtime
      this.raw = require(path.resolve(process.cwd(), "configs", "index.js")) as RawPlatformConfigs;
      logger.debug("Unified platform configs loaded from configs/index.js");
    } catch (error) {
      logger.warn(`Failed to load configs/index.js: ${(error as Error).message}`);
      this.raw = { mobile: {}, web: {}, api: {}, framework: {} };
    }
    return this.raw;
  }

  /**
   * 获取 Web 模式配置
   * 优先级：环境变量 BASE_URL > configs/web.config.local.js > 内置默认值
   */
  getWebConfig(): WebConfig {
    const raw = this.load().web || {};
    return {
      baseURL: process.env.BASE_URL || raw.baseURL || "http://localhost:3000",
      timeout: raw.timeout ?? 60000,
      expectTimeout: raw.expectTimeout ?? 10000,
      retries: raw.retries ?? (process.env.CI ? 2 : 0),
      workers: raw.workers ?? (process.env.CI ? 1 : undefined),
      trace: raw.trace ?? "on-first-retry",
      screenshot: raw.screenshot ?? "only-on-failure",
      video: raw.video ?? "retain-on-failure",
      outputDir: raw.outputDir || path.resolve(process.cwd(), "artifacts", "test-results"),
      reporter: raw.reporter || [["html"], ["allure-playwright"]],
      projects: raw.projects || [],
    };
  }

  /**
   * 获取 API 模式配置
   * 优先级：环境变量 API_TIMEOUT > configs/api.config.local.js > 内置默认值
   */
  getApiConfig(): ApiConfig {
    const raw = this.load().api || {};
    return {
      timeout: process.env.API_TIMEOUT
        ? parseInt(process.env.API_TIMEOUT, 10)
        : (raw.timeout ?? 30000),
      headers: raw.headers || { "Content-Type": "application/json" },
      retryAttempts: raw.retryAttempts ?? 0,
      retryDelay: raw.retryDelay ?? 1000,
      baseURL: raw.baseURL || "",
    };
  }

  /**
   * 获取框架行为配置
   * 优先级：环境变量 > configs/framework.config.local.js > 内置默认值
   *
   * 判断规则：环境变量显式设置（!== undefined）时优先，否则回退配置文件，再回退默认值。
   */
  getFrameworkBehaviorConfig(): FrameworkBehaviorConfig {
    const raw = this.load().framework || {};
    return {
      screenshotOnFailure:
        process.env.SCREENSHOT_ON_FAILURE !== undefined
          ? process.env.SCREENSHOT_ON_FAILURE !== "false"
          : (raw.screenshotOnFailure ?? true),
      videoRecording:
        process.env.VIDEO_RECORDING !== undefined
          ? process.env.VIDEO_RECORDING === "true"
          : (raw.videoRecording ?? false),
      headless:
        process.env.HEADLESS !== undefined
          ? process.env.HEADLESS === "true"
          : (raw.headless ?? false),
      allureEnabled:
        process.env.ALLURE_ENABLED !== undefined
          ? process.env.ALLURE_ENABLED !== "false"
          : (raw.allureEnabled ?? true),
    };
  }
}

export const unifiedConfig = UnifiedConfigLoader.getInstance();
