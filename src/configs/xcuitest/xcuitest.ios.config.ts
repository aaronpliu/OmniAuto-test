import type {
  AppConfig,
  DeviceConfig,
  EnvConfig,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES, InvalidCombinationError } from '../../contracts/types';
import { toAbsolutePath } from '../../utils/paths';

/**
 * XCUITest iOS 侧构建参数（xcodebuild 的输入）。
 *
 * 【destination 字符串是本文件的核心，也是 xcodebuild 最容易写错的一项】
 * 模拟器与真机的语法完全不同：
 *   - 模拟器：`platform=iOS Simulator,name=iPhone 15,OS=17.5`
 *   - 真机：  `platform=iOS,id=<udid>`
 * 常见错误有三类，且报错信息都很误导：
 *   1. 真机用了 `name=`：xcodebuild 报 "Unable to find a device matching the provided destination"，
 *      即使设备就插在那里 —— 真机必须用 `id=`（udid），因为设备名可重复；
 *   2. 模拟器漏了 `OS=`：退化成 `OS=latest`，Xcode 升级后静默跑到别的运行时上；
 *   3. `platform=iOS Simulator` 中间的空格被转义或引号包错：destination 整体解析失败。
 * 因此本文件把 destination 的拼装收口到 `buildDestination()` 一个函数里，
 * 并且**不在字符串内部加引号** —— 引号是 shell 的事，我们用 execFile 数组传参，
 * 加引号反而会让引号本身成为字面量的一部分。
 *
 * 【为什么非 iOS 平台要直接抛错而不是返回空配置】
 * XCUITest 是 Apple 的私有测试框架，Android 上根本不存在对应概念。
 * 返回一个「空的 Android XCUITest 配置」会让错误推迟到 xcodebuild 启动失败时才暴露，
 * 那时的报错是 `xcodebuild: error: Unknown build action`，与真实原因（选错框架）毫无关联。
 */

/** xcodebuild 参数集合 */
export interface XCUITestIosConfig {
  /** `.xcworkspace` 绝对路径；与 projectPath 二选一，workspace 优先 */
  readonly workspacePath?: string;
  /** `.xcodeproj` 绝对路径 */
  readonly projectPath?: string;
  readonly scheme: string;
  readonly configuration: 'Debug' | 'Release';
  readonly derivedDataPath: string;
  /** `iphonesimulator` | `iphoneos` */
  readonly sdk: 'iphonesimulator' | 'iphoneos';
  /** `-destination` 的值，见文件头说明 */
  readonly destination: string;
  readonly testPlan?: string;
  /** `.xcresult` 输出路径 */
  readonly resultBundlePath: string;
  /** XCTest Runner target 名 */
  readonly runnerTarget: string;
  /** 完整的 xcodebuild 参数数组（execFile 风格，不含可执行文件本身） */
  readonly xcodebuildArgs: readonly string[];
}

/** iOS 侧构建输入 */
export interface XCUITestIosInput {
  readonly app: AppConfig;
  readonly device: DeviceConfig;
  readonly env: EnvConfig;
  readonly scheme?: string;
  readonly workspacePath?: string;
  readonly projectPath?: string;
  readonly configuration?: 'Debug' | 'Release';
  readonly derivedDataPath?: string;
  readonly testPlan?: string;
  readonly resultBundlePath?: string;
  readonly runnerTarget?: string;
  /** 运行标识，用于隔离每轮的 `.xcresult`，避免 xcodebuild 因产物已存在而拒绝写入 */
  readonly runId?: string;
  /** 追加到末尾的额外 xcodebuild 参数 */
  readonly extraArgs?: readonly string[];
}

/** iOS 侧默认值 */
export const XCUITEST_IOS_DEFAULTS = {
  configuration: 'Debug',
  /** 与 Detox 分开：两者都用 `ios/build` 会互相覆盖 DerivedData */
  derivedDataPath: 'ios/xcuitest-build',
  iosSourceDir: 'ios',
  /** Runner target 命名约定：`<Scheme>UITests` */
  runnerTargetSuffix: 'UITests',
  resultBundleDir: 'reports/xcresult',
} as const;

