/**
 * 统一报告接口
 * Unified Reporter Interface
 *
 * 定义报告后端的标准接口，支持多后端并存（Allure、JSON、平台 API）。
 * 各报告后端实现此接口，由 ReportManager 统一编排。
 */

/** 日志级别 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 步骤状态 */
export type StepStatus = "passed" | "failed" | "broken" | "skipped";

/** 步骤记录 */
export interface StepRecord {
  /** 步骤名称 */
  name: string;
  /** 步骤状态 */
  status: StepStatus;
  /** 开始时间戳 (ms) */
  start: number;
  /** 结束时间戳 (ms) */
  stop: number;
  /** 错误信息（仅失败时） */
  error?: string;
  /** 截图路径（仅失败时） */
  screenshot?: string;
}

/** 测试结果上下文（传递给 LifecycleHooks.afterEach） */
export interface TestResultContext {
  /** 测试名称 */
  testName: string;
  /** 测试是否失败 */
  failed: boolean;
  /** 错误信息 */
  error?: Error;
}

/** 统一报告后端接口 */
export interface IReporter {
  /** 报告后端名称 */
  readonly name: string;

  /** 记录步骤 */
  recordStep(step: StepRecord): void;

  /** 附加截图 */
  attachScreenshot(name: string, path: string): void;

  /** 附加录屏 */
  attachRecording(name: string, buffer: Buffer): void;

  /** 记录日志 */
  log(level: LogLevel, message: string): void;

  /** 生成最终报告 */
  generate(): Promise<void>;
}
