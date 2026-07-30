/**
 * 插件媒体能力提供者接口
 * Plugin Media Provider Interface
 *
 * 截图和录屏是插件专属能力，不同插件（Detox/Appium/Playwright）的实现完全不同。
 * 此接口抽象了媒体能力，由各插件提供实现，core/reporting/ 中的服务层仅做编排。
 */

/** 插件媒体能力提供者（截图/录屏） */
export interface IMediaProvider {
  /** 截图并返回文件路径 */
  takeScreenshot(name: string): Promise<string>;

  /** 是否支持录屏（Detox 返回 false，由 artifacts video 插件接管） */
  supportsRecording(): boolean;

  /**
   * 开始录屏
   * @returns true 表示成功启动，false 表示不支持或由外部接管
   */
  startRecording(): Promise<boolean>;

  /**
   * 停止录屏并返回视频 Buffer
   * @returns 视频 Buffer，不支持时返回 null
   */
  stopRecording(): Promise<Buffer | null>;
}
