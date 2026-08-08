import type {
  DeviceConfig,
  EnvConfig,
  Orientation,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES } from '../../contracts/types';

/**
 * iOS 模拟器设备配置。
 *
 * 【为什么默认是 iPhone 15 / 17.5】
 * Xcode 15.4 自带的 iOS 17.5 运行时里，`iPhone 15` 是 `xcrun simctl list devicetypes` 中
 * 一定存在的设备型号；而 `iPhone 15 Pro Max` 这类型号在精简安装的 CI 镜像里经常缺失。
 * 选一个「最不可能不存在」的型号做默认值，可以让 `--device=simulator` 在绝大多数机器上开箱即跑。
 *
 * 【platformVersion 为什么必须显式声明】
 * 三套框架对「不指定系统版本」的处理完全不同：
 *   - Appium XCUITest driver：会挑第一个匹配 deviceName 的运行时，多运行时共存时结果不确定；
 *   - Detox：`device.os` 缺省时按名称模糊匹配，可能命中已删除的旧运行时；
 *   - xcodebuild：`-destination` 不带 OS 会退化成 `OS=latest`，CI 升级 Xcode 后行为静默漂移。
 * 显式声明版本号，是让三套框架落到同一台设备上的前提（C-01 等价性的物理基础）。
 */

/** iOS 模拟器可被外部覆盖的字段（CLI / 调用方注入，不走环境变量） */
export interface IosSimulatorOverrides {
  readonly deviceName?: string;
  readonly platformVersion?: string;
  /** 指定具体模拟器实例的 UDID（同名同版本存在多台克隆实例时使用） */
  readonly udid?: string;
  readonly headless?: boolean;
  readonly orientation?: Orientation;
}

/** 默认值集中声明，便于 dry-run 帮助文本与文档引用同一份真理源 */
export const IOS_SIMULATOR_DEFAULTS = {
  id: 'ios.simulator',
  deviceName: 'iPhone 15',
  platformVersion: '17.5',
  /**
   * 120s：iOS 模拟器冷启动 + WDA 首次编译注入在 M 系列机器上约 40~90s，
   * 低于 120s 会在「首次运行」这一最脆弱的场景上大量误报超时。
   */
  newCommandTimeoutSec: 120,
} as const;

/** iOS 模拟器默认设备配置（静态快照，不含任何环境覆盖） */
export const iosSimulatorConfig: DeviceConfig = {
  id: IOS_SIMULATOR_DEFAULTS.id,
  platform: 'ios',
  kind: 'simulator',
  deviceName: IOS_SIMULATOR_DEFAULTS.deviceName,
  platformVersion: IOS_SIMULATOR_DEFAULTS.platformVersion,
  // 模拟器无固定 udid：由 simctl 在创建时分配，需要精确指定时通过 overrides.udid 注入
  udid: undefined,
  avdName: undefined,
  // 模拟器没有真正的 headless 模式（Simulator.app 必须有窗口服务器），恒为 false
  headless: false,
  orientation: 'portrait',
  newCommandTimeoutSec: IOS_SIMULATOR_DEFAULTS.newCommandTimeoutSec,
  extraCapabilities: {},
};

/**
 * 构建 iOS 模拟器设备配置。
 *
 * 覆盖优先级（高 → 低）：`overrides` > `env.deviceUdid` > 静态默认值。
 *
 * ⚠ 关于「环境变量覆盖 deviceName / platformVersion」：
 * 契约层 `EnvConfig` 是冻结项，其中只有 `deviceUdid` 一个设备相关字段。
 * 若为 deviceName/platformVersion 新增 `OMNI_*` 变量，就必须同时改
 * `ENV_SPEC`、`.env.example` 与冻结的 `EnvConfig` 三处，第三处不允许改动，
 * 强行只改前两处会造成「.env.example 里写了、代码永远读不到」的三方漂移 ——
 * 这正是 env.config.ts 文件头明令禁止的腐化。
 * 因此这两项改由 `overrides` 参数注入（CLI 层可透传），udid 则复用既有的 `OMNI_DEVICE_UDID`。
 *
 * @param env 已加载的环境配置，仅用于读取 `deviceUdid`
 * @param overrides 调用方显式覆盖项
 */
export function buildIosSimulatorConfig(
  env?: EnvConfig,
  overrides: IosSimulatorOverrides = {},
): DeviceConfig {
  const udid = overrides.udid ?? env?.deviceUdid;

  return {
    ...iosSimulatorConfig,
    deviceName: overrides.deviceName ?? iosSimulatorConfig.deviceName,
    platformVersion: overrides.platformVersion ?? iosSimulatorConfig.platformVersion,
    udid,
    headless: overrides.headless ?? iosSimulatorConfig.headless,
    orientation: overrides.orientation ?? iosSimulatorConfig.orientation,
  };
}

/** iOS 版本号形如 `17` / `17.5` / `17.5.1` */
const IOS_VERSION_PATTERN = /^\d+(\.\d+){0,2}$/;

/** 校验 iOS 模拟器设备配置（纯函数，不做任何 I/O，不探测设备是否真实存在） */
export function validate(config: DeviceConfig = iosSimulatorConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.platform !== 'ios') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.platform',
      message: `iOS 模拟器配置的 platform 必须为 'ios'，实际为 '${config.platform}'`,
      severity: 'error',
    });
  }

  if (config.kind !== 'simulator') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.kind',
      message: `iOS 模拟器配置的 kind 必须为 'simulator'，实际为 '${config.kind}'`,
      severity: 'error',
    });
  }

  if (config.deviceName.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'device.deviceName',
      message: 'iOS 模拟器必须指定 deviceName（如 "iPhone 15"）',
      severity: 'error',
      hint: '可执行 `xcrun simctl list devicetypes` 查看本机可用型号',
    });
  }

  if (config.platformVersion === undefined || config.platformVersion.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'device.platformVersion',
      message: '未指定 platformVersion，多个 iOS 运行时共存时会落到不确定的设备上',
      severity: 'warning',
      hint: '可执行 `xcrun simctl list runtimes` 查看本机已安装的 iOS 运行时',
    });
  } else if (!IOS_VERSION_PATTERN.test(config.platformVersion)) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.platformVersion',
      message: `platformVersion 格式非法："${config.platformVersion}"，期望形如 "17.5"`,
      severity: 'error',
    });
  }

  if (config.headless === true) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.headless',
      message: 'iOS 模拟器不支持 headless（Simulator 依赖窗口服务器），该项将被忽略',
      severity: 'warning',
      hint: 'CI 上请改用无头会话（如 xvfb 不适用于 macOS），或直接接受模拟器窗口存在',
    });
  }

  if (config.avdName !== undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'device.avdName',
      message: 'avdName 是 Android 模拟器专属字段，在 iOS 配置上无意义',
      severity: 'warning',
    });
  }

  return issues;
}
