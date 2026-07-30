/**
 * Appium Plugin — 插件入口
 *
 * 负责 Appium 专属生命周期：
 *   beforeAll: 启动 Appium server + 检测设备
 *   afterAll:  清理 session + 停止 server
 */
import * as path from "path";
import { IPlugin, LifecycleHooks } from "../../core/interfaces/IPlugin";
import { IMediaProvider } from "../../core/interfaces/IMediaProvider";
import { IDeviceProvider, DeviceInfo } from "../../core/interfaces/IDeviceProvider";
import { PluginConfig, ActionConfig } from "../../core/interfaces/IConfigProvider";
import { Logger } from "../../core/utils/Logger";
import { mobileConfig } from "../../core/config/MobileConfigLoader";
import { AppiumActions } from "./AppiumActions";
import { AppiumServer } from "./server/AppiumServer";
import { DeviceDetector } from "./device/AndroidDeviceDetector";
import { IOSDeviceDetector } from "./device/IOSDeviceDetector";

const logger = Logger.getInstance();

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
    return new AppiumActions(config.capabilities as Record<string, unknown>);
  }

  getDeviceProvider(): IDeviceProvider {
    return new AppiumDeviceProvider();
  }

  getMediaProvider(): IMediaProvider {
    return new AppiumMediaProvider();
  }

  getLifecycleHooks(): LifecycleHooks {
    return {
      beforeAll: async () => {
        const platform = process.env.TEST_PLATFORM || "android";

        // 启动 Appium server
        logger.info(`检测到 ${platform} 平台 (Appium)，正在启动 Appium server...`);
        try {
          if (this.server) {
            await this.server.start();
          }
          logger.info("✓ Appium server 启动成功");
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.error(`Appium server 启动失败: ${msg}`);
          logger.error("请检查 Appium 是否已安装 (npm install -g appium)");
          throw error;
        }

        // 设备检测
        if (platform === "android") {
          logger.info("正在检测 Android 设备...");
          try {
            const detector = new DeviceDetector();
            const device = await detector.detectAndSelectDevice();
            logger.info(`✓ 已选择设备: ${device.udid} (${device.model})`);
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.warn(`设备检测失败: ${msg}`);
            logger.warn("测试可能会失败，请确保 Android 设备已连接");
          }
        }

        if (platform === "ios") {
          logger.info("正在检测 iOS 设备/模拟器...");
          try {
            const iosDetector = new IOSDeviceDetector();
            const device = await iosDetector.detectAndSelectDevice();
            logger.info(`✓ 已选择设备: ${device.name} (iOS ${device.version})`);
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.warn(`iOS 设备检测失败: ${msg}`);
            logger.warn("测试可能会失败，请确保 Xcode 已安装且有可用的 iOS 模拟器");
          }

          // 从统一移动端配置读取 iOS 应用路径
          try {
            const apps = mobileConfig.getApplications();
            if (apps.iosApp) {
              const appPath = path.resolve(process.cwd(), apps.iosApp);
              process.env.IOS_APP_PATH = appPath;
              logger.info(`使用统一配置中的 iOS 应用路径: ${appPath}`);
            }
          } catch {
            logger.warn("无法从统一移动端配置读取 iOS 应用路径");
          }
        }
      },

      afterAll: async () => {
        // 1) 强制杀掉 Appium session
        try {
          const serverConfig = mobileConfig.getAppiumServerConfig();
          const host = process.env.APPIUM_HOST || serverConfig.host || "0.0.0.0";
          const port = process.env.APPIUM_PORT || String(serverConfig.port) || "4723";
          const sessionBase = `http://${host}:${port}/session`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          try {
            const resp = await fetch(`${sessionBase}s`, { signal: controller.signal });
            const body = JSON.parse(await resp.text()) as { value?: Array<{ id: string }> };
            const sessions = body.value ?? [];
            for (const s of sessions) {
              await fetch(`${sessionBase}/${s.id}`, {
                method: "DELETE",
                signal: controller.signal,
              }).catch(() => {});
            }
          } catch {
            /* fetch 失败说明 Appium 已不在运行 */
          } finally {
            clearTimeout(timeout);
          }
        } catch {
          /* ignore */
        }

        // 2) 等待 WebdriverIO 客户端沉降
        await new Promise((r) => setTimeout(r, 2000));

        // 3) 清理环境变量
        delete process.env.ANDROID_DEVICE_NAME;
        delete process.env.ANDROID_PLATFORM_VERSION;
        delete process.env.ANDROID_DEVICE_TYPE;
        delete process.env.IOS_DEVICE_NAME;
        delete process.env.IOS_PLATFORM_VERSION;
        delete process.env.IOS_UDID;
        delete process.env.IOS_DEVICE_TYPE;
      },
    };
  }

  getAppiumServer(): AppiumServer | null {
    return this.server;
  }

  async destroy(): Promise<void> {
    if (this.server) {
      try {
        logger.info("正在停止 Appium server...");
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
