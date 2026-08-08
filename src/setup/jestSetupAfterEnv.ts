import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IAdapter } from '../contracts/IActions';
import type {
  ArtifactRef,
  ILogger,
  ResolvedRunConfig,
  TestCaseRecord,
  TestCaseStatus,
} from '../contracts/types';
import { isOmniError } from '../contracts/types';
import { createAndInitAdapter } from '../factory/AdapterFactory';
import { createLogger, createRunLogger } from '../utils/logger';
import { ensureDir } from '../utils/paths';
import { captureFailureScreenshot } from '../utils/screenshot';
import type { WorkerShard } from './globalTeardown';
import { clearTestContext, drainArtifacts, setTestContext } from './testContext';

/**
 * Jest setupFilesAfterEnv —— 跑在**每一个 worker 子进程**里。
 *
 * 这是「适配器生命周期」与「jest 生命周期」的缝合点：
 *   beforeAll  建会话（每个 worker 一个）
 *   afterEach  失败自动截图 + 记录用例结果
 *   afterAll   销毁会话 + 把本 worker 的结果写成分片 JSON
 *
 * 【为什么会话是 per-worker 而不是 per-test】
 * 建一次 Appium/Detox 会话通常要 20~60 秒，per-test 建会话会让 10 个用例的套件跑成十几分钟。
 * per-worker 复用会话 + 每个用例前 reloadApp 复位状态，是业界通行的性价比最优解。
 *
 * 【为什么 runConfig 从文件读，而不是从 globalSetup 传】
 * jest 的 globalSetup 跑在主进程，worker 是独立子进程，两者之间只有
 * 「环境变量 + 文件系统」两条通道，内存对象传不过来。globalSetup 把 ResolvedRunConfig
 * 序列化落盘并把路径写进 OMNI_RUN_CONFIG_FILE，worker 在此反序列化 —— 这是唯一可靠的方式。
 */

/* ═══════════════ 模块加载期：读配置并设置超时 ═══════════════ */

/**
 * 在模块顶层（而非 beforeAll 内）读取配置。
 * `jest.setTimeout` 必须在钩子注册之前调用才能作用于 beforeAll —— 而适配器初始化恰恰是
 * 全流程最慢的一步，默认 5 秒超时必然失败。因此这里同步读文件，尽早把超时放宽。
 */
const runConfig: ResolvedRunConfig | undefined = loadRunConfigFromEnv();

/** 兜底超时：配置缺失时也要给适配器初始化留出足够时间 */
const FALLBACK_TIMEOUT_MS = 120_000;

if (runConfig !== undefined) {
  jest.setTimeout(Math.max(runConfig.test.timeouts.testMs, runConfig.test.timeouts.hookMs));
} else {
  jest.setTimeout(FALLBACK_TIMEOUT_MS);
}

/* ═══════════════ worker 级状态 ═══════════════ */

let adapter: IAdapter | undefined;
let logger: ILogger = createLogger({ scope: 'worker' });

/** 本 worker 已完成的用例记录，afterAll 时落盘 */
const caseRecords: TestCaseRecord[] = [];

/** 当前用例的开始时间，用于计算 durationMs */
let currentTestStartedAt = 0;

/** worker 自身的起止时间，写进分片供报告核算 */
const workerStartedAt = new Date().toISOString();

/* ═══════════════ 生命周期钩子 ═══════════════ */

beforeAll(async () => {
  if (runConfig === undefined) {
    // 没有配置就没法建会话。抛出明确错误，而不是让用例在第一次 tap 时报
    // 「上下文未初始化」——后者会把使用者的注意力引向脚本而非配置链路。
    throw new Error(
      '未能读取运行配置：环境变量 OMNI_RUN_CONFIG_FILE 缺失或指向的文件不存在。\n'
      + '请通过 `npx tsx src/index.ts ...` 或 `npm test` 启动测试，不要直接调用 jest —— '
      + '运行配置由 CLI/globalSetup 生成。',
    );
  }

  logger = createRunLogger(runConfig).child('worker', { pid: process.pid });

  logger.info('正在建立会话…', {
    framework: String(runConfig.framework),
    platform: runConfig.platform,
    device: runConfig.deviceKind,
  });

  const startedAt = Date.now();
  adapter = await createAndInitAdapter({ runConfig, logger });
  setTestContext({ adapter, runConfig, logger });

  logger.info('会话已就绪', { durationMs: Date.now() - startedAt });
});

