import type { Config } from 'jest';

import { DETOX_RUNNER_DEFAULTS } from '../detox/detox.runner.config';
import { createBaseJestConfig } from './jest.base.config';

/**
 * Detox 专属 Jest 配置。
 *
 * 【⚠️ 本文件的调用方向与另外两个框架**相反** —— 这是最容易搞错的一点】
 * Appium / XCUITest：`omni` CLI → 起 jest → jest 里的适配器去驱动框架。
 * Detox：            `omni` CLI → 起 `detox test -c <configuration>` → **detox CLI 反过来拉起 jest**。
 *
 * 也就是说本文件**不是**由我们直接 `jest --config` 使用的，
 * 而是被 `.detoxrc` 的 `testRunner.args.config` 指向（见 detox.runner.config.ts 的 jestConfigPath），
 * 由 detox CLI 在它自己的进程里读取。带来三个必须遵守的后果：
 *
 *   1. **不能在这里设 `globalSetup` / `globalTeardown` 来做设备生命周期管理**。
 *      detox 有自己的一套（`detox/runners/jest/globalSetup`），负责启动模拟器、装包、建立 detox server。
 *      如果我们的 globalSetup 也去碰设备，两边会重复启动并互相抢占，
 *      典型现象是「App 刚起来就被另一侧 uninstall 了」。
 *      —— base 配置里的 globalSetup 只做**产物目录准备与运行上下文落盘**（纯 Node 侧，不碰设备），
 *      因此可以安全共存；这条约束在此显式记录，防止后来者往 globalSetup 里塞设备逻辑。
 *
 *   2. **`maxWorkers` 由 detox 决定，jest 侧只能与之保持一致**。
 *      detox CLI 会把自己的 `--workers` 透传成 jest 的 `--maxWorkers`（命令行优先级高于配置文件）。
 *      我们在 `.detoxrc` 的 testRunner 里已经写死 `maxWorkers: 1`，
 *      这里同样写 1，保证「直接跑 jest 调试」与「经 detox 跑」两条路径行为一致。
 *
 *   3. **不能 import 任何 detox 运行时**（`detox` 包本身）。
 *      detox 的模块顶层会读取 `DETOX_CONFIG_PATH` 等环境变量，
 *      在配置解析阶段（此时 detox CLI 还没注入这些变量）导入会直接抛错。
 *      本文件只从 `configs/detox/*` 取**纯数据常量**，不碰 detox 包。
 *
 * 【testEnvironment 为什么保持 'node' 而不用 detox 的自定义环境】
 * detox 官方模板会设 `testEnvironment: 'detox/runners/jest/testEnvironment'`，
 * 它的作用是注入 `device` / `element` / `by` 等全局变量。
 * 而本工程的核心承诺是「一份用例零改动跑三个框架」——
 * 用例里绝不能出现 detox 专有全局量，一切都走统一的适配器接口。
 * 所以我们在 `.detoxrc` 里设了 `behavior.exposeGlobals: false`，
 * 这里也就没有理由切换 testEnvironment。
 * 适配器自行 `require('detox')` 并持有实例，这条路径不依赖全局注入。
 */

/** Detox 配置默认值 */
export const JEST_DETOX_DEFAULTS = {
  displayName: 'detox',
  /** 与 .detoxrc 的 testRunner.args.maxWorkers 保持一致，理由见文件头第 2 条 */
  maxWorkers: 1,
  /**
   * 240s：比 base 的 120s 长，比 XCUITest 的 360s 短。
   * Detox 的 startup（setupTimeout 300s）主要花在 detox CLI 侧的
   * 「启动模拟器 + 安装 App + 建立 detox server 连接」，
   * 这部分发生在 jest 用例**之外**（属于 detox 的 globalSetup），不计入 testTimeout。
   * 用例内部真正耗时的是 `device.launchApp()` 与同步机制（synchronization）的等待，
   * 240s 足以覆盖一次冷启动 + 若干次页面跳转。
   */
  testTimeout: 240_000,
  /** detox CLI 读取本文件的路径（与 .detoxrc 中 jestConfigPath 同源，避免两处硬编码分叉） */
  jestConfigPath: DETOX_RUNNER_DEFAULTS.jestConfigPath,
} as const;

/** Detox jest 配置入参 */
export interface DetoxJestConfigOptions {
  readonly testTimeout?: number;
  readonly testPathPattern?: string;
  readonly bail?: number;
  readonly overrides?: Config;
}

/** 构建 Detox 专属 jest 配置 */
export function createDetoxJestConfig(options: DetoxJestConfigOptions = {}): Config {
  const config = createBaseJestConfig({
    displayName: JEST_DETOX_DEFAULTS.displayName,
    maxWorkers: JEST_DETOX_DEFAULTS.maxWorkers,
    testTimeout: options.testTimeout ?? JEST_DETOX_DEFAULTS.testTimeout,
    testPathPattern: options.testPathPattern,
    bail: options.bail,
    overrides: options.overrides,
  });

  return {
    ...config,
    // 同 XCUITest：worker 数不在逃生舱范围内，必须与 .detoxrc 一致
    maxWorkers: JEST_DETOX_DEFAULTS.maxWorkers,
    /**
     * `testEnvironment: 'node'`（沿用 base）。
     * 显式重申而非依赖 base，是为了让任何试图改成 detox 自定义环境的人，
     * 先在这里看到文件头第「testEnvironment」段的理由。
     */
    testEnvironment: 'node',
  };
}

const detoxJestConfig: Config = createDetoxJestConfig();
export default detoxJestConfig;
