import type {
  AppConfig,
  DeviceConfig,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES, InvalidCombinationError } from '../../contracts/types';

/**
 * Detox iOS 侧配置片段（`.detoxrc` 的 `devices.*` 与 `apps.*` 两个条目）。
 *
 * 【device.os 为什么要带 "iOS " 前缀】
 * Detox 的 simulator driver 把 `device.os` 原样交给 `applesimutils --byOS`，
 * 后者匹配的是运行时的**完整名称**（`iOS 17.5`），不是裸版本号。
 * 写成 `"17.5"` 会匹配不到任何运行时，Detox 报错为
 * `Failed to find a device by type = "iPhone 15" and by OS = "17.5"` ——
 * 这条报错很容易被误读成「模拟器没装」，实际上只是少了两个字符的前缀。
 *
 * 【binaryPath 与 build 的关系】
 * Detox 不负责推断产物路径：`build` 是它执行的命令，`binaryPath` 是它随后去取产物的位置，
 * 两者必须由使用者保证一致。`-derivedDataPath ios/build` 决定了产物落在
 * `ios/build/Build/Products/<Configuration>-iphonesimulator/<Scheme>.app`，
 * 本文件按这个约定同时生成两者，避免手工拼错。
 */

/** Detox iOS 设备条目 */
export interface DetoxIosDeviceEntry {
  readonly type: 'ios.simulator';
  readonly device: {
    /** 设备型号名，如 `iPhone 15` */
    readonly type: string;
    /** 运行时完整名，如 `iOS 17.5` */
    readonly os?: string;
    /** 精确指定某台已存在的模拟器实例 */
    readonly id?: string;
  };
}

/** Detox iOS App 条目 */
export interface DetoxIosAppEntry {
  readonly type: 'ios.app';
  readonly binaryPath: string;
  readonly build?: string;
  readonly launchArgs?: Readonly<Record<string, string | number | boolean>>;
}

/** iOS App 条目构建输入 */
export interface DetoxIosAppInput {
  readonly app: AppConfig;
  /** 覆盖二进制路径；缺省时按 derivedDataPath 约定推导 */
  readonly binaryPath?: string;
  /** Xcode scheme 名；缺省时由 app.key 推导 */
  readonly scheme?: string;
  /** `.xcworkspace` 路径（相对工程根）；与 project 二选一，workspace 优先 */
  readonly workspace?: string;
  /** `.xcodeproj` 路径（相对工程根） */
  readonly project?: string;
  /** 构建配置，默认 Debug —— Detox 需要 Debug 才能注入同步机制 */
  readonly configuration?: 'Debug' | 'Release';
  /** DerivedData 路径，默认 `ios/build` */
  readonly derivedDataPath?: string;
  /** 覆盖构建命令；传空串表示「不构建，直接用现成产物」 */
  readonly buildCommand?: string;
}

/** iOS 侧默认值 */
export const DETOX_IOS_DEFAULTS = {
  configuration: 'Debug',
  sdk: 'iphonesimulator',
  derivedDataPath: 'ios/build',
  /** 工作区目录，约定放在 e2e 同级仓库的 ios/ 下 */
  iosSourceDir: 'ios',
} as const;

/**
 * 由 App key 推导默认 Xcode scheme 名：`mock` → `OmniMock`。
 * 这只是一个**可被覆盖的约定**，真实工程若 scheme 名不同，
 * 通过 `DetoxIosAppInput.scheme` 显式传入即可。
 */
