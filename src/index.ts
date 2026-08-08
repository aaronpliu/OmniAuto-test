/**
 * OmniAutoTest 统一入口 —— 双职责文件。
 *
 * (a) **对外 barrel**：测试脚本 `import { getActions, defineLocator } from '@omni'`。
 * (b) **CLI 入口**：`npx tsx src/index.ts --framework=appium ...` / `npm test` / `npm run dry-run`。
 *
 * 两者由文件末尾的 `require.main === module` 分流：被 import 时只是一组导出，
 * 被直接执行时才跑 CLI。
 *
 * 【导出面为什么这么克制】
 * 这里**故意不导出** AdapterFactory / 各 Adapter / configs 的内部实现。
 * 一旦导出，测试脚本就能 `import { createAdapter } from '@omni'` 直接触碰框架细节，
 * 「一份脚本零改动跨框架」的抽象边界当场破产 —— 而且这种破坏是渐进式的、
 * code review 很难察觉的。收紧导出面是守住 AC-6 最省力的手段。
 */

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* ═══════════════════════════════════════════════════════════════════
 *                    Part A —— 对外 barrel 导出
 * ═══════════════════════════════════════════════════════════════════ */

/** 脚本层唯一的四个能力入口 */
export { getActions, getDevice, getRunConfig, getLogger } from './setup/testContext';

import type { IActions, IDeviceActions } from './contracts/IActions';
import { getActions as resolveActions, getDevice as resolveDevice } from './setup/testContext';

/**
 * 惰性代理：把「取上下文」推迟到**每一次属性访问**时。
 *
 * 【为什么不能写 `export const actions = getActions()`】
 * 模块在 import 阶段就会求值，而此时 TestContext 尚未注入 ——
 * 它是在 jest worker 的 `beforeAll` 里才由 `jestSetupAfterEnv` 建好会话后写入的。
 * 直接求值会在**加载测试文件的瞬间**抛「上下文未初始化」，
 * 且报错栈指向 import 语句，完全看不出真实原因。
 *
 * 用 Proxy 把求值推迟到 `actions.tap(...)` 这一刻，脚本层就能写成最自然的形式：
 *   `import { actions } from '@omni'`（顶层）
 *   `await actions.tap('login_submit_btn')`（用例内，此时上下文已就绪）
 *
 * 【为什么要 bind】
 * `Reflect.get` 取出的方法若直接返回，调用时 `this` 会指向 Proxy 而非真实适配器实例，
 * 适配器内部访问 `this.driver` 会得到 undefined。绑回真实对象是必须的。
 */
function createLazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop, receiver): unknown {
      const real = resolve() as Record<string | symbol, unknown>;
      const value = Reflect.get(real, prop, receiver);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(real)
        : value;
    },
    has(_target, prop): boolean {
      return prop in (resolve() as object);
    },
  });
}

/** 脚本层首选的元素操作入口：`await actions.tap('login_submit_btn')` */
export const actions: IActions = createLazyProxy<IActions>(resolveActions);

/** 脚本层首选的设备操作入口：`await device.reloadApp()` */
export const device: IDeviceActions = createLazyProxy<IDeviceActions>(resolveDevice);

/** 声明式定位器工具（纯函数，无框架依赖） */
export {
  defineLocator,
  defineLocators,
  describeLocator,
  normalizeLocator,
} from './contracts/IElementLocator';

/** 定位器与动作的类型（仅类型，运行时零开销） */
export type {
  ElementType,
  LocatorDescriptor,
  LocatorLike,
  NativeSelector,
} from './contracts/IElementLocator';

export type {
  AssertTextOptions,
  BaseActionOptions,
  DeviceInfo,
  IActions,
  IDeviceActions,
  LaunchAppOptions,
  LongPressOptions,
  ScreenshotOptions,
  ScrollOptions,
  ScrollToOptions,
  SwipeOptions,
  TapOptions,
  TypeTextOptions,
  WaitOptions,
} from './contracts/IActions';

export type {
  AppKey,
  ArtifactRef,
  DeviceKind,
  FrameworkKind,
  ILogger,
  LogLevel,
  Orientation,
  Platform,
  ResolvedRunConfig,
  SwipeDirection,
  TextMatchMode,
} from './contracts/types';

/** 脚本层可能需要 catch 的错误类 */
export {
  ActionTimeoutError,
  AdapterNotInitializedError,
  AssertionFailedError,
  ElementNotFoundError,
  isOmniError,
  OmniError,
  UnsupportedLocatorError,
} from './contracts/types';

/* ═══════════════════════════════════════════════════════════════════
 *                    Part B —— CLI 实现
 * ═══════════════════════════════════════════════════════════════════ */

import type {
  AppKey,
  DeviceKind,
  DryRunCheckId,
  DryRunCheckResult,
  DryRunReport,
  FrameworkKind,
  LogLevel,
  Platform,
  ResolvedRunConfig,
  TestRunOptions,
  ValidationIssue,
} from './contracts/types';
import {
  BUILTIN_FRAMEWORKS,
  DEVICE_KINDS,
  EXIT_CODES,
  isOmniError as isOmniErrorValue,
  PLATFORMS,
  toExitCode,
} from './contracts/types';
import { defineLocator } from './contracts/IElementLocator';
import {
  ENV_SPEC_KEYS,
  isAppRegistered,
  listAppKeys,
  resolveApp,
  resolveRunConfig,
  validateAllConfigs,
} from './configs';
import {
  checkCombination,
  getCapability,
  listCapabilities,
  listFrameworks,
  probeFramework,
} from './factory/AdapterFactory';
import { translateAcrossFrameworks } from './factory/LocatorResolverFactory';
import { ensureRunPaths, getProjectRoot, isWritableDir, toRelativePath } from './utils/paths';

/* ─────────────── 默认值 ─────────────── */

/** CLI 缺省值。集中在此，帮助文本与解析器共用同一份，不会出现「文档写的和实际不一样」 */
const CLI_DEFAULTS = {
  framework: 'appium' as FrameworkKind,
  app: 'mock' as AppKey,
  platform: 'ios' as Platform,
  device: 'simulator' as DeviceKind,
} as const;

/* ─────────────── 参数解析 ─────────────── */

/** 需要取值的长参数 */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  'framework', 'app', 'platform', 'device', 'test-path-pattern',
  'tags', 'retries', 'log-level', 'report-dir', 'device-id',
]);

/** 布尔开关 */
const BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run', 'bail', 'headless', 'verbose', 'help', 'version',
]);

/** 短参数别名 */
const SHORT_ALIASES: Readonly<Record<string, string>> = {
  f: 'framework', a: 'app', p: 'platform', d: 'device', h: 'help', v: 'version',
};

interface ParseResult {
  readonly options: TestRunOptions;
  readonly errors: readonly string[];
}

