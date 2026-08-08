import type {
  AppConfig,
  DeviceConfig,
  EnvConfig,
  TestConfig,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES, InvalidCombinationError } from '../../contracts/types';

/**
 * Appium iOS（XCUITest driver）W3C capabilities 构建器。
 *
 * 【为什么每一项都显式写 `appium:` 前缀】
 * W3C WebDriver 规范只承认少数标准 capability（`platformName`/`browserName`/`acceptInsecureCerts`…），
 * 其余一律要求带厂商前缀，否则服务端**必须**拒绝会话。Appium 2.x 严格执行了这条规范：
 * 不带前缀的 `deviceName` 会直接报
 * `Bad capabilities. Specify either app or bundleId ... 'deviceName' is not a standard capability`。
 * 契约层 `AppiumFrameworkConfig.capabilities` 的注释写的是「前缀由 Driver 统一补全」，
 * 那是 Appium 1.x 的行为，在 2.x 上已不成立 —— 本文件按 2.x 的真实要求在**构建期**就补全前缀，
 * 让适配器层可以把这份对象原样丢给 `remote({ capabilities })`。
 *
 * 【并发时哪些端口必须错开】
 * XCUITest driver 为每个会话起一个 WebDriverAgent 实例，默认都监听 8100。
 * 同机跑 2 个 worker 时第二个会话会绑定失败或串到第一台设备上。
 * 因此 `wdaLocalPort` 必须按 worker 序号错开：`8100 + workerIndex`。
 * mjpeg 屏幕流同理（`9100 + workerIndex`）。
 */

