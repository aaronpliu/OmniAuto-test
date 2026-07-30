/**
 * 测试生命周期钩子 — 自动处理移动端截图和录屏
 * Test Lifecycle Hooks — Automated screenshot & recording for mobile tests
 *
 * 截图/录屏通过 core/reporting/ 的 ScreenshotService 和 RecordingService
 * 统一调用插件的 IMediaProvider 实现，不再直接引用 allure-js-commons。
 *
 * 控制方式（环境变量 / CLI 参数）：
 *   SCREENSHOT_ON_FAILURE=true   — 测试失败时自动截图（默认开启）
 *   VIDEO_RECORDING=true         — 每个测试自动录屏（默认关闭）
 */
import * as fs from "fs";
import { join } from "path";
import { TestContext } from "../utils/TestContext";
import { TestSessionState } from "../utils/TestSessionState";
import { Logger } from "../utils/Logger";
import { ensureSessionDir } from "../utils/SessionDir";
import { PluginRegistry } from "../../core/registry/PluginRegistry";
import { ReportManager } from "../../core/reporting/ReportManager";
import { ScreenshotService } from "../../core/reporting/ScreenshotService";
import { RecordingService } from "../../core/reporting/RecordingService";

const logger = Logger.getInstance();

// 确保会话目录已创建（兼容 Detox 模式下 globalSetup 未被调用的场景，幂等）
ensureSessionDir();

// ---- 服务实例（懒初始化） ----
let screenshotService: ScreenshotService | null = null;
let recordingService: RecordingService | null = null;

/** 获取 ScreenshotService */
function getScreenshotService(): ScreenshotService | null {
  if (screenshotService) {
    return screenshotService;
  }
  const registry = PluginRegistry.getInstance();
  if (!registry.isInitialized) {
    return null;
  }
  screenshotService = new ScreenshotService(ReportManager.getInstance());
  return screenshotService;
}

/** 获取 RecordingService */
function getRecordingService(): RecordingService | null {
  if (recordingService) {
    return recordingService;
  }
  const registry = PluginRegistry.getInstance();
  if (!registry.isInitialized) {
    return null;
  }
  recordingService = new RecordingService(ReportManager.getInstance());
  return recordingService;
}

/** 读取环境变量开关 */
function isScreenshotEnabled(): boolean {
  return process.env.SCREENSHOT_ON_FAILURE !== "false";
}

function isRecordingEnabled(): boolean {
  return process.env.VIDEO_RECORDING === "true";
}

/** 获取当前测试展示名 */
function getTestName(): string {
  try {
    return expect.getState().currentTestName || "unknown";
  } catch {
    return "unknown";
  }
}

