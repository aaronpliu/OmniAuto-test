import type {
  AppConfig,
  DeviceConfig,
  ValidationIssue,
} from '../../contracts/types';
import { ERROR_CODES, InvalidCombinationError } from '../../contracts/types';

/**
 * Detox Android 侧配置片段（`.detoxrc` 的 `devices.*` 与 `apps.*` 两个条目）。
 *
 * 【testBinaryPath 是 Android 独有的、也是最常被漏掉的一项】
 * Detox 在 Android 上通过 **Android Instrumentation** 驱动 App，需要两个 apk：
 *   1. 被测 apk（`app-debug.apk`）；
 *   2. instrumentation 测试 apk（`app-debug-androidTest.apk`）。
 * 后者由 `assembleAndroidTest` 任务产出，若 `build` 命令里漏了这个任务，
 * 或 `testBinaryPath` 没配，Detox 会在 `device.launchApp()` 处报
 * `Failed to run application on the device`，而真实原因是 test apk 根本不存在。
 * 所以本文件把两个 assemble 任务与 testBinaryPath 绑定生成，杜绝半配。
 *
 * 【android.emulator vs android.attached】
 * - `android.emulator`：Detox **自己负责启动** AVD，用 `device.avdName` 定位；
 * - `android.attached`：连接已经在 `adb devices` 里的设备（真机或手工起的模拟器），用 `device.adbName`。
 * 用错类型的典型症状是：真机明明插着，Detox 却去启动一个不存在的 AVD 然后超时。
 */

/** Detox Android 模拟器设备条目 */
export interface DetoxAndroidEmulatorDeviceEntry {
  readonly type: 'android.emulator';
  readonly device: {
    readonly avdName: string;
  };
  /** 传给 `emulator` 可执行文件的额外参数，如 `-no-snapshot -no-audio` */
  readonly bootArgs?: string;
  /** 是否强制无窗口启动 */
  readonly headless?: boolean;
  /** 复用已启动的同名 AVD，而不是先关再开（本地开发提速关键项） */
  readonly gpuMode?: 'auto' | 'host' | 'swiftshader_indirect' | 'angle_indirect' | 'guest';
}

/** Detox Android 真机（已连接设备）条目 */
export interface DetoxAndroidAttachedDeviceEntry {
  readonly type: 'android.attached';
  readonly device: {
    /** adb serial，支持正则字符串（Detox 会按正则匹配 `adb devices` 输出） */
    readonly adbName: string;
  };
}

/** Android 设备条目联合 */
export type DetoxAndroidDeviceEntry =
  | DetoxAndroidEmulatorDeviceEntry
  | DetoxAndroidAttachedDeviceEntry;

/** Detox Android App 条目 */
export interface DetoxAndroidAppEntry {
  readonly type: 'android.apk';
  readonly binaryPath: string;
  readonly build?: string;
  /** instrumentation 测试 apk 路径（Android 必填，理由见文件头） */
  readonly testBinaryPath: string;
  readonly launchArgs?: Readonly<Record<string, string | number | boolean>>;
  /** 反向端口转发，形如 `{ 8080: 8080 }`，供 App 访问宿主机 mock server */
  readonly reversePorts?: readonly number[];
}

/** Android App 条目构建输入 */
export interface DetoxAndroidAppInput {
  readonly app: AppConfig;
  readonly binaryPath?: string;
  readonly testBinaryPath?: string;
  /** 构建类型，默认 debug —— Detox 需要 debug 变体才能链接同步库 */
  readonly buildType?: 'debug' | 'release';
  /** gradle 模块名，默认 `app` */
  readonly gradleModule?: string;
  /** Android 源码目录（相对工程根），默认 `android` */
  readonly androidSourceDir?: string;
  /** 覆盖构建命令；传空串表示「不构建，直接用现成产物」 */
  readonly buildCommand?: string;
  readonly reversePorts?: readonly number[];
}

/** Android 侧默认值 */
export const DETOX_ANDROID_DEFAULTS = {
  buildType: 'debug',
  gradleModule: 'app',
  androidSourceDir: 'android',
  /**
   * `-no-snapshot`：禁用快照启动。快照会把「上次运行残留的 App 状态」一并恢复，
   * 让 E2E 的初始状态不可预期 —— 这是 Android 用例「本地过、CI 挂」的常见根因。
   * `-no-boot-anim`：跳过开机动画，省 5~10s。
   * `-no-audio`：CI 容器通常没有音频设备，不关会打一堆 ALSA 报错。
   */
  bootArgs: '-no-snapshot -no-boot-anim -no-audio',
} as const;

