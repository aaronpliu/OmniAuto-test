/**
 * 测试生命周期钩子 — 自动处理移动端截图和录屏
 * Test Lifecycle Hooks — Automated screenshot & recording for mobile tests
 *
 * 无需用户在测试代码中添加任何 step() 调用，
 * 所有操作通过 afterEach / beforeEach 自动完成。
 *
 * 控制方式（环境变量 / CLI 参数）：
 *   SCREENSHOT_ON_FAILURE=true   — 测试失败时自动截图（默认开启）
 *   VIDEO_RECORDING=true         — 每个测试自动录屏（默认关闭）
 */
import { TestContext } from '../utils/testContext';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

/** 安全地附加文件到 Allure 报告（使用 allure-js-commons 原生 API） */
function allureAttachment(name: string, content: Buffer, type: string): void {
  try {
    const { attachment } = require('allure-js-commons');
    if (typeof attachment === 'function') {
      attachment(name, content, type);
    }
  } catch { /* ignore */ }
}

/** 读取环境变量开关 */
function isScreenshotEnabled(): boolean {
  return process.env.SCREENSHOT_ON_FAILURE !== 'false';
}

function isRecordingEnabled(): boolean {
  return process.env.VIDEO_RECORDING === 'true';
}

/** 获取当前测试展示名 */
function getTestName(): string {
  try {
    return expect.getState().currentTestName || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** 判断当前测试是否失败：检查步骤文件中是否有失败步骤 */
function isTestFailed(): boolean {
  // 方式1: expect.getState（Appium 环境有效）
  try {
    const state = expect.getState() as any;
    if (state.suppressedErrors?.length > 0) return true;
    if (state.errors?.length > 0) return true;
  } catch { /* ignore */ }

  // 方式2: 检查步骤文件中是否有失败步骤（Detox/Appium 通用）
  try {
    const { join } = require('path');
    const { readFileSync, existsSync } = require('fs');
    const stepsFile = join(process.cwd(), 'artifacts', 'allure-results', '.pending-steps.jsonl');
    if (existsSync(stepsFile)) {
      const raw = readFileSync(stepsFile, 'utf-8');
      const hasFailed = raw.split('\n').some((l: string) => {
        try { return JSON.parse(l).status === 'failed'; } catch { return false; }
      });
      if (hasFailed) return true;
    }
  } catch { /* ignore */ }

  return false;
}

// ====================================================================
//  录屏控制（Appium startRecordingScreen / stopRecordingScreen）
// ====================================================================

async function startRecording(): Promise<void> {
  if (!isRecordingEnabled()) return;

  const actions = TestContext.getActions();
  if (!actions || typeof actions.startRecording !== 'function') return;

  try {
    await actions.startRecording();
    logger.info('[录屏] 已开始');
  } catch (err: any) {
    logger.warn(`[录屏] 开始失败: ${err.message}`);
  }
}

async function stopRecording(): Promise<void> {
  if (!isRecordingEnabled()) return;

  const actions = TestContext.getActions();
  if (!actions || typeof actions.stopRecording !== 'function') return;

  try {
    const videoBuffer: Buffer | null = await actions.stopRecording();
    if (!videoBuffer) return;

    allureAttachment('Screen Recording / 录屏', videoBuffer, 'video/mp4');
    logger.info('[录屏] 已附加到 Allure 报告');
  } catch (err: any) {
    logger.warn(`[录屏] 停止失败: ${err.message}`);
  }
}

// ====================================================================
//  失败截图（Appium / Detox 原生 takeScreenshot API）
// ====================================================================

async function captureScreenshotOnFailure(): Promise<void> {
  if (!isScreenshotEnabled()) return;

  const actions = TestContext.getActions();
  if (!actions || typeof actions.takeScreenshot !== 'function') return;

  const testName = getTestName();
  logger.info(`[截图] 测试失败，正在截屏: ${testName}`);

  try {
    const screenshotPath = await actions.takeScreenshot(`failure_${Date.now()}`);
    logger.info(`[截图] 已保存: ${screenshotPath}`);

    // Appium 模式：通过 allure-js-commons 附加到报告
    const fs = require('fs');
    const buf = fs.readFileSync(screenshotPath);
    allureAttachment('Failure Screenshot / 失败截图', buf, 'image/png');

    // Detox 模式：通过文件系统传给 Reporter
    try {
      const { join } = require('path');
      const attachFile = join(process.cwd(), 'artifacts', 'allure-results', '.pending-attach.jsonl');
      fs.appendFileSync(attachFile, JSON.stringify({ screenshot: screenshotPath }) + '\n');
    } catch { /* ignore */ }

    logger.info('[截图] 已附加到 Allure 报告');
  } catch (err: any) {
    logger.warn(`[截图] 失败: ${err.message}`);
  }
}

// ====================================================================
//  注册 Jest 全局钩子
// ====================================================================

function clearSteps() {
  try {
    // 清空步骤文件
    const { join } = require('path');
    const { existsSync, unlinkSync } = require('fs');
    const stepsFile = join(process.cwd(), 'artifacts', 'allure-results', '.pending-steps.jsonl');
    const attachFile = join(process.cwd(), 'artifacts', 'allure-results', '.pending-attach.jsonl');
    if (existsSync(stepsFile)) unlinkSync(stepsFile);
    if (existsSync(attachFile)) unlinkSync(attachFile);
  } catch { /* ignore */ }
}

beforeEach(async () => {
  // 清空上一条测试的步骤记录（文件系统）
  clearSteps();

  if (isRecordingEnabled()) {
    await startRecording();
  }
});

afterEach(async () => {
  logger.info('[Lifecycle] afterEach running...');
  const failed = isTestFailed();
  logger.info(`[Lifecycle] testFailed=${failed}`);

  // 1) 失败截图
  if (failed) {
    await captureScreenshotOnFailure();
  }

  // 2) 停止录屏（失败时只会保存，通过时丢弃）
  if (isRecordingEnabled()) {
    await stopRecording();
  }
});
