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

// 动态获取 allure 实例（运行时可用，TypeScript 无法静态解析其类型）
function getAllure(): any {
  try {
    return require('allure-jest/node').allure;
  } catch {
    return null;
  }
}

/** 安全地附加文件到 Allure 报告 */
function allureAttachment(name: string, content: Buffer, type: string): void {
  try {
    const a = getAllure();
    if (a) {
      a.attachment(name, content, type);
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

/** 判断当前测试是否失败 */
function isTestFailed(): boolean {
  try {
    const state = expect.getState() as any;
    if (state.suppressedErrors?.length > 0) return true;
    if (state.errors?.length > 0) return true;
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

    const fs = require('fs');
    const buf = fs.readFileSync(screenshotPath);
    allureAttachment('Failure Screenshot / 失败截图', buf, 'image/png');
    logger.info('[截图] 已附加到 Allure 报告');
  } catch (err: any) {
    logger.warn(`[截图] 失败: ${err.message}`);
  }
}

// ====================================================================
//  注册 Jest 全局钩子
// ====================================================================

beforeEach(async () => {
  // 清空上一条测试的步骤记录
  try {
    const collector = (globalThis as any)['__OMNI_STEP_COLLECTOR__'];
    if (collector && collector.clear) collector.clear();
  } catch { /* ignore */ }

  if (isRecordingEnabled()) {
    await startRecording();
  }
});

afterEach(async () => {
  const failed = isTestFailed();

  // 1) 失败截图
  if (failed) {
    await captureScreenshotOnFailure();
  }

  // 2) 停止录屏（失败时只会保存，通过时丢弃）
  if (isRecordingEnabled()) {
    await stopRecording();
  }
});
