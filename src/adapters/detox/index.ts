import type { FrameworkCapability } from '../../contracts/types';
import type { AdapterInit, AdapterModule, CreateAdapterFn, IAdapter } from '../../contracts/IActions';
import { createAdapter, DetoxAdapter } from './DetoxAdapter';
import { DETOX_PACKAGE } from './DetoxDriver';

/**
 * Detox 适配器模块出口。
 * 本目录零第三方顶层 import：detox 只在 DetoxDriver.connect() 内被 lazyImport。
 */

export type {
  DetoxLocatorResolverOptions,
  DetoxMatcherBy,
  DetoxMatcherNode,
  DetoxMatcherSpec,
} from './DetoxLocatorResolver';
export {
  createDetoxLocatorResolver,
  DetoxLocatorResolver,
  renderDetoxMatcher,
} from './DetoxLocatorResolver';

export type {
  DetoxAttributesResult,
  DetoxByLike,
  DetoxDeviceLike,
  DetoxElementAttributes,
  DetoxElementFn,
  DetoxElementLike,
  DetoxElementsAttributes,
  DetoxExpectFn,
  DetoxExpectLike,
  DetoxLaunchAppParams,
  DetoxMatcherLike,
  DetoxModuleLike,
  DetoxWaitForChainLike,
  DetoxWaitForExpectationLike,
  DetoxWaitForFn,
  DetoxWhileElementLike,
} from './DetoxDriver';
export {
  createDetoxDriver,
  DETOX_ORIENTATION,
  DETOX_PACKAGE,
  DetoxDriver,
  isMultiElementAttributes,
  toAttributeList,
} from './DetoxDriver';

export type { ArtifactSink } from './DetoxAdapter';
export { createAdapter, DetoxActions, DetoxAdapter, DetoxDeviceActions } from './DetoxAdapter';

/** 本框架的能力声明 */
export const DETOX_CAPABILITY: FrameworkCapability = {
  framework: 'detox',
  displayName: 'Detox (React Native)',
  platforms: ['ios', 'android'],
  deviceKinds: {
    // Detox 官方不支持 iOS 真机（无法做灰盒同步），Android 真机可用
    ios: ['simulator'],
    android: ['emulator', 'real'],
  },
  requiredPackages: [DETOX_PACKAGE],
  supportsVideo: true,
  supportsRealDevice: false,
  notes:
    '灰盒同步最稳、速度最快，但只适用于 React Native App；'
    + '不支持 xpath / 子串匹配 / 坐标点击，遇到这些语义会抛 UnsupportedLocatorError',
};

/** 符合 `CreateAdapterFn` 的工厂函数 */
export const createDetoxAdapter: CreateAdapterFn = (init: AdapterInit): IAdapter =>
  new DetoxAdapter(init);

/** 符合 `AdapterModule` 结构约束的模块对象 */
export const detoxAdapterModule: AdapterModule = { createAdapter };

/**
 * 统一名的能力导出。
 * 工厂层在惰性加载本模块后会读取该字段，用真实值刷新注册表里的静态快照。
 */
export const capability: FrameworkCapability = DETOX_CAPABILITY;

export default detoxAdapterModule;
