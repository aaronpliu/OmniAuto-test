/**
 * 设备管理接口
 * Device Provider Interface
 *
 * 抽象设备检测、选择和管理能力，
 * 由 Appium 插件提供 Android/iOS 设备管理，
 * Detox 插件提供模拟器管理。
 */

/** 设备信息 */
export interface DeviceInfo {
  /** 设备唯一标识 */
  udid: string;
  /** 设备名称/型号 */
  name: string;
  /** 系统版本 */
  version: string;
  /** 是否为模拟器 */
  isEmulator: boolean;
  /** 设备状态 */
  status?: string;
}

/** 设备管理提供者 */
export interface IDeviceProvider {
  /** 检测所有可用设备 */
  detectDevices(): Promise<DeviceInfo[]>;

  /**
   * 选择设备
   * @param devices 可用设备列表
   * @param preferredUdid 优先使用的设备 UDID（可选）
   */
  selectDevice(devices: DeviceInfo[], preferredUdid?: string): DeviceInfo | null;

  /**
   * 完整的设备检测和选择流程
   * 包含设备检测 → 选择 → 设置环境变量
   */
  detectAndSelectDevice(): Promise<DeviceInfo>;
}
