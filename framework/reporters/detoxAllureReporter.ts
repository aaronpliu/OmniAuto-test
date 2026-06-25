/**
 * Detox Allure Reporter
 *
 * Detox Jest 配置覆盖了 allure-jest/node 测试环境，
 * 导致 Allure 报告无数据生成。本 reporter 直接写入
 * Allure JSON 结果文件，不依赖 allure-jest 运行时。
 */
import { createHash } from 'crypto';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const RESULTS_DIR = join(process.cwd(), 'artifacts', 'allure-results');

interface AllureStep {
  name: string;
  status: 'passed' | 'failed' | 'broken' | 'skipped';
  stage: 'finished';
  start: number;
  stop: number;
  statusDetails?: { message: string; trace: string };
}

interface AllureTestResult {
  uuid: string;
  name: string;
  fullName: string;
  historyId: string;
  status: 'passed' | 'failed' | 'broken' | 'skipped';
  statusDetails?: { message: string; trace: string };
  stage: 'finished' | 'pending';
  start: number;
  stop: number;
  labels: { name: string; value: string }[];
  parameters: any[];
  steps: AllureStep[];
  attachments: any[];
}

/** 从全局 StepCollector 读取当前测试的步骤 */
function getRecordedSteps(): AllureStep[] {
  try {
    const key = '__OMNI_STEP_COLLECTOR__';
    const collector = (globalThis as any)[key];
    if (!collector || !collector.getSteps) return [];
    const steps = collector.getSteps();
    collector.clear(); // 读取后清空，避免重复
    return steps.map((s: any) => ({
      name: s.name,
      status: s.status,
      stage: 'finished' as const,
      start: s.start,
      stop: s.stop,
      statusDetails: s.error ? { message: s.error, trace: '' } : undefined,
    }));
  } catch {
    return [];
  }
}

class DetoxAllureReporter implements jest.Reporter {
  private results: Map<string, AllureTestResult> = new Map();
  private testStartTimes: Map<string, number> = new Map();
  private suiteCount = 0;

  onRunStart(): void {
    if (!existsSync(RESULTS_DIR)) {
      mkdirSync(RESULTS_DIR, { recursive: true });
    }
  }

  onTestStart(test: jest.Test): void {
    this.testStartTimes.set(test.path, Date.now());
  }

  onTestResult(_test: jest.Test, testResult: jest.TestResult): void {
    for (const result of testResult.testResults) {
      const fullName = result.fullName || `${testResult.testFilePath}#${result.title}`;
      const uuid = this.generateUuid(fullName);
      const startTime = this.testStartTimes.get(testResult.testFilePath) || Date.now();

      const allureResult: AllureTestResult = {
        uuid,
        name: result.title,
        fullName,
        historyId: createHash('md5').update(fullName).digest('hex'),
        status: this.mapStatus(result.status),
        statusDetails: result.failureMessages?.length
          ? { message: result.failureMessages[0], trace: result.failureMessages.join('\n') }
          : undefined,
        stage: 'finished',
        start: startTime,
        stop: Date.now(),
        labels: [
          { name: 'suite', value: this.extractSuite(fullName) },
          { name: 'language', value: 'javascript' },
          { name: 'framework', value: 'jest' },
          { name: 'platform', value: process.env.TEST_PLATFORM || 'ios' },
        ],
        parameters: [],
        steps: getRecordedSteps(),
        attachments: [],
      };

      this.results.set(uuid, allureResult);
      this.writeResult(allureResult);
    }

    this.suiteCount++;
  }

  onRunComplete(_contexts: Set<jest.Context>, _results: jest.AggregatedResult): void {
    // 写入 container 文件
    const uuids = Array.from(this.results.keys());
    const containerUuid = this.generateUuid(`suite-${this.suiteCount}`);
    const container = {
      uuid: containerUuid,
      name: 'Detox Test Suite',
      children: uuids,
      befores: [],
      afters: [],
    };
    const containerPath = join(RESULTS_DIR, `${containerUuid}-container.json`);
    writeFileSync(containerPath, JSON.stringify(container, null, 2));
  }

  private mapStatus(status: string): AllureTestResult['status'] {
    switch (status) {
      case 'passed': return 'passed';
      case 'failed': return 'failed';
      case 'skipped': case 'pending': case 'disabled': return 'skipped';
      default: return 'broken';
    }
  }

  private extractSuite(fullName: string): string {
    const idx = fullName.lastIndexOf('#');
    if (idx > 0) return fullName.substring(0, idx);
    const parts = fullName.split(' > ');
    return parts.length > 1 ? parts[0] : fullName;
  }

  private generateUuid(seed: string): string {
    return createHash('sha1').update(seed).digest('hex').substring(0, 36);
  }

  private writeResult(result: AllureTestResult): void {
    const filePath = join(RESULTS_DIR, `${result.uuid}-result.json`);
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }
}

export default DetoxAllureReporter;
