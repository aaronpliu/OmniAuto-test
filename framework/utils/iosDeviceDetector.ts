import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "./logger";

const execAsync = promisify(exec);
const logger = Logger.getInstance();

export interface IOSDeviceInfo {
  udid: string;
  name: string;
  version: string;
  isSimulator: boolean;
  state?: string;
}

export class IOSDeviceDetector {
  /**
   * 检测所有可用的 iOS 模拟器
   */
  async detectSimulators(): Promise<IOSDeviceInfo[]> {
    try {
      logger.info("正在检测 iOS 模拟器...");

      const { stdout } = await execAsync("xcrun simctl list devices available --json");
      const data = JSON.parse(stdout) as { devices: Record<string, any[]> };

      const devices: IOSDeviceInfo[] = [];

      // 解析 simctl 输出（按 runtime 分组）
      for (const runtime of Object.keys(data.devices)) {
        for (const device of data.devices[runtime]) {
          if (device.isAvailable && device.state === "Booted") {
            devices.push({
              udid: device.udid,
              name: device.name,
              version: runtime.replace("com.apple.CoreSimulator.SimRuntime.iOS", ""),
              isSimulator: true,
              state: device.state,
            });
          }
        }
      }

      // 如果没有已启动的模拟器，列出所有可用的
      if (devices.length === 0) {
        for (const runtime of Object.keys(data.devices)) {
          for (const device of data.devices[runtime]) {
            if (device.isAvailable) {
              devices.push({
                udid: device.udid,
                name: device.name,
                version: runtime.replace("com.apple.CoreSimulator.SimRuntime.iOS", ""),
                isSimulator: true,
                state: device.state,
              });
            }
          }
        }
      }

      logger.info(`检测到 ${devices.length} 个 iOS 模拟器`);
      devices.forEach((d) => {
        logger.info(`  - ${d.name} (iOS ${d.version}) [${d.state || "unknown"}] UDID: ${d.udid}`);
      });

      return devices;
    } catch (error: any) {
      logger.error(`iOS 模拟器检测失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 检测所有连接的 iOS 真机
   */
  async detectRealDevices(): Promise<IOSDeviceInfo[]> {
    try {
      logger.info("正在检测 iOS 真机...");

      const { stdout } = await execAsync(
        "xcrun xctrace list devices --json 2>/dev/null || xcrun devicectl list devices --json 2>/dev/null"
      );

      const devices: IOSDeviceInfo[] = [];
      const data = JSON.parse(stdout);

      // xctrace 格式
      if (data.devices) {
        for (const device of data.devices) {
          if (device.platform === "ios" && !device.isSimulator) {
            devices.push({
              udid: device.udid || device.hardwareProperties?.udid,
              name: device.name || device.modelName,
              version: device.osVersionNumber || "Unknown",
              isSimulator: false,
            });
          }
        }
      }

      logger.info(`检测到 ${devices.length} 个 iOS 真机`);
      devices.forEach((d) => {
        logger.info(`  - ${d.name} (iOS ${d.version}) UDID: ${d.udid}`);
      });

      return devices;
    } catch (error: any) {
      logger.debug(`iOS 真机检测失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 检测所有 iOS 设备（模拟器 + 真机）
   */
  async detectDevices(): Promise<IOSDeviceInfo[]> {
    const simulators = await this.detectSimulators();
    const realDevices = await this.detectRealDevices();
    return [...simulators, ...realDevices];
  }

  /**
   * 选择设备
   * 优先级：已启动的模拟器 > 真机 > 未启动的模拟器
   */
  selectDevice(devices: IOSDeviceInfo[], preferredUdid?: string): IOSDeviceInfo | null {
    if (devices.length === 0) {
      return null;
    }

    // 如果指定了优先设备
    if (preferredUdid) {
      const preferred = devices.find((d) => d.udid === preferredUdid);
      if (preferred) {
        logger.info(`使用指定的设备: ${preferred.name} (${preferred.udid})`);
        return preferred;
      }
      logger.warn(`指定的设备 ${preferredUdid} 未找到，将自动选择设备`);
    }

    // 优先选择已启动的模拟器
    const bootedSimulators = devices.filter((d) => d.isSimulator && d.state === "Booted");
    if (bootedSimulators.length > 0) {
      logger.info(`自动选择已启动的模拟器: ${bootedSimulators[0].name}`);
      return bootedSimulators[0];
    }

    // 其次选择真机
    const realDevices = devices.filter((d) => !d.isSimulator);
    if (realDevices.length > 0) {
      logger.info(`自动选择真机: ${realDevices[0].name}`);
      return realDevices[0];
    }

    // 最后选择未启动的模拟器
    logger.info(`自动选择模拟器: ${devices[0].name}（需要启动）`);
    return devices[0];
  }

  /**
   * 启动模拟器
   */
  async bootSimulator(udid: string): Promise<void> {
    try {
      logger.info(`正在启动模拟器 ${udid}...`);
      await execAsync(`xcrun simctl boot ${udid} 2>/dev/null || true`);
      await execAsync("open -a Simulator 2>/dev/null || true");
      logger.info("模拟器已启动");
    } catch (error: any) {
      logger.warn(`启动模拟器失败: ${error.message}`);
    }
  }

  /**
   * 设置环境变量
   */
  static setEnvironmentVariables(device: IOSDeviceInfo): void {
    process.env.IOS_DEVICE_NAME = device.name;
    process.env.IOS_PLATFORM_VERSION = device.version;
    process.env.IOS_UDID = device.udid;
    process.env.IOS_DEVICE_TYPE = device.isSimulator ? "simulator" : "real";

    logger.info(`iOS 环境变量已设置:
      IOS_DEVICE_NAME=${device.name}
      IOS_PLATFORM_VERSION=${device.version}
      IOS_UDID=${device.udid}
      IOS_DEVICE_TYPE=${device.isSimulator ? "simulator" : "real"}
    `);
  }

  /**
   * 完整的设备检测和选择流程
   */
  async detectAndSelectDevice(): Promise<IOSDeviceInfo> {
    const devices = await this.detectDevices();

    if (devices.length === 0) {
      throw new Error(
        "未检测到可用的 iOS 设备或模拟器，请确保：\n" +
          "1. Xcode 已安装\n" +
          "2. 至少有一个 iOS 模拟器\n" +
          "3. 或已连接 iOS 真机并信任此电脑"
      );
    }

    const preferredUdid = process.env.IOS_UDID;
    const selected = this.selectDevice(devices, preferredUdid);

    if (!selected) {
      throw new Error("iOS 设备选择失败");
    }

    // 如果是模拟器且未启动，则启动它
    if (selected.isSimulator && selected.state !== "Booted") {
      await this.bootSimulator(selected.udid);
      // 等待模拟器启动
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // 设置环境变量
    IOSDeviceDetector.setEnvironmentVariables(selected);

    return selected;
  }
}

// 导出单例
let iosDeviceDetectorInstance: IOSDeviceDetector | null = null;

export function getIOSDeviceDetector(): IOSDeviceDetector {
  if (!iosDeviceDetectorInstance) {
    iosDeviceDetectorInstance = new IOSDeviceDetector();
  }
  return iosDeviceDetectorInstance;
}
