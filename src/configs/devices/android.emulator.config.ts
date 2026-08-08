import type {
  DeviceConfig,
  EnvConfig,
  Orientation,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES } from '../../contracts/types';

/**
 * Android 模拟器（AVD）设备配置。
 *
 * 【deviceName 与 avdName 的分工，这是最容易配错的一处】
 * - `avdName`（`Pixel_6_API_34`）是 `emulator -avd <name>` 与 Detox `device.avdName` 使用的**AVD 定义名**，
 *   必须与 `~/.android/avd/<name>.avd` 目录名完全一致，不允许有空格；
 * - `deviceName`（`Android Emulator`）是 Appium `appium:deviceName` 使用的**人类可读标签**。
 *   UiAutomator2 driver 在提供了 `appium:udid` 或 `appium:avd` 时会忽略 deviceName，
 *   但 W3C 会话协商阶段仍要求它非空，所以不能省。
 * 把两者混为一谈（例如把 `Pixel_6_API_34` 填进 deviceName 又不填 avdName）会导致
 * Appium 连上「当前恰好开着的任意一台模拟器」，而 Detox 则完全启动不了设备。
 */

/** Android 模拟器可被外部覆盖的字段 */
export interface AndroidEmulatorOverrides {
  readonly deviceName?: string;
  readonly avdName?: string;
  readonly platformVersion?: string;
  /** 已启动模拟器的 adb serial，形如 `emulator-5554` */
  readonly udid?: string;
  readonly headless?: boolean;
  readonly orientation?: Orientation;
}

/** 默认值集中声明 */
export const ANDROID_EMULATOR_DEFAULTS = {
  id: 'android.emulator',
  /** AVD 定义名；对应 `avdmanager create avd -n Pixel_6_API_34` */
  avdName: 'Pixel_6_API_34',
  /** Appium capabilities 用的可读标签 */
  deviceName: 'Android Emulator',
  /** API 34 == Android 14 */
  platformVersion: '14',
  /**
   * 180s：Android 模拟器冷启动（含 `wait-for-device` 与 boot_completed 轮询）
   * 在未预热的 CI 上普遍 60~150s，比 iOS 模拟器更慢，故上浮到 180s。
   */
  newCommandTimeoutSec: 180,
} as const;

/** Android 模拟器默认设备配置（静态快照，不含任何环境覆盖） */
export const androidEmulatorConfig: DeviceConfig = {
  id: ANDROID_EMULATOR_DEFAULTS.id,
  platform: 'android',
  kind: 'emulator',
  deviceName: ANDROID_EMULATOR_DEFAULTS.deviceName,
  platformVersion: ANDROID_EMULATOR_DEFAULTS.platformVersion,
  // 未指定 serial 时由 Appium / Detox 自行挑选已启动的模拟器
  udid: undefined,
  avdName: ANDROID_EMULATOR_DEFAULTS.avdName,
  // 与 iOS 不同，Android 模拟器**确实**支持 `-no-window`，CI 上开启可省下可观的 GPU 开销
  headless: false,
  orientation: 'portrait',
  newCommandTimeoutSec: ANDROID_EMULATOR_DEFAULTS.newCommandTimeoutSec,
  extraCapabilities: {},
};

/**
 * 构建 Android 模拟器设备配置。
 *
 * 覆盖优先级（高 → 低）：`overrides` > `env.deviceUdid` > 静态默认值。
 * 关于「为什么 deviceName / avdName 不从环境变量读」的完整理由，见
 * `ios.simulator.config.ts#buildIosSimulatorConfig` 的注释（契约层 EnvConfig 为冻结项）。
 */
export function buildAndroidEmulatorConfig(
  env?: EnvConfig,
  overrides: AndroidEmulatorOverrides = {},
): DeviceConfig {
  const udid = overrides.udid ?? env?.deviceUdid;

  return {
    ...androidEmulatorConfig,
    deviceName: overrides.deviceName ?? androidEmulatorConfig.deviceName,
    platformVersion: overrides.platformVersion ?? androidEmulatorConfig.platformVersion,
    udid,
    avdName: overrides.avdName ?? androidEmulatorConfig.avdName,
    headless: overrides.headless ?? androidEmulatorConfig.headless,
    orientation: overrides.orientation ?? androidEmulatorConfig.orientation,
  };
}

/** AVD 名只允许字母数字、下划线、点、连字符 —— 含空格会让 `emulator -avd` 参数解析错位 */
const AVD_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Android 模拟器 serial 形如 `emulator-5554` */
const EMULATOR_SERIAL_PATTERN = /^emulator-\d+$/;

/** 校验 Android 模拟器设备配置（纯函数，不探测 AVD 是否真实存在） */
export function validate(config: DeviceConfig = androidEmulatorConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.platform !== 'android') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.platform',
      message: `Android 模拟器配置的 platform 必须为 'android'，实际为 '${config.platform}'`,
      severity: 'error',
    });
  }

  if (config.kind !== 'emulator') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.kind',
      message: `Android 模拟器配置的 kind 必须为 'emulator'，实际为 '${config.kind}'`,
      severity: 'error',
    });
  }

  if (config.deviceName.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'device.deviceName',
      message: 'Android 模拟器必须指定 deviceName（W3C 会话协商要求该项非空）',
      severity: 'error',
    });
  }

  if (config.avdName === undefined || config.avdName.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'device.avdName',
      message: '未指定 avdName，Detox 无法启动模拟器，Appium 也只能连接「恰好开着的那一台」',
      severity: 'error',
      hint: '可执行 `emulator -list-avds` 查看本机已创建的 AVD',
    });
  } else if (!AVD_NAME_PATTERN.test(config.avdName)) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.avdName',
      message: `avdName "${config.avdName}" 含非法字符（仅允许字母数字与 . _ -），会导致 emulator 命令行参数解析错位`,
      severity: 'error',
      hint: 'AVD 名必须与 ~/.android/avd/<name>.avd 目录名完全一致',
    });
  }

  if (config.udid !== undefined && !EMULATOR_SERIAL_PATTERN.test(config.udid)) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.udid',
      message: `模拟器 serial 期望形如 "emulator-5554"，实际为 "${config.udid}"`,
      severity: 'warning',
      hint: '若确实要连真机，请改用 --device=real（android.real 配置）',
    });
  }

  if (config.platformVersion === undefined || config.platformVersion.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'device.platformVersion',
      message: '未指定 platformVersion，Appium 无法在多设备场景下做版本匹配',
      severity: 'warning',
    });
  }

  return issues;
}
