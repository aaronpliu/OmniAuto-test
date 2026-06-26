/**
 * Detox Allure Reporter
 *
 * Detox 覆盖了 allure-jest/node 测试环境，本 reporter
 * 直接写入 Allure JSON 结果文件，包含自动化收集的测试步骤。
 */
import { createHash } from 'crypto';
import { writeFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, copyFileSync } from 'fs';
import { join, basename } from 'path';

const RESULTS_DIR = join(process.cwd(), 'artifacts', 'allure-results');

interface AllureStep {
  name: string;
  status: 'passed' | 'failed' | 'broken' | 'skipped';
  stage: 'finished';
  start: number;
  stop: number;
  statusDetails?: { message: string; trace: string };
  attachments?: { name: string; type: string; source: string }[];
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

/** 从附件文件中读取测试级截图并复制到 allure-results */
function drainTestAttachments(): { name: string; type: string; source: string }[] {
  try {
    const filePath = join(process.cwd(), 'artifacts', 'allure-results', '.pending-attach.jsonl');
    if (!existsSync(filePath)) return [];
    const raw = readFileSync(filePath, 'utf-8');
    unlinkSync(filePath);

    const attachments: { name: string; type: string; source: string }[] = [];
    raw.trim().split('\n').filter(Boolean).forEach((line: string) => {
      const item = JSON.parse(line);
      if (item.screenshot && existsSync(item.screenshot)) {
        const destName = `failure-${basename(item.screenshot)}`;
        const destPath = join(RESULTS_DIR, destName);
        copyFileSync(item.screenshot, destPath);
        attachments.push({ name: 'Failure Screenshot', type: 'image/png', source: destName });
      }
    });
    return attachments;
  } catch { return []; }
}

/** 从步骤文件中读取并清空（文件系统 IPC，兼容 Jest sandbox 隔离） */
function drainRecordedSteps(): AllureStep[] {
  try {
    const filePath = join(process.cwd(), 'artifacts', 'allure-results', '.pending-steps.jsonl');

    if (!existsSync(filePath)) return [];

    const raw = readFileSync(filePath, 'utf-8');
    unlinkSync(filePath);

    const steps: any[] = raw.trim().split('\n').filter(Boolean).map((l: string) => JSON.parse(l));
    console.log(`[AllureReporter] Read ${steps.length} steps from file`);

    return steps.map((s: any): AllureStep => {
      const result: AllureStep = {
        name: s.name,
        status: s.status,
        stage: 'finished',
        start: s.start,
        stop: s.stop,
        statusDetails: s.error ? { message: s.error, trace: '' } : undefined,
      };

      // 处理失败步骤的截图附件
      if (s.screenshot && existsSync(s.screenshot)) {
        try {
          const destName = `step-${basename(s.screenshot)}`;
          const destPath = join(RESULTS_DIR, destName);
          copyFileSync(s.screenshot, destPath);
          result.attachments = [
            { name: 'Step Screenshot', type: 'image/png', source: destName },
          ];
        } catch {
          // 复制失败不影响步骤记录
        }
      }

      return result;
    });
  } catch (err) {
    console.log('[AllureReporter] Error reading steps:', err);
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
    console.log(`[AllureReporter] onTestResult called, tests: ${testResult.testResults.length}`);

    // 一次性读取步骤
    const allSteps = drainRecordedSteps();
    console.log(`[AllureReporter] Steps for this file: ${allSteps.length}`);

    // 一次性读取测试级截图附件
    const testAttachments = drainTestAttachments();

    for (const result of testResult.testResults) {
      const fullName = result.fullName || `${testResult.testFilePath}#${result.title}`;
      const uuid = this.generateUuid(fullName);
      const startTime = this.testStartTimes.get(testResult.testFilePath) || Date.now();
      const isSkipped = result.status === 'skipped' || result.status === 'pending' || result.status === 'disabled';
      const isFailed = result.status === 'failed';

      const allureResult: AllureTestResult = {
        uuid,
        name: result.title,
        fullName,
        historyId: createHash('md5').update(fullName).digest('hex'),
        status: this.mapStatus(result.status),
        // 有步骤时错误已在步骤中展示，测试级别不重复
        statusDetails: (!isSkipped && allSteps.length === 0 && result.failureMessages?.length)
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
        steps: isSkipped ? [] : allSteps,
        attachments: isFailed ? testAttachments : [],
      };

      this.results.set(uuid, allureResult);
      this.writeResult(allureResult);
    }

    this.suiteCount++;
  }

  onRunComplete(_contexts: Set<jest.Context>, _results: jest.AggregatedResult): void {
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