/** iOS capabilities 构建输入 */
export interface IosCapabilityInput {
  readonly app: AppConfig;
  readonly device: DeviceConfig;
  readonly env: EnvConfig;
  /** 测试策略；目前只用于把 hook 超时同步给 WDA 启动超时 */
  readonly test?: TestConfig;
  /** 已解析的 bundleId；缺省时取 `app.ios.appId` */
  readonly appId?: string;
  /** 已解析为绝对路径的安装包（.app / .ipa） */
  readonly binaryPath?: string;
  /** jest worker 序号（从 0 开始），用于错开 WDA 端口 */
  readonly workerIndex?: number;
  /** 覆盖 noReset（默认 true，见下方说明） */
  readonly noReset?: boolean;
  /** 覆盖 fullReset（默认 false） */
  readonly fullReset?: boolean;
  /** 逃生舱：原样合并进最终 capabilities（键需自带 `appium:` 前缀） */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** iOS 相关默认值 */
export const APPIUM_IOS_DEFAULTS = {
  automationName: 'XCUITest',
  /** WDA 默认端口，多 worker 时按序号递增 */
  wdaLocalPortBase: 8100,
  /** MJPEG 屏幕流默认端口，多 worker 时按序号递增 */
  mjpegServerPortBase: 9100,
  /**
   * 240s：WDA 首次运行需现场编译签名注入，冷启动在未预热机器上可达 3 分钟以上。
   * 这是 iOS 自动化「第一次总是失败」的头号原因，宁可给足也不要卡在这里。
   */
  wdaLaunchTimeout: 240_000,
  /** 60s：WDA 起来之后的 HTTP 握手，正常在秒级，60s 足够覆盖抖动 */
  wdaConnectionTimeout: 60_000,
  /** 120s：模拟器冷启动（含 boot 到 SpringBoard 可交互） */
  simulatorStartupTimeout: 120_000,
  /** 120s：两条 Appium 命令之间的最大空闲时间，超过则服务端主动销毁会话 */
  newCommandTimeoutSec: 120,
} as const;

/**
 * 把 `AppConfig.permissions` 转成 XCUITest driver 要求的 `appium:permissions` 格式。
 *
 * Appium 的 `permissions` capability 期望一个**JSON 字符串**（不是对象），形如：
 * `'{"com.omni.mock":{"camera":"YES","photos":"YES"}}'`
 * 它底层调用 `applesimutils --setPermissions`，故取值沿用 applesimutils 的
 * `YES | NO | unset` 三态 —— 与 `AppConfig.permissions` 的取值域完全一致，无需转换大小写。
 *
 * ⚠ 该 capability **仅对模拟器有效**：真机权限只能由用户手动授予或依赖 App 自身的引导流程。
 *
 * @returns JSON 字符串；无权限声明或 bundleId 缺失时返回 undefined（不下发该 capability）
 */
export function formatIosPermissions(
  permissions: AppConfig['permissions'],
  bundleId: string,
): string | undefined {
  if (permissions === undefined || bundleId.trim() === '') {
    return undefined;
  }
  const entries = Object.entries(permissions);
  if (entries.length === 0) {
    return undefined;
  }
  const table: Record<string, Record<string, string>> = {
    [bundleId]: Object.fromEntries(entries),
  };
  return JSON.stringify(table);
}

/**
 * 把 `AppConfig.launchArgs` 转成 XCUITest 的 `processArguments`。
 *
 * XCUIApplication 的 `launchArguments` 是**扁平字符串数组**，业界约定用 `-key value` 成对表达；
 * 布尔值则遵循 `NSUserDefaults` 的惯例，用 `-key YES/NO`（这样 App 内可直接被
 * `UserDefaults.standard.bool(forKey:)` 读到），而不是只传一个裸 flag。
 */
export function toProcessArguments(
  launchArgs: AppConfig['launchArgs'],
): { readonly args: string[]; readonly env: Record<string, string> } | undefined {
  if (launchArgs === undefined) {
    return undefined;
  }
  const entries = Object.entries(launchArgs);
  if (entries.length === 0) {
    return undefined;
  }
  const args: string[] = [];
  for (const [key, value] of entries) {
    args.push(`-${key}`);
    args.push(typeof value === 'boolean' ? (value ? 'YES' : 'NO') : String(value));
  }
  return { args, env: {} };
}

/**
 * 构建 iOS W3C capabilities。
 *
 * @throws {InvalidCombinationError} `device.platform` 不是 ios
 */
export function buildIosCapabilities(input: IosCapabilityInput): Record<string, unknown> {
  const { app, device, env } = input;

  if (device.platform !== 'ios') {
    throw new InvalidCombinationError(
      { framework: 'appium', platform: device.platform, device: device.kind, app: app.key },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'device.platform',
          message: `buildIosCapabilities 只能用于 iOS 设备，实际收到 platform='${device.platform}'`,
          severity: 'error',
          hint: 'Android 请改用 buildAndroidCapabilities()',
        },
      ],
    );
  }

  const workerIndex = input.workerIndex ?? 0;
  const bundleId = input.appId ?? app.ios?.appId ?? '';
  const binaryPath = input.binaryPath ?? app.ios?.binaryPath;
  const isSimulator = device.kind === 'simulator';

  /**
   * noReset 默认 true：默认**不**在会话结束时卸载 App、不清数据。
   * 理由是移动端 E2E 的绝大部分耗时在装包上，反复卸载重装会让一轮冒烟从 2 分钟变成 10 分钟；
   * 需要纯净环境的用例应显式传 fullReset，而不是让所有人为少数用例买单。
   */
  const noReset = input.noReset ?? true;
  const fullReset = input.fullReset ?? false;

  const capabilities: Record<string, unknown> = {
    // ── W3C 标准 capability（唯一不带前缀的一项） ──
    platformName: 'iOS',

    // ── 驱动与设备定位 ──
    'appium:automationName': APPIUM_IOS_DEFAULTS.automationName,
    'appium:deviceName': device.deviceName,
    'appium:platformVersion': device.platformVersion,
    'appium:udid': device.udid,

    // ── App 定位 ──
    'appium:app': binaryPath,
    'appium:bundleId': bundleId !== '' ? bundleId : undefined,

    // ── 重置策略 ──
    'appium:noReset': noReset,
    'appium:fullReset': fullReset,

    // ── 超时 ──
    'appium:newCommandTimeout': device.newCommandTimeoutSec ?? APPIUM_IOS_DEFAULTS.newCommandTimeoutSec,
    'appium:wdaLaunchTimeout': APPIUM_IOS_DEFAULTS.wdaLaunchTimeout,
    'appium:wdaConnectionTimeout': APPIUM_IOS_DEFAULTS.wdaConnectionTimeout,
    'appium:simulatorStartupTimeout': APPIUM_IOS_DEFAULTS.simulatorStartupTimeout,

    /**
     * usePrebuiltWDA：复用已构建的 WDA，跳过每次会话的重新编译。
     * 本地默认开启（省 1~3 分钟），CI 默认关闭 —— CI 上 DerivedData 通常是干净的，
     * 开启后 Appium 会去找一个不存在的 prebuilt 产物并以更难懂的方式失败。
     */
    'appium:usePrebuiltWDA': env.nodeEnv !== 'ci',

    /**
     * 端口错开：多 worker 并发时，第 N 个 worker 用 8100+N。
     * 单 worker（默认）时等价于 8100，与 WDA 默认值一致。
     */
    'appium:wdaLocalPort': APPIUM_IOS_DEFAULTS.wdaLocalPortBase + workerIndex,
    'appium:mjpegServerPort': APPIUM_IOS_DEFAULTS.mjpegServerPortBase + workerIndex,

    // ── 弹窗与 WebView ──
    /**
     * autoAcceptAlerts：自动点掉系统弹窗（权限、评分、更新提示）。
     * 与 permissions 预授权是互补而非重复：permissions 只能覆盖已知的权限项，
     * 而系统级弹窗（如「App 想使用无线数据」）不在 applesimutils 的管辖范围内。
     */
    'appium:autoAcceptAlerts': true,
    /** 混合 App 的 WebView 上下文默认不含 Safari，显式打开以便 context 切换 */
    'appium:includeSafariInWebviews': true,

    // ── 稳定性 ──
    /** 连接已存在的 WDA 会话失败时，允许重建而不是直接报错 */
    'appium:shouldTerminateApp': false,
    /** 关闭 XCUITest 的自动截图快照缓存，长会话下能显著降低内存占用 */
    'appium:maxTypingFrequency': 30,
  };

  // 仅模拟器支持权限预授权；真机下发该项会被 driver 直接拒绝会话
  if (isSimulator) {
    const permissions = formatIosPermissions(app.permissions, bundleId);
    if (permissions !== undefined) {
      capabilities['appium:permissions'] = permissions;
    }
  }

  const processArguments = toProcessArguments(app.launchArgs);
  if (processArguments !== undefined) {
    capabilities['appium:processArguments'] = processArguments;
  }

  if (device.orientation !== undefined) {
    capabilities['appium:orientation'] = device.orientation.toUpperCase();
  }

  // 设备级逃生舱（DeviceConfig.extraCapabilities）与调用级逃生舱（input.extra）依次合并
  Object.assign(capabilities, device.extraCapabilities ?? {}, input.extra ?? {});

  // 清掉 undefined：W3C 会话协商对显式 null/undefined 的处理各 driver 不一，
  // 干脆不下发缺失项，让 driver 走自己的默认值
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