/** 首字母大写（gradle 任务名拼接用：debug → Debug、buyer → Buyer） */
function capitalize(value: string): string {
  return value === '' ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/**
 * 产物路径推导的公共入参。
 *
 * 【为什么改成选项对象而不是继续用位置参数】
 * 加入 flavor 维度后位置参数会变成四个同类型的 string，
 * `buildAndroidBinaryPath('debug', 'app', 'android', 'buyer')` 这种调用极易错位，
 * 且错位后产出的是一个**语法合法但指向不存在文件**的路径，要等到装包才报错。
 */
export interface AndroidArtifactPathInput {
  readonly buildType?: string;
  readonly gradleModule?: string;
  readonly androidSourceDir?: string;
  /**
   * product flavor 名，本工程恒等于 app key（mock / buyer / seller / wallet）。
   * 传空串或省略表示「该工程未使用 flavor」，回退到无 flavor 的经典路径。
   */
  readonly flavor?: string;
}

/**
 * 拼出被测 apk 产物路径。
 *
 * 【为什么必须带 flavor 维度】
 * 不带 flavor 时四个 App 会推导出**完全相同**的 `app-debug.apk`，
 * 于是「切换 App」在 Android 上变成静默 no-op —— 不报错、装的还是上一个包，
 * 是最难排查的一类问题。iOS 侧因为路径里带 scheme（OmniMock / OmniBuyer …）天然可区分，
 * 这里引入 flavor 正是为了与 iOS 保持对称。
 *
 * 有 flavor：`android/app/build/outputs/apk/buyer/debug/app-buyer-debug.apk`
 * 无 flavor：`android/app/build/outputs/apk/debug/app-debug.apk`（AGP 经典布局）
 */
export function buildAndroidBinaryPath(input: AndroidArtifactPathInput = {}): string {
  const buildType = input.buildType ?? DETOX_ANDROID_DEFAULTS.buildType;
  const gradleModule = input.gradleModule ?? DETOX_ANDROID_DEFAULTS.gradleModule;
  const sourceDir = input.androidSourceDir ?? DETOX_ANDROID_DEFAULTS.androidSourceDir;
  const flavor = (input.flavor ?? '').trim();

  const base = `${sourceDir}/${gradleModule}/build/outputs/apk`;
  if (flavor === '') {
    return `${base}/${buildType}/${gradleModule}-${buildType}.apk`;
  }
  return `${base}/${flavor}/${buildType}/${gradleModule}-${flavor}-${buildType}.apk`;
}

/**
 * 拼出 instrumentation 测试 apk 产物路径。
 *
 * 注意 androidTest 的目录层级与被测 apk **不同**：flavor 段在 `androidTest/` 之后，
 * 即 `apk/androidTest/<flavor>/<buildType>/`，而不是 `apk/<flavor>/androidTest/<buildType>/`。
 * 这是 AGP 的既定布局，写反了会得到一个不存在的路径。
 */
export function buildAndroidTestBinaryPath(input: AndroidArtifactPathInput = {}): string {
  const buildType = input.buildType ?? DETOX_ANDROID_DEFAULTS.buildType;
  const gradleModule = input.gradleModule ?? DETOX_ANDROID_DEFAULTS.gradleModule;
  const sourceDir = input.androidSourceDir ?? DETOX_ANDROID_DEFAULTS.androidSourceDir;
  const flavor = (input.flavor ?? '').trim();

  const base = `${sourceDir}/${gradleModule}/build/outputs/apk/androidTest`;
  if (flavor === '') {
    return `${base}/${buildType}/${gradleModule}-${buildType}-androidTest.apk`;
  }
  return `${base}/${flavor}/${buildType}/${gradleModule}-${flavor}-${buildType}-androidTest.apk`;
}

/**
 * 拼出 gradle 构建命令。
 *
 * `-DtestBuildType=<type>` 不可省：它告诉 Android Gradle Plugin 用哪个变体构建 androidTest，
 * 缺失时 AGP 会用 `debug` 兜底，于是 release 场景下会产出一个与被测 apk 变体不匹配的 test apk，
 * 安装时报签名/变体不一致，错误信息与真实原因毫不相关。
 *
 * 带 flavor 时任务名是 `assemble<Flavor><BuildType>`，例如 buyer + debug →
 * `assembleBuyerDebug assembleBuyerDebugAndroidTest`。
 *
 * ⚠️ 前置条件：该 gradle 任务**只有在 `android/app/build.gradle` 里声明了对应
 * `productFlavors` 时才存在**，否则会报 "Task 'assembleBuyerDebug' not found"。
 * 详见 buildDetoxAndroidApp 的文档注释。
 */
export function buildAndroidBuildCommand(input: {
  readonly buildType?: string;
  readonly androidSourceDir?: string;
  readonly flavor?: string;
} = {}): string {
  const buildType = input.buildType ?? DETOX_ANDROID_DEFAULTS.buildType;
  const sourceDir = input.androidSourceDir ?? DETOX_ANDROID_DEFAULTS.androidSourceDir;
  const flavor = (input.flavor ?? '').trim();
  // 变体段：flavor 在前、buildType 在后，与 AGP 的 <flavor><BuildType> 任务命名一致
  const variant = `${capitalize(flavor)}${capitalize(buildType)}`;
  return `cd ${sourceDir} && ./gradlew assemble${variant} assemble${variant}AndroidTest `
    + `-DtestBuildType=${buildType}`;
}

/**
 * 构建 Detox Android 设备条目。
 *
 * 依据 `device.kind` 自动在 `android.emulator` 与 `android.attached` 之间路由。
 *
 * @throws {InvalidCombinationError} 设备不是 Android，或 kind 为 simulator
 */
export function buildDetoxAndroidDevice(device: DeviceConfig): DetoxAndroidDeviceEntry {
  if (device.platform !== 'android') {
    throw new InvalidCombinationError(
      { framework: 'detox', platform: device.platform, device: device.kind },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'device.platform',
          message: `buildDetoxAndroidDevice 只能用于 Android 设备，实际收到 platform='${device.platform}'`,
          severity: 'error',
          hint: 'iOS 请改用 buildDetoxIosDevice()',
        },
      ],
    );
  }

  if (device.kind === 'emulator') {
    return {
      type: 'android.emulator',
      device: {
        // avdName 缺失时给一个显式的空串而不是 undefined：
        // Detox 对 undefined 的报错是 "Cannot read property 'match' of undefined"，
        // 而空串会报 "avdName is required"，后者能直接指向问题
        avdName: device.avdName ?? '',
      },
      bootArgs: DETOX_ANDROID_DEFAULTS.bootArgs,
      headless: device.headless ?? false,
      gpuMode: 'auto',
    };
  }

  if (device.kind === 'real') {
    return {
      type: 'android.attached',
      device: {
        adbName: device.udid ?? '',
      },
    };
  }

  throw new InvalidCombinationError(
    { framework: 'detox', platform: device.platform, device: device.kind },
    [
      {
        code: ERROR_CODES.INVALID_COMBINATION,
        path: 'device.kind',
        message: `Android 不存在 '${device.kind}' 形态；虚拟设备请用 emulator，物理设备请用 real`,
        severity: 'error',
      },
    ],
  );
}

