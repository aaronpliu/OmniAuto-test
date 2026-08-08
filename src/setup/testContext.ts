import type { IActions, IAdapter, IDeviceActions } from '../contracts/IActions';
import type { ArtifactRef, ILogger, ResolvedRunConfig } from '../contracts/types';
import { AdapterNotInitializedError } from '../contracts/types';
import { createLogger } from '../utils/logger';

/**
 * 运行时上下文单例 —— 「一份脚本跑三端」的落地点。
 *
 * 【本文件为什么禁止 import 任何 adapter / factory 的具体实现】
 * 测试脚本 → `@omni` → testContext 是**每个用例文件都会走**的加载链。
 * 一旦这里静态 import 了 AppiumAdapter，那么跑 detox 时也会把 webdriverio 拉进内存，
 * 包没装就直接 ERR_MODULE_NOT_FOUND —— D-1 惰性导入的全部努力在这一行 import 上前功尽弃。
 * 因此本文件只依赖 contracts（纯类型）与 utils/logger，适配器由 jestSetupAfterEnv 注入。
 *
 * 【为什么 getActions() 返回 Proxy 而不是真实对象】
 * 测试文件的**模块顶层**常见这种写法：
 *     const actions = getActions();            // ← 模块加载期执行
 *     describe('...', () => { it('...', async () => { await actions.tap('btn'); }); });
 * 而 jest 的模块加载发生在 `beforeAll` **之前**，那时 Adapter 还没建。
 * 若返回真实对象，此处必然抛异常，整个用例文件连收集阶段都过不去。
 * 返回惰性 Proxy 后，`getActions()` 在顶层只是拿到一个空壳，
 * 真正解引用（`actions.tap`）发生在用例执行期，此时 Adapter 已就绪。
 */

/** 当前 worker 的运行时上下文 */
export interface TestContext {
  readonly adapter: IAdapter;
  readonly runConfig: ResolvedRunConfig;
  readonly logger: ILogger;
}

/**
 * 进程内单例。
 * jest 每个 worker 是独立子进程，模块状态天然隔离，因此「单例」的作用域就是「一个 worker」，
 * 并发 worker 之间不会互相污染，无需额外加锁。
 */
let currentContext: TestContext | undefined;

/** 本 worker 采集到的产物，afterAll 时随分片报告一起落盘 */
let collectedArtifacts: ArtifactRef[] = [];

/** 未初始化时 getLogger() 的兜底日志器，惰性创建 */
let fallbackLogger: ILogger | undefined;

/* ═══════════════ 生命周期 ═══════════════ */

/** 注入上下文。由 jestSetupAfterEnv 的 beforeAll 调用 */
export function setTestContext(context: TestContext): void {
  currentContext = context;
}

/** 读取上下文；未初始化时抛 AdapterNotInitializedError */
export function getTestContext(): TestContext {
  if (currentContext === undefined) {
    throw new AdapterNotInitializedError('getTestContext');
  }
  return currentContext;
}

/** 清空上下文与产物累积。由 jestSetupAfterEnv 的 afterAll 调用 */
export function clearTestContext(): void {
  currentContext = undefined;
  collectedArtifacts = [];
}

/** 上下文是否已就绪（不抛异常，供条件分支与 dry-run 使用） */
export function hasTestContext(): boolean {
  return currentContext !== undefined;
}

/* ═══════════════ 脚本层的四个能力入口 ═══════════════ */

/**
 * 元素级动作入口。返回惰性代理，可安全地在测试文件模块顶层调用（理由见文件头）。
 */
export function getActions(): IActions {
  return actionsProxy;
}

/**
 * 设备与 App 级能力入口。同样是惰性代理。
 */
export function getDevice(): IDeviceActions {
  return deviceProxy;
}

/**
 * 当前运行配置。
 *
 * 注意这里**不做惰性代理** —— runConfig 是纯数据，脚本常在顶层解构读取字段
 * （`const { platform } = getRunConfig()`），代理会让解构在顶层立刻触发解引用而失败，
 * 反而比直接抛错更难排查。明确抛 AdapterNotInitializedError，提示写在用例内部读取。
 */
export function getRunConfig(): ResolvedRunConfig {
  if (currentContext === undefined) {
    throw new AdapterNotInitializedError('getRunConfig');
  }
  return currentContext.runConfig;
}

/**
 * 当前日志器。
 *
 * 与其它三个入口不同，未初始化时**不抛异常**而是返回一个兜底 logger：
 * 日志经常出现在错误处理路径上（catch 块、afterEach 降级分支），
 * 若 getLogger() 自身会抛，就会把原始异常替换成「上下文未初始化」，掩盖真实故障。
 */
