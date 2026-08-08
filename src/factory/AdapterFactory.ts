import type {
  DeviceKind,
  FrameworkCapability,
  FrameworkKind,
  HealthCheckResult,
  Platform,
  ValidationIssue,
  ValidationResult,
} from '../contracts/types';
import {
  FrameworkNotRegisteredError,
  InvalidCombinationError,
} from '../contracts/types';
import type { AdapterInit, AdapterModule, IAdapter } from '../contracts/IActions';
import { isPackageAvailable } from '../utils/lazyImport';

/**
 * 适配器工厂 —— 全工程唯一的「框架注册表」。
 *
 * 【为什么能力矩阵是静态数据而不是从适配器模块里读】
 * `--help`、组合校验（AC-3）、dry-run 的 `combination-matrix` 都必须在
 * **不加载任何适配器代码**的前提下回答「xcuitest 支不支持 android」。
 * 若能力声明只存在于 `adapters/<fw>/index.ts`，那么打印一次帮助文本就要把三套适配器全部 require 进来，
 * 既慢又把「惰性加载」这条设计原则废掉了。
 *
 * 代价是同一份能力声明在两处存在（本文件的静态快照 + 适配器自己的 `capability` 导出）。
 * 处理办法不是靠人肉同步，而是：**模块一旦被惰性加载，就用模块导出的 `capability` 覆盖快照**
 * （见 `loadAdapterModule`）。于是快照只在「尚未加载」的窗口期生效，
 * 一旦真正用到该框架，运行时数据必然以适配器自身声明为准，两者不可能长期分叉。
 *
 * 【为什么 probeFramework 绝不抛异常】
 * 它服务于 dry-run 与 doctor 这类「体检」场景：目的是**把所有问题一次性列出来**。
 * 任何一个框架没装依赖就抛异常中断，使用者就只能「修一个跑一次」，
 * 三个框架要来回四五轮 —— 这正是 dry-run 想消灭的循环。
 */

/* ═══════════════ 注册表条目 ═══════════════ */

/** 适配器模块的加载器；返回值至少要满足 `AdapterModule` */
export type AdapterModuleLoader = () => Promise<AdapterModule & {
  readonly capability?: FrameworkCapability;
}>;

export interface FrameworkRegistryEntry {
  readonly framework: FrameworkKind;
  /** 静态能力快照；模块加载后会被模块自身的 capability 覆盖 */
  capability: FrameworkCapability;
  /** 惰性加载适配器模块 */
  readonly loadModule: AdapterModuleLoader;
}

/* ═══════════════ 内置能力矩阵（静态快照） ═══════════════ */

/**
 * ⚠ 本常量必须与 `src/adapters/appium/index.ts` 的 `APPIUM_CAPABILITY` 保持一致。
 * 运行时一致性由 `loadAdapterModule` 的覆盖机制保证。
 */
export const APPIUM_CAPABILITY_SNAPSHOT: FrameworkCapability = {
  framework: 'appium',
  displayName: 'Appium (WebDriver)',
  platforms: ['ios', 'android'],
  deviceKinds: {
    ios: ['simulator', 'real'],
    android: ['emulator', 'real'],
  },
  requiredPackages: ['webdriverio'],
  supportsVideo: true,
  supportsRealDevice: true,
  notes: '覆盖面最广（iOS + Android，模拟器 + 真机），需要本地或远端运行 Appium Server',
};

/** ⚠ 与 `src/adapters/xcuitest/index.ts` 的 `XCUITEST_CAPABILITY` 保持一致 */
export const XCUITEST_CAPABILITY_SNAPSHOT: FrameworkCapability = {
  framework: 'xcuitest',
  displayName: 'XCUITest (Xcode 原生)',
  platforms: ['ios'],
  deviceKinds: {
    ios: ['simulator', 'real'],
  },
  requiredPackages: [],
  supportsVideo: true,
  supportsRealDevice: true,
  notes: '仅 macOS 可用，需 Xcode Command Line Tools 与实现 NDJSON 协议的 XCTest Runner target',
};

/** ⚠ 与 `src/adapters/detox/index.ts` 的 `DETOX_CAPABILITY` 保持一致 */
export const DETOX_CAPABILITY_SNAPSHOT: FrameworkCapability = {
  framework: 'detox',
  displayName: 'Detox (React Native)',
  platforms: ['ios', 'android'],
  deviceKinds: {
    ios: ['simulator'],
    android: ['emulator', 'real'],
  },
  requiredPackages: ['detox'],
  supportsVideo: true,
  supportsRealDevice: false,
  notes: '灰盒同步最稳、速度最快，但只适用于 React Native App；不支持 xpath / 子串匹配 / 坐标点击',
};

/* ═══════════════ 注册表 ═══════════════ */

const FRAMEWORK_REGISTRY = new Map<FrameworkKind, FrameworkRegistryEntry>([
  [
    'appium',
    {
      framework: 'appium',
      capability: APPIUM_CAPABILITY_SNAPSHOT,
      loadModule: async () => await import('../adapters/appium'),
    },
  ],
  [
    'xcuitest',
    {
      framework: 'xcuitest',
      capability: XCUITEST_CAPABILITY_SNAPSHOT,
      loadModule: async () => await import('../adapters/xcuitest'),
    },
  ],
  [
    'detox',
    {
      framework: 'detox',
      capability: DETOX_CAPABILITY_SNAPSHOT,
      loadModule: async () => await import('../adapters/detox'),
    },
  ],
]);

