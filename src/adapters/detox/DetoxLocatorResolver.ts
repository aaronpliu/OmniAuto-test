import type { AppConfig, FrameworkKind, Platform } from '../../contracts/types';
import { UnsupportedLocatorError } from '../../contracts/types';
import type {
  ElementType,
  ILocatorResolver,
  LocatorDescriptor,
  LocatorLike,
  NativeSelector,
} from '../../contracts/IElementLocator';
import { describeLocator, flattenForPlatform } from '../../contracts/IElementLocator';

/**
 * Detox 定位器翻译器 —— 把声明式 `LocatorDescriptor` 翻译为结构化 matcher 描述（`DetoxMatcherSpec`）。
 *
 * 【为什么输出的是「描述」而不是直接调 `by.id()`】
 * `by` 只有在 detox 这个 npm 包被真正加载后才存在，而本文件必须能在**没装 detox** 的机器上
 * 被单测与 dry-run 直接调用（这正是「Resolver 必须是纯函数」的现实意义）。
 * 因此 Resolver 只产出与框架无关的 matcher 树，由 DetoxDriver 在运行时把它组装成
 * `by.id('x').withAncestor(by.text('y'))` 这样的真实 matcher 链。
 *
 * ════════ 铁律：不支持的语义一律抛错，绝不静默降级 ════════
 * Detox 的匹配器集合远小于 Appium：没有 xpath、没有 NSPredicate、没有子串匹配。
 * 如果这里为了「让用例跑起来」把 `match: 'contains'` 悄悄当成 `exact`、
 * 或者把 xpath 换成某个 by.id 去碰运气，后果是**用例定位到错误元素却显示通过** ——
 * 这是自动化测试里最昂贵的失效模式（假绿灯比红灯危险得多）。
 * 所以下列情形一律抛 `UnsupportedLocatorError`：
 *   - `xpath`（Detox 完全没有等价物）
 *   - `id`（原生 resource-id / name，Detox 只能查 testID，两者不同源）
 *   - `match` 为 contains / startsWith / regex（Detox matcher 只有全等语义）
 */

type FlatLocator = Omit<LocatorDescriptor, 'platform'>;

/** Detox 支持的基础匹配维度 */
export type DetoxMatcherBy = 'id' | 'text' | 'label' | 'type' | 'traits';

/** 单个 `by.xxx(value)` 调用 */
export interface DetoxMatcherNode {
  readonly by: DetoxMatcherBy;
  readonly value: string;
}

/**
 * 结构化 matcher 描述。
 * - `base`：AND 组合的基础匹配器，至少一个（Driver 用 `.and()` 串联）；
 * - `ancestor` / `descendant`：对应 `.withAncestor()` / `.withDescendant()`；
 * - `index`：对应 `element(m).atIndex(n)`。
 */
export interface DetoxMatcherSpec {
  readonly base: readonly DetoxMatcherNode[];
  readonly ancestor?: DetoxMatcherSpec;
  readonly descendant?: DetoxMatcherSpec;
  readonly index?: number;
}

export interface DetoxLocatorResolverOptions {
  readonly platform: Platform;
  /** 保留 testIdAttribute 以保持三个 Resolver 构造签名一致；Detox 的 testID 落点由 RN 决定，故仅用于日志 */
  readonly testIdAttribute?: AppConfig['testIdAttribute'];
}

/**
 * 语义类型 → iOS 原生类名（React Native 视角）。
 * ⚠ `by.type()` 在 Detox 上是**弱策略**：RN 的组件树与原生类名并非一一对应
 * （多数容器都是 RCTView），能用 testId 就不要用 type。
 */
const IOS_TYPE_MAP: Readonly<Record<ElementType, string>> = {
  button: 'RCTView',
  text: 'RCTTextView',
  input: 'RCTUITextField',
  image: 'RCTImageView',
  switch: 'RCTSwitch',
  checkbox: 'RCTSwitch',
  slider: 'RCTSlider',
  link: 'RCTTextView',
  scrollView: 'RCTScrollView',
  list: 'RCTScrollView',
  cell: 'RCTView',
  tab: 'RCTView',
  alert: '_UIAlertControllerView',
  webView: 'RNCWebView',
  other: 'RCTView',
};

/** 语义类型 → Android 原生类名（React Native 视角） */
const ANDROID_TYPE_MAP: Readonly<Record<ElementType, string>> = {
  button: 'android.widget.Button',
  text: 'android.widget.TextView',
  input: 'android.widget.EditText',
  image: 'android.widget.ImageView',
  switch: 'com.facebook.react.views.switchview.ReactSwitch',
  checkbox: 'android.widget.CheckBox',
  slider: 'com.facebook.react.views.slider.ReactSlider',
  link: 'android.widget.TextView',
  scrollView: 'android.widget.ScrollView',
  list: 'androidx.recyclerview.widget.RecyclerView',
  cell: 'android.view.ViewGroup',
  tab: 'android.widget.TabWidget',
  alert: 'android.app.AlertDialog',
  webView: 'android.webkit.WebView',
  other: 'android.view.View',
};

