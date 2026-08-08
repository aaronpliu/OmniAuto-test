import type { Config } from 'jest';

import { XCUITEST_RUNNER_DEFAULTS } from '../xcuitest/xcuitest.runner.config';
import { createBaseJestConfig } from './jest.base.config';

/**
 * XCUITest 专属 Jest 配置。
 *
 * 【maxWorkers 被硬编码为 1，且不提供覆盖入口 —— 这是本文件最重要的约束】
 * 不是「建议串行」，而是**并行在架构上不可能成立**：
 *   1. Node 与 Swift Runner 之间只有一条 NDJSON over stdio 管道（见 xcuitest.runner.config.ts）。
 *      多个 jest worker 会各自 spawn 一个 `xcodebuild`，
 *      但它们抢的是同一份 DerivedData 与同一个 `.xcresult` 输出路径；
 *   2. `xcodebuild` 对同一 DerivedData 目录不做并发保护，
 *      两个进程同时写会产生损坏的模块缓存，报错是
 *      "unable to attach DB: error: accessing build database ... database is locked"，
 *      与真实原因（并行）毫无字面关联，排查成本极高；
 *   3. 即使换成独立 DerivedData，`-destination` 指向的模拟器也只有一台，
 *      两个 Runner 同时驱动同一台设备，UI 状态互相覆盖。
 * 所以这里不设 `maxWorkers` 参数：任何「能配置」的暗示都会诱导使用者去踩这个坑。
 * 需要真并行请用 Appium（它的架构允许）。
 *
 * 【testTimeout 是三个框架里最长的】
 * 用例的第一条断言之前，要串行完成：
 *   xcodebuild 解析 .xctestrun（数秒）
 *   → 安装 Runner.app（数秒~数十秒）
 *   → 冷启动模拟器（30s~180s，取决于是否首次启动该 runtime）
 *   → Runner 与 Node 完成 NDJSON 握手
 * 握手超时本身就设了 300s（XCUITEST_RUNNER_DEFAULTS.handshakeTimeoutMs），
 * 用例超时必须**严格大于**它，否则 jest 会先掐断用例，
 * 而子进程还在后台跑，留下孤儿 xcodebuild 进程占着模拟器 —— 下一轮直接连不上。
 */

/** XCUITest 配置默认值 */
export const JEST_XCUITEST_DEFAULTS = {
  displayName: 'xcuitest',
  /** 架构性约束，不可配置 —— 理由见文件头 */
  maxWorkers: 1,
  /**
   * 360s = 握手超时 300s + 60s 余量。
   * 余量用于「握手成功之后」的实际测试步骤；
   * 若等于握手超时，则任何一次慢启动都会让用例在第一条断言前就被判超时。
   */
  testTimeout: XCUITEST_RUNNER_DEFAULTS.handshakeTimeoutMs + 60_000,
} as const;

/** XCUITest jest 配置入参（刻意不含 maxWorkers） */
export interface XCUITestJestConfigOptions {
  readonly testTimeout?: number;
  readonly testPathPattern?: string;
  readonly bail?: number;
  readonly overrides?: Config;
}

/** 构建 XCUITest 专属 jest 配置 */
export function createXCUITestJestConfig(options: XCUITestJestConfigOptions = {}): Config {
  const testTimeout = options.testTimeout ?? JEST_XCUITEST_DEFAULTS.testTimeout;

  const config = createBaseJestConfig({
    displayName: JEST_XCUITEST_DEFAULTS.displayName,
    // 强制串行；即便调用方通过 overrides 传了别的值，下面也会再覆盖回来
    maxWorkers: JEST_XCUITEST_DEFAULTS.maxWorkers,
    testTimeout,
    testPathPattern: options.testPathPattern,
    bail: options.bail,
    overrides: options.overrides,
  });

  return {
    ...config,
    /**
     * 二次强制：overrides 是逃生舱，但 maxWorkers 不在逃生范围内。
     * 放行它意味着放行一类必然发生、又极难归因的构建数据库损坏。
     */
    maxWorkers: JEST_XCUITEST_DEFAULTS.maxWorkers,
    /**
     * `bail: 1` 更适合 XCUITest：单个用例代价高达数分钟，
     * 第一个失败之后继续跑通常只是在浪费 CI 时间。
     * 但仍尊重调用方的显式设置。
     */
    bail: options.bail ?? 1,
  };
}

const xcuitestJestConfig: Config = createXCUITestJestConfig();
export default xcuitestJestConfig;
