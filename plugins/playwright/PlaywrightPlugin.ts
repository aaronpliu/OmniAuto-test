/**
 * Playwright Plugin — 插件入口
 */
import { IPlugin, LifecycleHooks } from "../../core/interfaces/IPlugin";
import { IMediaProvider } from "../../core/interfaces/IMediaProvider";
import { PluginConfig, ActionConfig } from "../../core/interfaces/IConfigProvider";
import { PlaywrightActions } from "./PlaywrightActions";

export class PlaywrightPlugin implements IPlugin {
  readonly name = "playwright";
  readonly platforms = ["web"];
  readonly version = "1.0.0";

  async initialize(_config: PluginConfig): Promise<void> {
    // Playwright 由 Playwright Test Runner 管理初始化
  }

  createActions(config: ActionConfig): any {
    if (!config.page) {
      throw new Error("PlaywrightPlugin requires a Page object in ActionConfig");
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return new PlaywrightActions(config.page as any, config.browser as any);
  }

  getMediaProvider(): IMediaProvider {
    return new PlaywrightMediaProvider();
  }

  getLifecycleHooks(): LifecycleHooks {
    return {};
  }

  async destroy(): Promise<void> {
    // Playwright 由 Test Runner 管理销毁
  }
}

/**
 * Playwright 媒体能力提供者
 */
class PlaywrightMediaProvider implements IMediaProvider {
  takeScreenshot(name: string): Promise<string> {
    // 委托给 PlaywrightActions 的 takeScreenshot
    const sessionDir = process.env.OMNITEST_SESSION_DIR || "artifacts";
    return Promise.resolve(`${sessionDir}/screenshots/${name}_${Date.now()}.png`);
  }

  supportsRecording(): boolean {
    return true; // Playwright 内置 video 支持
  }

  startRecording(): Promise<boolean> {
    // Playwright video 由配置驱动，不需要手动启动
    return Promise.resolve(false);
  }

  stopRecording(): Promise<Buffer | null> {
    return Promise.resolve(null);
  }
}
