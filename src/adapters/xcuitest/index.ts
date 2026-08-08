import type { FrameworkCapability } from '../../contracts/types';
import type { AdapterInit, AdapterModule, CreateAdapterFn, IAdapter } from '../../contracts/IActions';
import { createAdapter, XCUITestAdapter } from './XCUITestAdapter';

/**
 * XCUITest 适配器模块出口。
 *
 * 本目录**零 npm 依赖**：XCUITest 靠 Xcode 工具链驱动，
 * 所需的只有 macOS + Xcode Command Line Tools，因此 `requiredPackages` 为空数组。
 * 这也意味着 dry-run 阶段对本框架的探测永远不会因为「包没装」而失败，
 * 真正的前置条件检查在 `XCUITestDriver.healthCheck()` 里（平台/xcrun/scheme）。
 */

export type {
  BridgeField,
  BridgePredicate,
  BridgeQuery,
  BridgeQueryNode,
  XCUITestResolverOptions,
} from './XCUITestLocatorResolver';
export {
  ANY_ELEMENT_TYPE,
  createXCUITestLocatorResolver,
  escapePredicateLiteral,
  renderBridgeQuery,
  renderNodePredicate,
  renderPredicate,
  XCUITestLocatorResolver,
} from './XCUITestLocatorResolver';

export type {
  BridgeFrame,
  BridgeLogFrame,
  BridgeReadyFrame,
  BridgeRequestFrame,
  BridgeResponseFrame,
  XCUITestElementHandle,
  XCUITestElementSnapshot,
  XCUITestSession,
} from './XCUITestDriver';
export {
  asXCUITestConfig,
  BRIDGE_LINE_PREFIX,
  BRIDGE_PROTOCOL_VERSION,
  buildDestination,
  buildRunnerEnv,
  buildXcodebuildArgs,
  createXCUITestDriver,
  DEFAULT_BRIDGE_CONFIG,
  DEFAULT_XCRUN_PATH,
  XCUITestDriver,
} from './XCUITestDriver';

export type { ArtifactSink } from './XCUITestAdapter';
export {
  createAdapter,
  XCUITestActions,
  XCUITestAdapter,
  XCUITestDeviceActions,
} from './XCUITestAdapter';

/** 本框架的能力声明 */
export const XCUITEST_CAPABILITY: FrameworkCapability = {
  framework: 'xcuitest',
  displayName: 'XCUITest (Xcode 原生)',
  platforms: ['ios'],
  deviceKinds: {
    ios: ['simulator', 'real'],
  },
  // 不依赖任何 npm 包：驱动方式是 xcrun xcodebuild 子进程 + NDJSON 桥接
  requiredPackages: [],
  supportsVideo: true,
  supportsRealDevice: true,
  notes:
    '仅 macOS 可用，需 Xcode Command Line Tools；'
    + '需要在被测工程内提供实现 NDJSON 协议的 XCTest Runner target（见 XCUITestDriver 顶部注释）。'
    + '真机不支持 simctl 装包 / 预授权权限 / 录屏。',
};

/** 符合 `CreateAdapterFn` 的工厂函数 */
export const createXCUITestAdapter: CreateAdapterFn = (init: AdapterInit): IAdapter =>
  new XCUITestAdapter(init);

/** 符合 `AdapterModule` 结构约束的模块对象 */
export const xcuitestAdapterModule: AdapterModule = { createAdapter };

/**
 * 统一名的能力导出。
 * 工厂层在惰性加载本模块后会读取该字段，用真实值刷新注册表里的静态快照。
 */
export const capability: FrameworkCapability = XCUITEST_CAPABILITY;

export default xcuitestAdapterModule;