export function defaultIosScheme(appKey: string): string {
  const normalized = appKey.trim();
  if (normalized === '') {
    return 'Omni';
  }
  return `Omni${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

/** 拼出 xcodebuild 的产物路径（与 -derivedDataPath 严格对应） */
export function buildIosBinaryPath(
  scheme: string,
  configuration: string = DETOX_IOS_DEFAULTS.configuration,
  derivedDataPath: string = DETOX_IOS_DEFAULTS.derivedDataPath,
): string {
  return `${derivedDataPath}/Build/Products/${configuration}-${DETOX_IOS_DEFAULTS.sdk}/${scheme}.app`;
}

/**
 * 拼出 Detox 使用的 xcodebuild 构建命令。
 *
 * 几个参数的必要性：
 * - `-sdk iphonesimulator`：不加会默认按真机 SDK 构建，产物无法装进模拟器；
 * - `-derivedDataPath`：不加则产物落在全局 DerivedData 的随机哈希目录里，`binaryPath` 无法预测；
 * - `-quiet`：xcodebuild 的默认输出量巨大，会把 Detox 自身的日志淹没。
 */
export function buildIosBuildCommand(input: {
  readonly scheme: string;
  readonly workspace?: string;
  readonly project?: string;
  readonly configuration?: string;
  readonly derivedDataPath?: string;
}): string {
  const configuration = input.configuration ?? DETOX_IOS_DEFAULTS.configuration;
  const derivedDataPath = input.derivedDataPath ?? DETOX_IOS_DEFAULTS.derivedDataPath;

  const target = input.workspace !== undefined && input.workspace !== ''
    ? `-workspace ${input.workspace}`
    : `-project ${input.project ?? `${DETOX_IOS_DEFAULTS.iosSourceDir}/${input.scheme}.xcodeproj`}`;

  return [
    'xcodebuild',
    target,
    `-scheme ${input.scheme}`,
    `-configuration ${configuration}`,
    `-sdk ${DETOX_IOS_DEFAULTS.sdk}`,
    `-derivedDataPath ${derivedDataPath}`,
    '-quiet',
    'build',
  ].join(' ');
}

/**
 * 构建 Detox iOS 设备条目。
 *
 * @throws {InvalidCombinationError} 设备不是 iOS 模拟器
 */
export function buildDetoxIosDevice(device: DeviceConfig): DetoxIosDeviceEntry {
  if (device.platform !== 'ios') {
    throw new InvalidCombinationError(
      { framework: 'detox', platform: device.platform, device: device.kind },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'device.platform',
          message: `buildDetoxIosDevice 只能用于 iOS 设备，实际收到 platform='${device.platform}'`,
          severity: 'error',
          hint: 'Android 请改用 buildDetoxAndroidDevice()',
        },
      ],
    );
  }

  if (device.kind !== 'simulator') {
    throw new InvalidCombinationError(
      { framework: 'detox', platform: device.platform, device: device.kind },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'device.kind',
          message: `Detox 在 iOS 上只支持模拟器（ios.simulator），实际收到 kind='${device.kind}'`,
          severity: 'error',
          hint: 'Detox 官方明确不支持 iOS 真机；iOS 真机请改用 --framework=appium 或 --framework=xcuitest',
        },
      ],
    );
  }

  return {
    type: 'ios.simulator',
    device: {
      type: device.deviceName,
      // 关键：补上 "iOS " 前缀，理由见文件头
      os: device.platformVersion !== undefined && device.platformVersion.trim() !== ''
        ? `iOS ${device.platformVersion}`
        : undefined,
      id: device.udid,
    },
  };
}

/** 构建 Detox iOS App 条目 */
export function buildDetoxIosApp(input: DetoxIosAppInput): DetoxIosAppEntry {
  const scheme = input.scheme ?? defaultIosScheme(String(input.app.key));
  const configuration = input.configuration ?? DETOX_IOS_DEFAULTS.configuration;
  const derivedDataPath = input.derivedDataPath ?? DETOX_IOS_DEFAULTS.derivedDataPath;

  const binaryPath = input.binaryPath
    ?? input.app.ios?.binaryPath
    ?? buildIosBinaryPath(scheme, configuration, derivedDataPath);

  const build = input.buildCommand !== undefined
    ? input.buildCommand
    : buildIosBuildCommand({
      scheme,
      workspace: input.workspace ?? `${DETOX_IOS_DEFAULTS.iosSourceDir}/${scheme}.xcworkspace`,
      project: input.project,
      configuration,
      derivedDataPath,
    });

  return {
    type: 'ios.app',
    binaryPath,
    build: build === '' ? undefined : build,
    launchArgs: input.app.launchArgs,
  };
}

/** 校验 iOS 设备条目 */
export function validateDevice(entry: DetoxIosDeviceEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (entry.device.type.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.devices.device.type',
      message: 'Detox iOS 设备必须指定型号名（如 "iPhone 15"）',
      severity: 'error',
    });
  }

  if (entry.device.os === undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.devices.device.os',
      message: '未指定 os，多个 iOS 运行时共存时 Detox 会挑到不确定的那一个',
      severity: 'warning',
      hint: '形如 "iOS 17.5"',
    });
  } else if (!entry.device.os.startsWith('iOS ')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.devices.device.os',
      message: `os="${entry.device.os}" 缺少 "iOS " 前缀，applesimutils 将匹配不到任何运行时`,
      severity: 'error',
      hint: '正确写法形如 "iOS 17.5"，而不是 "17.5"',
    });
  }

  return issues;
}

/** 校验 iOS App 条目 */
export function validateApp(entry: DetoxIosAppEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (entry.binaryPath.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.apps.binaryPath',
      message: 'Detox iOS App 必须指定 binaryPath（.app 产物路径）',
      severity: 'error',
    });
  } else if (!entry.binaryPath.endsWith('.app')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.apps.binaryPath',
      message: `binaryPath "${entry.binaryPath}" 不以 .app 结尾；Detox 模拟器只能安装 .app 目录，不能安装 .ipa`,
      severity: 'error',
      hint: '.ipa 是给真机/App Store 的归档格式，模拟器需要 xcodebuild 产出的 .app bundle',
    });
  }

  if (entry.build !== undefined && entry.build.includes('-sdk iphoneos')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.apps.build',
      message: '构建命令使用了 -sdk iphoneos（真机 SDK），产物无法安装到模拟器',
      severity: 'error',
      hint: '请改为 -sdk iphonesimulator',
    });
  }

  if (entry.build !== undefined && entry.build.includes('-configuration Release')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.apps.build',
      message: 'Release 配置通常未链接 Detox 的同步库，会导致 Detox 无法感知 App 空闲状态而全程超时',
      severity: 'warning',
      hint: 'Detox 建议使用 Debug 配置；确需 Release 时须在该配置中显式集成 Detox',
    });
  }

  return issues;
}