/** 判断当前测试是否失败 */
function isTestFailed(): boolean {
  try {
    const state = expect.getState() as Record<string, unknown>;
    if (Array.isArray(state.suppressedErrors) && (state.suppressedErrors as unknown[]).length > 0) {
      return true;
    }
    if (Array.isArray(state.errors) && (state.errors as unknown[]).length > 0) {
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    const stepsFile = join(process.cwd(), "artifacts", "allure-results", ".pending-steps.jsonl");
    if (fs.existsSync(stepsFile)) {
      const raw = fs.readFileSync(stepsFile, "utf-8");
      if (
        raw.split("\n").some((l: string) => {
          try {
            return (JSON.parse(l) as { status: string }).status === "failed";
          } catch {
            return false;
          }
        })
      ) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }

  return false;
}

/** 检查步骤文件中是否已有失败截图 */
function hasStepFailureScreenshot(): boolean {
  try {
    const stepsFile = join(process.cwd(), "artifacts", "allure-results", ".pending-steps.jsonl");
    if (fs.existsSync(stepsFile)) {
      const raw = fs.readFileSync(stepsFile, "utf-8");
      return raw.split("\n").some((l: string) => {
        try {
          const step = JSON.parse(l) as { status: string; screenshot?: string };
          return step.status === "failed" && !!step.screenshot;
        } catch {
          return false;
        }
      });
    }
  } catch {
    /* ignore */
  }
  return false;
}

// ====================================================================
//  失败截图（通过 ScreenshotService + IMediaProvider）
// ====================================================================

async function captureScreenshotOnFailure(): Promise<void> {
  if (!isScreenshotEnabled()) {
    return;
  }

  if (hasStepFailureScreenshot()) {
    logger.info("[截图] 步骤已有失败截图，跳过测试级截图");
    return;
  }

  // 尝试通过 ScreenshotService（插件路径）截图
  const svc = getScreenshotService();
  if (svc) {
    const registry = PluginRegistry.getInstance();
    const platform = process.env.TEST_PLATFORM || "ios";
    try {
      const plugin = registry.getPluginForPlatform(platform);
      const mediaProvider = plugin.getMediaProvider?.();
      if (mediaProvider) {
        svc.setMediaProvider(mediaProvider);
        const screenshotPath = await svc.capture(`failure_${Date.now()}`);
        if (screenshotPath) {
          logger.info(`[截图] 已保存: ${screenshotPath}`);
          return;
        }
      }
    } catch {
      /* 插件未注册时回退到 actions 路径 */
    }
  }

  // 回退路径：通过 TestContext 中的 actions 截图
  const actions = TestContext.getActions() as {
    takeScreenshot?: (name: string) => Promise<string>;
  };
  if (!actions || typeof actions.takeScreenshot !== "function") {
    return;
  }

  const testName = getTestName();
  logger.info(`[截图] 测试失败，正在截屏: ${testName}`);

  try {
    const screenshotPath = await actions.takeScreenshot(`failure_${Date.now()}`);
    logger.info(`[截图] 已保存: ${screenshotPath}`);

    try {
      const attachFile = join(
        process.cwd(),
        "artifacts",
        "allure-results",
        ".pending-attach.jsonl"
      );
      fs.appendFileSync(attachFile, JSON.stringify({ screenshot: screenshotPath }) + "\n");
    } catch {
      /* ignore */
    }

    logger.info("[截图] 测试级截图已记录");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("after the Jest environment has been torn down") ||
      msg.includes("Provided module is not an instance of Module") ||
      msg.includes("A session is either terminated or not started")
    ) {
      logger.debug("[截图] 环境已销毁，跳过截图");
    } else {
      logger.warn(`[截图] 失败: ${msg}`);
    }
  }
}

// ====================================================================
//  录屏控制（通过 RecordingService + IMediaProvider）
// ====================================================================

async function startRecording(): Promise<void> {
  if (!isRecordingEnabled()) {
    return;
  }

  const svc = getRecordingService();
  if (!svc || !svc.supportsRecording) {
    return;
  }

  const registry = PluginRegistry.getInstance();
  const platform = process.env.TEST_PLATFORM || "ios";
  try {
    const plugin = registry.getPluginForPlatform(platform);
    const mediaProvider = plugin.getMediaProvider?.();
    if (mediaProvider) {
      svc.setMediaProvider(mediaProvider);
      const started = await svc.start();
      if (started) {
        logger.info("[录屏] 已开始");
      }
    }
  } catch {
    // 回退路径
    const actions = TestContext.getActions() as { startRecording?: () => Promise<void> };
    if (actions && typeof actions.startRecording === "function") {
      try {
        await actions.startRecording();
        logger.info("[录屏] 已开始 (fallback)");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[录屏] 开始失败: ${msg}`);
      }
    }
  }
}

async function stopRecording(): Promise<void> {
  if (!isRecordingEnabled()) {
    return;
  }

  const svc = getRecordingService();
  if (svc) {
    const buffer = await svc.stop();
    if (buffer) {
      logger.info("[录屏] 已附加到报告");
    }
    return;
  }

  const actions = TestContext.getActions() as {
    stopRecording?: () => Promise<Buffer | null>;
  };
  if (actions && typeof actions.stopRecording === "function") {
    try {
      const videoBuffer = await actions.stopRecording();
      if (videoBuffer) {
        logger.info("[录屏] 已停止 (fallback)");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[录屏] 停止失败: ${msg}`);
    }
  }
}

// ====================================================================
//  注册 Jest 全局钩子
// ====================================================================

function clearSteps() {
  try {
    const stepsFile = join(process.cwd(), "artifacts", "allure-results", ".pending-steps.jsonl");
    const attachFile = join(process.cwd(), "artifacts", "allure-results", ".pending-attach.jsonl");
    if (fs.existsSync(stepsFile)) {
      fs.unlinkSync(stepsFile);
    }
    if (fs.existsSync(attachFile)) {
      fs.unlinkSync(attachFile);
    }
  } catch {
    /* ignore */
  }
}

let _origConsoleWarn: typeof console.warn | null = null;
let _origConsoleError: typeof console.error | null = null;
let _origStderrWrite: typeof process.stderr.write | null = null;
const SUPPRESS_PATTERNS = [
  "after the Jest environment has been torn down",
  "Provided module is not an instance of Module",
  "A session is either terminated or not started",
  "invalid session id",
  "Cannot read properties of undefined",
];

beforeEach(async () => {
  TestSessionState.reset();

  if (_origConsoleWarn) {
    console.warn = _origConsoleWarn;
    _origConsoleWarn = null;
  }
  if (_origConsoleError) {
    console.error = _origConsoleError;
    _origConsoleError = null;
  }
  if (_origStderrWrite) {
    process.stderr.write = _origStderrWrite;
    _origStderrWrite = null;
  }

  clearSteps();

  if (isRecordingEnabled()) {
    await startRecording();
  }
});

afterEach(async () => {
  TestSessionState.markTearingDown();

  logger.info("[Lifecycle] afterEach running...");
  const failed = isTestFailed();
  logger.info(`[Lifecycle] testFailed=${failed}`);

  // 安装进程级 stderr 过滤器
  _origConsoleWarn = console.warn;
  _origConsoleError = console.error;
  _origStderrWrite = process.stderr.write.bind(process.stderr);

  const shouldSuppress = (text: string): boolean => SUPPRESS_PATTERNS.some((p) => text.includes(p));

  console.warn = (...args: unknown[]) => {
    if (args.some((a) => typeof a === "string" && shouldSuppress(a))) {
      return;
    }
    _origConsoleWarn!(...(args as Parameters<typeof console.warn>));
  };
  console.error = (...args: unknown[]) => {
    if (args.some((a) => typeof a === "string" && shouldSuppress(a))) {
      return;
    }
    _origConsoleError!(...(args as Parameters<typeof console.error>));
  };
  process.stderr.write = ((chunk: string | Buffer | Uint8Array) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    if (shouldSuppress(text)) {
      return true;
    }
    return _origStderrWrite!(chunk as string);
  }) as typeof process.stderr.write;

  // Appium 模式：删除 session
  const registry = PluginRegistry.getInstance();
  const isAppiumMode = registry.hasPlugin("appium") && !registry.hasPlugin("detox");
  if (isAppiumMode) {
    try {
      const actions = TestContext.getActions() as {
        driver?: { deleteSession: () => Promise<void> } | null;
      };
      const driver = actions?.driver;
      if (driver) {
        await driver.deleteSession().catch(() => {});
        (actions as Record<string, unknown>).driver = null;
        logger.debug("[Lifecycle] Appium session deleted");
      }
    } catch {
      /* ignore */
    }
  }

  if (failed) {
    await captureScreenshotOnFailure();
  }

  if (isRecordingEnabled()) {
    await stopRecording();
  }
});
