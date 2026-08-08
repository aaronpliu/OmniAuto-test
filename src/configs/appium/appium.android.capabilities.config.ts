import type {
  AppConfig,
  DeviceConfig,
  EnvConfig,
  TestConfig,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES, InvalidCombinationError } from '../../contracts/types';

/**
 * Appium Android（UiAutomator2 driver）W3C capabilities 构建器。
 *
 * 【systemPort 为什么必须按 worker 错开 —— Android 并发的头号坑】
 * UiAutomator2 driver 会在**宿主机**上开一个端口（默认 8200），通过 `adb forward` 转发到
 * 设备内的 UiAutomator2 Server（设备侧固定 6790）。这个宿主机端口是 driver 与设备通信的唯一通道。
 * 两个 worker 同时用 8200 时，第二个会话的 `adb forward` 会**覆盖**第一个的转发规则，
 * 于是两个会话的指令全部打到同一台设备上 —— 现象是「用例随机失败、点到了别的界面」，
 * 且不会有任何报错，极难定位。
 * 计算规则：`systemPort = 8200 + workerIndex`。Appium 官方建议每个会话间隔至少 1，
 * 本工程按 2 递增（`8200, 8202, 8204…`），为将来可能引入的 chromedriverPort 预留相邻端口。
 *
 * 【为什么不用 appium:autoLaunch=false】
 * 保持默认的自动启动：本工程的 Adapter 层在 `init()` 之后立刻需要一个可交互的 App，
 * 手动 launch 只会把同一件事拆成两步并多出一处失败点。
 */

