import type {
  FrameworkKind,
  HealthCheckResult,
  ILogger,
  ResolvedRunConfig,
} from '../contracts/types';
import { FrameworkNotRegisteredError, InvalidCombinationError } from '../contracts/types';
import type { IFrameworkDriver } from '../contracts/IActions';

/**
 * 低层驱动工厂。
 *
 * 【为什么这里必须惰性加载，而 LocatorResolverFactory 可以静态 import】
 * Driver 是**唯一接触第三方 SDK / 子进程**的一层：
 * - AppiumDriver → `lazyImport('webdriverio')`
 * - DetoxDriver  → `lazyImport('detox')` 或读取 runner 注入的全局
 * - XCUITestDriver → spawn `xcrun xcodebuild`
 *
 * 虽然三个 Driver 模块自身没有第三方顶层 import（tsc 与 require 都不会炸），
 * 但静态 import 会把三份 Driver 代码无条件拉进任何引用工厂的进程 ——
 * 包括只想跑 `--dry-run` 或 `--help` 的场景。用动态 import 收敛为「按需加载」，
 * 同时也给外部框架留出「注册一个 loader 即可接入」的扩展点（AC-6）。
 *
 * 【为什么 loader 返回的是构造好的实例而不是 class】
 * 各框架 Driver 的构造签名未来可能分化（例如第 4 个框架需要额外的连接池）。
 * 让 loader 自己完成构造，工厂只依赖 `IFrameworkDriver` 这一个契约，
 * 扩展方不必迁就统一构造签名。
 */

/** 驱动加载器：按需 import 并构造出驱动实例 */
export type DriverLoader = (
  runConfig: ResolvedRunConfig,
  logger: ILogger,
) => Promise<IFrameworkDriver>;

/** 内置驱动加载器注册表 */
const DRIVER_REGISTRY = new Map<FrameworkKind, DriverLoader>([
  [
    'appium',
    async (runConfig, logger) => {
      const module = await import('../adapters/appium/AppiumDriver');
      return new module.AppiumDriver(runConfig, logger);
    },
  ],
  [
    'detox',
    async (runConfig, logger) => {
      const module = await import('../adapters/detox/DetoxDriver');
      return new module.DetoxDriver(runConfig, logger);
    },
  ],
  [
    'xcuitest',
    async (runConfig, logger) => {
      const module = await import('../adapters/xcuitest/XCUITestDriver');
      return new module.XCUITestDriver(runConfig, logger);
    },
  ],
]);

/** 注册（或覆盖）一个框架的驱动加载器 */
export function registerDriverLoader(framework: FrameworkKind, loader: DriverLoader): void {
  DRIVER_REGISTRY.set(framework, loader);
}

/** 移除注册（供单测隔离用） */
export function unregisterDriverLoader(framework: FrameworkKind): boolean {
  return DRIVER_REGISTRY.delete(framework);
}

/** 是否已注册 */
export function hasDriverLoader(framework: FrameworkKind): boolean {
  return DRIVER_REGISTRY.has(framework);
}

/** 已注册的驱动清单（稳定排序） */
export function listDriverLoaders(): FrameworkKind[] {
  return [...DRIVER_REGISTRY.keys()].sort((left, right) => String(left).localeCompare(String(right)));
}

/**
 * 创建驱动实例（**不建立连接**，connect() 由调用方决定时机）。
 *
 * 分两步的理由：Adapter 需要在 connect 之前把驱动交给 actions/device 持有，
 * 而 dry-run 只想拿到实例调用 `healthCheck()` —— 后者不应该真的去拉起设备。
 *
 * @throws FrameworkNotRegisteredError 框架未注册
 * @throws InvalidCombinationError     framework × platform 组合非法
 */
export async function createDriver(
  runConfig: ResolvedRunConfig,
  logger: ILogger,
): Promise<IFrameworkDriver> {
  const framework = runConfig.framework;
  const loader = DRIVER_REGISTRY.get(framework);
  if (loader === undefined) {
    throw new FrameworkNotRegisteredError(framework, listDriverLoaders());
  }
  if (framework === 'xcuitest' && runConfig.platform !== 'ios') {
    throw new InvalidCombinationError(runConfig.options, [
      {
        code: 'OMNI_E_INVALID_COMBINATION',
        path: 'options.platform',
        message: 'XCUITest 是 Xcode 原生测试框架，只支持 iOS',
        severity: 'error',
        hint: '请改用 --framework=appium 或 --framework=detox 跑 Android',
      },
    ]);
  }
  const driver = await loader(runConfig, logger);
  logger.debug('驱动已创建', { framework: String(framework), platform: runConfig.platform });
  return driver;
}

/**
 * 创建驱动并立即连接。失败时保证驱动被清理，不留下悬挂的会话或子进程。
 */
export async function connectDriver(
  runConfig: ResolvedRunConfig,
  logger: ILogger,
): Promise<IFrameworkDriver> {
  const driver = await createDriver(runConfig, logger);
  try {
    await driver.connect();
  } catch (error) {
    // connect 半途失败可能已经起了 appium session 或 xcodebuild 子进程，
    // 不 disconnect 会把它们泄漏到 CI 机器上，后续用例全部被占用设备卡死
    await driver.disconnect().catch(() => undefined);
    throw error;
  }
  return driver;
}

/**
 * 对驱动做一次体检；**不抛异常**，任何失败都折叠成 ok:false 的结果。
 * 供 dry-run 与 `omni doctor` 类命令使用。
 */
export async function probeDriver(
  runConfig: ResolvedRunConfig,
  logger: ILogger,
): Promise<HealthCheckResult> {
  const framework = runConfig.framework;
  try {
    const driver = await createDriver(runConfig, logger);
    return await driver.healthCheck();
  } catch (error) {
    return {
      ok: false,
      framework,
      checks: [
        {
          name: 'driver-create',
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
