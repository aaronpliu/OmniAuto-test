import type { Config } from 'jest';

import { defaultTestConfig } from '../test.config';
import { getProjectRoot } from '../../utils/paths';

/**
 * Jest 基础配置 —— 三个框架专属配置的共同祖先。
 *
 * 【为什么要有一个 base，而不是三份各写各的】
 * 三个框架真正的差异只有四项：`displayName`、`maxWorkers`、`testTimeout`、`setupFilesAfterEnv` 追加项。
 * 其余（ts-jest 转换、路径别名映射、reporters、覆盖率忽略规则）**必须完全一致** ——
 * 因为本工程的核心承诺是「一份用例零改动跑三个框架」（R-1）。
 * 只要模块解析规则在三份配置里出现一丁点分叉，
 * 就会出现「同一个 import 在 appium 下能解析、在 detox 下报 Cannot find module」的诡异现象，
 * 而这类问题排查成本极高。所以这里用「一个 base + 三个薄覆盖」的结构强制收口。
 *
 * 【为什么 setup 文件只写路径字符串，绝不 import】
 * `globalSetup` / `globalTeardown` / `setupFilesAfterEnv` 由 jest **在另一个模块注册表里**加载：
 *   - globalSetup/Teardown 跑在 jest 主进程；
 *   - setupFilesAfterEnv 跑在每个 worker 的测试沙箱内。
 * 如果本文件直接 `import '../../setup/globalSetup'`，那么：
 *   1. 配置被读取时（此时还没有任何测试环境）就会执行 setup 的模块顶层副作用；
 *   2. 同一模块会被主进程与 worker 各加载一次，模块级单例状态出现两份，
 *      表现为「globalSetup 里存的东西在测试里读不到」。
 * 因此这里只交路径字符串给 jest，由 jest 决定何时、在哪个上下文加载。
 * 这也意味着 `src/setup/*.ts` 尚未落盘时本文件依然能通过类型检查 —— 这是刻意的解耦。
 *
 * 【rootDir 为什么用 getProjectRoot() 而不是 __dirname】
 * 本文件位于 `src/configs/jest/`，用 `__dirname` 需要写 `../../..`，
 * 一旦文件被移动就静默失效（jest 不会报错，只会「找不到任何用例」）。
 * `getProjectRoot()` 通过回溯 package.json 定位，与全工程其它路径解析共用同一套真理源。
 */

/** setup 文件路径（相对工程根）。只作为字符串传给 jest，见文件头说明。 */
export const JEST_SETUP_PATHS = {
  globalSetup: '<rootDir>/src/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/src/setup/globalTeardown.ts',
  setupAfterEnv: '<rootDir>/src/setup/jestSetupAfterEnv.ts',
} as const;

/**
 * 路径别名映射 —— **必须与 tsconfig.json 的 compilerOptions.paths 逐条对齐**。
 *
 * tsc 用 `paths` 解析类型，jest 运行时用 `moduleNameMapper` 解析真实模块。
 * 两者是两套完全独立的机制，谁也不会检查对方，因此漂移只会在运行时暴露：
 * 类型检查全绿，`jest` 一跑就 "Cannot find module '@configs/xxx'"。
 *
 * 注意 `@apps/*` 指向工程根的 `apps/`（tsconfig 中 baseUrl='.'，映射为 `apps/*`），
 * **不是** `src/apps/`。这条最容易抄错。
 *
 * 另注意 `@omni` 是精确匹配（无 `/*`），所以正则用 `^@omni$` 而非前缀匹配 ——
 * 否则 `@omni-something` 也会被错误命中。
 */
export const JEST_MODULE_NAME_MAPPER: Readonly<Record<string, string>> = {
  '^@omni$': '<rootDir>/src/index.ts',
  '^@contracts/(.*)$': '<rootDir>/src/contracts/$1',
  '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  '^@configs/(.*)$': '<rootDir>/src/configs/$1',
  '^@adapters/(.*)$': '<rootDir>/src/adapters/$1',
  '^@factory/(.*)$': '<rootDir>/src/factory/$1',
  '^@setup/(.*)$': '<rootDir>/src/setup/$1',
  '^@apps/(.*)$': '<rootDir>/apps/$1',
};

/**
 * ts-jest transform 配置。
 *
 * 用 `transform` 而不是 `preset: 'ts-jest'`：preset 在 ts-jest 29 中已标记为
 * 「会被 transform 字段整体覆盖」，两者混用时 transform 静默胜出，
 * 让人误以为 preset 生效了。显式写 transform 消除这层歧义。
 *
 * `isolatedModules: true` 的取舍：关闭跨文件类型检查，转译速度提升约 3~5 倍。
 * 类型正确性由独立的 `npm run typecheck`（tsc --noEmit）保证 ——
 * 让 jest 再做一遍全量类型检查是纯粹的重复劳动，而 E2E 的启动时间本就紧张。
 */