/** Android capabilities 构建输入 */
export interface AndroidCapabilityInput {
  readonly app: AppConfig;
  readonly device: DeviceConfig;
  readonly env: EnvConfig;
  readonly test?: TestConfig;
  /** 已解析的 package name；缺省时取 `app.android.appId` */
  readonly appId?: string;
  /** 已解析为绝对路径的 .apk */
  readonly binaryPath?: string;
  /** jest worker 序号（从 0 开始），用于错开 systemPort */
  readonly workerIndex?: number;
  readonly noReset?: boolean;
  readonly fullReset?: boolean;
  /** 逃生舱：原样合并（键需自带 `appium:` 前缀） */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** Android 相关默认值 */
export const APPIUM_ANDROID_DEFAULTS = {
  automationName: 'UiAutomator2',
  /** UiAutomator2 driver 宿主机端口基准值 */
  systemPortBase: 8200,
  /** 相邻会话的端口步长，留 1 个空位给 chromedriverPort */
  systemPortStep: 2,
  /**
   * 120s：UiAutomator2 Server 需要现场安装两个 apk（server + test）并启动 instrumentation，
   * 首次在真机上普遍 30~90s。
   */
  uiautomator2ServerLaunchTimeout: 120_000,
  /** 120s：两个 server apk 的安装耗时，低端真机上可能很慢 */
  uiautomator2ServerInstallTimeout: 120_000,
  /**
   * 120s：单条 adb 命令超时。默认 20s 在「安装大 apk」「设备刚唤醒」时极易误报，
   * 而 adb 卡住通常是设备侧问题，给足时间再失败能拿到更有用的现场。
   */
  adbExecTimeout: 120_000,
  newCommandTimeoutSec: 120,
} as const;

/**
 * 计算 UiAutomator2 driver 的宿主机端口。
 * @param workerIndex jest worker 序号，从 0 开始
 */
export function computeSystemPort(workerIndex: number): number {
  const index = Number.isInteger(workerIndex) && workerIndex > 0 ? workerIndex : 0;
  return APPIUM_ANDROID_DEFAULTS.systemPortBase + index * APPIUM_ANDROID_DEFAULTS.systemPortStep;
}

/**
 * 把 `AppConfig.launchArgs` 转成 Android 的 `optionalIntentArguments`。
 *
 * Android 侧没有 iOS 那样的 `launchArguments` 概念，等价物是 `am start` 的 extra 参数。
 * 按值类型选择正确的 `am` 标志位：
 *   - boolean → `--ez`（extra boolean）
 *   - number  → `--ei`（extra int）
 *   - string  → `--es`（extra string）
 * 类型标志选错会让 App 侧 `getIntent().getStringExtra()` 静默拿到 null。
 */
export function toOptionalIntentArguments(launchArgs: AppConfig['launchArgs']): string | undefined {
  if (launchArgs === undefined) {
    return undefined;
  }
  const entries = Object.entries(launchArgs);
  if (entries.length === 0) {
    return undefined;
  }
  const parts: string[] = [];
  for (const [key, value] of entries) {
    if (typeof value === 'boolean') {
      parts.push(`--ez ${key} ${value ? 'true' : 'false'}`);
    } else if (typeof value === 'number') {
      parts.push(`--ei ${key} ${String(value)}`);
    } else {
      parts.push(`--es ${key} ${JSON.stringify(value)}`);
    }
  }
  return parts.join(' ');
}

/**
 * 构建 Android W3C capabilities。
 *
 * @throws {InvalidCombinationError} `device.platform` 不是 android
 */
export function buildAndroidCapabilities(input: AndroidCapabilityInput): Record<string, unknown> {
  const { app, device, env } = input;

  if (device.platform !== 'android') {
    throw new InvalidCombinationError(
      { framework: 'appium', platform: device.platform, device: device.kind, app: app.key },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'device.platform',
          message: `buildAndroidCapabilities 只能用于 Android 设备，实际收到 platform='${device.platform}'`,
          severity: 'error',
          hint: 'iOS 请改用 buildIosCapabilities()',
        },
      ],
    );
  }

  const workerIndex = input.workerIndex ?? 0;
  const appPackage = input.appId ?? app.android?.appId ?? '';
  const binaryPath = input.binaryPath ?? app.android?.binaryPath;
  const launchActivity = app.android?.launchActivity;

  const noReset = input.noReset ?? true;
  const fullReset = input.fullReset ?? false;

  const capabilities: Record<string, unknown> = {
    // ── W3C 标准 capability ──
    platformName: 'Android',

    // ── 驱动与设备定位 ──
    'appium:automationName': APPIUM_ANDROID_DEFAULTS.automationName,
    'appium:deviceName': device.deviceName,
    'appium:udid': device.udid,
    /** 模拟器专属：driver 会在 AVD 未启动时自动 `emulator -avd <avd>` 拉起它 */
    'appium:avd': device.kind === 'emulator' ? device.avdName : undefined,
    'appium:platformVersion': device.platformVersion,

    // ── App 定位 ──
    'appium:app': binaryPath,
    'appium:appPackage': appPackage !== '' ? appPackage : undefined,
    'appium:appActivity': launchActivity,

    // ── 重置策略（语义与 iOS 一致，理由见 appium.ios.capabilities.config.ts） ──
    'appium:noReset': noReset,
    'appium:fullReset': fullReset,

    /**
     * autoGrantPermissions：安装后自动 `adb shell pm grant` 全部 manifest 声明的运行时权限。
     * Android 侧没有 iOS 那样的「按项预授权」能力，只能全授或全不授；
     * E2E 场景下全授是合理默认 —— 权限弹窗本身极少是被测目标，却会打断几乎所有用例。
     * ⚠ 与 noReset=true 有交互：App 已安装且未卸载时该项不会生效（因为没有走安装流程）。
     */
    'appium:autoGrantPermissions': true,

    // ── 超时 ──
    'appium:newCommandTimeout': device.newCommandTimeoutSec ?? APPIUM_ANDROID_DEFAULTS.newCommandTimeoutSec,
    'appium:uiautomator2ServerLaunchTimeout': APPIUM_ANDROID_DEFAULTS.uiautomator2ServerLaunchTimeout,
    'appium:uiautomator2ServerInstallTimeout': APPIUM_ANDROID_DEFAULTS.uiautomator2ServerInstallTimeout,
    'appium:adbExecTimeout': APPIUM_ANDROID_DEFAULTS.adbExecTimeout,

    // ── 并发隔离（详见文件头说明） ──
    'appium:systemPort': computeSystemPort(workerIndex),

    /**
     * disableWindowAnimation：关闭窗口/过渡/动画缩放。
     * 动画不只是慢，它会让 UiAutomator2 的「等待窗口空闲」判定长时间不满足，
     * 从而把每个 tap 都拖到超时边缘 —— 这是 Android E2E 不稳定的最大单一来源。
     */
    'appium:disableWindowAnimation': true,

    /** 跳过 driver 对 App 签名的校验，能省下一次完整 apk 解析（大包上可达数秒） */
    'appium:skipDeviceInitialization': noReset,
    /** 不因为「已安装同名不同签名的包」而自动卸载重装，保持行为可预期 */
    'appium:enforceAppInstall': fullReset,
    /** 忽略无关的 hidden api 策略告警，避免污染日志 */
    'appium:ignoreHiddenApiPolicyError': true,
  };

  const intentArgs = toOptionalIntentArguments(app.launchArgs);
  if (intentArgs !== undefined) {
    capabilities['appium:optionalIntentArguments'] = intentArgs;
  }

  if (device.orientation !== undefined) {
    capabilities['appium:orientation'] = device.orientation.toUpperCase();
  }

  // 模拟器可以无窗口运行，真机不行
  if (device.kind === 'emulator' && device.headless === true) {
    capabilities['appium:isHeadless'] = true;
  }

  // CI 上强制关闭 driver 自带的重试，让失败尽快暴露而不是被静默吞掉
  if (env.nodeEnv === 'ci') {
    capabilities['appium:suppressKillServer'] = false;
  }

  Object.assign(capabilities, device.extraCapabilities ?? {}, input.extra ?? {});

  return stripUndefined(capabilities);
}

