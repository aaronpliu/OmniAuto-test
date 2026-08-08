import { createRequire } from 'node:module';

import type { FrameworkKind } from '../contracts/types';
import { ERROR_CODES, EXIT_CODES, FrameworkNotInstalledError, OmniError } from '../contracts/types';

/**
 * ESM-safe 真动态导入 —— 决策 D-1 的基础设施。
 *
 * ═══ 为什么需要这个文件（而不是直接写 `await import('webdriverio')`）═══
 *
 * 三个约束叠在一起，逼出了这个看起来很奇怪的实现：
 *
 * 1. **D-1：第三方 SDK 禁止顶层静态 import。**
 *    webdriverio / detox 是 optional peer，本机根本没装。若任何文件顶层 `import 'detox'`，
 *    模块一加载就崩，dry-run（AC-2 要求无依赖也退出码 0）与 tsc 全部失守。
 *
 * 2. **tsconfig `module: CommonJS` 会把 `import()` 语法降级成 `require()`。**
 *    这是 TypeScript 的既定行为，不是 bug。于是即便写了 `await import('webdriverio')`，
 *    编译产物也是 `require('webdriverio')`。
 *
 * 3. **webdriverio v9 是 ESM-only。**
 *    用 require 加载 ESM 包，Node 直接抛 `ERR_REQUIRE_ESM`，且这个错误无法通过 try/catch 恢复成可用模块。
 *
 * 结论：必须让 `import()` 以「TypeScript 看不见、因而无法降级」的形式活到运行时。
 * `new Function('m', 'return import(m)')` 正是这个逃生舱 —— 函数体是字符串，
 * 编译器不会解析其中的 `import`，Node 在运行时按真正的动态 import 语义执行它。
 *
 * ⚠ 维护须知：这行代码看着像可以被「优化」掉，实际上不能。任何把它改回
 * `await import(packageName)` 的重构都会在 webdriverio v9 上以 ERR_REQUIRE_ESM 立即失败。
 */

/**
 * 真动态导入器。
 * 用 Function 构造器包裹，使 `import` 以字符串形态存在，绕开 TS 的 CommonJS 降级（见文件头）。
 */
const dynamicImport = new Function('specifier', 'return import(specifier);') as (
  specifier: string,
) => Promise<unknown>;

/**
 * 独立于打包器 / jest 模块注册表的 require，专供 `require.resolve` 探测使用。
 * 直接用全局 `require.resolve` 会被 jest 的模块注册表接管，在 worker 中给出与真实文件系统
 * 不一致的结论，导致 dry-run 的依赖探测结果不可信。
 */
const nodeRequire = createRequire(__filename);

/**
 * 已成功加载的模块缓存。
 * 动态 import 本身有 Node 层缓存，但每次调用仍需走一遍 Promise 与 interop 包装；
 * Driver 的每个动作都可能触碰 SDK，这里缓存一层可省掉重复开销。
 * 失败**不缓存** —— 允许使用者装好依赖后在同一进程内重试。
 */
const moduleCache = new Map<string, unknown>();

/** Node 在「模块找不到」时可能使用的错误码集合 */
const MODULE_NOT_FOUND_CODES: ReadonlySet<string> = new Set([
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
]);

/** 读取 unknown 异常上的 code 字段，不做类型断言兜底 */
function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** 读取 unknown 异常上的 message 字段 */
function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 判断异常是否为「目标包本身没装」。
 *
 * 【为什么不能只看 error.code】
 * 包**自身的依赖**缺失时，Node 抛出的同样是 MODULE_NOT_FOUND。若不加区分，
 * 一个 detox 安装损坏的现场会被报成「detox 未安装」，使用者照提示重装一遍仍然失败，
 * 排查方向被彻底带偏。因此这里额外要求错误信息中确实提到了目标包名，
 * 否则归类为「模块加载失败」，走 OmniError 分支并保留原始 cause。
 */
function isPackageMissingError(error: unknown, packageName: string): boolean {
  const code = readErrorCode(error);
  if (code === undefined || !MODULE_NOT_FOUND_CODES.has(code)) {
    return false;
  }
  const message = readErrorMessage(error);
  return message.includes(`'${packageName}'`)
    || message.includes(`"${packageName}"`)
    || message.includes(` ${packageName} `)
    || message.includes(`/${packageName}/`);
}

/**
 * CJS / ESM 双形态互操作。
 *
 * 三种现实情况：
 * - **纯 ESM 包**（webdriverio v9）：命名空间上直接就是 `remote` 等具名导出，无 default → 原样返回。
 * - **纯 CJS 包**（detox）：Node 把 `module.exports` 挂在 `default` 上 → 返回 default。
 * - **两者兼有**：`default` 是主体对象，同时 cjs-module-lexer 探测出的具名导出也挂在命名空间上。
 *   此时既不能只返回 default（丢具名导出），也不能展开合并（default 可能是函数，
 *   展开会丢掉可调用性与原型链）。用 Proxy 做「default 优先、命名空间兜底」的读取代理，
 *   是唯一能同时保住可调用性、原型链与全部导出的方案。
 */
