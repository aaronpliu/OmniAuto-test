import * as fs from 'node:fs';

import type {
  AppKey,
  DeviceKind,
  FrameworkKind,
  LogLevel,
  Platform,
  ResolvedRunConfig,
  TestRunOptions,
} from '../contracts/types';
import { DEVICE_KINDS, PLATFORMS } from '../contracts/types';
import { resolveRunConfig } from '../configs';
import { createRunLogger } from '../utils/logger';
import { ensureParentDir, ensureRunPaths, toRelativePath } from '../utils/paths';

/**
 * Jest globalSetup —— 跑在 jest **主进程**，全部 worker 启动之前。
 *
 * 【这里有一个必须绕开的坑：主进程建的对象，worker 拿不到】
 * jest 的 globalSetup 在主进程执行，而用例跑在 worker 子进程里。两者是**独立的 V8 实例**，
 * 主进程里 `global.__ADAPTER__ = adapter` 这种写法在 worker 中读到的永远是 undefined
 * （这是 jest 新手最常踩的坑之一）。进程间只有两条通道：**环境变量**与**文件系统**。
 *
 * 因此本文件只做「无状态准备」：
 *   1. 解析出 ResolvedRunConfig（或复用 CLI 已写好的那份）
 *   2. 创建 reports/ 下的各级目录
 *   3. 把配置**序列化落盘**，并把文件路径写进 process.env.OMNI_RUN_CONFIG_FILE
 *   4. 打印运行头部
 *
 * **绝不在这里建立 Adapter 会话** —— 建了 worker 也用不上，白白浪费一次昂贵的设备连接。
 * 会话由每个 worker 的 jestSetupAfterEnv 自己建。
 */

export default async function globalSetup(): Promise<void> {
  const runConfig = loadOrResolveRunConfig();

  // 目录统一在主进程创建一次：worker 并发 mkdir 会产生竞态，
  // 虽然 recursive:true 大多数情况下能容忍，但在网络卷上仍会偶发 EEXIST
  ensureRunPaths(runConfig.paths);

  // 序列化落盘 —— 这是主进程 → worker 传递配置的唯一可靠通道
  const configFile = ensureParentDir(runConfig.paths.runConfigFile);
  fs.writeFileSync(configFile, `${JSON.stringify(runConfig, null, 2)}\n`, 'utf8');

  // 子进程继承父进程的 env，因此这一行就把配置路径送到了每个 worker
  process.env['OMNI_RUN_CONFIG_FILE'] = configFile;

  printRunHeader(runConfig);
}

/**
 * 复用 CLI 已生成的配置，或现场解析一份。
 *
 * 两条路径都要支持：
 * - `npx tsx src/index.ts ...`：CLI 已经 resolve 过并落盘，直接复用，避免同一次运行出现
 *   两个不同的 runId（那会让截图目录与报告对不上号）。
 * - `npx jest --config ...`：绕过 CLI 直接调 jest，此时只能从环境变量拼出 TestRunOptions。
 */
function loadOrResolveRunConfig(): ResolvedRunConfig {
  const existing = process.env['OMNI_RUN_CONFIG_FILE'];
  if (existing !== undefined && existing !== '' && fs.existsSync(existing)) {
    try {
      return JSON.parse(fs.readFileSync(existing, 'utf8')) as ResolvedRunConfig;
    } catch {
      // 文件损坏就当作没有，重新解析一份，不要让一个坏缓存卡住整次运行
    }
  }
  return resolveRunConfig(readOptionsFromEnv());
}

/**
 * 从环境变量拼出 TestRunOptions（仅「直接调 jest」的场景会用到）。
 * 非法值不在这里报错 —— resolveRunConfig 内部会做完整校验并给出聚合错误信息。
 */
function readOptionsFromEnv(): TestRunOptions {
  const framework = (process.env['OMNI_FRAMEWORK'] ?? 'appium') as FrameworkKind;
  const app = (process.env['OMNI_APP'] ?? 'mock') as AppKey;
  const platform = pickEnum(process.env['OMNI_PLATFORM'], PLATFORMS, 'ios');
  const device = pickEnum(process.env['OMNI_DEVICE'], DEVICE_KINDS, defaultDeviceFor(platform));

  const options: TestRunOptions = {
    framework,
    app,
    platform,
    device,
    dryRun: false,
    testPathPattern: emptyToUndefined(process.env['OMNI_TEST_PATH_PATTERN']),
    deviceId: emptyToUndefined(process.env['OMNI_DEVICE_UDID']),
    headless: process.env['OMNI_HEADLESS'] === '1',
    verbose: process.env['OMNI_VERBOSE'] === '1',
    logLevel: emptyToUndefined(process.env['OMNI_LOG_LEVEL']) as LogLevel | undefined,
    reportDir: emptyToUndefined(process.env['OMNI_ARTIFACTS_DIR']),
  };
  return options;
}

/** 平台对应的默认设备形态：iOS 用模拟器，Android 用模拟器（emulator） */
function defaultDeviceFor(platform: Platform): DeviceKind {
  return platform === 'ios' ? 'simulator' : 'emulator';
}

/** 从候选枚举里挑值，非法或缺省时回退 */
function pickEnum<T extends string>(
  raw: string | undefined,
  candidates: readonly T[],
  fallback: T,
): T {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  return candidates.find((item) => item === normalized) ?? fallback;
}

/** 空字符串归一为 undefined，避免把 `OMNI_BASE_URL=` 当成有效值 */
function emptyToUndefined(raw: string | undefined): string | undefined {
  return raw === undefined || raw.trim() === '' ? undefined : raw;
}

/** 打印运行头部，让日志一眼能看出这次跑的是什么组合 */
function printRunHeader(runConfig: ResolvedRunConfig): void {
  const logger = createRunLogger(runConfig).child('globalSetup');

  const lines: string[] = [
    '',
    '═'.repeat(66),
    '  OmniAutoTest —— 开始运行',
    '═'.repeat(66),
    `  runId       ${runConfig.runId}`,
    `  框架        ${String(runConfig.framework)}`,
    `  平台/设备   ${runConfig.platform} / ${runConfig.deviceKind} (${runConfig.device.deviceName})`,
    `  App         ${runConfig.app.displayName} [${runConfig.appId}]`,
    `  产物目录    ${toRelativePath(runConfig.paths.reportsDir)}`,
    `  运行配置    ${toRelativePath(runConfig.paths.runConfigFile)}`,
    '═'.repeat(66),
    '',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);

  logger.debug('运行配置已落盘', {
    runConfigFile: toRelativePath(runConfig.paths.runConfigFile),
  });
}