/** 已加载模块缓存：同一框架只 import 一次 */
const MODULE_CACHE = new Map<FrameworkKind, AdapterModule>();

/* ═══════════════ 注册 / 查询 ═══════════════ */

/**
 * 注册（或覆盖）一个框架。这是新增第 4 个框架的**唯一**接入点（AC-6）。
 *
 * @example
 * registerFramework({
 *   framework: 'maestro',
 *   capability: { ... },
 *   loadModule: () => import('../adapters/maestro'),
 * });
 */
export function registerFramework(entry: FrameworkRegistryEntry): void {
  FRAMEWORK_REGISTRY.set(entry.framework, { ...entry });
  MODULE_CACHE.delete(entry.framework);
}

/** 注销框架（供单测隔离与插件卸载） */
export function unregisterFramework(framework: FrameworkKind): boolean {
  MODULE_CACHE.delete(framework);
  return FRAMEWORK_REGISTRY.delete(framework);
}

/** 是否已注册 */
export function isFrameworkRegistered(framework: FrameworkKind): boolean {
  return FRAMEWORK_REGISTRY.has(framework);
}

/** 已注册框架清单（稳定排序，供 CLI 白名单校验与帮助文本） */
export function listFrameworks(): FrameworkKind[] {
  return [...FRAMEWORK_REGISTRY.keys()].sort((left, right) => String(left).localeCompare(String(right)));
}

/** 读取能力声明；未注册返回 undefined（查询语义，不抛异常） */
export function getCapability(framework: FrameworkKind): FrameworkCapability | undefined {
  return FRAMEWORK_REGISTRY.get(framework)?.capability;
}

/** 读取能力声明；未注册抛错（命令语义） */
export function requireCapability(framework: FrameworkKind): FrameworkCapability {
  const capability = getCapability(framework);
  if (capability === undefined) {
    throw new FrameworkNotRegisteredError(framework, listFrameworks());
  }
  return capability;
}

/** 全部能力声明（按框架名排序） */
export function listCapabilities(): FrameworkCapability[] {
  return listFrameworks().map((framework) => requireCapability(framework));
}

/* ═══════════════ 模块加载 ═══════════════ */

/**
 * 惰性加载适配器模块，并用模块自身的 capability 刷新注册表快照。
 * @throws FrameworkNotRegisteredError 未注册
 */
export async function loadAdapterModule(framework: FrameworkKind): Promise<AdapterModule> {
  const cached = MODULE_CACHE.get(framework);
  if (cached !== undefined) {
    return cached;
  }
  const entry = FRAMEWORK_REGISTRY.get(framework);
  if (entry === undefined) {
    throw new FrameworkNotRegisteredError(framework, listFrameworks());
  }

  const module = await entry.loadModule();
  if (typeof module.createAdapter !== 'function') {
    throw new FrameworkNotRegisteredError(framework, listFrameworks());
  }
  if (module.capability !== undefined) {
    // 以适配器自身声明为准，消除静态快照与真实实现分叉的可能
    entry.capability = module.capability;
  }
  MODULE_CACHE.set(framework, module);
  return module;
}

/** 清空模块缓存（单测与热重载用） */
export function clearAdapterModuleCache(): void {
  MODULE_CACHE.clear();
}

/* ═══════════════ 组合校验 ═══════════════ */

export interface CombinationInput {
  readonly framework: FrameworkKind;
  readonly platform: Platform;
  readonly deviceKind: DeviceKind;
  /** 可选：App 支持的平台清单，来自 AppConfig.supportedPlatforms */
  readonly appSupportedPlatforms?: readonly Platform[];
  readonly appKey?: string;
}

/**
 * 校验 framework × platform × device × app 组合是否合法。
 * 聚合返回全部问题，**不抛异常**（AC-3 的判定依据）。
 */