export function getLogger(): ILogger {
  if (currentContext !== undefined) {
    return currentContext.logger;
  }
  if (fallbackLogger === undefined) {
    fallbackLogger = createLogger({ scope: 'omni' });
  }
  return fallbackLogger;
}

/* ═══════════════ 产物登记 ═══════════════ */

/** 登记一份产物（截图 / 视图树 / 视频），afterAll 时写进分片报告 */
export function registerArtifact(artifact: ArtifactRef): void {
  collectedArtifacts.push(artifact);
}

/** 读取本 worker 已登记的全部产物（只读快照） */
export function getArtifacts(): readonly ArtifactRef[] {
  return collectedArtifacts.slice();
}

/** 取出并清空已登记产物，供「按用例归集」的调用方使用 */
export function drainArtifacts(): ArtifactRef[] {
  const drained = collectedArtifacts;
  collectedArtifacts = [];
  return drained;
}

/* ═══════════════ 惰性代理实现 ═══════════════ */

/**
 * 这些属性会被 `await`、`console.log`、jest 的相等断言等宿主机制**主动探测**。
 * 若代理对它们也走「解引用真实 Adapter」的路径，就会在未初始化时抛出令人费解的异常
 * （典型症状：`await getActions()` 卡住或报 AdapterNotInitialized）。
 * 因此统一返回 undefined，让宿主按「普通对象」处理。
 */
const PROBE_PROPERTIES: ReadonlySet<string> = new Set(['then', 'catch', 'finally', 'inspect']);

/**
 * 创建惰性代理。
 *
 * @param accessor 访问器名，用于未初始化时的报错文案
 * @param resolve 真正的解引用函数，只在属性被访问时调用
 */
function createLazyProxy<T extends object>(accessor: string, resolve: () => T): T {
  // 用空对象作为 Proxy target：所有属性都不在 target 上，因而没有
  // 「不可配置属性必须如实返回」的 Proxy 不变量约束，get 陷阱可以自由转发。
  const target = Object.create(null) as T;

  return new Proxy(target, {
    get(_target, property, _receiver): unknown {
      if (typeof property === 'string' && PROBE_PROPERTIES.has(property)) {
        return undefined;
      }
      if (property === Symbol.toStringTag) {
        return `Omni${accessor}`;
      }
      if (typeof property === 'symbol') {
        // Symbol.iterator / util.inspect.custom 之类的宿主探测，一律视为不存在
        return undefined;
      }

      const instance = resolve();
      const value = (instance as Record<string, unknown>)[property];

      // 方法必须绑回真实实例：适配器内部大量使用 this 访问 driver / logger，
      // 不绑定会在第一次 this.driver 时炸成 undefined
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(instance)
        : value;
    },

    has(_target, property): boolean {
      if (typeof property === 'string' && PROBE_PROPERTIES.has(property)) {
        return false;
      }
      return property in (resolve() as object);
    },

    ownKeys(_target): ArrayLike<string | symbol> {
      return Reflect.ownKeys(resolve() as object);
    },

    getOwnPropertyDescriptor(_target, property): PropertyDescriptor | undefined {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve() as object, property);
      if (descriptor === undefined) {
        return undefined;
      }
      // 必须强制 configurable:true。target 是空对象，若如实返回原对象的
      // configurable:false，会触发 Proxy 不变量校验并抛 TypeError。
      return { ...descriptor, configurable: true };
    },

    set(_target, property, value): boolean {
      (resolve() as Record<string | symbol, unknown>)[property] = value;
      return true;
    },
  });
}

/** 解引用当前 Adapter 的 actions */
const actionsProxy: IActions = createLazyProxy<IActions>('Actions', () => {
  if (currentContext === undefined) {
    throw new AdapterNotInitializedError('getActions');
  }
  return currentContext.adapter.actions;
});

/** 解引用当前 Adapter 的 device */
const deviceProxy: IDeviceActions = createLazyProxy<IDeviceActions>('Device', () => {
  if (currentContext === undefined) {
    throw new AdapterNotInitializedError('getDevice');
  }
  return currentContext.adapter.device;
});

/**
 * 直接取用底层适配器。
 * 仅供 setup 层与调试使用（失败截图需要 adapter 实例），**脚本层禁止调用** ——
 * 故意不从 `src/index.ts` 导出，脚本拿不到它，抽象边界才守得住。
 */
export function getAdapter(): IAdapter {
  if (currentContext === undefined) {
    throw new AdapterNotInitializedError('getAdapter');
  }
  return currentContext.adapter;
}

/** 取用底层适配器，未初始化时返回 undefined（不抛异常，供降级路径使用） */
export function tryGetAdapter(): IAdapter | undefined {
  return currentContext?.adapter;
}
