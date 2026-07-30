/**
 * 统一录屏服务
 * Recording Service
 *
 * 通过 IMediaProvider 接口委托给插件实现录屏，
 * 完成后分发给 ReportManager。
 *
 * 阶段二将从 testLifecycle 和 screenRecorder 中
 * 的 2 套录屏实现统一到此处。
 */

import { IMediaProvider } from "../interfaces/IMediaProvider";
import { ReportManager } from "./ReportManager";

export class RecordingService {
  private reportManager: ReportManager;
  private mediaProvider: IMediaProvider | null = null;
  private recording = false;

  constructor(reportManager: ReportManager) {
    this.reportManager = reportManager;
  }

  /** 设置当前插件的媒体能力提供者 */
  setMediaProvider(provider: IMediaProvider): void {
    this.mediaProvider = provider;
  }

  /** 清除媒体提供者 */
  clearMediaProvider(): void {
    this.mediaProvider = null;
    this.recording = false;
  }

  /** 是否支持录屏 */
  get supportsRecording(): boolean {
    return this.mediaProvider?.supportsRecording() ?? false;
  }

  /** 是否正在录屏 */
  get isRecording(): boolean {
    return this.recording;
  }

  /**
   * 开始录屏
   * @returns true 表示成功启动
   */
  async start(): Promise<boolean> {
    if (!this.mediaProvider || this.recording) {
      return false;
    }

    const started = await this.mediaProvider.startRecording();
    this.recording = started;
    return started;
  }

  /**
   * 停止录屏并附加到报告
   * @returns 视频 Buffer，如果不支持或失败则返回 null
   */
  async stop(): Promise<Buffer | null> {
    if (!this.mediaProvider || !this.recording) {
      return null;
    }

    try {
      const buffer = await this.mediaProvider.stopRecording();
      this.recording = false;

      if (buffer) {
        this.reportManager.attachRecording("Screen Recording", buffer);
      }
      return buffer;
    } catch {
      this.recording = false;
      return null;
    }
  }
}
