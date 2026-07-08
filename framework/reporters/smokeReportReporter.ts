/**
 * Smoke Report Reporter
 *
 * A Jest reporter that collects mobile smoke test results and outputs
 * both a structured JSON report and a self-contained HTML email template.
 *
 * Outputs:
 *   - artifacts/smoke-results/smoke-report.json
 *   - artifacts/smoke-results/smoke-report.html
 */
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { SmokeReport, SmokeSummary, SmokeTestCase, SmokeTestStatus } from "../types/smokeReport";
import { generateSmokeHtmlReport } from "./smokeHtmlGenerator";
import { Logger } from "../utils/logger";

const logger = Logger.getInstance();

const RESULTS_DIR = join(process.cwd(), "artifacts", "smoke-results");

class SmokeReportReporter implements jest.Reporter {
  private testCases: SmokeTestCase[] = [];
  private testStartTimes: Map<string, number> = new Map();
  private runStartTime = 0;

  onRunStart(): void {
    this.runStartTime = Date.now();
    this.testCases = [];

    if (!existsSync(RESULTS_DIR)) {
      mkdirSync(RESULTS_DIR, { recursive: true });
    }
  }

  onTestStart(test: jest.Test): void {
    this.testStartTimes.set(test.path, Date.now());
  }

  onTestResult(_test: jest.Test, testResult: jest.TestResult): void {
    const fileStartTime = this.testStartTimes.get(testResult.testFilePath) || this.runStartTime;

    for (const result of testResult.testResults) {
      const status = this.mapStatus(result.status);
      const testCase: SmokeTestCase = {
        name: result.fullName || result.title,
        status,
        startTime: fileStartTime,
        endTime: Date.now(),
      };

      if (status === "failed" && result.failureMessages?.length) {
        testCase.failureMessage = result.failureMessages.join("\n");
      }

      this.testCases.push(testCase);
    }
  }

  onRunComplete(_contexts: Set<jest.Context>, _results: jest.AggregatedResult): void {
    const summary = this.buildSummary();
    const report: SmokeReport = {
      summary,
      testCases: this.testCases,
      metadata: {
        platform: process.env.TEST_PLATFORM || "ios",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
      },
    };

    // Write JSON report
    const jsonPath = join(RESULTS_DIR, "smoke-report.json");
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    logger.info(`[SmokeReport] JSON report written to: ${jsonPath}`);

    // Generate HTML report
    try {
      const htmlPath = generateSmokeHtmlReport(jsonPath);
      logger.info(`[SmokeReport] HTML report written to: ${htmlPath}`);
    } catch (err) {
      logger.error("[SmokeReport] Failed to generate HTML report", err);
    }
  }

  private mapStatus(status: string): SmokeTestStatus {
    switch (status) {
      case "passed":
        return "passed";
      case "failed":
        return "failed";
      case "skipped":
      case "pending":
      case "disabled":
        return "skipped";
      default:
        return "failed";
    }
  }

  private buildSummary(): SmokeSummary {
    const total = this.testCases.length;
    const passed = this.testCases.filter((tc) => tc.status === "passed").length;
    const failed = this.testCases.filter((tc) => tc.status === "failed").length;
    const skipped = this.testCases.filter((tc) => tc.status === "skipped").length;
    const passRate = total > 0 ? Math.round((passed / total) * 100 * 100) / 100 : 0;
    const duration = Date.now() - this.runStartTime;

    return { total, passed, failed, skipped, passRate, duration };
  }
}

export default SmokeReportReporter;
