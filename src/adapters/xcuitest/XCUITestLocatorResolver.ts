import type { FrameworkKind, Platform } from '../../contracts/types';
import { UnsupportedLocatorError } from '../../contracts/types';
import type {
  ElementType,
  ILocatorResolver,
  LocatorLike,
  NativeSelector,
  TextMatchModeLite,
} from '../../contracts/IElementLocator';
import { describeLocator, flattenForPlatform } from '../../contracts/IElementLocator';

/**
 * XCUITest 定位器翻译器。
 *
 * 【产物为什么是 JSON DSL 而不是选择器字符串】
 * XCUITest 的查询是**代码构造**的（`app.descendants(matching:).matching(NSPredicate)`），
 * 没有像 Appium 那样的「一行选择器字符串」表达形态。若强行拼一个字符串再让 Swift 侧反解析，
 * 等于自己发明一套语法还要写两遍解析器。因此这里直接产出结构化的 `BridgeQuery` JSON，
 * 通过 NDJSON 桥接原样送到 Swift Runner，Runner 按字段逐段构造 XCUIElementQuery ——
 * 双方只共享一份 schema，不共享任何解析逻辑。
 *
 * 【为什么同时给出 predicateFormat】
 * 绝大多数查询可以被压成一条 NSPredicate，Runner 直接
 * `query.matching(NSPredicate(format: predicateFormat))` 即可，省掉逐条谓词的组装分支；
 * 而 ancestor / descendant / OR 组这类无法压平的情形仍保留结构化字段。
 * 换言之：`predicateFormat` 是快路径，结构化字段是完备路径，两者语义等价且必须同时正确。
 *
 * 本文件是**纯函数**：无 I/O、无状态、不 import 任何驱动或第三方 SDK。
 */

/* ═══════════════ Bridge Query DSL ═══════════════ */

/** 可参与谓词的 XCUIElement 属性字段 */
export type BridgeField =
  | 'identifier'
  | 'label'
  | 'value'
  | 'title'
  | 'placeholderValue';

/** 单条谓词 */
export interface BridgePredicate {
  readonly field: BridgeField;
  readonly match: TextMatchModeLite;
  readonly value: string;
}

/** 一个查询节点：元素类型 + AND 谓词组 + 若干 OR 谓词组 */
export interface BridgeQueryNode {
  /** XCUIElementType 名，`XCUIElementTypeAny` 表示不限类型 */
  readonly elementType: string;
  /** 全部必须成立（AND） */
  readonly predicates: readonly BridgePredicate[];
  /**
   * 每个内层数组是一个 OR 组，组内任一成立即可；多个 OR 组之间仍是 AND。
   * 用于表达 `text` → label OR value OR title 这类「同一语义落在多个原生属性」的情形。
   */
  readonly anyOf: readonly (readonly BridgePredicate[])[];
}

/** 送往 Swift Runner 的完整查询描述 */
export interface BridgeQuery {
  readonly kind: 'bridge-query';
  /** schema 版本，Runner 用它做兼容性校验 */
  readonly version: 1;
  /** 逃生舱：直接用 xpath 在视图树上查询（与 target 互斥） */
  readonly xpath?: string;
  readonly target: BridgeQueryNode;
  /** 目标必须位于该祖先之内 */
  readonly ancestor?: BridgeQueryNode;
  /** 目标必须包含该后代 */
  readonly descendant?: BridgeQueryNode;
  /** 多命中时取第 index 个（0-based） */
  readonly index?: number;
  /** target 的等价 NSPredicate 串；无法压平（存在 OR 组以外的复杂情形）时为 undefined */
  readonly predicateFormat?: string;
  /** 人类可读描述 */
  readonly description: string;
}

/* ═══════════════ 元素类型映射 ═══════════════ */