/** 校验已构建的 iOS capabilities */
export function validate(capabilities: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (capabilities['platformName'] !== 'iOS') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.capabilities.platformName',
      message: `platformName 必须为 'iOS'，实际为 '${String(capabilities['platformName'])}'`,
      severity: 'error',
    });
  }

  const hasApp = typeof capabilities['appium:app'] === 'string';
  const hasBundleId = typeof capabilities['appium:bundleId'] === 'string';
  if (!hasApp && !hasBundleId) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'appium.capabilities',
      message: 'iOS 会话必须提供 appium:app（安装包路径）或 appium:bundleId（已安装 App）之一',
      severity: 'error',
      hint: '请在 App 配置中补全 ios.appId 或 ios.binaryPath',
    });
  }

  const deviceName = capabilities['appium:deviceName'];
  if (typeof deviceName !== 'string' || deviceName.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'appium.capabilities.appium:deviceName',
      message: 'iOS 会话必须提供 appium:deviceName',
      severity: 'error',
    });
  }

  if (capabilities['appium:noReset'] === true && capabilities['appium:fullReset'] === true) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.capabilities.appium:fullReset',
      message: 'noReset 与 fullReset 同时为 true 是自相矛盾的组合，Appium 会直接拒绝会话',
      severity: 'error',
      hint: '需要纯净环境用 fullReset=true + noReset=false；需要复用状态用 noReset=true + fullReset=false',
    });
  }

  const permissions = capabilities['appium:permissions'];
  if (permissions !== undefined && typeof permissions !== 'string') {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'appium.capabilities.appium:permissions',
      message: 'appium:permissions 必须是 JSON 字符串而不是对象，否则 XCUITest driver 会解析失败',
      severity: 'error',
    });
  }

  // 排查「非 appium: 前缀的非标准 capability」——这是 Appium 2.x 拒绝会话的头号原因
  const W3C_STANDARD_KEYS = new Set([
    'platformName',
    'browserName',
    'browserVersion',
    'acceptInsecureCerts',
    'pageLoadStrategy',
    'proxy',
    'setWindowRect',
    'timeouts',
    'strictFileInteractability',
    'unhandledPromptBehavior',
  ]);
  for (const key of Object.keys(capabilities)) {
    if (!key.startsWith('appium:') && !W3C_STANDARD_KEYS.has(key) && !key.includes(':')) {
      issues.push({
        code: ERROR_CODES.CONFIG_INVALID,
        path: `appium.capabilities.${key}`,
        message: `capability "${key}" 既不是 W3C 标准项也没有 appium: 前缀，Appium 2.x 会拒绝该会话`,
        severity: 'error',
        hint: `请改写为 "appium:${key}"`,
      });
    }
  }

  return issues;
}