/**
 * 手写参数解析（不引入 commander/yargs）。
 *
 * 支持 `--key=value` 与 `--key value` 两种写法，以及 `-f appium` 短参数；
 * `--` 之后的全部内容原样收进 jestArgs 透传给 jest。
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  const errors: string[] = [];
  const raw = new Map<string, string>();
  const flags = new Set<string>();
  const jestArgs: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    // `--` 之后原样透传，不再做任何解析
    if (token === '--') {
      jestArgs.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith('-')) {
      errors.push(`无法识别的位置参数 "${token}"（参数需以 -- 开头，或放在 -- 之后透传给 jest）`);
      continue;
    }

    // 归一化：去掉前导横线，拆出 = 后的值，短参数展开为长名
    const isShort = !token.startsWith('--');
    const body = token.replace(/^--?/, '');
    const equalsIndex = body.indexOf('=');
    let name = equalsIndex === -1 ? body : body.slice(0, equalsIndex);
    let inlineValue = equalsIndex === -1 ? undefined : body.slice(equalsIndex + 1);

    if (isShort) {
      const expanded = SHORT_ALIASES[name];
      if (expanded === undefined) {
        errors.push(`未知的短参数 "-${name}"`);
        continue;
      }
      name = expanded;
    }

    if (BOOLEAN_FLAGS.has(name)) {
      if (inlineValue !== undefined && inlineValue !== 'true' && inlineValue !== 'false') {
        errors.push(`参数 --${name} 是开关，不接受值 "${inlineValue}"`);
        continue;
      }
      if (inlineValue !== 'false') {
        flags.add(name);
      }
      continue;
    }

    if (!VALUE_FLAGS.has(name)) {
      errors.push(`未知参数 "--${name}"`);
      continue;
    }

    // 未用 = 传值时，吃掉下一个 token 作为值
    if (inlineValue === undefined) {
      const next = argv[index + 1];
      if (next === undefined || next === '--' || next.startsWith('-')) {
        errors.push(`参数 --${name} 缺少值`);
        continue;
      }
      inlineValue = next;
      index += 1;
    }
    raw.set(name, inlineValue);
  }

  const retriesRaw = raw.get('retries');
  let retries: number | undefined;
  if (retriesRaw !== undefined) {
    const parsed = Number.parseInt(retriesRaw, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      errors.push(`--retries 需要非负整数，收到 "${retriesRaw}"`);
    } else {
      retries = parsed;
    }
  }

  const tagsRaw = raw.get('tags');
  const tags = tagsRaw === undefined
    ? undefined
    : tagsRaw.split(',').map((item) => item.trim()).filter((item) => item !== '');

  const platform = (raw.get('platform') ?? CLI_DEFAULTS.platform) as Platform;
  // 设备形态的缺省值依赖平台：android 上默认 emulator 而不是 simulator，
  // 否则 `--platform=android` 单独使用时会撞上「android 不支持 simulator」而报错，
  // 但用户其实什么都没做错
  const deviceDefault: DeviceKind = raw.get('platform') !== undefined && platform === 'android'
    ? 'emulator'
    : CLI_DEFAULTS.device;

  const options: TestRunOptions = {
    framework: (raw.get('framework') ?? CLI_DEFAULTS.framework) as FrameworkKind,
    app: (raw.get('app') ?? CLI_DEFAULTS.app) as AppKey,
    platform,
    device: (raw.get('device') ?? deviceDefault) as DeviceKind,
    dryRun: flags.has('dry-run'),
    testPathPattern: raw.get('test-path-pattern'),
    deviceId: raw.get('device-id'),
    tags,
    retries,
    bail: flags.has('bail') ? true : undefined,
    headless: flags.has('headless') ? true : undefined,
    verbose: flags.has('verbose') ? true : undefined,
    logLevel: raw.get('log-level') as LogLevel | undefined,
    reportDir: raw.get('report-dir'),
    jestArgs,
    help: flags.has('help'),
    version: flags.has('version'),
  };

  return { options, errors };
}

/* ─────────────── 组合合法性校验 ─────────────── */

/**
 * 运行时组合校验。
 *
 * 【为什么这层不能省】
 * `FrameworkKind` 是开放联合（`'appium'|'xcuitest'|'detox'|(string & {})`），
 * 类型层对 `--framework=appuim` 这种错拼**毫无保护**。契约层把拼写保护的责任
 * 明确下移到运行时，这里就是收口的地方：以 registry 的 keys 为白名单。
 */
export function validateRunOptions(options: TestRunOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const registered = listFrameworks();

  if (!registered.includes(options.framework)) {
    issues.push({
      code: 'OMNI_E_FRAMEWORK_NOT_REGISTERED',
      path: 'options.framework',
      message: `未注册的框架 "${String(options.framework)}"`,
      severity: 'error',
      hint: `可用框架：${registered.map(String).join(' / ')}`,
    });
    // 框架不认识就无从谈论平台/设备能力，提前返回避免级联噪音
    return issues;
  }

  if (!PLATFORMS.includes(options.platform)) {
    issues.push({
      code: 'OMNI_E_INVALID_COMBINATION',
      path: 'options.platform',
      message: `未知平台 "${String(options.platform)}"`,
      severity: 'error',
      hint: `可选：${PLATFORMS.join(' / ')}`,
    });
  }

  if (!DEVICE_KINDS.includes(options.device)) {
    issues.push({
      code: 'OMNI_E_INVALID_COMBINATION',
      path: 'options.device',
      message: `未知设备形态 "${String(options.device)}"`,
      severity: 'error',
      hint: `可选：${DEVICE_KINDS.join(' / ')}`,
    });
  }

  if (!isAppRegistered(options.app)) {
    issues.push({
      code: 'OMNI_E_INVALID_COMBINATION',
      path: 'options.app',
      message: `未注册的 App "${String(options.app)}"`,
      severity: 'error',
      hint: `可用 App：${listAppKeys().map(String).join(' / ')}`,
    });
  }

  // 平台/设备/App 任一不认识时，能力矩阵校验的结论没有意义
  if (issues.length > 0) {
    return issues;
  }

  const app = resolveApp(options.app);
  const result = checkCombination({
    framework: options.framework,
    platform: options.platform,
    deviceKind: options.device,
    appSupportedPlatforms: app.supportedPlatforms,
    appKey: String(options.app),
  });
  issues.push(...result.issues);

  return issues;
}

/* ─────────────── 帮助与矩阵 ─────────────── */

/** 渲染合法组合矩阵表格 */
export function renderCombinationMatrix(): string {
  const header = ['框架', '平台', '设备形态', '依赖包'];
  const rows: string[][] = [];

  for (const capability of listCapabilities()) {
    for (const platform of capability.platforms) {
      const kinds = capability.deviceKinds[platform] ?? [];
      rows.push([
        String(capability.framework),
        platform,
        kinds.join(', ') || '（无）',
        capability.requiredPackages.join(', ') || '（无需第三方包）',
      ]);
    }
  }

  return renderTable(header, rows, '  ');
}

/** 通用等宽表格渲染（按列内容自适应宽度，中文按 2 字宽计算） */
function renderTable(header: readonly string[], rows: readonly string[][], indent = ''): string {
  const widths = header.map((cell, columnIndex) => {
    const bodyMax = rows.reduce(
      (max, row) => Math.max(max, displayWidth(row[columnIndex] ?? '')),
      0,
    );
    return Math.max(displayWidth(cell), bodyMax);
  });

  const line = (cells: readonly string[]): string =>
    indent + cells.map((cell, i) => padDisplay(cell ?? '', widths[i])).join('  ').trimEnd();

  const separator = indent + widths.map((width) => '─'.repeat(width)).join('  ');

  return [line(header), separator, ...rows.map(line)].join('\n');
}

/** 显示宽度：CJK 字符占 2 列，用于表格对齐 */
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += (code >= 0x1100 && (
      code <= 0x115f
      || (code >= 0x2e80 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe6f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6)
    )) ? 2 : 1;
  }
  return width;
}

