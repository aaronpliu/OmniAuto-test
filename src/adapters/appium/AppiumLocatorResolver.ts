import type { AppConfig, FrameworkKind, Platform } from '../../contracts/types';
import { UnsupportedLocatorError } from '../../contracts/types';
import type {
  ElementType,
  ILocatorResolver,
  LocatorDescriptor,
  LocatorLike,
  NativeSelector,
  TextMatchModeLite,
} from '../../contracts/IElementLocator';
import { describeLocator, flattenForPlatform } from '../../contracts/IElementLocator';

/**
 * Appium 定位器翻译器 —— 把声明式 `LocatorDescriptor` 翻译为 W3C `using` + `value`。
 *
 * 【纯函数约束】
 * 本文件**不 import 任何第三方 SDK、不做任何 I/O、不持有可变状态**。
 * 这是它能在「没有设备、没装 webdriverio」的机器上被单测与 dry-run 直接调用的前提，
 * 也是 LocatorResolverFactory 允许静态 import 三个 Resolver 的理由（见 factory/LocatorResolverFactory.ts）。
 *
 * 【策略选择顺序】（同一语义优先选「最快 + 最稳」的原生策略）
 *   1. xpath 逃生舱      → 'xpath'（要求 xpath 是唯一选择性字段，否则抛错而非静默忽略其它字段）
 *   2. 含 ancestor/descendant 的组合
 *        iOS     → '-ios class chain'（`/**​/` 表祖先链，`[$...$]` 表「包含某后代」）
 *        Android → '-android uiautomator' 的 `.childSelector()`（祖先）
 *                  / 'xpath'（后代约束，UiSelector 无法表达「父找子再回到父」）
 *   3. 单一简单字段且 match=exact → 'accessibility id' / 'id' / 'class name'（原生最快路径）
 *   4. 其余组合
 *        iOS     → '-ios predicate string'
 *        Android → '-android uiautomator'
 *
 * 【为什么 index 不写进选择器】
 * iOS predicate 无 instance 概念、UiSelector 的 `.instance()` 与 xpath 的 `[n]` 下标基准还不一致
 * （前者 0-based、后者 1-based）。把 index 统一留在 `NativeSelector.index` 上，
 * 由 Driver 用 findElements + 数组下标处理，三条路径行为才真正一致。
 */

/** 展开平台覆盖后的扁平定位器 */
type FlatLocator = Omit<LocatorDescriptor, 'platform'>;

/** testId 属性名配置（取自 AppConfig.testIdAttribute，避免 Resolver 反向依赖 configs 层） */
export type TestIdAttributeConfig = AppConfig['testIdAttribute'];

export interface AppiumLocatorResolverOptions {
  readonly platform: Platform;
  /** 来自 `ResolvedRunConfig.app.testIdAttribute`，决定 testId 落到哪个原生属性 */
  readonly testIdAttribute?: TestIdAttributeConfig;
}

/** iOS 默认：RN 的 testID → accessibilityIdentifier，在 XCUITest 谓词里体现为 `name` */
const DEFAULT_IOS_TESTID_ATTRIBUTE = 'accessibilityIdentifier';
/** Android 默认：RN 的 testID → content-desc（部分原生 App 用 resource-id） */
const DEFAULT_ANDROID_TESTID_ATTRIBUTE = 'content-desc';

/** 语义类型 → iOS XCUIElementType */
const IOS_TYPE_MAP: Readonly<Record<ElementType, string>> = {
  button: 'XCUIElementTypeButton',
  text: 'XCUIElementTypeStaticText',
  input: 'XCUIElementTypeTextField',
  image: 'XCUIElementTypeImage',
  switch: 'XCUIElementTypeSwitch',
  checkbox: 'XCUIElementTypeSwitch',
  slider: 'XCUIElementTypeSlider',
  link: 'XCUIElementTypeLink',
  scrollView: 'XCUIElementTypeScrollView',
  list: 'XCUIElementTypeTable',
  cell: 'XCUIElementTypeCell',
  tab: 'XCUIElementTypeButton',
  alert: 'XCUIElementTypeAlert',
  webView: 'XCUIElementTypeWebView',
  other: 'XCUIElementTypeOther',
};