export const JEST_TRANSFORM: Readonly<Record<string, unknown>> = {
  '^.+\\.tsx?$': [
    'ts-jest',
    {
      tsconfig: '<rootDir>/tsconfig.json',
      isolatedModules: true,
      diagnostics: false,
    },
  ],
};

/** 基础配置默认值 */
export const JEST_BASE_DEFAULTS = {
  testEnvironment: 'node',
  /** 用例根目录：只扫 tests/，不扫 src/（src 里没有 .spec.ts，扫了纯属浪费） */
  testRoots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  /**
   * 单用例 120s：与 test.config.ts 的 testMs 对齐。
   * jest 默认 5s 对移动端 E2E 完全不可用 —— 光是 App 冷启动就可能超过它。
   */
  testTimeout: defaultTestConfig.timeouts.testMs,
  /**
   * `verbose: false`：逐条打印用例名会与适配器自身的结构化日志交错，
   * 在 CI 的行缓冲输出里变成一团乱麻。执行进度由自定义 reporter 负责。
   */
  verbose: false,
  /**
   * `forceExit: false`：**刻意不开**。
   * forceExit 会掩盖「会话没关干净、子进程还活着」这类真实资源泄漏；
   * 宁可让 jest 挂住并打印 detectOpenHandles 的堆栈，也不要静默地杀进程 ——
   * 那些泄漏在 CI 上会累积成 runner 卡死。
   */
  forceExit: false,
  detectOpenHandles: false,
  /**
   * `watchman: false`：**必须显式关闭，否则 jest 根本起不来**。
   *
   * 【实测现象】不加该项时，三套配置（appium / xcuitest / detox）执行任何命令
   * （哪怕只是 `--listTests`）都会 **exit 137（SIGKILL）且零输出** ——
   * 没有堆栈、没有报错信息，极难定位。
   *
   * 【根因】jest 默认用 watchman 构建 haste map 来扫描文件。本工程根目录下有
   * `node_modules/` 与持续写入的 `reports/`，watchman 在部分 macOS 环境上
   * 递归 crawl 时内存暴涨被 OOM killer 干掉；watchman 一死，jest 主进程随之被杀，
   * 且因为死在 crawl 阶段（还没进入 reporter），连一行日志都来不及输出。
   *
   * 【为什么放配置里而不是让调用方传 --watchman=false】
   * 命令行参数只能救「人手敲的那一次」。Detox 是由 detox CLI 反向拼命令行拉起 jest 的，
   * 我们无法保证它带上这个 flag；CI 脚本、IDE 的 jest 插件同理。
   * 写进配置才能覆盖所有入口。
   *
   * 【代价】关掉后改用 node 自身的文件遍历，本工程 spec 数量在百量级，
   * 启动开销差异可忽略；且 E2E 场景不用 watch mode，watchman 的增量优势本就用不上。
   */
  watchman: false,
} as const;

/** 基础配置构建入参 */
export interface BaseJestConfigOptions {
  readonly displayName?: string;
  readonly maxWorkers?: number | string;
  readonly testTimeout?: number;
  readonly rootDir?: string;
  readonly roots?: readonly string[];
  readonly testMatch?: readonly string[];
  /** 追加到基础 setupFilesAfterEnv 之后的框架专属 setup 文件 */
  readonly extraSetupFilesAfterEnv?: readonly string[];
  readonly testPathPattern?: string;
  readonly bail?: number;
  readonly verbose?: boolean;
  /** 直接覆盖任意 jest 字段（逃生舱） */
  readonly overrides?: Config;
}

/**
 * 构建基础 Jest 配置。
 *
 * @param options 框架专属覆盖项
 */
