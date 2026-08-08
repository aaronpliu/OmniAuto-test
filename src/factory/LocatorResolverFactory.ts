import type {
  AppConfig,
  FrameworkKind,
  Platform,
  ResolvedRunConfig,
} from '../contracts/types';
import { FrameworkNotRegisteredError, UnsupportedLocatorError } from '../contracts/types';
import type { ILocatorResolver, LocatorLike, NativeSelector } from '../contracts/IElementLocator';
import { AppiumLocatorResolver } from '../adapters/appium/AppiumLocatorResolver';
import { DetoxLocatorResolver } from '../adapters/detox/DetoxLocatorResolver';
import { XCUITestLocatorResolver } from '../adapters/xcuitest/XCUITestLocatorResolver';

/**
 * 定位器解析器工厂。
 *
 * 【为什么只有这一层可以静态 import 适配器代码】
 * 三个 Resolver 都是**纯函数模块**：不 import 任何第三方 SDK、不碰设备、不起子进程。
 * 因此静态 import 它们既不会触发 `ERR_REQUIRE_ESM`，也不会在没装 webdriverio/detox 的机器上炸掉。
 *
 * 这条性质是 dry-run 的地基：`locator-purity` 检查需要在**完全没有设备、没有第三方依赖**的
 * CI 机器上，把资产层声明的每一个 Locator 都翻译一遍，验证「一份脚本三框架都能表达」。
 * 若 Resolver 也走惰性加载，dry-run 就必须先装齐所有框架依赖 —— 那这个检查就失去意义了。
 *
 * 对比：`DriverFactory` / `AdapterFactory` 里的 Driver 与 Adapter 必须惰性加载，
 * 因为它们最终会 `lazyImport('webdriverio' | 'detox')` 或 spawn xcodebuild。
 */

/** 构造 Resolver 所需的上下文（三框架统一签名） */
export interface LocatorResolverContext {
  readonly platform: Platform;
  /** 来自 `ResolvedRunConfig.app.testIdAttribute` */
  readonly testIdAttribute?: AppConfig['testIdAttribute'];
}

/** Resolver 构造函数签名；第 4 框架通过它接入 */
export type LocatorResolverFactoryFn = (context: LocatorResolverContext) => ILocatorResolver;

/**
 * 内置 Resolver 注册表。
 * key 用 `FrameworkKind`（开放联合），运行时白名单以本表的 keys 为准。
 */
const RESOLVER_REGISTRY = new Map<FrameworkKind, LocatorResolverFactoryFn>([
  [
    'appium',
    (context) => new AppiumLocatorResolver({
      platform: context.platform,
      testIdAttribute: context.testIdAttribute,
    }),
  ],
  [
    'detox',
    (context) => new DetoxLocatorResolver({
      platform: context.platform,
      testIdAttribute: context.testIdAttribute,
    }),
  ],
  [
    'xcuitest',
    // XCUITest 恒为 iOS，构造签名里没有 platform；这里做一次形参适配，
    // 让三个框架对外呈现同一个 LocatorResolverFactoryFn
    (context) => new XCUITestLocatorResolver({
      testIdAttribute: context.testIdAttribute?.ios,
    }),
  ],
]);

/** 注册（或覆盖）一个框架的 Resolver 构造函数 */
export function registerLocatorResolver(
  framework: FrameworkKind,
  factory: LocatorResolverFactoryFn,
): void {
  RESOLVER_REGISTRY.set(framework, factory);
}

/** 移除注册（主要供单测隔离用） */
export function unregisterLocatorResolver(framework: FrameworkKind): boolean {
  return RESOLVER_REGISTRY.delete(framework);
}

/** 是否已注册 */
export function hasLocatorResolver(framework: FrameworkKind): boolean {
  return RESOLVER_REGISTRY.has(framework);
}

/** 已注册的框架清单（稳定排序，便于生成帮助文本与快照测试） */
export function listLocatorResolvers(): FrameworkKind[] {
  return [...RESOLVER_REGISTRY.keys()].sort((left, right) => String(left).localeCompare(String(right)));
}

/**
 * 创建指定框架的 Resolver。
 * @throws FrameworkNotRegisteredError 框架未注册
 */
export function createLocatorResolver(
  framework: FrameworkKind,
  context: LocatorResolverContext,
): ILocatorResolver {
  const factory = RESOLVER_REGISTRY.get(framework);
  if (factory === undefined) {
    throw new FrameworkNotRegisteredError(framework, listLocatorResolvers());
  }
  if (framework === 'xcuitest' && context.platform !== 'ios') {
    throw new FrameworkNotRegisteredError(framework, listLocatorResolvers());
  }
  return factory(context);
}

/** 从解析后的运行配置直接创建（运行期最常用的入口） */
export function createLocatorResolverFromRunConfig(
  runConfig: ResolvedRunConfig,
): ILocatorResolver {
  return createLocatorResolver(runConfig.framework, {
    platform: runConfig.platform,
    testIdAttribute: runConfig.app.testIdAttribute,
  });
}

/** 单个框架的翻译结果 */
export interface LocatorTranslation {
  readonly framework: FrameworkKind;
  readonly ok: boolean;
  readonly selector?: NativeSelector;
  readonly reason?: string;
}

/**
 * 把同一个 Locator 在全部已注册框架上翻译一遍。
 *
 * 这是 dry-run `locator-purity` 检查的核心原语：不连设备、不装依赖即可回答
 * 「这个 Locator 换到别的框架还能不能用」。返回值里失败项**不抛异常**，
 * 由调用方聚合成报告 —— 一次跑完全部 Locator 比 fail-fast 有用得多。
 */
export function translateAcrossFrameworks(
  locator: LocatorLike,
  context: LocatorResolverContext,
  frameworks: readonly FrameworkKind[] = listLocatorResolvers(),
): LocatorTranslation[] {
  const results: LocatorTranslation[] = [];
  for (const framework of frameworks) {
    // XCUITest 只有 iOS，在 android 上下文中跳过而不是报错，否则安卓侧的 dry-run 会全红
    if (framework === 'xcuitest' && context.platform !== 'ios') {
      continue;
    }
    try {
      const resolver = createLocatorResolver(framework, context);
      results.push({ framework, ok: true, selector: resolver.resolve(locator) });
    } catch (error) {
      results.push({
        framework,
        ok: false,
        reason: error instanceof UnsupportedLocatorError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
  return results;
}
