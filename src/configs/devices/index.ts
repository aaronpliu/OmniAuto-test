import type {
  DeviceConfig,
  DeviceKind,
  EnvConfig,
  Orientation,
  Platform,
  ValidationIssue,
} from '../../contracts/types';
import { DEVICE_KINDS, ERROR_CODES, InvalidCombinationError, PLATFORMS } from '../../contracts/types';

import {
  ANDROID_EMULATOR_DEFAULTS,
  androidEmulatorConfig,
  buildAndroidEmulatorConfig,
  validate as validateAndroidEmulator,
} from './android.emulator.config';
import {
  ANDROID_REAL_DEFAULTS,
  androidRealConfig,
  buildAndroidRealConfig,
  validate as validateAndroidReal,
} from './android.real.config';
import {
  IOS_SIMULATOR_DEFAULTS,
  buildIosSimulatorConfig,
  iosSimulatorConfig,
  validate as validateIosSimulator,
} from './ios.simulator.config';

/**
 * 设备注册表与解析入口。
 *
 * 【为什么用 `platform:kind` 做主键，而不是二维嵌套 Map】
 * 「非法组合」在本工程是一等公民（AC-3）：`ios+emulator`、`android+simulator` 必须被明确拒绝。
 * 扁平的字符串主键让「已注册 / 物理非法 / 合法但未提供配置」三种状态可以用三张平表精确表达，
 * 从而给出**分级诊断**而不是一句笼统的 "not found" —— 后者会让使用者反复怀疑是自己拼错了参数。
 */

/* ═══════════════ 类型 ═══════════════ */

/** 设备覆盖项全集（三种设备的并集，各 builder 只取自己认识的字段） */
export interface DeviceOverrides {
  readonly deviceName?: string;
  readonly platformVersion?: string;
  readonly udid?: string;
  readonly avdName?: string;
  readonly headless?: boolean;
  readonly orientation?: Orientation;
}

/** 设备构建器签名 */
export type DeviceBuilder = (env?: EnvConfig, overrides?: DeviceOverrides) => DeviceConfig;

/** 注册表条目 */
export interface DeviceRegistryEntry {
  readonly platform: Platform;
  readonly kind: DeviceKind;
  /** 静态默认配置（不含 env / overrides） */
  readonly defaults: DeviceConfig;
  readonly build: DeviceBuilder;
  readonly validate: (config: DeviceConfig, options?: { readonly strict?: boolean }) => ValidationIssue[];
}

/** 注册表主键，形如 `ios:simulator` */
export type DeviceRegistryKey = `${Platform}:${DeviceKind}`;

/** 拼接注册表主键 */
export function deviceRegistryKey(platform: Platform, kind: DeviceKind): DeviceRegistryKey {
  return `${platform}:${kind}`;
}

/* ═══════════════ 注册表 ═══════════════ */

/** 已提供配置的设备组合 */
export const DEVICE_REGISTRY: Readonly<Partial<Record<DeviceRegistryKey, DeviceRegistryEntry>>> = {
  'ios:simulator': {
    platform: 'ios',
    kind: 'simulator',
    defaults: iosSimulatorConfig,
    build: (env, overrides) => buildIosSimulatorConfig(env, overrides),
    validate: (config) => validateIosSimulator(config),
  },
  'android:emulator': {
    platform: 'android',
    kind: 'emulator',
    defaults: androidEmulatorConfig,
    build: (env, overrides) => buildAndroidEmulatorConfig(env, overrides),
    validate: (config) => validateAndroidEmulator(config),
  },
  'android:real': {
    platform: 'android',
    kind: 'real',
    defaults: androidRealConfig,
    build: (env, overrides) => buildAndroidRealConfig(env, overrides),
    validate: (config, options) => validateAndroidReal(config, { strict: options?.strict ?? true }),
  },
};

/**
 * **物理上不存在**的组合：不是「还没实现」，而是这两个词在该平台的生态里根本不存在。
 * 给出术语纠正比给出「不支持」更有用 —— 使用者十有八九只是用错了词。
 */
const PHYSICALLY_INVALID: Readonly<Partial<Record<DeviceRegistryKey, string>>> = {
  'ios:emulator': 'iOS 生态中没有 emulator 形态：Apple 的虚拟设备称为 simulator（模拟器，共享宿主 CPU 指令集），'
    + '请使用 --device=simulator',
  'android:simulator': 'Android 生态中没有 simulator 形态：Google 的虚拟设备称为 emulator（仿真器，QEMU 全系统仿真），'
    + '请使用 --device=emulator',
};

/**
 * 合法但**本工程尚未提供配置**的组合。
 * 与上面那类的区别在于「能不能做」而非「有没有做」，所以 hint 指向扩展路径而不是纠正参数。
 */
const NOT_PROVIDED: Readonly<Partial<Record<DeviceRegistryKey, string>>> = {
  'ios:real': 'iOS 真机在技术上受支持（Appium XCUITest / xcodebuild 均可驱动），但本工程尚未提供对应设备配置：'
    + '真机需要开发者证书、Provisioning Profile 与 WebDriverAgent 重签名，属于团队级环境资产，无法给出通用默认值',
};

/* ═══════════════ 解析 ═══════════════ */

/** 构造非法组合错误（统一诊断措辞） */
function invalidCombination(
  platform: Platform,
  kind: DeviceKind,
  reason: string,
  hint: string,
): InvalidCombinationError {
  const issues: ValidationIssue[] = [
    {
      code: ERROR_CODES.INVALID_COMBINATION,
      path: 'options.device',
      message: reason,
      severity: 'error',
      hint,
    },
  ];
  return new InvalidCombinationError({ platform, device: kind }, issues);
}

