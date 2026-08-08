import type {
  DeviceConfig,
  EnvConfig,
  Orientation,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES } from '../../contracts/types';

/**
 * Android 真机设备配置。
 *
 * 【与模拟器的本质差异：udid 是必填而非可选】
 * 模拟器场景下「连上恰好开着的那一台」通常无害（本机一般只开一台）；
 * 真机场景则完全相反 —— 开发机上常年插着多台调试机，`adb devices` 返回多行时
 * 不指定 serial 会让 adb 直接报 `more than one device/emulator` 并中止，
 * 或者更糟：静默连上别人正在手工调试的那台设备并把 App 卸载重装。
 * 因此本配置把「未提供 serial」定义为 error 级问题（严格模式下）。
 *
 * 【真机 serial 从哪来】
 * 复用既有环境变量 `OMNI_DEVICE_UDID`（ENV_SPEC 已声明、`.env.example` 已同步、
 * `EnvConfig.deviceUdid` 已在冻结契约中留位），无需新增任何 env key。
 * CLI 的 `--deviceId` 会以更高优先级覆盖它。
 */

/** Android 真机可被外部覆盖的字段 */
export interface AndroidRealOverrides {
  readonly deviceName?: string;
  readonly platformVersion?: string;
  /** adb serial，`adb devices` 第一列 */
  readonly udid?: string;
  readonly orientation?: Orientation;
}

/** 校验选项 */
export interface AndroidRealValidateOptions {
  /**
   * 严格模式（默认 true）：缺少 serial 视为 error。
   *
   * `validateAllConfigs()` 这类「全矩阵体检」场景会传 false —— 体检时并没有真的要连某台真机，
   * 若此时把「没插手机」判成 error，dry-run 会在任何一台没接设备的机器上永远失败，
   * 这个检查项就退化成了噪音。
   */
  readonly strict?: boolean;
}

/** 默认值集中声明 */
export const ANDROID_REAL_DEFAULTS = {
  id: 'android.real',
  deviceName: 'Android Device',
  /**
   * 300s：真机场景要额外承担 USB 传包（release 包动辄上百 MB）与厂商 ROM 的
   * 「安装确认弹窗」等待，比模拟器慢一个量级。
   */
  newCommandTimeoutSec: 300,
} as const;

/** Android 真机默认设备配置（静态快照；udid 需由 env/overrides 注入） */
export const androidRealConfig: DeviceConfig = {
  id: ANDROID_REAL_DEFAULTS.id,
  platform: 'android',
  kind: 'real',
  deviceName: ANDROID_REAL_DEFAULTS.deviceName,
  // 真机系统版本由设备本身决定，不做默认假设：填错会让 Appium 的版本校验直接拒绝会话
  platformVersion: undefined,
  udid: undefined,
  avdName: undefined,
  // 真机无 headless 概念
  headless: false,
  orientation: 'portrait',
  newCommandTimeoutSec: ANDROID_REAL_DEFAULTS.newCommandTimeoutSec,
  extraCapabilities: {},
};

/**
 * 构建 Android 真机设备配置。
 *
 * 覆盖优先级（高 → 低）：`overrides.udid` > `env.deviceUdid` > 无（触发校验错误）。
 */
export function buildAndroidRealConfig(
  env?: EnvConfig,
  overrides: AndroidRealOverrides = {},
): DeviceConfig {
  const udid = overrides.udid ?? env?.deviceUdid;

  return {
    ...androidRealConfig,
    deviceName: overrides.deviceName ?? androidRealConfig.deviceName,
    platformVersion: overrides.platformVersion ?? androidRealConfig.platformVersion,
    udid,
    orientation: overrides.orientation ?? androidRealConfig.orientation,
  };
}

/**
 * adb serial 形态很杂：USB 直连是厂商自定义字符串（如 `emulator-5554` / `9A241FFAZ00CQM`），
 * 无线调试是 `192.168.1.7:5555`。故只排除「明显不是 serial」的情况（空白字符）。
 */
const SERIAL_FORBIDDEN_PATTERN = /\s/;

/** 校验 Android 真机设备配置（纯函数，不执行 adb） */
export function validate(
  config: DeviceConfig = androidRealConfig,
  options: AndroidRealValidateOptions = {},
): ValidationIssue[] {
  const strict = options.strict ?? true;
  const issues: ValidationIssue[] = [];

  if (config.platform !== 'android') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.platform',
      message: `Android 真机配置的 platform 必须为 'android'，实际为 '${config.platform}'`,
      severity: 'error',
    });
  }

  if (config.kind !== 'real') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.kind',
      message: `Android 真机配置的 kind 必须为 'real'，实际为 '${config.kind}'`,
      severity: 'error',
    });
  }

  if (config.udid === undefined || config.udid.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'device.udid',
      message: '真机运行必须指定 adb serial，否则多设备在线时 adb 会因歧义中止或连错设备',
      severity: strict ? 'error' : 'warning',
      hint: '执行 `adb devices` 取第一列，然后设置 OMNI_DEVICE_UDID=<serial> 或传 --deviceId=<serial>',
    });
  } else if (SERIAL_FORBIDDEN_PATTERN.test(config.udid)) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.udid',
      message: `adb serial "${config.udid}" 含空白字符，几乎必然是复制粘贴时带入了多余内容`,
      severity: 'error',
    });
  }

  if (config.avdName !== undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.avdName',
      message: 'avdName 是模拟器专属字段，真机配置上填写它通常意味着选错了 --device',
      severity: 'warning',
    });
  }

  return issues;
}
