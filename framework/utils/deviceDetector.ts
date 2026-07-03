import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "../utils/logger";

const execAsync = promisify(exec);
const logger = Logger.getInstance();

export interface DeviceInfo {
  udid: string;
  model: string;
  version: string;
  isEmulator: boolean;
  status: string;
}

export class DeviceDetector {
  /**
   * 检测所有连接的 Android 设备
   */
  async detectDevices(): Promise<DeviceInfo[]> {
    try {
      logger.info("正在检测 Android 设备...");

      const { stdout } = await execAsync("adb devices -l");
      const devices: DeviceInfo[] = [];

      const lines = stdout.split("\n");

      for (const line of lines) {
        // 解析 adb devices -l 输出
        // 格式: [udid]  [status]  [properties...]
        const match = line.match(/^([^\s]+)\s+(\w+)/);
        if (!match) {
          continue;
        }

        const udid = match[1];
        const status = match[2];

        // 只保留状态为 device 的设备
        if (status !== "device") {
          logger.warn(`设备 ${udid} 状态异常: ${status}`);
          continue;
        }

        // 获取设备详细信息
        const deviceInfo = await this.getDeviceDetails(udid);
        devices.push({
          udid,
          ...deviceInfo,
          status,
        });
      }

      logger.info(`检测到 ${devices.length} 个可用设备`);
      devices.forEach((device) => {
        logger.info(
          `  - ${device.udid} (${device.model}) ${device.isEmulator ? "[模拟器]" : "[真机]"} Android ${device.version}`
        );
      });

      return devices;
    } catch (error: any) {
      logger.error(`设备检测失败: ${error.message}`);
      throw new Error(`设备检测失败: ${error.message}`);
    }
  }

  /**
   * 获取设备详细信息
   */
  private async getDeviceDetails(
    udid: string
  ): Promise<{ model: string; version: string; isEmulator: boolean }> {
    try {
      const [modelResult, versionResult] = await Promise.all([
        execAsync(`adb -s ${udid} shell getprop ro.product.model`),
        execAsync(`adb -s ${udid} shell getprop ro.build.version.release`),
      ]);

      const model = modelResult.stdout.trim();
      const version = versionResult.stdout.trim();
      const isEmulator = udid.includes("emulator-");

      return {
        model: model || "Unknown",
        version: version || "Unknown",
        isEmulator,
      };
    } catch (error: any) {
      logger.warn(`获取设备 ${udid} 详细信息失败: ${error.message}`);
      return {
        model: "Unknown",
        version: "Unknown",
        isEmulator: udid.includes("emulator-"),
      };
    }
  }

  /**
   * 选择设备
   * @param devices 可用设备列表
   * @param preferredUdid 优先使用的设备 UDID（可选）
   */
  selectDevice(devices: DeviceInfo[], preferredUdid?: string): DeviceInfo | null {
    if (devices.length === 0) {
      return null;
    }

    // 如果指定了优先设备
    if (preferredUdid) {
      const preferred = devices.find((d) => d.udid === preferredUdid);
      if (preferred) {
        logger.info(`使用指定的设备: ${preferred.udid} (${preferred.model})`);
        return preferred;
      }
      logger.warn(`指定的设备 ${preferredUdid} 未找到，将自动选择设备`);
    }

    // 自动选择：优先选择真机，如果没有真机则选择模拟器
    const realDevices = devices.filter((d) => !d.isEmulator);
    if (realDevices.length > 0) {
      logger.info(`自动选择真机: ${realDevices[0].udid} (${realDevices[0].model})`);
      return realDevices[0];
    }

    // 没有真机，选择模拟器
    logger.info(`自动选择模拟器: ${devices[0].udid} (${devices[0].model})`);
    return devices[0];
  }

  /**
   * 设置环境变量
   */
  static setEnvironmentVariables(device: DeviceInfo): void {
    process.env.ANDROID_DEVICE_NAME = device.udid;
    process.env.ANDROID_PLATFORM_VERSION = device.version;
    process.env.ANDROID_DEVICE_TYPE = device.isEmulator ? "emulator" : "real";

    logger.info(`环境变量已设置:
      ANDROID_DEVICE_NAME=${device.udid}
      ANDROID_PLATFORM_VERSION=${device.version}
      ANDROID_DEVICE_TYPE=${device.isEmulator ? "emulator" : "real"}
    `);
  }

  /**
   * 完整的设备检测和选择流程
   */
  async detectAndSelectDevice(): Promise<DeviceInfo> {
    const devices = await this.detectDevices();

    if (devices.length === 0) {
      throw new Error(
        "未检测到可用的 Android 设备，请确保：\n1. 设备已连接\n2. 设备已授权 USB 调试\n3. adb 已正确安装"
      );
    }

    // 检查是否有指定的设备
    const preferredUdid = process.env.ANDROID_DEVICE_NAME;
    const selected = this.selectDevice(devices, preferredUdid);

    if (!selected) {
      throw new Error("设备选择失败");
    }

    // 设置环境变量
    DeviceDetector.setEnvironmentVariables(selected);

    return selected;
  }
}

// 导出单例
let deviceDetectorInstance: DeviceDetector | null = null;

export function getDeviceDetector(): DeviceDetector {
  if (!deviceDetectorInstance) {
    deviceDetectorInstance = new DeviceDetector();
  }
  return deviceDetectorInstance;
}