/**
 * 解析设备配置。
 *
 * @param platform 目标平台
 * @param kind 设备形态
 * @param env 已加载的环境配置（提供 `deviceUdid`）
 * @param overrides CLI 或调用方的显式覆盖
 * @throws {InvalidCombinationError} 组合物理非法、尚未提供配置，或参数本身不是合法枚举值
 */
export function resolveDevice(
  platform: Platform,
  kind: DeviceKind,
  env?: EnvConfig,
  overrides: DeviceOverrides = {},
): DeviceConfig {
  // 先做枚举校验：类型层的 Platform/DeviceKind 在 CLI 边界会被 as 断言击穿，
  // 运行时必须自己兜住，否则错拼的 --platform=IOS 会以 "未注册组合" 的形式报出，误导排查方向
  if (!PLATFORMS.includes(platform)) {
    throw invalidCombination(
      platform,
      kind,
      `未知平台 "${String(platform)}"`,
      `platform 仅支持：${PLATFORMS.join(' | ')}`,
    );
  }
  if (!DEVICE_KINDS.includes(kind)) {
    throw invalidCombination(
      platform,
      kind,
      `未知设备形态 "${String(kind)}"`,
      `device 仅支持：${DEVICE_KINDS.join(' | ')}`,
    );
  }

  const key = deviceRegistryKey(platform, kind);

  const physicalReason = PHYSICALLY_INVALID[key];
  if (physicalReason !== undefined) {
    throw invalidCombination(platform, kind, physicalReason, `可用组合：${listDeviceKeys().join(' / ')}`);
  }

  const notProvidedReason = NOT_PROVIDED[key];
  if (notProvidedReason !== undefined) {
    throw invalidCombination(
      platform,
      kind,
      notProvidedReason,
      '如需接入，请新增 src/configs/devices/ios.real.config.ts 并在 DEVICE_REGISTRY 中注册',
    );
  }

  const entry = DEVICE_REGISTRY[key];
  if (entry === undefined) {
    throw invalidCombination(
      platform,
      kind,
      `设备组合 "${key}" 未注册`,
      `可用组合：${listDeviceKeys().join(' / ')}`,
    );
  }

  return entry.build(env, overrides);
}

/** 列出所有已注册的设备组合主键 */
export function listDeviceKeys(): DeviceRegistryKey[] {
  return Object.keys(DEVICE_REGISTRY) as DeviceRegistryKey[];
}

/** 列出所有已注册设备的静态默认配置（供 --help 渲染设备矩阵） */
export function listDevices(): DeviceConfig[] {
  return listDeviceKeys().map((key) => {
    const entry = DEVICE_REGISTRY[key];
    // key 来自 Object.keys(DEVICE_REGISTRY)，entry 必定存在；此处仅为满足类型收窄
    return entry === undefined ? iosSimulatorConfig : entry.defaults;
  });
}

/** 组合是否受支持（不抛错版本，供 CLI 渲染矩阵与 dry-run 使用） */
export function isDeviceSupported(platform: Platform, kind: DeviceKind): boolean {
  return DEVICE_REGISTRY[deviceRegistryKey(platform, kind)] !== undefined;
}

/**
 * 校验任意设备配置：按 `platform:kind` 路由到对应模块的 validate。
 *
 * @param config 待校验设备
 * @param options.strict 见 `android.real.config.ts#AndroidRealValidateOptions`
 */
export function validateDevice(
  config: DeviceConfig,
  options: { readonly strict?: boolean } = {},
): ValidationIssue[] {
  const entry = DEVICE_REGISTRY[deviceRegistryKey(config.platform, config.kind)];
  if (entry === undefined) {
    return [
      {
        code: ERROR_CODES.INVALID_COMBINATION,
        path: 'device',
        message: `设备 "${config.id}" 的 platform:kind 组合（${config.platform}:${config.kind}）未注册，无法校验`,
        severity: 'error',
        hint: `可用组合：${listDeviceKeys().join(' / ')}`,
      },
    ];
  }
  return entry.validate(config, options);
}

/**
 * 校验全部已注册设备（dry-run 用）。
 * 以非严格模式运行：真机缺 serial 在「没插设备的机器上做体检」时属于预期情况，降级为 warning。
 */
export function validateAllDevices(env?: EnvConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const key of listDeviceKeys()) {
    const entry = DEVICE_REGISTRY[key];
    if (entry === undefined) {
      continue;
    }
    issues.push(...entry.validate(entry.build(env), { strict: false }));
  }
  return issues;
}

/* ═══════════════ 透传导出 ═══════════════ */

export {
  ANDROID_EMULATOR_DEFAULTS,
  ANDROID_REAL_DEFAULTS,
  IOS_SIMULATOR_DEFAULTS,
  androidEmulatorConfig,
  androidRealConfig,
  buildAndroidEmulatorConfig,
  buildAndroidRealConfig,
  buildIosSimulatorConfig,
  iosSimulatorConfig,
  validateAndroidEmulator,
  validateAndroidReal,
  validateIosSimulator,
};

export type { AndroidEmulatorOverrides } from './android.emulator.config';
export type { AndroidRealOverrides, AndroidRealValidateOptions } from './android.real.config';
export type { IosSimulatorOverrides } from './ios.simulator.config';
