import type { FrameworkCapability } from '../../contracts/types';
import type { AdapterInit, AdapterModule, CreateAdapterFn, IAdapter } from '../../contracts/IActions';
import { AppiumAdapter, createAdapter } from './AppiumAdapter';
import { APPIUM_PACKAGE } from './AppiumDriver';

/**
 * Appium 适配器模块出口。
 *
 * 【为什么这里可以静态 import 三个实现文件】
 * 本目录下没有任何文件顶层 import webdriverio —— SDK 只在 AppiumDriver.connect()
 * 内部通过 lazyImport 加载。因此加载本模块本身是零副作用、零依赖的，
 * 工厂层即使在没装 webdriverio 的机器上 import 它也不会崩。
 */

export type {
  AppiumLocatorResolverOptions,
  TestIdAttributeConfig,
} from './AppiumLocatorResolver';
export { AppiumLocatorResolver, createAppiumLocatorResolver } from './AppiumLocatorResolver';

export type {
  W3CPointerAction,
  WdioBrowserLike,
  WdioElementLike,
  WdioElementRef,
  WdioPoint,
  WdioRect,
  WdioRemoteOptions,
  WdioWaitOptions,
  WebdriverIoModuleLike,
} from './AppiumDriver';
export { APPIUM_PACKAGE, AppiumDriver, createAppiumDriver, W3C_ELEMENT_KEY } from './AppiumDriver';

export type { ArtifactSink } from './AppiumAdapter';
export { AppiumActions, AppiumAdapter, AppiumDeviceActions, createAdapter } from './AppiumAdapter';

/** 本框架的能力声明，AdapterFactory 的能力矩阵直接引用它 */
export const APPIUM_CAPABILITY: FrameworkCapability = {
  framework: 'appium',
  displayName: 'Appium (WebdriverIO)',
  platforms: ['ios', 'android'],
  deviceKinds: {
    ios: ['simulator', 'real'],
    android: ['emulator', 'real'],
  },
  requiredPackages: [APPIUM_PACKAGE],
  supportsVideo: true,
  supportsRealDevice: true,
  notes: '覆盖面最广；需要独立运行的 Appium Server（默认 http://127.0.0.1:4723）',
};

/** 符合 `CreateAdapterFn` 的工厂函数（与 AppiumAdapter.ts 中的同名导出一致） */
export const createAppiumAdapter: CreateAdapterFn = (init: AdapterInit): IAdapter =>
  new AppiumAdapter(init);

/** 符合 `AdapterModule` 结构约束的模块对象，供 registry 的动态 import 使用 */
export const appiumAdapterModule: AdapterModule = { createAdapter };

/**
 * 统一名的能力导出。
 * 工厂层在惰性加载本模块后会读取该字段，用真实值刷新注册表里的静态快照 ——
 * 名字固定为 `capability` 才能被工厂用同一段代码处理所有框架（包括第 4 个外部框架）。
 */
export const capability: FrameworkCapability = APPIUM_CAPABILITY;

export default appiumAdapterModule;