function interopModule<T>(namespace: unknown): T {
  if (typeof namespace !== 'object' || namespace === null) {
    return namespace as T;
  }

  const ns = namespace as Record<string, unknown>;
  const defaultExport = ns['default'];

  if (defaultExport === undefined || defaultExport === null) {
    return namespace as T;
  }
  if (typeof defaultExport !== 'object' && typeof defaultExport !== 'function') {
    return namespace as T;
  }

  const namedKeys = Object.keys(ns).filter((key) => key !== 'default' && key !== '__esModule');
  if (namedKeys.length === 0) {
    return defaultExport as T;
  }

  return new Proxy(defaultExport as object, {
    get(target, property, receiver): unknown {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      return typeof property === 'string' ? ns[property] : undefined;
    },
    has(target, property): boolean {
      return Reflect.has(target, property)
        || (typeof property === 'string' && property in ns);
    },
  }) as T;
}

/**
 * 惰性加载第三方框架 SDK。
 *
 * @typeParam T 调用方在自己文件内声明的「最小结构化类型」（见 ARCHITECTURE.md §9.7）。
 *   ⚠ 绝不要传第三方包的真实类型 —— 那需要顶层 `import type ... from 'detox'`，
 *   包没装时 tsc 立刻报错，D-1 与 AC-1 同时失守。
 * @param packageName npm 包名，如 'webdriverio'
 * @param framework 归属框架，仅用于错误信息归因；缺省时报为 'unknown'
 * @throws FrameworkNotInstalledError 包未安装（exit 6，语义化，绝不让 MODULE_NOT_FOUND 裸奔到上层）
 * @throws OmniError 包已安装但加载过程本身报错（如自身依赖缺失、语法错误、副作用抛异常）
 */
export async function lazyImport<T>(packageName: string, framework?: FrameworkKind): Promise<T> {
  const cached = moduleCache.get(packageName);
  if (cached !== undefined) {
    return cached as T;
  }

  let namespace: unknown;
  try {
    namespace = await dynamicImport(packageName);
  } catch (error) {
    if (isPackageMissingError(error, packageName)) {
      throw new FrameworkNotInstalledError(framework ?? 'unknown', packageName, error);
    }
    throw new OmniError(
      ERROR_CODES.FRAMEWORK_NOT_INSTALLED,
      `依赖包 "${packageName}" 已安装但加载失败：${readErrorMessage(error)}`,
      {
        exitCode: EXIT_CODES.FRAMEWORK_MISSING,
        cause: error,
        details: { packageName, framework, errorCode: readErrorCode(error) },
        hint:
          '这不是「包未安装」，而是包本身加载出错（常见于其自身依赖缺失、版本不兼容或 ESM/CJS 互操作问题）。'
          + `请先执行 npm ls ${packageName} 确认安装完整性`,
      },
    );
  }

  const resolved = interopModule<T>(namespace);
  moduleCache.set(packageName, resolved);
  return resolved;
}

/**
 * 只探测存在性，**不执行**模块（dry-run 用）。
 *
 * 用 `require.resolve` 而非 `import()`：前者只做路径解析，不会触发模块顶层副作用
 * （detox 顶层会读取 .detoxrc、webdriverio 会初始化日志器）。dry-run 需要在
 * 「零副作用」的前提下回答「这个包在不在」，因此必须走 resolve 而不是真加载。
 *
 * ⚠ 对 ESM-only 包同样有效：`require.resolve` 只查 package.json 的入口字段与文件是否存在，
 * 不会因为目标是 ESM 而抛 ERR_REQUIRE_ESM（那是 `require()` 才会做的事）。
 */
export function isPackageAvailable(packageName: string): boolean {
  return resolvePackagePath(packageName) !== undefined;
}

/**
 * 解析包的入口文件绝对路径，未安装时返回 undefined。
 * 供 dry-run 报告展示「依赖装在哪个 node_modules」，便于排查 monorepo 提升导致的版本歧义。
 */
export function resolvePackagePath(packageName: string): string | undefined {
  try {
    return nodeRequire.resolve(packageName);
  } catch {
    // 解析失败的唯一有意义结论就是「不可用」，无需区分具体原因
    return undefined;
  }
}

/**
 * 清空模块缓存。
 * 供单测在同一进程内切换 mock 实现使用；生产路径不应调用。
 */
export function clearLazyImportCache(): void {
  moduleCache.clear();
}
