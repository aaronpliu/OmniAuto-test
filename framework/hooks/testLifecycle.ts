/**
 * 测试生命周期钩子
 * Test Lifecycle Hooks
 *
 * 功能：
 * 1. 测试失败时自动截屏并附加到 Allure 报告
 * 2. 测试开始时自动开始录屏（VIDEO_RECORDING=true）
 * 3. 测试结束后自动停止录屏并附加到 Allure 报告
 * 4. 支持 Allure 步骤记录
 *
 * 使用方式：在 jest 配置的 setupFilesAfterEnv 中添加此文件
 */
import { allure } from 'allure-jest/node';
import { TestContext } from '../utils/testContext';
import { getScreenRecorder, ScreenRecorder } from '../utils/screenRecorder';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

/**
 * 获取当前测试名称
 */
function getTestName(): string {
  try {
    const state = expect.getState();
    if (state.currentTestName) {
      return state.currentTestName;
    }
  } catch (e) {
    // ignore
  }
  return 'unknown';
}

/**
 * 获取当前测试是否失败
 * 优先使用 jest/jasmine 的检测机制
 */
function isTestFailed(): boolean {
  try {
    const state = expect.getState() as any;
    // Jest 中失败测试会包含 suppressedErrors
    if (state.suppressedErrors && state.suppressedErrors.length > 0) {
      return true;
    }
    // jasmine 检测方式
    if (state.errors && state.errors.length > 0) {
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

/**
 * 在测试失败时截屏并附加到 Allure 报告
 */
async function handleScreenshotOnFailure(): Promise<void> {
  try {
    const actions = TestContext.getActions();
    if (!actions || typeof actions.takeScreenshot !== 'function') {
      return;
    }

    const testName = getTestName();
    logger.info(`测试失败，正在截屏: ${testName}`);

    // 截屏
    const screenshotPath = await actions.takeScreenshot(`failure_${Date.now()}`);
    logger.info(`截图已保存: ${screenshotPath}`);

    // 将截图附加到 Allure 报告
    try {
      const fs = require('fs');
      const screenshotBuffer = fs.readFileSync(screenshotPath);
      allure.attachment('失败截图 / Failure Screenshot', screenshotBuffer, 'image/png');
      logger.info('截图已附加到 Allure 报告');
    } catch (attachError: any) {
      logger.warn(`附加截图到 Allure 失败: ${attachError.message}`);
    }
  } catch (error: any) {
    logger.warn(`截屏失败: ${error.message}`);
  }
}

/**
 * 在测试结束后处理录屏文件
 */
async function handleScreenRecording(testFailed: boolean): Promise<void> {
  try {
    // 录屏由 ScreenRecorder 管理（在每个测试中 start/stop）
    const recorder = getScreenRecorder();
    if (!recorder) {
      return;
    }

    // 停止录屏
    const videoBuffer = await recorder.stop();
    if (!videoBuffer) {
      return;
    }

    // 仅在测试失败或总是保存时附加视频
    if (testFailed) {
      logger.info('测试失败，附加录屏到 Allure 报告');
      try {
        allure.attachment('录屏 / Screen Recording', videoBuffer, 'video/mp4');
      } catch (attachError: any) {
        logger.warn(`附加录屏到 Allure 失败: ${attachError.message}`);
      }
    }

    // 保存视频文件到 artifacts/videos/
    try {
      const testName = getTestName();
      await recorder.saveToFile(videoBuffer, testName);
    } catch (saveError: any) {
      logger.warn(`保存视频文件失败: ${saveError.message}`);
    }
  } catch (error: any) {
    logger.warn(`录屏处理失败: ${error.message}`);
  }
}

// ========== 注册全局测试生命周期钩子 ==========

/**
 * 在每个测试之前执行
 * - 开始录屏（如果启用）
 */
beforeEach(async () => {
  try {
    // 开始录屏
    const recorder = getScreenRecorder();
    if (recorder) {
      await recorder.start();
    }
  } catch (error: any) {
    logger.warn(`beforeEach 处理失败: ${error.message}`);
  }
});

/**
 * 在每个测试之后执行
 * - 测试失败时截屏
 * - 停止录屏并附加到报告
 */
afterEach(async () => {
  try {
    const testFailed = isTestFailed();

    if (testFailed) {
      // 测试失败：截屏
      await handleScreenshotOnFailure();
    }

    // 处理录屏
    await handleScreenRecording(testFailed);
  } catch (error: any) {
    logger.warn(`afterEach 处理失败: ${error.message}`);
  }
});