/** 语义类型 → Android 控件类名 */
const ANDROID_TYPE_MAP: Readonly<Record<ElementType, string>> = {
  button: 'android.widget.Button',
  text: 'android.widget.TextView',
  input: 'android.widget.EditText',
  image: 'android.widget.ImageView',
  switch: 'android.widget.Switch',
  checkbox: 'android.widget.CheckBox',
  slider: 'android.widget.SeekBar',
  link: 'android.widget.TextView',
  scrollView: 'android.widget.ScrollView',
  list: 'androidx.recyclerview.widget.RecyclerView',
  cell: 'android.view.ViewGroup',
  tab: 'android.widget.TabWidget',
  alert: 'android.app.AlertDialog',
  webView: 'android.webkit.WebView',
  other: 'android.view.View',
};

/** NSPredicate / class chain 字符串字面量转义 */
function escapeNsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Java 源码字符串字面量转义（UiSelector 的入参是 Java 表达式文本） */
function escapeJavaString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/** XPath 1.0 字符串字面量：无转义语法，含单双引号时须用 concat() 拼装 */
function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  const parts = value.split("'").map((segment) => `'${segment}'`);
  return `concat(${parts.join(`, "'", `)})`;
}

/** 正则元字符转义，用于把「短 id」放宽成 `.*:id/<name>$` 的匹配 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 判断定位器是否完全没有可用于筛选的字段 */
function hasNoConstraint(flat: FlatLocator): boolean {
  return flat.testId === undefined
    && flat.accessibilityId === undefined
    && flat.text === undefined
    && flat.label === undefined
    && flat.type === undefined
    && flat.id === undefined
    && flat.xpath === undefined
    && flat.ancestor === undefined
    && flat.descendant === undefined;
}

/** 统计「选择性字段」个数（不含 index / description / 关系约束） */
function countAttributeFields(flat: FlatLocator): number {
  let total = 0;
  if (flat.testId !== undefined) total += 1;
  if (flat.accessibilityId !== undefined) total += 1;
  if (flat.text !== undefined) total += 1;
  if (flat.label !== undefined) total += 1;
  if (flat.type !== undefined) total += 1;
  if (flat.id !== undefined) total += 1;
  return total;
}

export class AppiumLocatorResolver implements ILocatorResolver {
  readonly framework: FrameworkKind = 'appium';
  readonly platform: Platform;

  private readonly iosTestIdAttribute: string;
  private readonly androidTestIdAttribute: string;

  constructor(options: AppiumLocatorResolverOptions) {
    this.platform = options.platform;
    this.iosTestIdAttribute = options.testIdAttribute?.ios ?? DEFAULT_IOS_TESTID_ATTRIBUTE;
    this.androidTestIdAttribute = options.testIdAttribute?.android ?? DEFAULT_ANDROID_TESTID_ATTRIBUTE;
  }

  /** 语义元素类型 → 当前平台原生类名 */
  mapElementType(type: ElementType): string {
    return this.platform === 'ios' ? IOS_TYPE_MAP[type] : ANDROID_TYPE_MAP[type];
  }

  describe(locator: LocatorLike): string {
    return describeLocator(locator);
  }

  supports(locator: LocatorLike): boolean {
    try {
      this.resolve(locator);
      return true;
    } catch {
      // supports() 的契约是「不抛异常的预检」，任何翻译失败都归结为「不支持」
      return false;
    }
  }

  resolve(locator: LocatorLike): NativeSelector {
    const flat = flattenForPlatform(locator, this.platform);
    const description = describeLocator(locator);

    if (hasNoConstraint(flat)) {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        '定位器没有任何可用于筛选的字段（testId / text / label / type / id / xpath 至少需要一个）',
      );
    }

