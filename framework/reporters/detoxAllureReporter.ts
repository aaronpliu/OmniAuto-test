/**
 * Detox Allure Reporter
 *
 * Detox 覆盖了 allure-jest/node 测试环境，本 reporter
 * 直接写入 Allure JSON 结果文件，包含自动化收集的测试步骤。
 */
import { createHash } from 'crypto';
import { writeFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, copyFileSync, readdirSync, statSync } from 'fs';
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
    // 收集 Detox artifacts 产物（失败截图 + 录屏，由 Detox artifacts 插件生成）
    this.collectDetoxArtifacts();

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

  /**
   * 扫描 Detox artifacts 目录，收集失败测试的截图和录屏附加到 Allure。
   * 目录结构：artifacts/detox/<config>.<timestamp>Z/<✗ test-fullName>/{beforeEach.png, afterEach.png, test.mp4}
   * keepOnlyFailedTestsArtifacts: true 时只有失败测试（✗ 前缀）文件夹存在。
   */
  private collectDetoxArtifacts(): void {
    const detoxArtifactsDir = join(process.cwd(), 'artifacts', 'detox');
    if (!existsSync(detoxArtifactsDir)) return;

    let runDirs: string[] = [];
    try {
      runDirs = readdirSync(detoxArtifactsDir).filter(name => {
        try { return statSync(join(detoxArtifactsDir, name)).isDirectory(); } catch { return false; }
      });
    } catch { return; }

    for (const runDir of runDirs) {
      const runPath = join(detoxArtifactsDir, runDir);
      let testDirs: string[] = [];
      try {
        testDirs = readdirSync(runPath).filter(name => {
          try { return statSync(join(runPath, name)).isDirectory(); } catch { return false; }
        });
      } catch { continue; }

      for (const testDir of testDirs) {
        // 只处理失败测试（✗ 前缀，keepOnlyFailedTestsArtifacts 模式下仅失败测试有产物）
        if (!testDir.startsWith('✗')) continue;

        // 提取测试 fullName（去掉 "✗ " 前缀）
        const testFullName = testDir.substring(2).trim();
        const matchedUuid = this.findResultByFullName(testFullName);
        if (!matchedUuid) {
          console.log(`[AllureReporter] No matching test for Detox artifact: ${testDir}`);
          continue;
        }

        const testPath = join(runPath, testDir);
        let files: string[] = [];
        try {
          files = readdirSync(testPath).filter(name => {
            try { return statSync(join(testPath, name)).isFile(); } catch { return false; }
          });
        } catch { continue; }

        const newAttachments: { name: string; type: string; source: string }[] = [];
        for (const file of files) {
          const ext = file.toLowerCase().split('.').pop();
          const srcPath = join(testPath, file);

          if (ext === 'png') {
            const destName = `detox-${basename(srcPath)}`;
            try {
              copyFileSync(srcPath, join(RESULTS_DIR, destName));
              newAttachments.push({ name: 'Detox Screenshot', type: 'image/png', source: destName });
            } catch { /* ignore */ }
          } else if (ext === 'mp4') {
            const destName = `detox-${basename(srcPath)}`;
            try {
              copyFileSync(srcPath, join(RESULTS_DIR, destName));
              newAttachments.push({ name: 'Detox Screen Recording', type: 'video/mp4', source: destName });
            } catch { /* ignore */ }
          }
        }

        if (newAttachments.length > 0) {
          const result = this.results.get(matchedUuid);
          if (result) {
            result.attachments = [...(result.attachments || []), ...newAttachments];
            this.writeResult(result);
            console.log(`[AllureReporter] Attached ${newAttachments.length} Detox artifacts to: ${testFullName}`);
          }
        }
      }
    }
  }

  /**
   * 通过 fullName 匹配已记录的测试结果 UUID。
   * Detox artifacts 文件夹名可能包含细微差异（如尾部 " id" 后缀），使用 includes 模糊匹配兜底。
   */
  private findResultByFullName(testFullName: string): string | undefined {
    // 精确匹配优先
    for (const [uuid, result] of this.results) {
      if (result.fullName === testFullName) return uuid;
    }
    // 模糊匹配兜底
    for (const [uuid, result] of this.results) {
      if (result.fullName.includes(testFullName) || testFullName.includes(result.fullName)) {
        return uuid;
      }
    }
    return undefined;
  }

  private writeResult(result: AllureTestResult): void {
    const filePath = join(RESULTS_DIR, `${result.uuid}-result.json`);
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }
}

export default DetoxAllureReporter;