/**
 * 构建 Detox Android App 条目。
 *
 * 【产物路径的三级优先级 —— 顺序不可调换】
 * ① `input.binaryPath`（调用方显式传入，如 CLI `--binary-path`）
 * ② `input.app.android.binaryPath`（`src/configs/apps/<key>.config.ts` 里的显式配置）
 * ③ flavor 约定推导（本函数兜底）
 *
 * ②必须优先于③：apps 配置里的 `android.binaryPath` 目前是 undefined 并走 warning，
 * 那是**刻意设计**——留给团队接入真机包时填写。一旦填了显式值，
 * 就意味着「我的产物不在约定位置」，此时若被 flavor 约定覆盖，
 * 团队会对着一个自己从没配过的路径排查，且完全看不出是被谁改的。
 *
 * 【flavor 恒等于 app key】
 * 与 iOS 侧用 scheme（OmniMock / OmniBuyer …）区分 App 保持对称。
 * 不引入 flavor 维度的话四个 App 会推导出同一个 `app-debug.apk`，
 * 切换 App 在 Android 上变成静默 no-op。
 *
 * ⚠️ 【前置条件：必须先声明 productFlavors】
 * flavor 约定要求团队在 `android/app/build.gradle` 中声明：
 * ```groovy
 * android {
 *   flavorDimensions "app"
 *   productFlavors { mock {}; buyer {}; seller {}; wallet {} }
 * }
 * ```
 * 否则 `assembleBuyerDebug` 这个 gradle 任务根本不存在，
 * 构建阶段会报 `Task 'assembleBuyerDebug' not found in project ':app'`。
 * 这个报错看起来像「我们的配置错了」，实际是 App 工程侧缺少 flavor 声明。
 */