    const fragment = this.buildFragment(flat, description);

    return {
      framework: this.framework,
      platform: this.platform,
      using: fragment.using,
      value: fragment.value,
      index: flat.index,
      raw: { using: fragment.using, value: fragment.value },
      description,
    };
  }

  /* ─────────── 内部：策略选择 ─────────── */

  private buildFragment(
    flat: FlatLocator,
    description: string,
  ): { using: string; value: string } {
    // 1) xpath 逃生舱
    if (flat.xpath !== undefined) {
      if (countAttributeFields(flat) > 0 || flat.ancestor !== undefined || flat.descendant !== undefined) {
        throw new UnsupportedLocatorError(
          this.framework,
          description,
          'xpath 是逃生舱，不能与 testId / text / type / ancestor 等字段混用；'
          + '混用时无法保证 AND 语义，静默忽略其余字段会造成定位到错误元素',
        );
      }
      return { using: 'xpath', value: flat.xpath };
    }

    // 2) 关系约束（ancestor / descendant）
    if (flat.ancestor !== undefined || flat.descendant !== undefined) {
      return this.platform === 'ios'
        ? { using: '-ios class chain', value: this.buildIosClassChain(flat, description) }
        : this.buildAndroidRelational(flat, description);
    }

    // 3) 单字段快路径
    const fast = this.tryFastPath(flat);
    if (fast !== undefined) {
      return fast;
    }

    // 4) 组合表达式
    return this.platform === 'ios'
      ? { using: '-ios predicate string', value: this.buildIosPredicate(flat, description) }
      : { using: '-android uiautomator', value: this.buildAndroidUiSelector(flat, description) };
  }

  /**
   * 单一字段 + exact 匹配时，直连原生最快策略。
   * 这条路径的价值不只是性能：'accessibility id' / 'id' 在 Appium 侧走的是原生查询 API，
   * 而 predicate / uiautomator / xpath 都需要遍历视图树，在长列表页面差距可达数秒。
   */
  private tryFastPath(flat: FlatLocator): { using: string; value: string } | undefined {
    const fieldCount = countAttributeFields(flat);
    if (fieldCount !== 1) {
      return undefined;
    }
    const mode: TextMatchModeLite = flat.match ?? 'exact';

    if (flat.type !== undefined) {
      return { using: 'class name', value: this.mapElementType(flat.type) };
    }

    if (mode !== 'exact') {
      // 非精确匹配一律交给 predicate / uiautomator 处理
      return undefined;
    }

    if (flat.accessibilityId !== undefined) {
      return { using: 'accessibility id', value: flat.accessibilityId };
    }

    if (flat.testId !== undefined) {
      if (this.platform === 'ios') {
        // accessibilityIdentifier 在 Appium iOS 上等价于 'accessibility id'
        return this.iosTestIdAttribute === DEFAULT_IOS_TESTID_ATTRIBUTE
          ? { using: 'accessibility id', value: flat.testId }
          : undefined;
      }
      if (this.androidTestIdAttribute === 'resource-id') {
        return { using: 'id', value: flat.testId };
      }
      if (this.androidTestIdAttribute === DEFAULT_ANDROID_TESTID_ATTRIBUTE) {
        return { using: 'accessibility id', value: flat.testId };
      }
      return undefined;
    }

    if (flat.id !== undefined && this.platform === 'android' && flat.id.includes('/')) {
      // 完整 resource-id（pkg:id/name）才走原生 id 策略；短名交给 resourceIdMatches 放宽
      return { using: 'id', value: flat.id };
    }

    return undefined;
  }

  /* ─────────── iOS：NSPredicate ─────────── */

  /** 生成单个属性的谓词子句 */
  private iosClause(attribute: string, mode: TextMatchModeLite, value: string): string {
    const literal = `"${escapeNsString(value)}"`;
    switch (mode) {
      case 'contains':
        return `${attribute} CONTAINS ${literal}`;
      case 'startsWith':
        return `${attribute} BEGINSWITH ${literal}`;
      case 'regex':
        return `${attribute} MATCHES ${literal}`;
      case 'exact':
      default:
        return `${attribute} == ${literal}`;
    }
  }

  /**
   * 把扁平定位器翻译为 NSPredicate 子句数组。
   * `text` 展开为 label/value/name 三选一的 OR 组：iOS 上「可见文本」在不同控件里
   * 分别落在这三个属性上（StaticText → label、TextField → value、Button → label/name），
   * 只查其一会漏掉大量元素。
   */
  private iosClauses(flat: FlatLocator, description: string): string[] {
    const mode: TextMatchModeLite = flat.match ?? 'exact';
    const clauses: string[] = [];

    if (flat.type !== undefined) {
      clauses.push(`type == "${escapeNsString(this.mapElementType(flat.type))}"`);
    }
    if (flat.testId !== undefined) {
      const attribute = this.iosTestIdAttribute === DEFAULT_IOS_TESTID_ATTRIBUTE
        ? 'name'
        : this.iosTestIdAttribute;
      clauses.push(this.iosClause(attribute, 'exact', flat.testId));
    }
    if (flat.accessibilityId !== undefined) {
      clauses.push(this.iosClause('name', 'exact', flat.accessibilityId));
    }
    if (flat.id !== undefined) {
      clauses.push(this.iosClause('name', 'exact', flat.id));
    }
    if (flat.label !== undefined) {
      clauses.push(this.iosClause('label', mode, flat.label));
    }
    if (flat.text !== undefined) {
      const group = ['label', 'value', 'name']
        .map((attribute) => this.iosClause(attribute, mode, flat.text as string))
        .join(' OR ');
      clauses.push(`(${group})`);
    }

    if (clauses.length === 0) {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        'iOS 谓词翻译后为空，请检查定位器字段',
      );
    }
    return clauses;
  }

  private buildIosPredicate(flat: FlatLocator, description: string): string {
    return this.iosClauses(flat, description).join(' AND ');
  }

  /* ─────────── iOS：Class Chain（关系约束） ─────────── */

  /**
   * 生成一个 class chain 段：`<Type>[\`谓词\`]`，并在存在 descendant 约束时追加 `[$后代谓词$]`。
   * `$...$` 是 class chain 独有的「包含某后代」语法 —— 这正是 predicate 无法表达、
   * 而 Detox 需要 withDescendant 才能表达的那一类约束。
   */
  private iosChainSegment(flat: FlatLocator, description: string): string {
    const elementType = flat.type !== undefined ? this.mapElementType(flat.type) : 'XCUIElementTypeAny';
    const selfFlat: FlatLocator = { ...flat, type: undefined, ancestor: undefined, descendant: undefined };

    let segment = elementType;
    if (countAttributeFields(selfFlat) > 0) {
      segment += `[\`${this.buildIosPredicate(selfFlat, description)}\`]`;
    }
    if (flat.descendant !== undefined) {
      const descendant = flat.descendant as FlatLocator;
      const descendantType = descendant.type !== undefined
        ? this.mapElementType(descendant.type)
        : undefined;
      const descendantSelf: FlatLocator = { ...descendant, type: undefined, ancestor: undefined, descendant: undefined };
      const parts: string[] = [];
      if (descendantType !== undefined) {
        parts.push(`type == "${escapeNsString(descendantType)}"`);
      }
      if (countAttributeFields(descendantSelf) > 0) {
        parts.push(this.buildIosPredicate(descendantSelf, description));
      }
      if (parts.length === 0) {
        throw new UnsupportedLocatorError(
          this.framework,
          description,
          'descendant 约束为空，无法生成 class chain 的 [$...$] 段',
        );
      }
      segment += `[$${parts.join(' AND ')}$]`;
    }
    return segment;
  }

  private buildIosClassChain(flat: FlatLocator, description: string): string {
    const segments: string[] = [];
    if (flat.ancestor !== undefined) {
      const ancestor = flat.ancestor as FlatLocator;
      if (ancestor.ancestor !== undefined) {
        throw new UnsupportedLocatorError(
          this.framework,
          description,
          'class chain 仅支持单层 ancestor 嵌套；多层祖先链请改用 xpath 逃生舱',
        );
      }
      segments.push(this.iosChainSegment(ancestor, description));
    }
    segments.push(this.iosChainSegment(
      { ...flat, ancestor: undefined },
      description,
    ));
    return `**/${segments.join('/**/')}`;
  }

  /* ─────────── Android：UiSelector ─────────── */

  /** 生成 UiSelector 的属性调用链（不含 `new UiSelector()` 前缀） */
  private androidSelectorCalls(flat: FlatLocator, description: string): string[] {
    const mode: TextMatchModeLite = flat.match ?? 'exact';
    const calls: string[] = [];

    if (flat.type !== undefined) {
      calls.push(`.className("${escapeJavaString(this.mapElementType(flat.type))}")`);
    }
    if (flat.testId !== undefined) {
      calls.push(
        this.androidTestIdAttribute === 'resource-id'
          ? this.androidResourceIdCall(flat.testId)
          : `.description("${escapeJavaString(flat.testId)}")`,
      );
    }
    if (flat.accessibilityId !== undefined) {
      calls.push(`.description("${escapeJavaString(flat.accessibilityId)}")`);
    }
    if (flat.id !== undefined) {
      calls.push(this.androidResourceIdCall(flat.id));
    }
    if (flat.label !== undefined) {
      switch (mode) {
        case 'contains':
          calls.push(`.descriptionContains("${escapeJavaString(flat.label)}")`);
          break;
        case 'startsWith':
          calls.push(`.descriptionStartsWith("${escapeJavaString(flat.label)}")`);
          break;
        case 'regex':
          calls.push(`.descriptionMatches("${escapeJavaString(flat.label)}")`);
          break;
        case 'exact':
        default:
          calls.push(`.description("${escapeJavaString(flat.label)}")`);
          break;
      }
    }
    if (flat.text !== undefined) {
      switch (mode) {
        case 'contains':
          calls.push(`.textContains("${escapeJavaString(flat.text)}")`);
          break;
        case 'startsWith':
          calls.push(`.textStartsWith("${escapeJavaString(flat.text)}")`);
          break;
        case 'regex':
          calls.push(`.textMatches("${escapeJavaString(flat.text)}")`);
          break;
        case 'exact':
        default:
          calls.push(`.text("${escapeJavaString(flat.text)}")`);
          break;
      }
    }

    if (calls.length === 0) {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        'Android UiSelector 翻译后为空，请检查定位器字段',
      );
    }
    return calls;
  }

  /**
   * resource-id 调用。
   * 短名（不含 `/`）放宽成 `resourceIdMatches(".*:id/<name>$")`：脚本层不应该、也没法知道
   * 被测 App 的 applicationId 前缀，硬要求全名会让同一份脚本在 debug/release 变体间失效。
   */
  private androidResourceIdCall(value: string): string {
    if (value.includes('/')) {
      return `.resourceId("${escapeJavaString(value)}")`;
    }
    return `.resourceIdMatches("${escapeJavaString(`.*:id/${escapeRegExp(value)}$`)}")`;
  }

  private buildAndroidUiSelector(flat: FlatLocator, description: string): string {
    return `new UiSelector()${this.androidSelectorCalls(flat, description).join('')}`;
  }

  /**
   * Android 关系约束。
   * - ancestor → `祖先UiSelector.childSelector(目标UiSelector)`，UiAutomator 返回的是 childSelector 指向的元素，语义正确；
   * - descendant → UiSelector 没有「父元素含某后代」的表达式，只能降级到 xpath。
   *   这里的降级是**显式且等价**的（xpath 能精确表达 AND + 后代约束），
   *   与 Detox 那种「换个策略去猜」的静默降级有本质区别。
   */
  private buildAndroidRelational(
    flat: FlatLocator,
    description: string,
  ): { using: string; value: string } {
    if (flat.descendant !== undefined) {
      return { using: 'xpath', value: this.buildAndroidXPath(flat, description) };
    }

    const ancestor = flat.ancestor as FlatLocator;
    if (ancestor.ancestor !== undefined || ancestor.descendant !== undefined) {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        'UiSelector 的 childSelector 仅支持单层祖先约束；更复杂的层级请改用 xpath 逃生舱',
      );
    }
    const ancestorCalls = this.androidSelectorCalls(ancestor, description).join('');
    const targetCalls = this.androidSelectorCalls(
      { ...flat, ancestor: undefined, descendant: undefined },
      description,
    ).join('');
    return {
      using: '-android uiautomator',
      value: `new UiSelector()${ancestorCalls}.childSelector(new UiSelector()${targetCalls})`,
    };
  }

  /** 生成 XPath 谓词条件（Android 属性名） */
  private androidXPathConditions(flat: FlatLocator, description: string): string[] {
    const mode: TextMatchModeLite = flat.match ?? 'exact';
    if (mode === 'regex') {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        'XPath 1.0 不支持正则匹配；含 descendant 约束时请把 match 改为 exact/contains/startsWith',
      );
    }
    const conditions: string[] = [];

    const push = (attribute: string, value: string, useMode: TextMatchModeLite): void => {
      const literal = xpathLiteral(value);
      if (useMode === 'contains') {
        conditions.push(`contains(@${attribute}, ${literal})`);
      } else if (useMode === 'startsWith') {
        conditions.push(`starts-with(@${attribute}, ${literal})`);
      } else {
        conditions.push(`@${attribute}=${literal}`);
      }
    };

    if (flat.type !== undefined) {
      push('class', this.mapElementType(flat.type), 'exact');
    }
    if (flat.testId !== undefined) {
      push(this.androidTestIdAttribute === 'resource-id' ? 'resource-id' : 'content-desc', flat.testId, 'exact');
    }
    if (flat.accessibilityId !== undefined) {
      push('content-desc', flat.accessibilityId, 'exact');
    }
    if (flat.id !== undefined) {
      push('resource-id', flat.id, flat.id.includes('/') ? 'exact' : 'contains');
    }
    if (flat.label !== undefined) {
      push('content-desc', flat.label, mode);
    }
    if (flat.text !== undefined) {
      push('text', flat.text, mode);
    }

    if (conditions.length === 0) {
      throw new UnsupportedLocatorError(this.framework, description, 'XPath 条件为空，请检查定位器字段');
    }
    return conditions;
  }

  private buildAndroidXPath(flat: FlatLocator, description: string): string {
    const self: FlatLocator = { ...flat, ancestor: undefined, descendant: undefined };
    const conditions = this.androidXPathConditions(self, description);

    if (flat.descendant !== undefined) {
      const descendantConditions = this.androidXPathConditions(
        { ...(flat.descendant as FlatLocator), ancestor: undefined, descendant: undefined },
        description,
      );
      conditions.push(`.//*[${descendantConditions.join(' and ')}]`);
    }

    const selfXPath = `//*[${conditions.join(' and ')}]`;
    if (flat.ancestor === undefined) {
      return selfXPath;
    }
    const ancestorConditions = this.androidXPathConditions(
      { ...(flat.ancestor as FlatLocator), ancestor: undefined, descendant: undefined },
      description,
    );
    return `//*[${ancestorConditions.join(' and ')}]${selfXPath}`;
  }
}

/** 便捷工厂，供 LocatorResolverFactory 与单测使用 */
export function createAppiumLocatorResolver(
  options: AppiumLocatorResolverOptions,
): AppiumLocatorResolver {
  return new AppiumLocatorResolver(options);
}