/** 由 App key 推导默认 scheme 名：`mock` → `OmniMock` */
export function defaultXcuitestScheme(appKey: string): string {
  const normalized = appKey.trim();
  if (normalized === '') {
    return 'Omni';
  }
  return `Omni${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

/**
 * 拼装 `-destination` 值。
 *
 * @throws {InvalidCombinationError} 设备不是 iOS
 */
export function buildDestination(device: DeviceConfig): string {
  if (device.platform !== 'ios') {
    throw new InvalidCombinationError(
      { framework: 'xcuitest', platform: device.platform, device: device.kind },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'device.platform',
          message: `XCUITest 是 Apple 私有测试框架，不存在 ${device.platform} 平台的实现`,
          severity: 'error',
          hint: 'Android 请改用 --framework=appium 或 --framework=detox',
        },
      ],
    );
  }

  if (device.kind === 'simulator') {
    const parts = ['platform=iOS Simulator', `name=${device.deviceName}`];
    if (device.platformVersion !== undefined && device.platformVersion.trim() !== '') {
      parts.push(`OS=${device.platformVersion}`);
    }
    return parts.join(',');
  }

  // 真机：必须用 udid（id=），设备名不唯一
  if (device.udid !== undefined && device.udid.trim() !== '') {
    return `platform=iOS,id=${device.udid}`;
  }

  // 没有 udid 的真机无法定位；给出一个语法合法但注定匹配失败的 destination 只会更难排查，
  // 不如在这里就抛错
  throw new InvalidCombinationError(
    { framework: 'xcuitest', platform: device.platform, device: device.kind },
    [
      {
        code: ERROR_CODES.CONFIG_MISSING_FIELD,
        path: 'device.udid',
        message: 'iOS 真机的 -destination 必须使用 id=<udid>，但设备配置中没有 udid',
        severity: 'error',
        hint: '执行 `xcrun xctrace list devices` 获取 udid，然后设置 OMNI_DEVICE_UDID 或传 --deviceId',
      },
    ],
  );
}

/** 由设备形态推导 SDK */
export function resolveSdk(device: DeviceConfig): 'iphonesimulator' | 'iphoneos' {
  return device.kind === 'simulator' ? 'iphonesimulator' : 'iphoneos';
}

/**
 * 构建完整的 iOS 侧 xcodebuild 参数。
 *
 * @throws {InvalidCombinationError} 平台不是 iOS
 */
export function buildXCUITestIosConfig(input: XCUITestIosInput): XCUITestIosConfig {
  const { app, device } = input;

  if (device.platform !== 'ios') {
    throw new InvalidCombinationError(
      { framework: 'xcuitest', platform: device.platform, device: device.kind, app: app.key },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'options.platform',
          message: `XCUITest 仅支持 iOS，实际收到 platform='${device.platform}'`,
          severity: 'error',
          hint: 'Android 请改用 --framework=appium 或 --framework=detox',
        },
      ],
    );
  }

  const scheme = input.scheme ?? defaultXcuitestScheme(String(app.key));
  const configuration = input.configuration ?? XCUITEST_IOS_DEFAULTS.configuration;
  const derivedDataPath = toAbsolutePath(input.derivedDataPath ?? XCUITEST_IOS_DEFAULTS.derivedDataPath);
  const sdk = resolveSdk(device);
  const destination = buildDestination(device);
  const runnerTarget = input.runnerTarget ?? `${scheme}${XCUITEST_IOS_DEFAULTS.runnerTargetSuffix}`;

  // 每轮一个独立的 .xcresult：xcodebuild 在目标路径已存在时会直接失败（不覆盖），
  // 用 runId 做后缀能同时满足「不冲突」与「可追溯」
  const resultBundlePath = toAbsolutePath(
    input.resultBundlePath
    ?? `${XCUITEST_IOS_DEFAULTS.resultBundleDir}/${input.runId ?? 'latest'}.xcresult`,
  );

  const workspacePath = input.workspacePath !== undefined
    ? toAbsolutePath(input.workspacePath)
    : (input.projectPath === undefined
      ? toAbsolutePath(`${XCUITEST_IOS_DEFAULTS.iosSourceDir}/${scheme}.xcworkspace`)
      : undefined);
  const projectPath = input.projectPath !== undefined ? toAbsolutePath(input.projectPath) : undefined;

  const args: string[] = [];

  // workspace 优先：同时给 -workspace 与 -project 时 xcodebuild 直接报错
  if (workspacePath !== undefined) {
    args.push('-workspace', workspacePath);
  } else if (projectPath !== undefined) {
    args.push('-project', projectPath);
  }

  args.push('-scheme', scheme);
  args.push('-configuration', configuration);
  args.push('-sdk', sdk);
  args.push('-destination', destination);
  args.push('-derivedDataPath', derivedDataPath);
  args.push('-resultBundlePath', resultBundlePath);

  if (input.testPlan !== undefined && input.testPlan.trim() !== '') {
    args.push('-testPlan', input.testPlan);
  }

  /**
   * `-destination-timeout 120`：xcodebuild 默认只等 30s 让模拟器就绪，
   * 冷启动经常超过这个值，报错却是含糊的 "Unable to find a destination"。
   */
  args.push('-destination-timeout', '120');

  /**
   * 真机需要自动管理签名；模拟器不需要签名，加了反而会在无证书的 CI 上失败。
   */
  if (sdk === 'iphoneos') {
    args.push('-allowProvisioningUpdates');
  } else {
    args.push('CODE_SIGNING_ALLOWED=NO');
  }

  if (input.extraArgs !== undefined) {
    args.push(...input.extraArgs);
  }

  return {
    workspacePath,
    projectPath,
    scheme,
    configuration,
    derivedDataPath,
    sdk,
    destination,
    testPlan: input.testPlan,
    resultBundlePath,
    runnerTarget,
    xcodebuildArgs: args,
  };
}

/** 校验 iOS 侧配置 */
export function validate(config: XCUITestIosConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.workspacePath === undefined && config.projectPath === undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'xcuitest.ios.workspacePath',
      message: 'xcodebuild 必须提供 -workspace 或 -project 之一',
      severity: 'error',
    });
  }

  if (config.workspacePath !== undefined && config.projectPath !== undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.ios.projectPath',
      message: '同时提供了 workspacePath 与 projectPath，xcodebuild 会直接报错拒绝执行',
      severity: 'error',
      hint: '二选一；有 .xcworkspace 时一律用 workspace（否则 CocoaPods 依赖不会被链接）',
    });
  }

  if (config.scheme.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'xcuitest.ios.scheme',
      message: 'scheme 不能为空',
      severity: 'error',
      hint: '可执行 `xcodebuild -list -workspace <path>` 查看可用 scheme',
    });
  }

  if (!config.destination.startsWith('platform=')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.ios.destination',
      message: `destination "${config.destination}" 未以 platform= 开头，xcodebuild 无法解析`,
      severity: 'error',
    });
  }

  const isSimulatorDestination = config.destination.includes('platform=iOS Simulator');

  if (isSimulatorDestination && config.sdk !== 'iphonesimulator') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.ios.sdk',
      message: `destination 指向模拟器但 sdk='${config.sdk}'，产物架构与目标不匹配`,
      severity: 'error',
      hint: '模拟器必须配 -sdk iphonesimulator',
    });
  }

  if (!isSimulatorDestination && config.sdk !== 'iphoneos') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.ios.sdk',
      message: `destination 指向真机但 sdk='${config.sdk}'`,
      severity: 'error',
      hint: '真机必须配 -sdk iphoneos',
    });
  }

  if (isSimulatorDestination && !config.destination.includes('OS=')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.ios.destination',
      message: 'destination 未指定 OS=，xcodebuild 会退化为 OS=latest，Xcode 升级后行为将静默漂移',
      severity: 'warning',
    });
  }

  if (!isSimulatorDestination && !config.destination.includes('id=')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.ios.destination',
      message: '真机 destination 必须用 id=<udid> 定位；name= 在同名设备存在时会匹配失败',
      severity: 'error',
    });
  }

  if (!config.resultBundlePath.endsWith('.xcresult')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.ios.resultBundlePath',
      message: `resultBundlePath "${config.resultBundlePath}" 不以 .xcresult 结尾`,
      severity: 'warning',
      hint: 'Xcode 只把 .xcresult 后缀的目录识别为结果包，其它后缀无法在 Xcode 中打开',
    });
  }

  if (config.configuration === 'Release') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'xcuitest.ios.configuration',
      message: 'Release 配置通常开启了优化与符号裁剪，UI 测试的可访问性树可能与 Debug 不一致',
      severity: 'warning',
    });
  }

  return issues;
}