export function buildDetoxAndroidApp(input: DetoxAndroidAppInput): DetoxAndroidAppEntry {
  const buildType = input.buildType ?? DETOX_ANDROID_DEFAULTS.buildType;
  const gradleModule = input.gradleModule ?? DETOX_ANDROID_DEFAULTS.gradleModule;
  const sourceDir = input.androidSourceDir ?? DETOX_ANDROID_DEFAULTS.androidSourceDir;
  // flavor 恒取 app key，保证四个 App 的产物路径两两不同
  const flavor = input.app.key;
  const pathInput: AndroidArtifactPathInput = {
    buildType,
    gradleModule,
    androidSourceDir: sourceDir,
    flavor,
  };

  const binaryPath = input.binaryPath
    ?? input.app.android?.binaryPath
    ?? buildAndroidBinaryPath(pathInput);

  const testBinaryPath = input.testBinaryPath
    ?? buildAndroidTestBinaryPath(pathInput);

  const build = input.buildCommand !== undefined
    ? input.buildCommand
    : buildAndroidBuildCommand({ buildType, androidSourceDir: sourceDir, flavor });

  return {
    type: 'android.apk',
    binaryPath,
    build: build === '' ? undefined : build,
    testBinaryPath,
    launchArgs: input.app.launchArgs,
    reversePorts: input.reversePorts,
  };
}

/** 校验 Android 设备条目 */
export function validateDevice(entry: DetoxAndroidDeviceEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (entry.type === 'android.emulator') {
    if (entry.device.avdName.trim() === '') {
      issues.push({
        code: ERROR_CODES.CONFIG_MISSING_FIELD,
        path: 'detox.devices.device.avdName',
        message: 'android.emulator 必须指定 avdName，Detox 需要用它启动模拟器',
        severity: 'error',
        hint: '执行 `emulator -list-avds` 查看可用 AVD',
      });
    }
    return issues;
  }

  if (entry.device.adbName.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.devices.device.adbName',
      message: 'android.attached 必须指定 adbName（adb serial）',
      severity: 'error',
      hint: '执行 `adb devices` 取第一列，然后设置 OMNI_DEVICE_UDID 或传 --deviceId',
    });
  }

  return issues;
}

/** 校验 Android App 条目 */
export function validateApp(entry: DetoxAndroidAppEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (entry.binaryPath.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.apps.binaryPath',
      message: 'Detox Android App 必须指定 binaryPath（.apk 路径）',
      severity: 'error',
    });
  } else if (!entry.binaryPath.endsWith('.apk')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.apps.binaryPath',
      message: `binaryPath "${entry.binaryPath}" 不以 .apk 结尾`,
      severity: 'error',
      hint: 'Detox 不支持 .aab（App Bundle），需先用 bundletool 转成 apk',
    });
  }

  if (entry.testBinaryPath.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'detox.apps.testBinaryPath',
      message: 'Android 必须提供 testBinaryPath（instrumentation 测试 apk），否则 Detox 无法驱动 App',
      severity: 'error',
      hint: '由 `./gradlew assembleAndroidTest` 产出',
    });
  } else if (!entry.testBinaryPath.includes('androidTest')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.apps.testBinaryPath',
      message: `testBinaryPath "${entry.testBinaryPath}" 路径中不含 androidTest，可能误填成了被测 apk`,
      severity: 'warning',
    });
  }

  if (entry.build !== undefined && !entry.build.includes('assembleAndroidTest')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.apps.build',
      message: '构建命令未包含 assembleAndroidTest，test apk 不会被产出，launchApp 必定失败',
      severity: 'error',
      hint: '正确形如：cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    });
  }

  if (entry.build !== undefined
    && entry.build.includes('assembleAndroidTest')
    && !entry.build.includes('-DtestBuildType=')) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'detox.apps.build',
      message: '构建命令缺少 -DtestBuildType=<type>，AGP 会用 debug 兜底，release 场景下变体将不匹配',
      severity: 'warning',
    });
  }

  return issues;
}
