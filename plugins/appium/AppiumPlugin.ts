/**
 * Appium Plugin — 插件入口
 */
import { IPlugin, LifecycleHooks } from "../../core/interfaces/IPlugin";
import { IActions } from "../../core/interfaces/IActions";
import { IMediaProvider } from "../../core/interfaces/IMediaProvider";
import { IDeviceProvider, DeviceInfo } from "../../core/interfaces/IDeviceProvider";
import { PluginConfig, ActionConfig } from "../../core/interfaces/IConfigProvider";
import { AppiumActions } from "./AppiumActions";
import { AppiumServer } from "./server/AppiumServer";
import { DeviceDetector } from "./device/AndroidDeviceDetector";
import { IOSDeviceDetector } from "./device/IOSDeviceDetector";

export class AppiumPlugin implements IPlugin {
  readonly name = "appium";
  readonly platforms = ["ios", "android"];
  readonly version = "1.0.0";

  private server: AppiumServer | null = null;

  initialize(_config: PluginConfig): Promise<void> {
    this.server = new AppiumServer();
    return Promise.resolve();
  }

  createActions(config: ActionConfig): any {
    return new AppiumActions(config.capabilities as Record<string, any>);
  }

  getDeviceProvider(): IDeviceProvider {
    return new AppiumDeviceProvider();
  }

  getMediaProvider(): IMediaProvider {
    return new AppiumMediaProvider();
  }

  getLifecycleHooks(): LifecycleHooks {
    return {};
  }

  getAppiumServer(): AppiumServer | null {
    return this.server;
  }

  async destroy(): Promise<void> {
    if (this.server) {
      try {
        await this.server.stop();
      } catch {
        // ignore
      }
      this.server = null;
    }
  }
}

/**
 * Appium 设备管理提供者
 */
class AppiumDeviceProvider implements IDeviceProvider {
  async detectDevices(): Promise<DeviceInfo[]> {
    const detector = new DeviceDetector();
    const devices = await detector.detectDevices();
    return devices.map((d) => ({
      udid: d.udid,
      name: d.model,
      version: d.version,
      isEmulator: d.isEmulator,
      status: d.status,
    }));
  }

  selectDevice(devices: DeviceInfo[], preferredUdid?: string): DeviceInfo | null {
    if (devices.length === 0) {
      return null;
    }
    if (preferredUdid) {
      return devices.find((d) => d.udid === preferredUdid) || devices[0];
    }
    // 优先真机
    return devices.find((d) => !d.isEmulator) || devices[0];
  }

  async detectAndSelectDevice(): Promise<DeviceInfo> {
    const devices = await this.detectDevices();
    const selected = this.selectDevice(devices, process.env.ANDROID_DEVICE_NAME);
    if (!selected) {
      throw new Error("No Android device found");
    }
    return selected;
  }
}

/**
 * Appium 媒体能力提供者
 */
class AppiumMediaProvider implements IMediaProvider {
  takeScreenshot(name: string): Promise<string> {
    const sessionDir = process.env.OMNITEST_SESSION_DIR || "artifacts";
    return Promise.resolve(`${sessionDir}/screenshots/${name}_${Date.now()}.png`);
  }

  supportsRecording(): boolean {
    return true;
  }

  startRecording(): Promise<boolean> {
    return Promise.resolve(true);
  }

  stopRecording(): Promise<Buffer | null> {
    return Promise.resolve(null);
  }
}
