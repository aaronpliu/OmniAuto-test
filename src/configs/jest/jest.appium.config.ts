import type { Config } from 'jest';

import { APPIUM_ANDROID_DEFAULTS } from '../appium/appium.android.capabilities.config';
import { APPIUM_IOS_DEFAULTS } from '../appium/appium.ios.capabilities.config';
import { createBaseJestConfig } from './jest.base.config';

/**
 * Appium 专属 Jest 配置。
 *
 * 【三个框架里，只有 Appium 具备真并行的可能】
 * 原因是它的架构最松耦合：Node 侧只是一个 HTTP 客户端，
 * 一台 Appium Server 可以同时持有多个 session，每个 session 绑一台设备。
 * 相比之下：
 *   - Detox 的 CLI 自己接管了 worker 与设备的分配，jest 侧不该再插手；
 *   - XCUITest 的 `xcodebuild` 子进程与 NDJSON 管道是一对一的，多 worker 会把协议帧搅乱。
 *
 * 【但默认仍然是 1，为什么】
 * 「能并行」不等于「应该默认并行」。并行 Appium 的前置条件有三个，缺一不可：
 *   1. **设备数 >= worker 数**。只有一台设备时开 4 个 worker，
 *      结果是四个 session 抢同一台机器，UI 状态互相污染，
 *      失败现象是随机的、不可复现的 —— 这是最昂贵的一类测试噪音。
 *   2. **端口不冲突**。见下方 PORT_ISOLATION 说明。
 *   3. **App 状态可隔离**。共用同一个后端账号的用例并行跑会互相踩数据。
 * 三条里只有第 2 条能由本工程自动保证，另外两条依赖使用者的环境。
 * 因此默认 `maxWorkers: 1`，并提供 `createAppiumJestConfig({ maxWorkers })` 让人显式开启。
 *
 * 【端口错峰是并行能成立的关键，且已经在 capabilities 层实现】
 * 每个 jest worker 通过环境变量 `JEST_WORKER_ID`（从 1 开始）拿到自己的序号，
 * capabilities 构建函数据此错开各自占用的本地端口：
 *   - iOS：`appium:wdaLocalPort   = 8100 + workerIndex`
 *          `appium:mjpegServerPort = 9100 + workerIndex`
 *   - Android：`appium:systemPort = 8200 + workerIndex * 2`
 * Android 步长为 2 是因为 UiAutomator2 driver 在 systemPort 之外还会隐式占用 `systemPort + 1`
 * 做 adb 转发；步长为 1 时相邻 worker 会撞车，
 * 报错是极具误导性的 "Could not proxy command to the remote server"。
 *
 * ⚠️ 本文件**不负责**分配端口，只负责说明约束并保证 worker 数不超过端口窗口。
 * 真正的分配在 `configs/appium/appium.{ios,android}.capabilities.config.ts`。
 */

/** 端口错峰参数（与 capabilities 层保持同一真理源，不重复硬编码） */
export const PORT_ISOLATION = {
  iosWdaPortBase: APPIUM_IOS_DEFAULTS.wdaLocalPortBase,
  iosMjpegPortBase: APPIUM_IOS_DEFAULTS.mjpegServerPortBase,
  androidSystemPortBase: APPIUM_ANDROID_DEFAULTS.systemPortBase,
  androidSystemPortStep: APPIUM_ANDROID_DEFAULTS.systemPortStep,
  /**
   * 端口窗口上限：iOS 的 wda(8100+) 与 mjpeg(9100+) 相距 1000，
   * Android 的 systemPort(8200+, 步长 2) 若无限增长会在 worker=50 时撞进 8300（XCUITest bridge 的默认端口）。
   * 取 32 是一个既宽裕又绝对安全的上界，同时也远超任何现实中的本地设备数量。
   */
  maxSafeWorkers: 32,
} as const;

/** Appium 配置默认值 */
export const JEST_APPIUM_DEFAULTS = {
  displayName: 'appium',
  /** 默认串行，理由见文件头 */
  maxWorkers: 1,
  /**
   * 180s：比 base 的 120s 更长。
   * Appium 的每条指令都是一次 HTTP 往返（Node → Appium Server → WDA/UiAutomator2 → 设备），
   * 三跳链路上任一环节的抖动都会累加；
   * 而且 `newCommandTimeout` 触发的 session 重建也发生在用例内部。
   */
  testTimeout: 180_000,
} as const;

/** Appium jest 配置入参 */
export interface AppiumJestConfigOptions {
  /**
   * 并行 worker 数。> 1 前请确认：设备数足够、账号数据可隔离。
   * 端口冲突已由 capabilities 层的错峰机制自动规避。
   */
  readonly maxWorkers?: number | string;
  readonly testTimeout?: number;
  readonly testPathPattern?: string;
  readonly bail?: number;
  readonly overrides?: Config;
}

/**
 * 计算某个 worker 应当使用的端口（供文档与自检脚本引用，运行时由 capabilities 层实际下发）。
 *
 * @param workerIndex jest 的 `JEST_WORKER_ID`（从 1 开始），单进程模式下为 0
 */
export function describeWorkerPorts(workerIndex: number): {
  readonly iosWdaLocalPort: number;
  readonly iosMjpegServerPort: number;
  readonly androidSystemPort: number;
} {
  const index = Number.isInteger(workerIndex) && workerIndex > 0 ? workerIndex : 0;
  return {
    iosWdaLocalPort: PORT_ISOLATION.iosWdaPortBase + index,
    iosMjpegServerPort: PORT_ISOLATION.iosMjpegPortBase + index,
    androidSystemPort: PORT_ISOLATION.androidSystemPortBase + index * PORT_ISOLATION.androidSystemPortStep,
  };
}

/** 构建 Appium 专属 jest 配置 */
export function createAppiumJestConfig(options: AppiumJestConfigOptions = {}): Config {
  const maxWorkers = options.maxWorkers ?? JEST_APPIUM_DEFAULTS.maxWorkers;

  // 超过安全窗口时收敛到上界：与其让端口撞进别的服务，不如少开几个 worker
  const safeWorkers = typeof maxWorkers === 'number'
    ? Math.min(Math.max(1, Math.trunc(maxWorkers)), PORT_ISOLATION.maxSafeWorkers)
    : maxWorkers;

  return createBaseJestConfig({
    displayName: JEST_APPIUM_DEFAULTS.displayName,
    maxWorkers: safeWorkers,
    testTimeout: options.testTimeout ?? JEST_APPIUM_DEFAULTS.testTimeout,
    testPathPattern: options.testPathPattern,
    bail: options.bail,
    overrides: options.overrides,
  });
}

const appiumJestConfig: Config = createAppiumJestConfig();
export default appiumJestConfig;
