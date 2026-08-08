import type { FrameworkKind, Platform } from './types';

/**
 * 声明式定位器契约（C-01）。
 * 核心原则：Locator 只描述「找什么」，绝不描述「怎么找」。
 * 任何框架专有选择器语法（by.id / -ios predicate / XCUIElementQuery）
 * 只允许出现在 adapters/<fw>/*LocatorResolver.ts 内部。
 *
 * 【为什么必须是「描述」而不是「选择器字符串」】
 * 如果契约层直接存放 xpath 或 by.id 字符串，脚本就与框架绑死了 —— 换框架必须重写全部 Locator，
 * AC-6「新增框架时资产层零改动」直接破产。把「找什么」（testId / text / type）与
 * 「怎么找」（各框架选择器语法）分离，翻译成本就被收敛到每框架一个纯函数 Resolver 里。
 */

/** 框架无关的语义元素类型；由各 Resolver 映射为原生类名 */
export type ElementType =
  | 'button'
  | 'text'
  | 'input'
  | 'image'
  | 'switch'
  | 'checkbox'
  | 'slider'
  | 'link'
  | 'scrollView'
  | 'list'
  | 'cell'
  | 'tab'
  | 'alert'
  | 'webView'
  | 'other';

/**
 * 声明式定位器描述。
 * 多字段同时出现时语义为 **AND**（各 Resolver 需能表达组合，
 * 无法表达时抛 UnsupportedLocatorError，不允许静默降级）。
 */
export interface LocatorDescriptor {
  /** 首选策略：跨平台测试标识（iOS accessibilityIdentifier / Android content-desc 或 resource-id） */
  readonly testId?: string;
  /** 无障碍标识（部分 App 与 testId 不同源时使用） */
  readonly accessibilityId?: string;
  /** 可见文本 */
  readonly text?: string;
  /** 无障碍标签（iOS label / Android contentDescription） */
  readonly label?: string;
  /** 语义元素类型 */
  readonly type?: ElementType;
  /** 原生 id（Android resource-id 短名 / iOS name），慎用 */
  readonly id?: string;
  /** 逃生舱：xpath。仅 Appium / XCUITest 支持，Detox 会抛 UnsupportedLocatorError */
  readonly xpath?: string;
  /** 多命中时取第 index 个（0-based） */
  readonly index?: number;
  /** 文本类字段的匹配模式，默认 'exact' */
  readonly match?: TextMatchModeLite;
  /** 祖先约束：本元素必须位于 ancestor 之内 */
  readonly ancestor?: LocatorDescriptor;
  /** 后代约束：本元素必须包含 descendant */
  readonly descendant?: LocatorDescriptor;
  /** 平台差异覆盖；解析时按当前 platform 深度合并覆盖本对象同名字段 */
  readonly platform?: Readonly<Partial<Record<Platform, Omit<LocatorDescriptor, 'platform'>>>>;
  /** 人类可读描述，用于日志、报错与截图命名 */
  readonly description?: string;
}

/** 与 types.ts 的 TextMatchMode 保持一致，此处独立声明避免循环引用歧义 */
export type TextMatchModeLite = 'exact' | 'contains' | 'startsWith' | 'regex';

/** 字符串简写等价于 `{ testId: value }`，提升脚本可读性 */
export type LocatorLike = LocatorDescriptor | string;

/**
 * Resolver 的输出：框架原生选择器的统一封装。
 * - using/value 供「字符串型选择器」框架（Appium）使用；
 * - raw 供「对象型 matcher」框架（Detox）使用；
 * - query 供「自定义桥接 DSL」框架（XCUITest）使用。
 */
export interface NativeSelector {
  readonly framework: FrameworkKind;
  readonly platform: Platform;
  /** 选择器策略名，如 'accessibility id' | '-ios class chain' | 'xpath' | 'detox-matcher' | 'bridge-query' */
  readonly using: string;
  /** 序列化后的选择器字符串（对象型框架填人类可读摘要） */
  readonly value: string;
  /** 多命中时的下标 */
  readonly index?: number;
  /** 框架原生对象（Detox matcher / XCUITest BridgeQuery），类型对上层不透明 */
  readonly raw?: unknown;
  /** 日志与报错用的可读描述 */
  readonly description: string;
}

/** 定位器解析器契约。实现必须是**纯函数**（无 I/O、无状态、可直接单测）。 */
export interface ILocatorResolver {
  readonly framework: FrameworkKind;
  readonly platform: Platform;

  /**
   * 将声明式定位器翻译为原生选择器。
   * @throws UnsupportedLocatorError 当前框架无法表达该定位语义时
   */
  resolve(locator: LocatorLike): NativeSelector;

  /** 预检：是否可翻译（dry-run 与条件分支使用，不抛异常） */
  supports(locator: LocatorLike): boolean;

