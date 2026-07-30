/**
 * Detox Plugin — 插件入口
 */
import { IPlugin, LifecycleHooks } from "../../core/interfaces/IPlugin";
import { IMediaProvider } from "../../core/interfaces/IMediaProvider";
import { PluginConfig, ActionConfig } from "../../core/interfaces/IConfigProvider";
import { DetoxActions } from "./DetoxActions";

export class DetoxPlugin implements IPlugin {
  readonly name = "detox";
  readonly platforms = ["ios", "android"];
  readonly version = "1.0.0";

  async initialize(_config: PluginConfig): Promise<void> {
    // Detox 由 Detox CLI 管理初始化
  }

  createActions(_config: ActionConfig): any {
    return new DetoxActions();
  }

  getMediaProvider(): IMediaProvider {
    return new DetoxMediaProvider();
  }

  getLifecycleHooks(): LifecycleHooks {
    return {};
  }

  async destroy(): Promise<void> {
    // Detox 由 Detox CLI 管理销毁
  }
}

/**
 * Detox 媒体能力提供者
 * 截图由 device.takeScreenshot() 实现，录屏由 Detox artifacts video 插件接管
 */
class DetoxMediaProvider implements IMediaProvider {
  takeScreenshot(name: string): Promise<string> {
    const sessionDir = process.env.OMNITEST_SESSION_DIR || "artifacts";
    return Promise.resolve(`${sessionDir}/screenshots/${name}_${Date.now()}.png`);
  }

  supportsRecording(): boolean {
    return false; // Detox artifacts video 插件接管
  }

  startRecording(): Promise<boolean> {
    return Promise.resolve(false);
  }

  stopRecording(): Promise<Buffer | null> {
    return Promise.resolve(null);
  }
}