/** 移除值为 undefined 的键（浅层） */
function stripUndefined(source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/** Android package name 形如 `com.omni.mock` */
const PACKAGE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/** 校验已构建的 Android capabilities */
export function validate(capabilities: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (capabilities['platformName'] !== 'Android') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.capabilities.platformName',
      message: `platformName 必须为 'Android'，实际为 '${String(capabilities['platformName'])}'`,
      severity: 'error',
    });
  }

  const hasApp = typeof capabilities['appium:app'] === 'string';
  const appPackage = capabilities['appium:appPackage'];
  const hasPackage = typeof appPackage === 'string' && appPackage.trim() !== '';

  if (!hasApp && !hasPackage) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'appium.capabilities',
      message: 'Android 会话必须提供 appium:app（apk 路径）或 appium:appPackage（已安装 App）之一',
      severity: 'error',
      hint: '请在 App 配置中补全 android.appId 或 android.binaryPath',
    });
  }

  if (hasPackage && !PACKAGE_NAME_PATTERN.test(appPackage as string)) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.capabilities.appium:appPackage',
      message: `appPackage "${String(appPackage)}" 不像合法的 Android 包名（期望形如 com.example.app）`,
      severity: 'warning',
    });
  }

  // 只给 package 不给 activity 时，UiAutomator2 会尝试从 apk 里推断；
  // 但在 noReset 且 apk 不可用的场景下它推断不出来，只能报一个很含糊的启动失败
  if (hasPackage && !hasApp && capabilities['appium:appActivity'] === undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'appium.capabilities.appium:appActivity',
      message: '仅提供了 appPackage 而未提供 appActivity，driver 在拿不到 apk 时无法推断启动入口',
      severity: 'warning',
      hint: '可执行 `adb shell cmd package resolve-activity --brief <package>` 获取，'
        + '然后填入 App 配置的 android.launchActivity',
    });
  }

  const systemPort = capabilities['appium:systemPort'];
  if (typeof systemPort !== 'number' || !Number.isInteger(systemPort) || systemPort < 1024) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.capabilities.appium:systemPort',
      message: `systemPort 必须是 >= 1024 的整数，实际为 ${String(systemPort)}`,
      severity: 'error',
      hint: '多 worker 并发时必须逐会话错开，否则 adb forward 规则会互相覆盖',
    });
  }

  if (capabilities['appium:noReset'] === true && capabilities['appium:fullReset'] === true) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.capabilities.appium:fullReset',
      message: 'noReset 与 fullReset 同时为 true 是自相矛盾的组合，Appium 会直接拒绝会话',
      severity: 'error',
    });
  }

  // avd 只在模拟器有意义；真机上给了会让 driver 去启动一个不存在的 AVD
  const avd = capabilities['appium:avd'];
  const udid = capabilities['appium:udid'];
  if (typeof avd === 'string' && typeof udid === 'string' && !udid.startsWith('emulator-')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.capabilities.appium:avd',
      message: `同时指定了 avd="${avd}" 与真机 udid="${udid}"，driver 的行为将取决于实现细节`,
      severity: 'warning',
      hint: '真机运行请不要下发 appium:avd',
    });
  }

  return issues;
}