  /** 生成可读描述（日志 / 截图命名 / 报错） */
  describe(locator: LocatorLike): string;

  /** 语义元素类型 → 当前平台原生类名，如 'button' → 'XCUIElementTypeButton' */
  mapElementType(type: ElementType): string;
}

/* ─────────── 契约层提供的纯辅助函数（无框架依赖） ─────────── */

/**
 * 身份函数 + 类型收窄，供资产层声明 Locator 时获得完整补全与 readonly 约束。
 *
 * 运行时是彻底的空操作，价值全在类型层：`const T` 修饰符让 TS 把传入的对象字面量
 * 按最窄的字面量类型推断（`type: 'button'` 而非 `type: string`），
 * 从而在 IDE 中获得字段补全，并让拼错的字段名在编译期就报错。
 */
export function defineLocator<const T extends LocatorDescriptor>(locator: T): T {
  return locator;
}

/** 批量声明一个页面的 Locator 集合 */
export function defineLocators<const T extends Record<string, LocatorDescriptor>>(locators: T): T {
  return locators;
}

/** 字符串简写归一化为 LocatorDescriptor */
export function normalizeLocator(locator: LocatorLike): LocatorDescriptor {
  if (typeof locator === 'string') {
    return { testId: locator, description: locator };
  }
  return locator;
}

/**
 * 按平台展开 platform 覆盖字段，返回扁平化后的描述（Resolver 内部第一步必须调用）。
 *
 * 【为什么这一步必须前置】
 * 各 Resolver 的翻译逻辑只应关心「扁平的一组约束」。若把平台分支散落进翻译代码，
 * 每新增一个平台差异都要改三个 Resolver。集中在此处展开后，Resolver 保持纯粹的单平台翻译器。
 *
 * 合并规则：
 * - 覆盖块中值为 `undefined` 的字段**不覆盖**基础字段（区别于 `{...base, ...override}` 的朴素展开，
 *   后者会把显式 undefined 写进去，导致基础层的 testId 被意外抹掉）；
 * - `ancestor` / `descendant` 递归展开，保证嵌套约束同样完成平台适配。
 */
export function flattenForPlatform(
  locator: LocatorLike,
  platform: Platform,
): Omit<LocatorDescriptor, 'platform'> {
  const descriptor = normalizeLocator(locator);
  const { platform: platformOverrides, ...base } = descriptor;

  const flattened: Record<string, unknown> = { ...base };

  const override = platformOverrides?.[platform];
  if (override !== undefined) {
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) {
        flattened[key] = value;
      }
    }
  }

  if (base.ancestor !== undefined || override?.ancestor !== undefined) {
    const ancestor = (override?.ancestor ?? base.ancestor) as LocatorDescriptor;
    flattened['ancestor'] = flattenForPlatform(ancestor, platform);
  }
  if (base.descendant !== undefined || override?.descendant !== undefined) {
    const descendant = (override?.descendant ?? base.descendant) as LocatorDescriptor;
    flattened['descendant'] = flattenForPlatform(descendant, platform);
  }

  return flattened as Omit<LocatorDescriptor, 'platform'>;
}

/**
 * 生成稳定的可读描述，缺省时由字段自动拼装。
 *
 * 「稳定」很重要：该描述会进入截图文件名与失败报告，若同一 Locator 每次生成的描述不同，
 * 报告里就无法按元素聚合失败次数。因此拼装顺序固定，不依赖对象键的枚举顺序。
 */
export function describeLocator(locator: LocatorLike): string {
  const descriptor = normalizeLocator(locator);
  if (descriptor.description !== undefined && descriptor.description !== '') {
    return descriptor.description;
  }

  const parts: string[] = [];
  if (descriptor.testId !== undefined) parts.push(`testId=${descriptor.testId}`);
  if (descriptor.accessibilityId !== undefined) parts.push(`a11yId=${descriptor.accessibilityId}`);
  if (descriptor.id !== undefined) parts.push(`id=${descriptor.id}`);
  if (descriptor.text !== undefined) parts.push(`text=${descriptor.text}`);
  if (descriptor.label !== undefined) parts.push(`label=${descriptor.label}`);
  if (descriptor.type !== undefined) parts.push(`type=${descriptor.type}`);
  if (descriptor.xpath !== undefined) parts.push(`xpath=${descriptor.xpath}`);
  if (descriptor.match !== undefined && descriptor.match !== 'exact') {
    parts.push(`match=${descriptor.match}`);
  }
  if (descriptor.index !== undefined) parts.push(`index=${descriptor.index}`);
  if (descriptor.ancestor !== undefined) {
    parts.push(`ancestor(${describeLocator(descriptor.ancestor)})`);
  }
  if (descriptor.descendant !== undefined) {
    parts.push(`descendant(${describeLocator(descriptor.descendant)})`);
  }

  return parts.length > 0 ? parts.join(' & ') : '<empty-locator>';
}
