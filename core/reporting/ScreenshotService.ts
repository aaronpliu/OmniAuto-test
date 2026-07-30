/**
 * 统一截图服务
 * Screenshot Service
 *
 * 通过 IMediaProvider 接口委托给插件实现截图，
 * 再经过图片缩放后分发给 ReportManager。
 *
 * 阶段二将从 ActionProxy/testLifecycle/assertionDiagnostics 中
 * 的 3 套截图实现统一到此处。
 */

import { IMediaProvider } from "../interfaces/IMediaProvider";
import { ReportManager } from "./ReportManager";

export class ScreenshotService {
  private reportManager: ReportManager;
  private mediaProvider: IMediaProvider | null = null;

  constructor(reportManager: ReportManager) {
    this.reportManager = reportManager;
  }

  /** 设置当前插件的媒体能力提供者 */
  setMediaProvider(provider: IMediaProvider): void {
    this.mediaProvider = provider;
  }

  /** 清除媒体提供者（插件销毁时调用） */
  clearMediaProvider(): void {
    this.mediaProvider = null;
  }

  /**
   * 截图并附加到报告
   * @param name 截图名称
   * @returns 截图文件路径，如果不可用则返回 null
   */
  async capture(name: string): Promise<string | null> {
    if (!this.mediaProvider) {
      return null;
    }

    try {
      const path = await this.mediaProvider.takeScreenshot(name);
      this.reportManager.attachScreenshot(name, path);
      return path;
    } catch {
      // 截图失败不影响测试流程
      return null;
    }
  }
}