beforeEach(() => {
  currentTestStartedAt = Date.now();
});

afterEach(async () => {
  const durationMs = Date.now() - currentTestStartedAt;
  const testInfo = readCurrentTestInfo();
  const artifacts: ArtifactRef[] = [];

  // 先把测试执行期间由 device.takeScreenshot() 等主动登记的产物收走，
  // 再追加失败截图，保证报告里产物顺序与实际发生顺序一致
  artifacts.push(...drainArtifacts());

  if (testInfo.status === 'failed' && runConfig !== undefined) {
    const shouldCapture = runConfig.test.screenshot.onFailure;
    if (shouldCapture) {
      const shot = await captureFailureScreenshot(adapter, testInfo.name, runConfig, logger);
      if (shot !== null) {
        artifacts.push(shot);
        logger.warn('用例失败，已保存现场截图', {
          test: testInfo.name,
          screenshot: shot.relativePath,
        });
      }
    }
  }

  caseRecords.push({
    suite: testInfo.suite,
    name: testInfo.name,
    fullName: testInfo.fullName,
    status: testInfo.status,
    durationMs,
    failureMessages: testInfo.failureMessages,
    artifacts,
  });
});

afterAll(async () => {
  if (adapter !== undefined) {
    try {
      await adapter.dispose();
      logger.info('会话已释放');
    } catch (error) {
      // dispose 契约上要求幂等且不抛，这里再兜一层：
      // 释放失败不应让整个 worker 标记为失败，否则全绿的用例会被一个清理问题带红
      logger.warn(`会话释放失败（已忽略）：${readErrorMessage(error)}`);
    }
    adapter = undefined;
  }

  clearTestContext();
  writeShard();
});

/* ═══════════════ 分片落盘 ═══════════════ */

/**
 * 把本 worker 的用例结果写成分片 JSON。
 *
 * 文件名带 pid + 随机后缀：jest 默认并发多个 worker，若共用一个文件名，
 * 后写的会覆盖先写的，报告里就只剩下最后一个 worker 的用例。
 */
function writeShard(): void {
  if (runConfig === undefined || caseRecords.length === 0) {
    return;
  }
  try {
    const shard: WorkerShard = {
      runId: runConfig.runId,
      pid: process.pid,
      startedAt: workerStartedAt,
      finishedAt: new Date().toISOString(),
      cases: caseRecords,
      artifacts: caseRecords.flatMap((record) => record.artifacts),
    };
    const dir = ensureDir(runConfig.paths.shardsDir);
    const fileName = `worker-${String(process.pid).padStart(7, '0')}-${Date.now()}.shard.json`;
    fs.writeFileSync(path.join(dir, fileName), `${JSON.stringify(shard, null, 2)}\n`, 'utf8');
  } catch (error) {
    logger.warn(`分片写入失败（报告将缺少本 worker 的数据）：${readErrorMessage(error)}`);
  }
}

/* ═══════════════ 当前用例信息读取 ═══════════════ */

/** afterEach 里能拿到的用例信息 */
interface CurrentTestInfo {
  readonly suite: string;
  readonly name: string;
  readonly fullName: string;
  readonly status: TestCaseStatus;
  readonly failureMessages: readonly string[];
}

/** jest-circus 内部状态的最小结构化描述（只声明我们要用的字段） */
interface CircusTestEntry {
  readonly name?: string;
  readonly errors?: readonly unknown[];
  readonly status?: string | null;
  readonly parent?: CircusDescribeBlock;
}

interface CircusDescribeBlock {
  readonly name?: string;
  readonly parent?: CircusDescribeBlock;
}

interface CircusState {
  readonly currentlyRunningTest?: CircusTestEntry | null;
}

/**
 * 读取当前用例的名称与成败。
 *
 * 【为什么要用 jest-circus 的内部状态】
 * jest 官方**没有**为 afterEach 暴露「当前用例是否失败」的公开 API（这是长期未决的 issue）。
 * 可选方案只有三个：自定义 testEnvironment 的 handleTestEvent、jasmine2 的 currentTest、
 * 或读 circus 的运行时状态。前者要求改 testEnvironment（属于 jest 配置层，且会与
 * 各框架自己的 environment 冲突），jasmine2 在 jest 29 已非默认。
 * 因此这里读 circus 状态，并对**每一步**都做降级：拿不到就当作 passed，
 * 顶多少一张截图，绝不让探测逻辑本身把用例带崩。
 */