/** 语义类型 → XCUIElementType 名 */
const ELEMENT_TYPE_MAP: Readonly<Record<ElementType, string>> = {
  button: 'XCUIElementTypeButton',
  text: 'XCUIElementTypeStaticText',
  input: 'XCUIElementTypeTextField',
  image: 'XCUIElementTypeImage',
  switch: 'XCUIElementTypeSwitch',
  checkbox: 'XCUIElementTypeCheckBox',
  slider: 'XCUIElementTypeSlider',
  link: 'XCUIElementTypeLink',
  scrollView: 'XCUIElementTypeScrollView',
  list: 'XCUIElementTypeTable',
  cell: 'XCUIElementTypeCell',
  tab: 'XCUIElementTypeTab',
  alert: 'XCUIElementTypeAlert',
  webView: 'XCUIElementTypeWebView',
  other: 'XCUIElementTypeOther',
};

/** 不限类型时的通配 */
export const ANY_ELEMENT_TYPE = 'XCUIElementTypeAny';

/* ═══════════════ NSPredicate 渲染 ═══════════════ */

/** NSPredicate 字符串字面量转义：反斜杠与双引号 */
export function escapePredicateLiteral(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** 单条谓词 → NSPredicate 片段 */
export function renderPredicate(predicate: BridgePredicate): string {
  const literal = `"${escapePredicateLiteral(predicate.value)}"`;
  switch (predicate.match) {
    case 'contains':
      return `${predicate.field} CONTAINS ${literal}`;
    case 'startsWith':
      return `${predicate.field} BEGINSWITH ${literal}`;
    case 'regex':
      return `${predicate.field} MATCHES ${literal}`;
    case 'exact':
    default:
      return `${predicate.field} == ${literal}`;
  }
}

/**
 * 节点 → NSPredicate 串。
 * AND 组直接串联；每个 OR 组用括号包裹后再并入 AND 链。
 * 无任何谓词时返回 undefined（表示「只按 elementType 过滤」）。
 */
export function renderNodePredicate(node: BridgeQueryNode): string | undefined {
  const clauses: string[] = node.predicates.map(renderPredicate);
  for (const group of node.anyOf) {
    if (group.length === 0) {
      continue;
    }
    if (group.length === 1) {
      clauses.push(renderPredicate(group[0] as BridgePredicate));
      continue;
    }
    clauses.push(`(${group.map(renderPredicate).join(' OR ')})`);
  }
  return clauses.length > 0 ? clauses.join(' AND ') : undefined;
}

/** 生成 Swift 侧等价源码（仅用于日志排障，不参与执行） */
export function renderBridgeQuery(query: BridgeQuery): string {
  if (query.xpath !== undefined) {
    return `app.xpath("${escapePredicateLiteral(query.xpath)}")`;
  }
  const parts: string[] = [];
  parts.push(`app.descendants(matching: .${lowerFirst(stripPrefix(query.target.elementType))})`);
  const predicate = renderNodePredicate(query.target);
  if (predicate !== undefined) {
    parts.push(`.matching(NSPredicate(format: "${escapePredicateLiteral(predicate)}"))`);
  }
  if (query.ancestor !== undefined) {
    const ancestorPredicate = renderNodePredicate(query.ancestor);
    parts.unshift(
      `app.descendants(matching: .${lowerFirst(stripPrefix(query.ancestor.elementType))})`
      + (ancestorPredicate !== undefined
        ? `.matching(NSPredicate(format: "${escapePredicateLiteral(ancestorPredicate)}")).firstMatch`
        : '.firstMatch'),
    );
    parts[1] = parts[1]!.replace('app.descendants', '.descendants');
  }
  if (query.descendant !== undefined) {
    const descendantPredicate = renderNodePredicate(query.descendant);
    parts.push(
      `/* containing: .${lowerFirst(stripPrefix(query.descendant.elementType))}`
      + (descendantPredicate !== undefined ? ` where ${descendantPredicate}` : '')
      + ' */',
    );
  }
  parts.push(query.index !== undefined ? `.element(boundBy: ${String(query.index)})` : '.firstMatch');
  return parts.join('');
}

function stripPrefix(elementType: string): string {
  return elementType.startsWith('XCUIElementType')
    ? elementType.slice('XCUIElementType'.length)
    : elementType;
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toLowerCase() + value.slice(1);
}

/* ═══════════════ Resolver ═══════════════ */

/** testId 在 iOS 侧落到哪个原生属性 */
export interface XCUITestResolverOptions {
  /**
   * 对应 `AppConfig.testIdAttribute.ios`。
   * - `accessibilityIdentifier`（默认）→ 只查 identifier；
   * - `name` → XCUITest 的 name 实为 identifier ?? label，故展开为 identifier OR label；
   * - 其它自定义值 → 按 label 处理（无障碍标签是唯一还能读到的兜底属性）。
   */
  readonly testIdAttribute?: string;
}

export class XCUITestLocatorResolver implements ILocatorResolver {
  readonly framework: FrameworkKind = 'xcuitest';
  readonly platform: Platform = 'ios';

  private readonly testIdAttribute: string;

  constructor(options: XCUITestResolverOptions = {}) {
    // XCUITest 只存在于 iOS，platform 恒为 'ios'，无需构造参数
    this.testIdAttribute = options.testIdAttribute ?? 'accessibilityIdentifier';
  }

  resolve(locator: LocatorLike): NativeSelector {
    const flat = flattenForPlatform(locator, this.platform);
    const description = describeLocator(locator);

    /* ── 逃生舱：xpath 独占 ── */
    if (flat.xpath !== undefined && flat.xpath !== '') {
      this.assertXpathExclusive(flat, description);
      const query: BridgeQuery = {
        kind: 'bridge-query',
        version: 1,
        xpath: flat.xpath,
        target: { elementType: ANY_ELEMENT_TYPE, predicates: [], anyOf: [] },
        index: flat.index,
        description,
      };
      return {
        framework: this.framework,
        platform: this.platform,
        using: 'xpath',
        value: flat.xpath,
        index: flat.index,
        raw: query,
        description,
      };
    }

    /* ── 常规路径 ── */
    const target = this.buildNode(flat, description);
    if (
      target.predicates.length === 0
      && target.anyOf.length === 0
      && target.elementType === ANY_ELEMENT_TYPE
      && flat.ancestor === undefined
      && flat.descendant === undefined
    ) {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        '定位器为空：至少需要 testId / accessibilityId / id / text / label / type / xpath 之一',
      );
    }

    const query: BridgeQuery = {
      kind: 'bridge-query',
      version: 1,
      target,
      ancestor: flat.ancestor !== undefined
        ? this.buildNode(flat.ancestor, describeLocator(flat.ancestor))
        : undefined,
      descendant: flat.descendant !== undefined
        ? this.buildNode(flat.descendant, describeLocator(flat.descendant))
        : undefined,
      index: flat.index,
      predicateFormat: renderNodePredicate(target),
      description,
    };

    return {
      framework: this.framework,
      platform: this.platform,
      using: 'bridge-query',
      // value 必须是可序列化的字符串形态：桥接协议直接发这段 JSON
      value: JSON.stringify(query),
      index: flat.index,
      raw: query,
      description,
    };
  }

  supports(locator: LocatorLike): boolean {
    try {
      this.resolve(locator);
      return true;
    } catch {
      return false;
    }
  }

  describe(locator: LocatorLike): string {
    return describeLocator(locator);
  }

  mapElementType(type: ElementType): string {
    return ELEMENT_TYPE_MAP[type] ?? ANY_ELEMENT_TYPE;
  }

  /* ── 内部 ── */

  /** xpath 与结构化字段混用时无法保证语义等价，直接拒绝而不是二选一静默丢弃 */
  private assertXpathExclusive(
    flat: Omit<import('../../contracts/IElementLocator').LocatorDescriptor, 'platform'>,
    description: string,
  ): void {
    const conflicting: string[] = [];
    if (flat.testId !== undefined) conflicting.push('testId');
    if (flat.accessibilityId !== undefined) conflicting.push('accessibilityId');
    if (flat.id !== undefined) conflicting.push('id');
    if (flat.text !== undefined) conflicting.push('text');
    if (flat.label !== undefined) conflicting.push('label');
    if (flat.type !== undefined) conflicting.push('type');
    if (flat.ancestor !== undefined) conflicting.push('ancestor');
    if (flat.descendant !== undefined) conflicting.push('descendant');
    if (conflicting.length > 0) {
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        `xpath 不能与 ${conflicting.join(' / ')} 混用，请二选一`,
      );
    }
  }

  /** 把一组扁平约束翻译为一个查询节点 */
  private buildNode(
    flat: Omit<import('../../contracts/IElementLocator').LocatorDescriptor, 'platform'>,
    description: string,
  ): BridgeQueryNode {
    if (flat.xpath !== undefined && flat.xpath !== '') {
      // 嵌套约束里出现 xpath：Runner 的 ancestor/descendant 是基于 XCUIElementQuery 组合的，
      // 无法接受一段独立 xpath，故显式拒绝
      throw new UnsupportedLocatorError(
        this.framework,
        description,
        'ancestor / descendant 约束内不支持 xpath',
      );
    }

    const match: TextMatchModeLite = flat.match ?? 'exact';
    const predicates: BridgePredicate[] = [];
    const anyOf: BridgePredicate[][] = [];

    if (flat.testId !== undefined) {
      const group = this.testIdPredicates(flat.testId, match);
      if (group.length === 1) {
        predicates.push(group[0] as BridgePredicate);
      } else {
        anyOf.push(group);
      }
    }

    if (flat.accessibilityId !== undefined) {
      predicates.push({ field: 'identifier', match, value: flat.accessibilityId });
    }

    if (flat.id !== undefined) {
      // iOS 语境下的「原生 id」即 accessibilityIdentifier
      predicates.push({ field: 'identifier', match, value: flat.id });
    }

    if (flat.label !== undefined) {
      predicates.push({ field: 'label', match, value: flat.label });
    }

    if (flat.text !== undefined) {
      // 可见文本在 XCUITest 中的落点不唯一：
      // StaticText 落在 label，TextField 落在 value，Button/NavBar 可能落在 title，
      // 空输入框的占位文案落在 placeholderValue。四者取 OR 才等价于「用户看到的文字」。
      anyOf.push([
        { field: 'label', match, value: flat.text },
        { field: 'value', match, value: flat.text },
        { field: 'title', match, value: flat.text },
        { field: 'placeholderValue', match, value: flat.text },
      ]);
    }

    return {
      elementType: flat.type !== undefined ? this.mapElementType(flat.type) : ANY_ELEMENT_TYPE,
      predicates,
      anyOf,
    };
  }

  /** testId → 谓词组，受 app.testIdAttribute.ios 影响 */
  private testIdPredicates(value: string, match: TextMatchModeLite): BridgePredicate[] {
    switch (this.testIdAttribute) {
      case 'name':
        // XCUITest 的 name = identifier ?? label，展开成 OR 才与之等价
        return [
          { field: 'identifier', match, value },
          { field: 'label', match, value },
        ];
      case 'accessibilityIdentifier':
        return [{ field: 'identifier', match, value }];
      default:
        // 自定义属性无法直接被 XCUIElement 读取，退回 label（唯一还能读到的无障碍文本）
        return [{ field: 'label', match, value }];
    }
  }
}

/** 便捷工厂 */
export function createXCUITestLocatorResolver(
  options: XCUITestResolverOptions = {},
): XCUITestLocatorResolver {
  return new XCUITestLocatorResolver(options);
}