/** 按显示宽度右侧补空格 */
function padDisplay(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

/** 渲染 --help */
export function renderHelp(): string {
  return `
OmniAutoTest —— 跨框架统一 E2E 测试入口
一份脚本零改动运行于 Appium / XCUITest / Detox。

用法
  npx tsx src/index.ts [选项] [-- <透传给 jest 的参数>]
  npm test -- [选项]
  npm run dry-run

选项
  -f, --framework=<name>      测试框架，默认 ${CLI_DEFAULTS.framework}
                              可用：${listFrameworks().map(String).join(' | ')}
  -a, --app=<key>             被测 App，默认 ${CLI_DEFAULTS.app}
                              可用：${listAppKeys().map(String).join(' | ')}
  -p, --platform=<name>       目标平台，默认 ${CLI_DEFAULTS.platform}
                              可用：${PLATFORMS.join(' | ')}
  -d, --device=<kind>         设备形态，默认 ${CLI_DEFAULTS.device}（--platform=android 时默认 emulator）
                              可用：${DEVICE_KINDS.join(' | ')}
      --device-id=<udid>      指定真机 udid / Android serial，覆盖默认设备
      --dry-run               只做静态自检，不连设备、不跑用例（无依赖也应全绿）
      --test-path-pattern=<r> 用例路径正则，透传给 jest
      --tags=<a,b>            按标签过滤用例
      --retries=<n>           失败重试次数
      --bail                  首个用例失败即停止
      --headless              无头模式（模拟器/模拟机支持时生效）
      --verbose               输出更详细的日志
      --log-level=<level>     日志级别：debug | info | warn | error | silent
      --report-dir=<path>     产物根目录，默认 reports
  -h, --help                  显示本帮助
  -v, --version               显示版本号

合法组合矩阵
${renderCombinationMatrix()}

  非法组合示例：xcuitest + android（XCUITest 仅 iOS）、ios + emulator、android + simulator。
  非法组合会在拉起 jest **之前**被拒绝，退出码 ${EXIT_CODES.INVALID_ARGS}。

示例
  # 本机自检，不需要设备与第三方依赖
  npm run dry-run

  # Appium + iOS 模拟器跑 mock App
  npx tsx src/index.ts --framework=appium --app=mock --platform=ios --device=simulator

  # Detox + Android 模拟器，失败即停
  npx tsx src/index.ts -f detox -a mock -p android -d emulator --bail

  # XCUITest + iOS 真机，指定 udid
  npx tsx src/index.ts -f xcuitest -p ios -d real --device-id=00008030-001A2B3C

  # 只跑登录相关用例，并把 --runInBand 透传给 jest
  npx tsx src/index.ts -f appium -p ios --test-path-pattern=login -- --runInBand

退出码
  ${EXIT_CODES.SUCCESS} 成功   ${EXIT_CODES.INVALID_ARGS} 参数/组合非法   ${EXIT_CODES.CONFIG_INVALID} 配置无效   ${EXIT_CODES.TYPECHECK_FAILED} 类型检查失败
  ${EXIT_CODES.DRY_RUN_FAILED} dry-run 未通过   ${EXIT_CODES.FRAMEWORK_MISSING} 框架依赖缺失   ${EXIT_CODES.DRIVER_FAILED} 驱动连接失败   ${EXIT_CODES.TESTS_FAILED} 用例失败
`.trimStart();
}

/** 读取 package.json 的版本号 */
function readVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(getProjectRoot(), 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/* ─────────────── 正常运行流程 ─────────────── */

/** 根据框架挑选 jest 配置文件 */
function resolveJestConfigPath(framework: FrameworkKind): string {
  return path.join(
    getProjectRoot(),
    'src', 'configs', 'jest', `jest.${String(framework)}.config.ts`,
  );
}

/** 解析配置 → 落盘 → 拉起 jest，返回 jest 的退出码 */
async function runTests(options: TestRunOptions): Promise<number> {
  const runConfig: ResolvedRunConfig = resolveRunConfig(options);
  ensureRunPaths(runConfig.paths);
  fs.writeFileSync(
    runConfig.paths.runConfigFile,
    `${JSON.stringify(runConfig, null, 2)}\n`,
    'utf8',
  );

  const jestConfigPath = resolveJestConfigPath(runConfig.framework);
  if (!fs.existsSync(jestConfigPath)) {
    process.stderr.write(
      `✖ 找不到框架 "${String(runConfig.framework)}" 的 jest 配置：`
      + `${toRelativePath(jestConfigPath)}\n`
      + '  新增框架时需要同时提供 src/configs/jest/jest.<framework>.config.ts\n',
    );
    return EXIT_CODES.CONFIG_INVALID;
  }

  const jestBin = path.join(getProjectRoot(), 'node_modules', '.bin', 'jest');
  if (!fs.existsSync(jestBin)) {
    process.stderr.write('✖ 未找到 jest，请先执行 npm install\n');
    return EXIT_CODES.GENERIC;
  }

  const jestArgs: string[] = ['--config', jestConfigPath];
  if (options.testPathPattern !== undefined) {
    jestArgs.push(`--testPathPattern=${options.testPathPattern}`);
  }
  if (options.bail === true) {
    jestArgs.push('--bail');
  }
  if (options.verbose === true) {
    jestArgs.push('--verbose');
  }
  jestArgs.push(...(options.jestArgs ?? []));

  // 环境变量是主进程 → jest worker 的唯一通道，
  // 这里把 CLI 的决定一次性注入，globalSetup 与 jestSetupAfterEnv 都从中读取
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    OMNI_RUN_CONFIG_FILE: runConfig.paths.runConfigFile,
    OMNI_RUN_ID: runConfig.runId,
    OMNI_FRAMEWORK: String(runConfig.framework),
    OMNI_APP: String(runConfig.options.app),
    OMNI_PLATFORM: runConfig.platform,
    OMNI_DEVICE: runConfig.deviceKind,
  };
  if (options.logLevel !== undefined) {
    childEnv['OMNI_LOG_LEVEL'] = options.logLevel;
  }
  if (options.verbose === true) {
    childEnv['OMNI_VERBOSE'] = '1';
  }
  if (options.headless === true) {
    childEnv['OMNI_HEADLESS'] = '1';
  }
  if (options.deviceId !== undefined) {
    childEnv['OMNI_DEVICE_UDID'] = options.deviceId;
  }
  if (options.retries !== undefined) {
    childEnv['OMNI_RETRIES'] = String(options.retries);
  }
  if (options.tags !== undefined && options.tags.length > 0) {
    childEnv['OMNI_TAGS'] = options.tags.join(',');
  }

  return await new Promise<number>((resolve) => {
    const child = spawn(jestBin, jestArgs, {
      cwd: getProjectRoot(),
      env: childEnv,
      stdio: 'inherit',
    });
    child.on('error', (error) => {
      process.stderr.write(`✖ 启动 jest 失败：${error.message}\n`);
      resolve(EXIT_CODES.GENERIC);
    });
    child.on('close', (code, signal) => {
      if (signal !== null) {
        process.stderr.write(`✖ jest 被信号 ${signal} 终止\n`);
        resolve(EXIT_CODES.GENERIC);
        return;
      }
      resolve(code ?? EXIT_CODES.GENERIC);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *                    dry-run 自检
 * ═══════════════════════════════════════════════════════════════════ */

/** 单项检查的产出 */
interface CheckOutcome {
  readonly issues: readonly ValidationIssue[];
  readonly details?: readonly string[];
}

/** 执行单项检查：捕获异常、计时，保证「一项失败不阻断其余项」 */
async function runCheck(
  id: DryRunCheckId,
  title: string,
  fn: () => Promise<CheckOutcome> | CheckOutcome,
): Promise<DryRunCheckResult> {
  const startedAt = Date.now();
  try {
    const outcome = await fn();
    return {
      id,
      title,
      ok: outcome.issues.every((issue) => issue.severity !== 'error'),
      durationMs: Date.now() - startedAt,
      issues: outcome.issues,
      details: outcome.details,
    };
  } catch (error) {
    // 检查项自身崩了也要变成一条 issue，而不是让整个 dry-run 挂掉
    return {
      id,
      title,
      ok: false,
      durationMs: Date.now() - startedAt,
      issues: [{
        code: 'OMNI_E_DRY_RUN_FAILED',
        path: id,
        message: `检查项执行异常：${readErrorMessage(error)}`,
        severity: 'error',
        hint: error instanceof Error ? (error.stack ?? '').split('\n').slice(1, 3).join(' ') : undefined,
      }],
    };
  }
}

/** 生成一条 error issue */
function errorIssue(path: string, message: string, hint?: string): ValidationIssue {
  return { code: 'OMNI_E_DRY_RUN_FAILED', path, message, severity: 'error', hint };
}

/** 生成一条 warning issue */
function warnIssue(path: string, message: string, hint?: string): ValidationIssue {
  return { code: 'OMNI_E_DRY_RUN_FAILED', path, message, severity: 'warning', hint };
}

/* ── 检查 1：env-spec ── */

/** `.env.example` 的 key 集合必须与 ENV_SPEC 逐条一致 */
function checkEnvSpec(): CheckOutcome {
  const issues: ValidationIssue[] = [];
  const examplePath = path.join(getProjectRoot(), '.env.example');

  if (!fs.existsSync(examplePath)) {
    return { issues: [errorIssue('.env.example', '文件不存在', '请从 ENV_SPEC 生成一份样例文件')] };
  }

  const exampleKeys = new Set<string>();
  for (const line of fs.readFileSync(examplePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(trimmed);
    if (match !== null) {
      exampleKeys.add(match[1]);
    }
  }

  const specKeys = new Set(ENV_SPEC_KEYS);

  for (const key of specKeys) {
    if (!exampleKeys.has(key)) {
      issues.push(errorIssue(
        `.env.example:${key}`,
        `ENV_SPEC 声明了 ${key}，但 .env.example 中缺失`,
        '请在 .env.example 中补充该变量（可留空值）',
      ));
    }
  }
  for (const key of exampleKeys) {
    if (!specKeys.has(key)) {
      issues.push(errorIssue(
        `.env.example:${key}`,
        `.env.example 中的 ${key} 未在 ENV_SPEC 中声明`,
        '请在 src/configs/env.config.ts 的 ENV_SPEC 中补充，或从样例文件中删除',
      ));
    }
  }

  return {
    issues,
    details: [`ENV_SPEC ${specKeys.size} 项 · .env.example ${exampleKeys.size} 项`],
  };
}

/* ── 检查 2：config-load ── */

/** resolveRunConfig 必须对各框架的默认合法组合都能产出**冻结**对象 */
function checkConfigLoad(): CheckOutcome {
  const issues: ValidationIssue[] = [];
  const details: string[] = [];

  const samples: readonly { framework: FrameworkKind; platform: Platform; device: DeviceKind }[] = [
    { framework: 'appium', platform: 'ios', device: 'simulator' },
    { framework: 'appium', platform: 'android', device: 'emulator' },
    { framework: 'detox', platform: 'ios', device: 'simulator' },
    { framework: 'xcuitest', platform: 'ios', device: 'simulator' },
  ];

  for (const sample of samples) {
    const label = `${String(sample.framework)}/${sample.platform}/${sample.device}`;
    try {
      const resolved = resolveRunConfig({
        framework: sample.framework,
        app: 'mock',
        platform: sample.platform,
        device: sample.device,
        dryRun: true,
      });
      if (!Object.isFrozen(resolved)) {
        issues.push(errorIssue(
          `resolveRunConfig(${label})`,
          '产出的 ResolvedRunConfig 未被 Object.freeze',
          '契约要求运行配置为不可变真理源，请在 resolveRunConfig 末尾冻结',
        ));
      }
      details.push(`${label} → runId=${resolved.runId} appId=${resolved.appId}`);
    } catch (error) {
      issues.push(errorIssue(
        `resolveRunConfig(${label})`,
        `解析失败：${readErrorMessage(error)}`,
      ));
    }
  }

  // 各配置模块自己的校验也一并纳入
  for (const issue of validateAllConfigs()) {
    issues.push(issue);
  }

  return { issues, details };
}

/* ── 检查 3：combination-matrix ── */

/**
 * 遍历 framework × platform × device × app 全组合，
 * 断言 checkCombination 的判定与能力矩阵完全一致，并校验若干**硬编码的已知非法组合**。
 */
function checkCombinationMatrix(): CheckOutcome {
  const issues: ValidationIssue[] = [];
  let total = 0;
  let legal = 0;

  const appKeys = listAppKeys();

  for (const framework of listFrameworks()) {
    const capability = getCapability(framework);
    if (capability === undefined) {
      issues.push(errorIssue(`capability:${String(framework)}`, '已注册框架缺少能力声明'));
      continue;
    }
    for (const platform of PLATFORMS) {
      for (const device of DEVICE_KINDS) {
        for (const appKey of appKeys) {
          total += 1;
          const app = resolveApp(appKey);

          // 独立于 checkCombination 再算一遍期望值，两边对不上说明矩阵实现有 bug
          const expected =
            capability.platforms.includes(platform)
            && (capability.deviceKinds[platform] ?? []).includes(device)
            && (device !== 'real' || capability.supportsRealDevice)
            && app.supportedPlatforms.includes(platform);

          const actual = checkCombination({
            framework,
            platform,
            deviceKind: device,
            appSupportedPlatforms: app.supportedPlatforms,
            appKey: String(appKey),
          }).ok;

          if (actual) {
            legal += 1;
          }
          if (actual !== expected) {
            issues.push(errorIssue(
              `${String(framework)}/${platform}/${device}/${String(appKey)}`,
              `组合判定与能力矩阵不一致：期望 ${expected ? '合法' : '非法'}，实际 ${actual ? '合法' : '非法'}`,
            ));
          }
        }
      }
    }
  }

  // 硬编码的红线组合：这几条一旦被判为合法，说明 AC-3 已经失守
  const mustBeIllegal: readonly { framework: FrameworkKind; platform: Platform; device: DeviceKind }[] = [
    { framework: 'xcuitest', platform: 'android', device: 'emulator' },
    { framework: 'appium', platform: 'ios', device: 'emulator' },
    { framework: 'appium', platform: 'android', device: 'simulator' },
    { framework: 'detox', platform: 'ios', device: 'real' },
  ];
  for (const combo of mustBeIllegal) {
    const app = resolveApp('mock');
    const result = checkCombination({
      framework: combo.framework,
      platform: combo.platform,
      deviceKind: combo.device,
      appSupportedPlatforms: app.supportedPlatforms,
      appKey: 'mock',
    });
    if (result.ok) {
      issues.push(errorIssue(
        `${String(combo.framework)}/${combo.platform}/${combo.device}`,
        '该组合应被判为非法，实际却通过了校验',
      ));
    }
  }

  return {
    issues,
    details: [`遍历 ${total} 个组合，其中合法 ${legal} 个、非法 ${total - legal} 个；4 条红线组合均被正确拒绝`],
  };
}

/* ── 检查 4：adapter-registry（含框架探测与定位器三框架翻译） ── */

/**
 * 适配器层「无设备可用性」检查，三件事：
 * 1. 注册表白名单完整（内置三框架都在）
 * 2. probeFramework 对未装依赖的框架报告 not-installed 而**不是崩溃**
 * 3. LocatorResolver 能把样例 Locator 真正翻译成三框架的原生选择器（这一步是真跑的）
 */
async function checkAdapterRegistry(): Promise<CheckOutcome> {
  const issues: ValidationIssue[] = [];
  const details: string[] = [];

  const registered = listFrameworks();
  for (const builtin of BUILTIN_FRAMEWORKS) {
    if (!registered.includes(builtin)) {
      issues.push(errorIssue(
        `registry:${builtin}`,
        `内置框架 ${builtin} 未出现在注册表中`,
        '检查 src/factory/AdapterFactory.ts 的 FRAMEWORK_REGISTRY',
      ));
    }
  }
  details.push(`注册表：${registered.map(String).join(' / ')}`);

  // probeFramework 契约上「任何情况下都不抛异常」，未装依赖只应体现为 ok:false
  for (const framework of registered) {
    try {
      const health = await probeFramework(framework);
      const failed = health.checks.filter((check) => !check.ok);
      details.push(
        `probe ${String(framework)}：${health.ok ? '可用' : `不可用（${failed.map((c) => c.name).join(', ')}）`}`,
      );
    } catch (error) {
      issues.push(errorIssue(
        `probe:${String(framework)}`,
        `probeFramework 抛出了异常（契约要求它永不抛错）：${readErrorMessage(error)}`,
      ));
    }
  }

  // ── 定位器三框架翻译（不依赖任何第三方包，必须真跑） ──
  const samples = [
    defineLocator({ testId: 'login-submit', description: '登录提交按钮' }),
    defineLocator({ text: '登录', type: 'button' }),
    defineLocator({ testId: 'cart-item', index: 2 }),
    defineLocator({ label: '购物车', type: 'tab' }),
  ];

  for (const platform of PLATFORMS) {
    for (const sample of samples) {
      const translations = translateAcrossFrameworks(sample, { platform });
      if (translations.length === 0) {
        issues.push(errorIssue(
          `locator/${platform}`,
          `样例定位器在 ${platform} 上没有任何框架可翻译`,
        ));
        continue;
      }
      for (const translation of translations) {
        if (!translation.ok) {
          issues.push(errorIssue(
            `locator/${platform}/${String(translation.framework)}`,
            `声明式定位器翻译失败：${translation.reason ?? '未知原因'}`,
            '纯语义定位器（testId/text/label/type）必须在所有框架上都可表达',
          ));
        }
      }
    }
    details.push(`${platform}: ${samples.length} 个样例定位器全框架翻译通过`);
  }

  // xpath 是 Detox 明确不支持的逃生舱，必须**如实报错**而不是静默降级
  const xpathLocator = defineLocator({ xpath: '//XCUIElementTypeButton[1]' });
  const xpathResults = translateAcrossFrameworks(xpathLocator, { platform: 'ios' });
  const detoxResult = xpathResults.find((item) => item.framework === 'detox');
  if (detoxResult !== undefined && detoxResult.ok) {
    issues.push(errorIssue(
      'locator/detox/xpath',
      'Detox 不支持 xpath，但翻译却成功了（可能被静默降级，违反跨框架等价性承诺）',
    ));
  } else {
    details.push('detox 对 xpath 正确抛出 UnsupportedLocatorError');
  }

  return { issues, details };
}

/* ── 检查 5：typecheck ── */

/** spawn `tsc --noEmit` */
function checkTypecheck(): CheckOutcome {
  const tscBin = path.join(getProjectRoot(), 'node_modules', '.bin', 'tsc');
  if (!fs.existsSync(tscBin)) {
    return { issues: [errorIssue('tsc', '未找到 tsc，请先执行 npm install')] };
  }

  const result = spawnSync(tscBin, ['--noEmit'], {
    cwd: getProjectRoot(),
    encoding: 'utf8',
    // tsc 在大工程上可能跑几十秒，给足时间
    timeout: 300_000,
  });

  if (result.status === 0) {
    return { issues: [], details: ['tsc --noEmit 零错误'] };
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const lines = output.split('\n').filter((line) => line.trim() !== '');
  return {
    issues: [errorIssue(
      'tsc',
      `tsc --noEmit 报告 ${lines.length} 行错误`,
      lines.slice(0, 5).join(' | '),
    )],
    details: lines.slice(0, 20),
  };
}

/* ── 检查 6：structure ── */

/** 期望存在的关键文件清单（硬编码，缺一即失败） */
const EXPECTED_FILES: readonly string[] = [
  'package.json',
  'tsconfig.json',
  '.env.example',
  'src/index.ts',
  'src/contracts/types.ts',
  'src/contracts/IActions.ts',
  'src/contracts/IElementLocator.ts',
  'src/utils/paths.ts',
  'src/utils/logger.ts',
  'src/utils/wait.ts',
  'src/utils/retry.ts',
  'src/utils/lazyImport.ts',
  'src/utils/screenshot.ts',
  'src/setup/testContext.ts',
  'src/setup/globalSetup.ts',
  'src/setup/globalTeardown.ts',
  'src/setup/jestSetupAfterEnv.ts',
  'src/factory/AdapterFactory.ts',
  'src/factory/DriverFactory.ts',
  'src/factory/LocatorResolverFactory.ts',
  'src/configs/index.ts',
  'src/configs/env.config.ts',
  'src/configs/test.config.ts',
  'src/configs/jest/jest.base.config.ts',
  'src/configs/jest/jest.appium.config.ts',
  'src/configs/jest/jest.detox.config.ts',
  'src/configs/jest/jest.xcuitest.config.ts',
  'src/adapters/appium/index.ts',
  'src/adapters/appium/AppiumAdapter.ts',
  'src/adapters/appium/AppiumDriver.ts',
  'src/adapters/appium/AppiumLocatorResolver.ts',
  'src/adapters/detox/index.ts',
  'src/adapters/detox/DetoxAdapter.ts',
  'src/adapters/detox/DetoxDriver.ts',
  'src/adapters/detox/DetoxLocatorResolver.ts',
  'src/adapters/xcuitest/index.ts',
  'src/adapters/xcuitest/XCUITestLocatorResolver.ts',
];

/** 期望存在且非空的目录 */
const EXPECTED_NON_EMPTY_DIRS: readonly string[] = ['apps', 'tests'];

function checkStructure(): CheckOutcome {
  const issues: ValidationIssue[] = [];
  const root = getProjectRoot();
  let present = 0;

  for (const relative of EXPECTED_FILES) {
    if (fs.existsSync(path.join(root, relative))) {
      present += 1;
    } else {
      issues.push(errorIssue(relative, '期望的文件不存在'));
    }
  }

  for (const dir of EXPECTED_NON_EMPTY_DIRS) {
    const files = listTypeScriptFiles(path.join(root, dir));
    if (files.length === 0) {
      issues.push(errorIssue(dir, `目录 ${dir}/ 下没有任何 .ts 文件`));
    }
  }

  return {
    issues,
    details: [`关键文件 ${present}/${EXPECTED_FILES.length} 就位`],
  };
}

/* ── 检查 7：locator-purity ── */

/** 框架专有 **API 调用** 黑名单（在「剥离注释与字符串」后的代码上匹配） */
const FRAMEWORK_API_BLACKLIST: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bby\s*\.\s*(id|text|label|type|traits|accessibilityLabel)\s*\(/g, label: 'Detox by.* 匹配器' },
  { pattern: /(^|[^.\w])element\s*\(/g, label: 'Detox element() 查询' },
  { pattern: /(^|[^\w$])\$\$?\s*\(/g, label: 'WebdriverIO $ / $$ 选择器' },
  { pattern: /\bdriver\s*\.\s*\w/g, label: 'Appium driver 直接访问' },
  { pattern: /\bbrowser\s*\.\s*\w/g, label: 'WebdriverIO browser 直接访问' },
  { pattern: /\bwaitForElementByAccessibilityId\s*\(/g, label: 'Appium 专有等待 API' },
];

/** 框架专有 **选择器字符串 / 导入** 黑名单（在「仅剥离注释」后的代码上匹配，保留字符串） */
const FRAMEWORK_STRING_BLACKLIST: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /from\s*['"](detox|webdriverio|appium|@wdio\/[\w-]+)['"]/g, label: '直接 import 框架 SDK' },
  { pattern: /require\s*\(\s*['"](detox|webdriverio|appium)['"]\s*\)/g, label: '直接 require 框架 SDK' },
  { pattern: /-ios\s+(predicate\s+string|class\s+chain)/g, label: 'Appium iOS 专有选择器策略' },
  { pattern: /-android\s+uiautomator/g, label: 'Appium Android 专有选择器策略' },
  { pattern: /XCUIElementType\w+/g, label: 'XCUITest 原生类名' },
];

/**
 * 扫描 apps/** 与 tests/**，禁止出现框架专有 API / 选择器。
 *
 * 【必须先剥离注释和字符串，否则会误伤】
 * 这些文件里最常见的内容之一，就是**解释「为什么不能这么写」的注释**：
 *   // 禁止：by.id('x') —— 这是 Detox 专有 API
 * 朴素地对原文做正则匹配，会把这条注释判成违规，使用者只能把注释删掉才能过检 ——
 * 检查项反过来惩罚了写文档的人。这是实测踩过的坑，故先剥离再匹配。
 */
function checkLocatorPurity(): CheckOutcome {
  const issues: ValidationIssue[] = [];
  const root = getProjectRoot();
  const files = [
    ...listTypeScriptFiles(path.join(root, 'apps')),
    ...listTypeScriptFiles(path.join(root, 'tests')),
  ];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = toRelativePath(file);
    const withoutComments = stripComments(source);
    const codeOnly = stripCommentsAndStrings(source);

    for (const rule of FRAMEWORK_API_BLACKLIST) {
      for (const line of matchLines(codeOnly, rule.pattern)) {
        issues.push(errorIssue(
          `${relative}:${line.lineNumber}`,
          `出现框架专有写法（${rule.label}）：${line.text}`,
          '资产层与用例层只能通过 @omni 的 getActions()/getDevice() 与声明式 Locator 交互',
        ));
      }
    }
    for (const rule of FRAMEWORK_STRING_BLACKLIST) {
      for (const line of matchLines(withoutComments, rule.pattern)) {
        issues.push(errorIssue(
          `${relative}:${line.lineNumber}`,
          `出现框架专有写法（${rule.label}）：${line.text}`,
          '请改用声明式 Locator（优先 testId），框架差异由 adapters 层消化',
        ));
      }
    }
  }

  return {
    issues,
    details: [`扫描 ${files.length} 个文件（apps/ 与 tests/），黑名单 ${FRAMEWORK_API_BLACKLIST.length + FRAMEWORK_STRING_BLACKLIST.length} 条`],
  };
}

/* ── 检查 8：dependency-direction ── */

/** 分层标识 */
type Layer = 'contracts' | 'utils' | 'configs' | 'adapters' | 'factory' | 'setup' | 'index' | 'apps' | 'tests' | 'external';

/**
 * 各层允许依赖的下游层集合。
 * `external`（node 内置与第三方包）对所有层放行，不在表中列出。
 */
const ALLOWED_DEPENDENCIES: Readonly<Record<Layer, readonly Layer[]>> = {
  contracts: ['contracts'],
  utils: ['contracts', 'utils'],
  configs: ['contracts', 'utils', 'configs'],
  adapters: ['contracts', 'utils', 'configs', 'adapters'],
  factory: ['contracts', 'utils', 'configs', 'adapters', 'factory'],
  setup: ['contracts', 'utils', 'configs', 'adapters', 'factory', 'setup'],
  index: ['contracts', 'utils', 'configs', 'adapters', 'factory', 'setup', 'index'],
  apps: ['index', 'apps'],
  tests: ['index', 'apps', 'tests'],
  external: [],
};

/** 由路径判定所属层 */
function layerOf(relativePath: string): Layer {
  const normalized = relativePath.split(path.sep).join('/');
  if (normalized === 'src/index.ts') return 'index';
  if (normalized.startsWith('src/contracts/')) return 'contracts';
  if (normalized.startsWith('src/utils/')) return 'utils';
  if (normalized.startsWith('src/configs/')) return 'configs';
  if (normalized.startsWith('src/adapters/')) return 'adapters';
  if (normalized.startsWith('src/factory/')) return 'factory';
  if (normalized.startsWith('src/setup/')) return 'setup';
  if (normalized.startsWith('apps/')) return 'apps';
  if (normalized.startsWith('tests/')) return 'tests';
  return 'external';
}

/** 把 import 说明符解析为「层」；无法解析为工程内路径的视为 external */
function resolveSpecifierLayer(specifier: string, fromFile: string): Layer {
  const root = getProjectRoot();

  // tsconfig 路径别名
  if (specifier === '@omni') return 'index';
  const aliasMap: Readonly<Record<string, Layer>> = {
    '@contracts/': 'contracts',
    '@utils/': 'utils',
    '@configs/': 'configs',
    '@adapters/': 'adapters',
    '@factory/': 'factory',
    '@setup/': 'setup',
    '@apps/': 'apps',
  };
  for (const [prefix, layer] of Object.entries(aliasMap)) {
    if (specifier.startsWith(prefix)) {
      return layer;
    }
  }

  if (!specifier.startsWith('.')) {
    return 'external';
  }

  const resolved = path.resolve(path.dirname(fromFile), specifier);
  const relative = path.relative(root, resolved).split(path.sep).join('/');

  // 目录形式的 import（如 '../adapters/appium'）补上 /index.ts 再判定
  const candidate = relative.endsWith('.ts') ? relative : `${relative}/index.ts`;
  const layer = layerOf(candidate);
  if (layer !== 'external') {
    return layer;
  }
  return layerOf(`${relative}.ts`);
}

/** 从源码中抽取全部 import / require 说明符 */
function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns: readonly RegExp[] = [
    /\bimport\s+type\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      specifiers.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return specifiers;
}

/** 扫描全工程 import，禁止反向依赖 */
function checkDependencyDirection(): CheckOutcome {
  const issues: ValidationIssue[] = [];
  const root = getProjectRoot();
  const files = [
    ...listTypeScriptFiles(path.join(root, 'src')),
    ...listTypeScriptFiles(path.join(root, 'apps')),
    ...listTypeScriptFiles(path.join(root, 'tests')),
  ];

  let edges = 0;
  for (const file of files) {
    const relative = toRelativePath(file);
    const fromLayer = layerOf(relative);
    if (fromLayer === 'external') {
      continue;
    }
    const allowed = ALLOWED_DEPENDENCIES[fromLayer];
    const source = stripComments(fs.readFileSync(file, 'utf8'));

    for (const specifier of extractSpecifiers(source)) {
      const toLayer = resolveSpecifierLayer(specifier, file);
      if (toLayer === 'external') {
        continue;
      }
      edges += 1;
      if (!allowed.includes(toLayer)) {
        issues.push(errorIssue(
          relative,
          `${fromLayer} 层不得依赖 ${toLayer} 层（import "${specifier}"）`,
          `${fromLayer} 允许依赖：${allowed.join(' / ') || '（无）'}`,
        ));
      }
    }
  }

  return {
    issues,
    details: [`扫描 ${files.length} 个文件、${edges} 条工程内依赖边`],
  };
}

/* ── 检查 9：artifacts-writable ── */

/** 用**真实写入探针**验证产物目录可写（不用 fs.access，容器/网络卷上有假阳性） */
function checkArtifactsWritable(): CheckOutcome {
  const issues: ValidationIssue[] = [];
  const details: string[] = [];

  const runConfig = resolveRunConfig({
    framework: 'appium',
    app: 'mock',
    platform: 'ios',
    device: 'simulator',
    dryRun: true,
  });
  ensureRunPaths(runConfig.paths);

  const targets: readonly { label: string; dir: string }[] = [
    { label: 'reportsDir', dir: runConfig.paths.reportsDir },
    { label: 'screenshotsDir', dir: runConfig.paths.screenshotsDir },
    { label: 'videosDir', dir: runConfig.paths.videosDir },
    { label: 'runtimeDir', dir: runConfig.paths.runtimeDir },
    { label: 'shardsDir', dir: runConfig.paths.shardsDir },
  ];

  for (const target of targets) {
    if (isWritableDir(target.dir)) {
      details.push(`${target.label} 可写：${toRelativePath(target.dir)}`);
    } else {
      issues.push(errorIssue(
        target.label,
        `目录不可写：${target.dir}`,
        '请检查该路径权限，或通过 OMNI_ARTIFACTS_DIR / --report-dir 指定其它目录',
      ));
    }
  }

  // dry-run 自己制造的运行时目录要顺手清掉，避免 reports/.run 里堆积空壳
  try {
    fs.rmSync(runConfig.paths.runtimeDir, { recursive: true, force: true });
  } catch {
    // 清理失败不影响结论
  }

  return { issues, details };
}

/* ── 检查 10：test-structure ── */

/** 用例层结构规范：必须有 *.spec.ts，且只通过 @omni 取用能力 */
function checkTestStructure(): CheckOutcome {
  const issues: ValidationIssue[] = [];
  const root = getProjectRoot();

  const testFiles = listTypeScriptFiles(path.join(root, 'tests'));
  const specFiles = testFiles.filter((file) => file.endsWith('.spec.ts'));
  const appFiles = listTypeScriptFiles(path.join(root, 'apps'));

  if (specFiles.length === 0) {
    issues.push(errorIssue(
      'tests',
      'tests/ 下没有任何 *.spec.ts 用例文件',
      'jest 的 testMatch 为 **/*.spec.ts，没有用例则整次运行没有意义',
    ));
  }

  for (const file of specFiles) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    const relative = toRelativePath(file);
    const specifiers = extractSpecifiers(source);
    const touchesOmni = specifiers.some(
      (item) => item === '@omni' || item.includes('/index') || item.startsWith('@apps/') || item.startsWith('.'),
    );
    if (!touchesOmni) {
      issues.push(warnIssue(
        relative,
        '用例文件没有从 @omni 或页面对象导入任何能力，可能是空壳用例',
      ));
    }
  }

  return {
    issues,
    details: [`用例文件 ${specFiles.length} 个 · 资产文件 ${appFiles.length} 个`],
  };
}

/* ─────────────── dry-run 主流程 ─────────────── */

/** 顺序执行全部检查项并产出报告 */
async function runDryRun(options: TestRunOptions): Promise<number> {
  process.stdout.write('\n正在执行 dry-run 自检（不连设备、不加载第三方框架）…\n\n');

  const checks: DryRunCheckResult[] = [];
  checks.push(await runCheck('env-spec', '.env.example 与 ENV_SPEC 一致性', checkEnvSpec));
  checks.push(await runCheck('config-load', '配置解析与冻结', checkConfigLoad));
  checks.push(await runCheck('combination-matrix', '组合矩阵判定', checkCombinationMatrix));
  checks.push(await runCheck('adapter-registry', '框架注册表 / 探测 / 定位器翻译', checkAdapterRegistry));
  checks.push(await runCheck('structure', '目录与文件结构', checkStructure));
  checks.push(await runCheck('locator-purity', '资产层与用例层框架纯净度', checkLocatorPurity));
  checks.push(await runCheck('dependency-direction', '分层依赖方向', checkDependencyDirection));
  checks.push(await runCheck('test-structure', '用例结构规范', checkTestStructure));
  checks.push(await runCheck('artifacts-writable', '产物目录可写性', checkArtifactsWritable));
  // typecheck 放最后：它最慢（要起一个 tsc 进程），前面的快检查先给出反馈
  checks.push(await runCheck('typecheck', 'TypeScript 类型检查', checkTypecheck));

  const failed = checks.filter((check) => !check.ok);
  const warnings = checks.reduce(
    (sum, check) => sum + check.issues.filter((issue) => issue.severity === 'warning').length,
    0,
  );

  const typecheckFailed = checks.some((check) => check.id === 'typecheck' && !check.ok);
  const exitCode = failed.length === 0
    ? EXIT_CODES.SUCCESS
    : typecheckFailed && failed.length === 1
      ? EXIT_CODES.TYPECHECK_FAILED
      : EXIT_CODES.DRY_RUN_FAILED;

  const report: DryRunReport = {
    runId: `dryrun-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    ok: failed.length === 0,
    exitCode,
    checks,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      warnings,
    },
  };

  printDryRunReport(report);
  writeDryRunReport(report, options);

  return exitCode;
}

/** 控制台表格输出 */
function printDryRunReport(report: DryRunReport): void {
  const rows = report.checks.map((check) => [
    check.ok ? '✅ PASS' : '❌ FAIL',
    check.id,
    check.title,
    `${check.durationMs}ms`,
  ]);

  process.stdout.write(`${renderTable(['结果', '检查项', '说明', '耗时'], rows, '  ')}\n\n`);

  for (const check of report.checks) {
    if (check.ok && check.issues.length === 0) {
      continue;
    }
    process.stdout.write(`  【${check.id}】${check.title}\n`);
    for (const issue of check.issues) {
      const marker = issue.severity === 'error' ? '✖' : '⚠';
      process.stdout.write(`    ${marker} ${issue.path}: ${issue.message}\n`);
      if (issue.hint !== undefined && issue.hint !== '') {
        process.stdout.write(`      ↳ ${issue.hint}\n`);
      }
    }
    process.stdout.write('\n');
  }

  const { summary } = report;
  process.stdout.write(
    `  汇总：${summary.passed}/${summary.total} 项通过`
    + `${summary.failed > 0 ? ` · ${summary.failed} 项失败` : ''}`
    + `${summary.warnings > 0 ? ` · ${summary.warnings} 条警告` : ''}\n`,
  );
  process.stdout.write(
    report.ok
      ? '  ✅ dry-run 全部通过\n\n'
      : `  ❌ dry-run 未通过（退出码 ${report.exitCode}）\n\n`,
  );
}

/** dry-run 报告落盘 */
function writeDryRunReport(report: DryRunReport, options: TestRunOptions): void {
  try {
    const reportsDir = options.reportDir !== undefined
      ? path.resolve(getProjectRoot(), options.reportDir)
      : path.join(getProjectRoot(), 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const target = path.join(reportsDir, 'dry-run-report.json');
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`  报告已写入 ${toRelativePath(target)}\n\n`);
  } catch (error) {
    process.stderr.write(`  ⚠ dry-run 报告写入失败：${readErrorMessage(error)}\n\n`);
  }
}

/* ─────────────── 文件与文本工具 ─────────────── */

/** 递归列出目录下全部 .ts 文件（跳过 node_modules 与隐藏目录） */
function listTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listTypeScriptFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results.sort();
}

/**
 * 剥离 `//` 与 `/* *\/` 注释，保留字符串与换行。
 * 保留换行是为了让匹配到的行号与原文件一致 —— 报错却给错行号比不报错更糟。
 */
export function stripComments(source: string): string {
  return stripSource(source, false);
}

/** 同时剥离注释与字符串字面量 */
export function stripCommentsAndStrings(source: string): string {
  return stripSource(source, true);
}

/** 注释/字符串剥离状态机；用空格占位保证列号不漂移，换行原样保留 */
function stripSource(source: string, stripStrings: boolean): string {
  type State = 'code' | 'line' | 'block' | 'single' | 'double' | 'template';
  let state: State = 'code';
  let out = '';
  let index = 0;

  const blank = (char: string): string => (char === '\n' ? '\n' : ' ');

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'code') {
      if (char === '/' && next === '/') { state = 'line'; out += '  '; index += 2; continue; }
      if (char === '/' && next === '*') { state = 'block'; out += '  '; index += 2; continue; }
      if (char === "'") { state = 'single'; out += stripStrings ? ' ' : char; index += 1; continue; }
      if (char === '"') { state = 'double'; out += stripStrings ? ' ' : char; index += 1; continue; }
      if (char === '`') { state = 'template'; out += stripStrings ? ' ' : char; index += 1; continue; }
      out += char; index += 1; continue;
    }

    if (state === 'line') {
      if (char === '\n') { state = 'code'; out += '\n'; } else { out += ' '; }
      index += 1; continue;
    }

    if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; out += '  '; index += 2; continue; }
      out += blank(char); index += 1; continue;
    }

    // ── 字符串内部 ──
    if (char === '\\') {
      out += stripStrings ? '  ' : source.slice(index, index + 2);
      index += 2;
      continue;
    }
    const closes =
      (state === 'single' && char === "'")
      || (state === 'double' && char === '"')
      || (state === 'template' && char === '`');
    if (closes) {
      state = 'code';
      out += stripStrings ? ' ' : char;
      index += 1;
      continue;
    }
    out += stripStrings ? blank(char) : char;
    index += 1;
  }

  return out;
}

/** 在文本中匹配正则，返回命中的行号与该行内容 */
function matchLines(source: string, pattern: RegExp): { lineNumber: number; text: string }[] {
  const hits: { lineNumber: number; text: string }[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const local = new RegExp(pattern.source, flags);
    if (local.test(lines[i])) {
      hits.push({ lineNumber: i + 1, text: lines[i].trim().slice(0, 120) });
    }
  }
  return hits;
}

/** 读取 unknown 异常的可读信息 */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ─────────────── CLI 主流程 ─────────────── */

/** 打印非法组合错误 + 完整合法矩阵 */
function printCombinationErrors(options: TestRunOptions, issues: readonly ValidationIssue[]): void {
  process.stderr.write('\n✖ 运行组合非法，已终止（未拉起 jest）\n\n');
  process.stderr.write(
    `  当前组合：framework=${String(options.framework)} platform=${options.platform}`
    + ` device=${options.device} app=${String(options.app)}\n\n`,
  );
  for (const issue of issues) {
    process.stderr.write(`  ✖ ${issue.message}\n`);
    if (issue.hint !== undefined && issue.hint !== '') {
      process.stderr.write(`    ↳ ${issue.hint}\n`);
    }
  }
  process.stderr.write('\n  合法组合矩阵：\n');
  process.stderr.write(`${renderCombinationMatrix()}\n\n`);
  process.stderr.write('  执行 `npx tsx src/index.ts --help` 查看完整用法。\n\n');
}

/** CLI 主函数，返回进程退出码 */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { options, errors } = parseArgs(argv);

  if (options.help === true) {
    process.stdout.write(renderHelp());
    return EXIT_CODES.SUCCESS;
  }
  if (options.version === true) {
    process.stdout.write(`omni-auto-test-e2e ${readVersion()}\n`);
    return EXIT_CODES.SUCCESS;
  }

  if (errors.length > 0) {
    process.stderr.write('\n✖ 参数解析失败\n\n');
    for (const message of errors) {
      process.stderr.write(`  ✖ ${message}\n`);
    }
    process.stderr.write('\n  执行 `npx tsx src/index.ts --help` 查看用法。\n\n');
    return EXIT_CODES.INVALID_ARGS;
  }

  // 组合校验必须在 dry-run 与正式运行**之前**完成（AC-3）
  const combinationIssues = validateRunOptions(options);
  const blocking = combinationIssues.filter((issue) => issue.severity === 'error');
  if (blocking.length > 0) {
    printCombinationErrors(options, blocking);
    return EXIT_CODES.INVALID_ARGS;
  }

  if (options.dryRun) {
    return await runDryRun(options);
  }

  return await runTests(options);
}

/**
 * CLI / barrel 分流。
 * 被 `import` 时 require.main 指向宿主入口（jest 或测试文件），条件不成立，只暴露导出；
 * 被 `tsx src/index.ts` 直接执行时才跑 CLI。
 */
if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      if (isOmniErrorValue(error)) {
        process.stderr.write(`\n✖ [${error.code}] ${error.message}\n`);
        if (error.hint !== undefined && error.hint !== '') {
          process.stderr.write(`  ↳ ${error.hint}\n`);
        }
        const issues = (error.details as { issues?: readonly ValidationIssue[] } | undefined)?.issues;
        if (issues !== undefined) {
          for (const issue of issues) {
            process.stderr.write(`  ✖ ${issue.path}: ${issue.message}\n`);
          }
        }
        process.stderr.write('\n');
      } else {
        // 非 Omni 错误说明是意料之外的缺陷，堆栈是排查的唯一线索，必须完整打印
        process.stderr.write('\n✖ 未预期的错误：\n');
        process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n\n`);
      }
      process.exitCode = toExitCode(error);
    });
}