/** 把 matcher 树渲染成等价的 Detox 源码字符串，用于日志与报错（不参与运行时执行） */
export function renderDetoxMatcher(spec: DetoxMatcherSpec): string {
  const quote = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const head = spec.base
    .map((node) => `by.${node.by}(${quote(node.value)})`)
    .join('.and(');
  let rendered = spec.base.length > 1 ? `${head}${')'.repeat(spec.base.length - 1)}` : head;

  if (spec.ancestor !== undefined) {
    rendered += `.withAncestor(${renderDetoxMatcher(spec.ancestor)})`;
  }
  if (spec.descendant !== undefined) {
    rendered += `.withDescendant(${renderDetoxMatcher(spec.descendant)})`;
  }
  if (spec.index !== undefined) {
    rendered = `element(${rendered}).atIndex(${spec.index})`;
  }
  return rendered;
}

export class DetoxLocatorResolver implements ILocatorResolver {
  readonly framework: FrameworkKind = 'detox';
  readonly platform: Platform;

  constructor(options: DetoxLocatorResolverOptions) {
    this.platform = options.platform;
  }

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
      return false;
    }
  }

  resolve(locator: LocatorLike): NativeSelector {
    const flat = flattenForPlatform(locator, this.platform);
    const description = describeLocator(locator);
    const spec = this.buildSpec(flat, description, true);

    return {
      framework: this.framework,
      platform: this.platform,
      using: 'detox-matcher',
      value: renderDetoxMatcher(spec),
      index: flat.index,
      raw: spec,
      description,
    };
  }

  /* ─────────── 内部 ─────────── */

  /**
   * 把扁平定位器翻译为 matcher 树。
   * @param isRoot 只有根节点携带 index（Detox 的 atIndex 作用于 element() 而非 matcher）
   */
  private buildSpec(flat: FlatLocator, description: string, isRoot: boolean): DetoxMatcherSpec {
    this.rejectUnsupported(flat, description);

    const base: DetoxMatcherNode[] = [];
    if (flat.testId !== undefined) {
      base.push({ by: 'id', value: flat.testId });
    }
    if (flat.accessibilityId !== undefined) {
      // Detox 的 by.id 对应 RN 的 testID，在 iOS 上即 accessibilityIdentifier
      base.push({ by: 'id', value: flat.accessibilityId });
    }
    if (flat.text !== undefined) {
      base.push({ by: 'text', value: flat.text });
    }
    if (flat.label !== undefined) {
      base.push({ by: 'label', value: flat.label });
    }
    if (flat.type !== undefined) {
      base.push({ by: 'type', value: this.mapElementType(flat.type) });
    }

    if (base.length === 0) {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        '定位器没有任何 Detox 可表达的字段（需要 testId / accessibilityId / text / label / type 之一）',
      );
    }

    const spec: {
      base: DetoxMatcherNode[];
      ancestor?: DetoxMatcherSpec;
      descendant?: DetoxMatcherSpec;
      index?: number;
    } = { base };

    if (flat.ancestor !== undefined) {
      spec.ancestor = this.buildSpec(flat.ancestor as FlatLocator, description, false);
    }
    if (flat.descendant !== undefined) {
      spec.descendant = this.buildSpec(flat.descendant as FlatLocator, description, false);
    }
    if (isRoot && flat.index !== undefined) {
      spec.index = flat.index;
    }
    return spec;
  }

  /** 集中拦截 Detox 无法表达的语义，给出「该怎么改」的可执行建议 */
  private rejectUnsupported(flat: FlatLocator, description: string): void {
    if (flat.xpath !== undefined) {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        'Detox 没有 xpath / class chain / NSPredicate 等树形查询能力。'
        + '静默改用其它字段去「碰运气」会导致定位到错误元素却断言通过，因此这里直接失败。'
        + '请为目标元素补上 testID 后改用 testId 定位',
      );
    }
    if (flat.id !== undefined) {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        'Detox 的 by.id 匹配的是 RN 的 testID，而 LocatorDescriptor.id 指的是原生 resource-id / name，'
        + '两者不同源，不能互相替代。请改用 testId 字段（或为该元素补 testID）',
      );
    }
    const match = flat.match ?? 'exact';
    if (match !== 'exact') {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        `Detox 的 by.text / by.label 只有全等语义，无法表达 match='${match}'。`
        + '请改用精确文案，或为该元素补 testID 后按 testId 定位',
      );
    }
  }
}

/** 便捷工厂，供 LocatorResolverFactory 与单测使用 */
export function createDetoxLocatorResolver(
  options: DetoxLocatorResolverOptions,
): DetoxLocatorResolver {
  return new DetoxLocatorResolver(options);
}