export function checkCombination(input: CombinationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const capability = getCapability(input.framework);

  if (capability === undefined) {
    issues.push({
      code: 'OMNI_E_FRAMEWORK_NOT_REGISTERED',
      path: 'options.framework',
      message: `未注册的框架 "${String(input.framework)}"`,
      severity: 'error',
      hint: `可用框架：${listFrameworks().map(String).join(' / ') || '（空）'}`,
    });
    return { ok: false, issues };
  }

  if (!capability.platforms.includes(input.platform)) {
    issues.push({
      code: 'OMNI_E_INVALID_COMBINATION',
      path: 'options.platform',
      message: `${capability.displayName} 不支持平台 ${input.platform}`,
      severity: 'error',
      hint: `该框架支持：${capability.platforms.join(' / ')}`,
    });
  } else {
    const allowedKinds = capability.deviceKinds[input.platform] ?? [];
    if (!allowedKinds.includes(input.deviceKind)) {
      issues.push({
        code: 'OMNI_E_INVALID_COMBINATION',
        path: 'options.device',
        message:
          `${capability.displayName} 在 ${input.platform} 上不支持设备形态 ${input.deviceKind}`,
        severity: 'error',
        hint: `该组合支持：${allowedKinds.join(' / ') || '（无）'}`,
      });
    }
  }

  if (input.deviceKind === 'real' && !capability.supportsRealDevice) {
    issues.push({
      code: 'OMNI_E_INVALID_COMBINATION',
      path: 'options.device',
      message: `${capability.displayName} 不支持真机`,
      severity: 'error',
      hint: '请改用 simulator / emulator，或换用 Appium',
    });
  }

  if (
    input.appSupportedPlatforms !== undefined
    && !input.appSupportedPlatforms.includes(input.platform)
  ) {
    issues.push({
      code: 'OMNI_E_INVALID_COMBINATION',
      path: 'options.app',
      message: `App "${input.appKey ?? '-'}" 不支持平台 ${input.platform}`,
      severity: 'error',
      hint: `该 App 支持：${input.appSupportedPlatforms.join(' / ') || '（空）'}`,
    });
  }

  return { ok: issues.every((issue) => issue.severity !== 'error'), issues };
}

/**
 * 组合校验的命令式版本。
 * @throws InvalidCombinationError 组合非法（exit 2）
 */
export function assertCombination(input: CombinationInput): void {
  const result = checkCombination(input);
  if (!result.ok) {
    throw new InvalidCombinationError(
      {
        framework: input.framework,
        platform: input.platform,
        device: input.deviceKind,
        app: input.appKey,
      },
      result.issues,
    );
  }
}

/* ═══════════════ 创建适配器 ═══════════════ */

/**
 * 创建适配器实例（**不 init**，会话建立由调用方决定时机）。
 *
 * @throws FrameworkNotRegisteredError 框架未注册
 * @throws InvalidCombinationError     组合非法
 */
export async function createAdapter(init: AdapterInit): Promise<IAdapter> {
  const runConfig = init.runConfig;
  assertCombination({
    framework: runConfig.framework,
    platform: runConfig.platform,
    deviceKind: runConfig.deviceKind,
    appSupportedPlatforms: runConfig.app.supportedPlatforms,
    appKey: String(runConfig.app.key),
  });

  const module = await loadAdapterModule(runConfig.framework);
  const adapter = module.createAdapter(init);
  init.logger.debug('适配器已创建', {
    framework: String(runConfig.framework),
    platform: runConfig.platform,
    device: runConfig.deviceKind,
  });
  return adapter;
}

/** 创建并初始化；init 失败时保证 dispose，不泄漏会话与子进程 */
export async function createAndInitAdapter(init: AdapterInit): Promise<IAdapter> {
  const adapter = await createAdapter(init);
  try {
    await adapter.init();
  } catch (error) {
    await adapter.dispose().catch(() => undefined);
    throw error;
  }
  return adapter;
}

/* ═══════════════ 探测 ═══════════════ */

/**
 * 探测某个框架当前是否可用。**任何情况下都不抛异常**。
 *
 * 检查项（按代价从低到高）：
 * 1. `registered`        —— 是否在注册表里
 * 2. `host-platform`     —— 宿主机是否满足（xcuitest 需要 macOS）
 * 3. `package:<name>`    —— 每个 requiredPackage 是否可 resolve（只探测存在性，不加载）
 * 4. `adapter-module`    —— 适配器模块能否被 import 且导出合法的 createAdapter
 */
export async function probeFramework(framework: FrameworkKind): Promise<HealthCheckResult> {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];

  const capability = getCapability(framework);
  const registered = capability !== undefined;
  checks.push({
    name: 'registered',
    ok: registered,
    detail: registered
      ? capability.displayName
      : `未注册；可用：${listFrameworks().map(String).join(' / ') || '（空）'}`,
  });

  if (!registered) {
    return { ok: false, framework, checks };
  }

  if (framework === 'xcuitest') {
    const isDarwin = process.platform === 'darwin';
    checks.push({
      name: 'host-platform',
      ok: isDarwin,
      detail: isDarwin ? 'darwin' : `XCUITest 仅支持 macOS，当前 ${process.platform}`,
    });
  }

  for (const packageName of capability.requiredPackages) {
    const available = isPackageAvailable(packageName);
    checks.push({
      name: `package:${packageName}`,
      ok: available,
      detail: available
        ? '已安装'
        : `未安装，真机联调前请执行：npm install --no-save ${packageName}`,
    });
  }

  try {
    const module = await loadAdapterModule(framework);
    const ok = typeof module.createAdapter === 'function';
    checks.push({
      name: 'adapter-module',
      ok,
      detail: ok ? '模块导出 createAdapter' : '模块未导出合法的 createAdapter',
    });
  } catch (error) {
    checks.push({
      name: 'adapter-module',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return { ok: checks.every((check) => check.ok), framework, checks };
}

/** 探测全部已注册框架，串行执行以避免同时 import 造成的日志交错 */
export async function probeAllFrameworks(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  for (const framework of listFrameworks()) {
    results.push(await probeFramework(framework));
  }
  return results;
}
