/**
 * 屏幕录制工具
 * Screen Recorder
 *
 * 支持 Appium 平台（Android + iOS）的视频录制，
 * 生成 MP4 文件并附加到 Allure 报告中。
 */
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../utils/Logger";
import { TestContext } from "../utils/TestContext";

const logger = Logger.getInstance();

export type RecorderPlatform = "android" | "ios";
export type VideoQuality = "low" | "medium" | "high";

export interface RecordingOptions {
  /** 录制时长上限（秒），默认 180 */
  timeLimit?: number;
  /** 视频质量，默认 medium */
  quality?: VideoQuality;
  /** 帧率，默认 10 */
  fps?: number;
}

/**
 * Appium 屏幕录制器
 * 使用 Appium 的 mobile: startRecordingScreen / stopRecordingScreen
 */
export class ScreenRecorder {
  private recording = false;
  private platform: RecorderPlatform;
  private options: RecordingOptions;

  constructor(platform: RecorderPlatform, options?: RecordingOptions) {
    this.platform = platform;
    this.options = {
      timeLimit: 180,
      quality: "medium",
      fps: 10,
      ...options,
    };
  }

  /**
   * 开始录屏
   */
  async start(): Promise<void> {
    if (this.recording) {
      logger.warn("录屏已在运行中");
      return;
    }

    try {
      const actions = TestContext.getActions();
      if (!actions || typeof actions.getDriver !== "function") {
        logger.warn("无法开始录屏：actions 实例不可用");
        return;
      }

      const driver = await actions.getDriver();
      if (!driver) {
        logger.warn("无法开始录屏：driver 未初始化");
        return;
      }

      logger.info("开始录屏...");

      // Appium 录制参数
      const recordingOptions: Record<string, any> = {
        timeLimit: this.options.timeLimit,
        videoQuality: this.options.quality,
        videoFps: this.options.fps,
        videoType: "h264",
      };

      // Android 支持 bitRate 和分辨率设置
      if (this.platform === "android") {
        recordingOptions.bitRate = 4000000;
        recordingOptions.videoSize = "720x1280";
      }

      await driver.startRecordingScreen(recordingOptions);
      this.recording = true;
      TestContext.setRecordingStarted(true);
      logger.info("录屏已开始");
    } catch (error: any) {
      logger.warn(`开始录屏失败: ${error.message}`);
      this.recording = false;
    }
  }

  /**
   * 停止录屏并返回视频 Buffer
   */
  async stop(): Promise<Buffer | null> {
    if (!this.recording) {
      logger.debug("录屏未在运行中");
      return null;
    }

    try {
      const actions = TestContext.getActions();
      if (!actions || typeof actions.getDriver !== "function") {
        logger.warn("无法停止录屏：actions 实例不可用");
        this.recording = false;
        return null;
      }

      const driver = await actions.getDriver();
      if (!driver) {
        logger.warn("无法停止录屏：driver 未初始化");
        this.recording = false;
        return null;
      }

      logger.info("停止录屏...");

      // 获取 base64 编码的视频数据
      const base64Video = await driver.stopRecordingScreen();
      this.recording = false;
      TestContext.setRecordingStarted(false);

      if (!base64Video) {
        logger.warn("录屏返回空数据");
        return null;
      }

      // 转换为 Buffer
      const videoBuffer = Buffer.from(base64Video as string, "base64");
      logger.info(`录屏完成，大小: ${this.formatSize(videoBuffer.length)}`);
      return videoBuffer;
    } catch (error: any) {
      logger.warn(`停止录屏失败: ${error.message}`);
      this.recording = false;
      TestContext.setRecordingStarted(false);
      return null;
    }
  }

  /**
   * 保存视频到文件
   */
  async saveToFile(videoBuffer: Buffer, testName: string): Promise<string> {
    const sanitized = testName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const videoDir = path.join(process.cwd(), "artifacts", "videos");
    const fileName = `${sanitized}_${Date.now()}.mp4`;
    const filePath = path.join(videoDir, fileName);

    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }

    await fs.promises.writeFile(filePath, videoBuffer);
    logger.info(`视频已保存: ${filePath}`);
    return filePath;
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) {
      return "0 B";
    }
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }
}

/**
 * 创建屏幕录制器实例
 */
export function createScreenRecorder(options?: RecordingOptions): ScreenRecorder | null {
  const platform = (process.env.TEST_PLATFORM || "android") as RecorderPlatform;
  const enabled = process.env.VIDEO_RECORDING === "true";

  if (!enabled) {
    logger.debug("录屏已禁用（设置 VIDEO_RECORDING=true 启用）");
    return null;
  }

  return new ScreenRecorder(platform, options);
}

// 导出单例
let screenRecorderInstance: ScreenRecorder | null = null;

export function getScreenRecorder(): ScreenRecorder | null {
  if (!screenRecorderInstance) {
    screenRecorderInstance = createScreenRecorder();
  }
  return screenRecorderInstance;
}
