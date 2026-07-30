/**
 * JSON 报告后端
 * JSON Report Backend
 *
 * 输出平台可消费的结构化 JSON 报告，供 Web 测试平台展示。
 * 与 Allure 后端并存，由 ReportManager 统一管理。
 */

import * as fs from "fs";
import * as path from "path";
import { IReporter, StepRecord, LogLevel } from "../core/interfaces/IReporter";
import { Logger } from "../core/utils/Logger";

const logger = Logger.getInstance();

interface JsonTestResult {
  testName: string;
  status: "passed" | "failed" | "skipped";
  startTime: number;
  endTime: number;
  duration: number;
  steps: StepRecord[];
  screenshots: string[];
  recordings: string[];
  error?: string;
}

interface JsonSuiteReport {
  platform: string;
  environment: string;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    duration: number;
  };
  tests: JsonTestResult[];
}

export class JsonBackend implements IReporter {
  readonly name = "json";

  private results: JsonTestResult[] = [];
  private currentSteps: StepRecord[] = [];
  private currentScreenshots: string[] = [];
  private currentRecordings: string[] = [];
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), "artifacts", "json-results");
  }

  recordStep(step: StepRecord): void {
    this.currentSteps.push(step);
  }

  attachScreenshot(name: string, screenshotPath: string): void {
    this.currentScreenshots.push(screenshotPath);
  }

  attachRecording(name: string, _buffer: Buffer): void {
    // JSON 后端只记录路径引用，不存储二进制数据
    this.currentRecordings.push(name);
  }

  log(level: LogLevel, message: string): void {
    logger.debug(`[JsonBackend:${level}] ${message}`);
  }

  /**
   * 记录一个测试结果
   */
  recordTestResult(
    testName: string,
    status: "passed" | "failed" | "skipped",
    startTime: number,
    endTime: number,
    error?: string
  ): void {
    this.results.push({
      testName,
      status,
      startTime,
      endTime,
      duration: endTime - startTime,
      steps: [...this.currentSteps],
      screenshots: [...this.currentScreenshots],
      recordings: [...this.currentRecordings],
      error,
    });

    // 清空当前步骤/截图/录屏（为下一个测试准备）
    this.currentSteps = [];
    this.currentScreenshots = [];
    this.currentRecordings = [];
  }

  /**
   * 生成 JSON 报告文件
   */
  generate(): Promise<void> {
    if (this.results.length === 0) {
      return Promise.resolve();
    }

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const passed = this.results.filter((r) => r.status === "passed").length;
    const failed = this.results.filter((r) => r.status === "failed").length;
    const skipped = this.results.filter((r) => r.status === "skipped").length;
    const total = this.results.length;
    const duration = this.results.reduce((sum, r) => sum + r.duration, 0);

    const report: JsonSuiteReport = {
      platform: process.env.TEST_PLATFORM || "unknown",
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
      summary: {
        total,
        passed,
        failed,
        skipped,
        passRate: total > 0 ? Math.round((passed / total) * 10000) / 100 : 0,
        duration,
      },
      tests: this.results,
    };

    const reportPath = path.join(this.outputDir, `report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    logger.info(`[JsonBackend] Report written to: ${reportPath}`);
    return Promise.resolve();
  }

  /** 获取当前测试结果列表 */
  getResults(): JsonTestResult[] {
    return [...this.results];
  }
}