function readCurrentTestInfo(): CurrentTestInfo {
  const fallbackName = readExpectStateTestName();

  try {
    // 用 require 而非顶层 import：本文件在非 jest 环境（如 tsc 之外的工具链）被加载时，
    // 顶层 import 'jest-circus' 会直接失败
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const circus = require('jest-circus') as { getState?: () => CircusState };
    const state = typeof circus.getState === 'function' ? circus.getState() : undefined;
    const entry = state?.currentlyRunningTest ?? undefined;

    if (entry !== undefined && entry !== null) {
      const errors = flattenCircusErrors(entry.errors ?? []);
      const name = entry.name ?? fallbackName;
      const suite = buildSuiteName(entry.parent);
      return {
        suite,
        name,
        fullName: suite !== '' ? `${suite} > ${name}` : name,
        status: errors.length > 0 ? 'failed' : normalizeStatus(entry.status),
        failureMessages: errors,
      };
    }
  } catch {
    // jest-circus 不可用（jasmine2 运行器或非 jest 环境）→ 走下面的兜底
  }

  return {
    suite: '',
    name: fallbackName,
    fullName: fallbackName,
    status: 'passed',
    failureMessages: [],
  };
}

/** 从 expect 的公共状态里取用例名，作为 circus 不可用时的兜底 */
function readExpectStateTestName(): string {
  try {
    const state = expect.getState();
    return state.currentTestName ?? 'unknown-test';
  } catch {
    return 'unknown-test';
  }
}

/**
 * circus 的 errors 是 `Array<Error | [Error|undefined, Error|undefined]>` 这种奇怪形状
 * （元组用于区分「断言错误」与「异步栈」）。这里统一压平成字符串数组。
 */
function flattenCircusErrors(errors: readonly unknown[]): string[] {
  const messages: string[] = [];
  for (const item of errors) {
    if (Array.isArray(item)) {
      for (const nested of item) {
        const text = stringifyError(nested);
        if (text !== undefined) {
          messages.push(text);
        }
      }
    } else {
      const text = stringifyError(item);
      if (text !== undefined) {
        messages.push(text);
      }
    }
  }
  return messages;
}

/** 把单个错误渲染成可读文本；OmniError 额外带上 code 与 hint */
function stringifyError(error: unknown): string | undefined {
  if (error === undefined || error === null) {
    return undefined;
  }
  if (isOmniError(error)) {
    const hint = error.hint !== undefined ? `\n提示：${error.hint}` : '';
    return `[${error.code}] ${error.message}${hint}\n${error.stack ?? ''}`.trimEnd();
  }
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}

/** 沿 parent 链拼出 describe 层级名（根块名为 'ROOT_DESCRIBE_BLOCK'，需剔除） */
function buildSuiteName(block: CircusDescribeBlock | undefined): string {
  const names: string[] = [];
  let current = block;
  while (current !== undefined) {
    const name = current.name;
    if (name !== undefined && name !== '' && name !== 'ROOT_DESCRIBE_BLOCK') {
      names.unshift(name);
    }
    current = current.parent;
  }
  return names.join(' > ');
}

/** circus 的 status 字符串归一到契约的 TestCaseStatus */
function normalizeStatus(status: string | null | undefined): TestCaseStatus {
  switch (status) {
    case 'skip':
    case 'skipped':
      return 'skipped';
    case 'todo':
      return 'todo';
    case 'fail':
    case 'failed':
      return 'failed';
    default:
      return 'passed';
  }
}

/* ═══════════════ 配置读取 ═══════════════ */

/** 从 OMNI_RUN_CONFIG_FILE 读取并反序列化运行配置；任何问题都返回 undefined */
function loadRunConfigFromEnv(): ResolvedRunConfig | undefined {
  const file = process.env['OMNI_RUN_CONFIG_FILE'];
  if (file === undefined || file === '') {
    return undefined;
  }
  try {
    if (!fs.existsSync(file)) {
      return undefined;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ResolvedRunConfig;
  } catch {
    return undefined;
  }
}

/** 读取 unknown 异常的可读信息 */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