export function createBaseJestConfig(options: BaseJestConfigOptions = {}): Config {
  const rootDir = options.rootDir ?? getProjectRoot();

  const setupFilesAfterEnv: string[] = [JEST_SETUP_PATHS.setupAfterEnv];
  if (options.extraSetupFilesAfterEnv !== undefined) {
    setupFilesAfterEnv.push(...options.extraSetupFilesAfterEnv);
  }

  const config: Config = {
    rootDir,
    displayName: options.displayName ?? 'omni',
    testEnvironment: JEST_BASE_DEFAULTS.testEnvironment,
    roots: [...(options.roots ?? JEST_BASE_DEFAULTS.testRoots)],
    testMatch: [...(options.testMatch ?? JEST_BASE_DEFAULTS.testMatch)],

    transform: { ...JEST_TRANSFORM } as Config['transform'],
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    moduleNameMapper: { ...JEST_MODULE_NAME_MAPPER },

    // 路径字符串，不 import —— 见文件头说明
    globalSetup: JEST_SETUP_PATHS.globalSetup,
    globalTeardown: JEST_SETUP_PATHS.globalTeardown,
    setupFilesAfterEnv,

    testTimeout: options.testTimeout ?? JEST_BASE_DEFAULTS.testTimeout,
    maxWorkers: options.maxWorkers ?? defaultTestConfig.maxWorkers,
    bail: options.bail ?? defaultTestConfig.bail,
    verbose: options.verbose ?? JEST_BASE_DEFAULTS.verbose,

    forceExit: JEST_BASE_DEFAULTS.forceExit,
    detectOpenHandles: JEST_BASE_DEFAULTS.detectOpenHandles,

    // 关闭 watchman —— 不加会 exit 137 零输出，理由见 JEST_BASE_DEFAULTS.watchman
    watchman: JEST_BASE_DEFAULTS.watchman,

    /**
     * `resetModules: false`：适配器与设备会话是模块级单例，
     * 每个用例都重置模块注册表会导致会话被反复重建 —— 一次重建就是几十秒。
     */
    resetModules: false,
    clearMocks: true,
    restoreMocks: true,

    /**
     * 覆盖率默认关闭：E2E 跑的是**设备上的 App**，
     * Node 侧收集到的覆盖率只反映测试框架自身代码，没有任何参考价值，
     * 反而会拖慢执行并产生误导性的报告。
     */
    collectCoverage: false,

    /**
     * 不监听 reports/：产物目录在运行中持续写入，
     * 被 haste map 扫描会造成明显的启动延迟与偶发的 EMFILE。
     */
    modulePathIgnorePatterns: ['<rootDir>/reports/'],
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/reports/'],

    /** 相对 rootDir 输出路径，让报告可以整体搬运（同 utils/paths#toRelativePath 的理由） */
    cacheDirectory: '<rootDir>/reports/.jest-cache',

    /**
     * `errorOnDeprecated: true`：jest 的废弃 API 在大版本升级时会直接消失，
     * 提前失败比升级当天集体爆炸好。
     */
    errorOnDeprecated: true,
  };

  if (options.testPathPattern !== undefined && options.testPathPattern.trim() !== '') {
    // testPathPattern 在 jest 29 属于 CLI 选项而非配置项，
    // 这里通过 testRegex 之外的 testMatch 无法表达，故保留给上层用 --testPathPattern 透传。
    // 为避免产生「配置里写了却不生效」的错觉，这里显式收窄 roots 而不是伪造字段。
    config.testMatch = [`**/*${options.testPathPattern}*.spec.ts`];
  }

  if (options.overrides !== undefined) {
    return mergeJestConfig(config, options.overrides);
  }

  return config;
}

/**
 * 浅合并两份 jest 配置，但对 `moduleNameMapper` 与 `setupFilesAfterEnv` 做深合并。
 *
 * 为什么这两个字段要特殊处理：
 * 它们是**累加语义**的。框架层想追加一条 setup 文件时，
 * 浅合并会直接把 base 的那条冲掉，导致全局断言扩展静默丢失 ——
 * 表现为「某个自定义 matcher 在 detox 下不存在」。
 */
export function mergeJestConfig(base: Config, patch: Config): Config {
  const merged: Config = { ...base, ...patch };

  if (base.moduleNameMapper !== undefined || patch.moduleNameMapper !== undefined) {
    merged.moduleNameMapper = {
      ...(base.moduleNameMapper ?? {}),
      ...(patch.moduleNameMapper ?? {}),
    };
  }

  if (patch.setupFilesAfterEnv !== undefined) {
    const baseSetup = base.setupFilesAfterEnv ?? [];
    const combined = [...baseSetup, ...patch.setupFilesAfterEnv];
    // 去重：同一个 setup 被加载两次会让 beforeAll 钩子执行两遍
    merged.setupFilesAfterEnv = [...new Set(combined)];
  }

  return merged;
}

/**
 * 校验 moduleNameMapper 与给定的 tsconfig paths 是否一一对应。
 *
 * 供自检脚本与单测调用：传入 `tsconfig.json` 的 `compilerOptions.paths`，
 * 返回缺失/多余的别名列表。空数组表示完全对齐。
 */
export function diffModuleNameMapper(
  tsconfigPaths: Readonly<Record<string, readonly string[]>>,
  mapper: Readonly<Record<string, string>> = JEST_MODULE_NAME_MAPPER,
): { readonly missing: string[]; readonly extra: string[] } {
  /** `@contracts/*` → `^@contracts/(.*)$`；`@omni` → `^@omni$` */
  const toRegexKey = (alias: string): string =>
    alias.endsWith('/*')
      ? `^${alias.slice(0, -2)}/(.*)$`
      : `^${alias}$`;

  const expected = new Set(Object.keys(tsconfigPaths).map(toRegexKey));
  const actual = new Set(Object.keys(mapper));

  const missing = [...expected].filter((key) => !actual.has(key));
  const extra = [...actual].filter((key) => !expected.has(key));

  return { missing, extra };
}

/** 默认导出：直接被 `jest --config src/configs/jest/jest.base.config.ts` 使用 */
const baseJestConfig: Config = createBaseJestConfig();
export default baseJestConfig;
