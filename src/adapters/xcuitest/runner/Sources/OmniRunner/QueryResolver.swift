// QueryResolver.swift
// ───────────────────────────────────────────────────────────────────────────
// BridgeQuery（结构化 DSL）→ XCUIElementQuery（XCUI 原生查询）。
//
// 设计要点（与 XCUITestLocatorResolver.ts:renderNodePredicate / renderBridgeQuery 对齐）：
// 1) 优先用 predicateFormat 走 NSPredicate 快路径（TS 已经把谓词压平成合法的 NSPredicate 串）。
// 2) 没有 predicateFormat 时，由结构化 predicates（AND）+ anyOf（OR 组，组间 AND）重新拼 NSPredicate。
// 3) ancestor / descendant 用 XCUIElementQuery.containing(NSPredicate) 表达「目标必须包含某后代」，
//    这是 XCUI 里能把结构化约束落到查询上的唯一原语。
// 4) xpath 与 target 互斥：xpath 没有原生引擎，交给 CommandRouter 直接回 unsupported_xpath，
//    不在这里静默降级（与项目「Detox 不支持就抛错」的硬原则一致）。
// ───────────────────────────────────────────────────────────────────────────

import XCTest

/// 语义类型名（"XCUIElementTypeButton"）→ XCUIElement.ElementType 的映射。
/// 只收录 TS 侧 ELEMENT_TYPE_MAP 真正会产出的类型，避免引用不存在的枚举 case 导致编译失败。
private let elementTypeMap: [String: XCUIElement.ElementType] = [
    "Button": .button,
    "StaticText": .staticText,
    "TextField": .textField,
    "SecureTextField": .secureTextField,
    "Image": .image,
    "Switch": .switch,
    "CheckBox": .checkBox,
    "Slider": .slider,
    "Link": .link,
    "ScrollView": .scrollView,
    "Table": .table,
    "Cell": .cell,
    "Tab": .tab,
    "Alert": .alert,
    "WebView": .webView,
    "Other": .other,
    "Any": .any,
]

/// 反向映射：ElementType → "XCUIElementTypeXxx"，用于快照里的 elementType 字段回传给 TS。
private let elementTypeReverse: [XCUIElement.ElementType: String] = {
    var dict: [XCUIElement.ElementType: String] = [:]
    for (key, value) in elementTypeMap {
        dict[value] = "XCUIElementType" + key
    }
    return dict
}()

/// 把 "XCUIElementTypeButton" 这类字符串解析成 XCUIElement.ElementType；未知类型回落到 .other。
private func elementTypeFromString(_ raw: String) -> XCUIElement.ElementType {
    let suffix = raw.hasPrefix("XCUIElementType")
        ? String(raw.dropFirst("XCUIElementType".count))
        : raw
    return elementTypeMap[suffix] ?? .other
}

/// 把 XCUIElement.ElementType 反向渲染成 "XCUIElementTypeButton"，未知回落到 XCUIElementTypeOther。
public func elementTypeToString(_ type: XCUIElement.ElementType) -> String {
    return elementTypeReverse[type] ?? "XCUIElementTypeOther"
}

/// 单条谓词 → NSPredicate 片段。字段名即 XCUIElement 的 KVC 属性（label/value/identifier/title/placeholderValue）。
private func predicateClause(_ predicate: BridgePredicate) -> String {
    let op: String
    switch predicate.match {
    case "contains":
        op = "CONTAINS"
    case "startsWith":
        op = "BEGINSWITH"
    case "regex":
        op = "MATCHES"
    default:
        op = "=="
    }
    // 字面量转义：反斜杠与单引号（与 TS 侧 escapePredicateLiteral 互为镜像）。
    let escaped = predicate.value
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "'", with: "\\'")
    return "\(predicate.field) \(op) '\(escaped)'"
}

/// 节点 → NSPredicate：predicates 全 AND；anyOf 每个内层数组是一个 OR 组，组间仍 AND。
private func buildPredicate(node: BridgeQueryNode) -> NSPredicate? {
    var clauses: [String] = node.predicates.map(predicateClause)
    for group in node.anyOf {
        guard !group.isEmpty else { continue }
        if group.count == 1 {
            clauses.append(predicateClause(group[0]))
        } else {
            clauses.append("(" + group.map(predicateClause).joined(separator: " OR ") + ")")
        }
    }
    guard !clauses.isEmpty else { return nil }
    return NSPredicate(format: clauses.joined(separator: " AND "))
}

/// 把一份 BridgeQuery 翻译成 XCUIElementQuery（不含 index 取第几个）。
/// - Parameters:
///   - query: 结构化查询描述。
///   - app: 被测 App 根（XCUIApplication）。
/// - Returns: 已应用类型 / 谓词 / ancestor / descendant 约束的查询。
public func resolveQuery(_ query: BridgeQuery, app: XCUIApplication) -> XCUIElementQuery {
    let targetType = elementTypeFromString(query.target.elementType)
    var result = app.descendants(matching: targetType)

    // 快路径：直接吃 TS 压平好的 predicateFormat。
    if let predicateFormat = query.predicateFormat, !predicateFormat.isEmpty {
        result = result.matching(NSPredicate(format: predicateFormat))
    } else if let targetPredicate = buildPredicate(node: query.target) {
        result = result.matching(targetPredicate)
    }

    // ancestor / descendant：用 containing 表达结构约束。
    if let ancestor = query.ancestor, let ancestorPredicate = buildPredicate(node: ancestor) {
        result = result.containing(ancestorPredicate)
    }
    if let descendant = query.descendant, let descendantPredicate = buildPredicate(node: descendant) {
        result = result.containing(descendantPredicate)
    }

    return result
}

/// 把 query 落到一个具体的 XCUIElement（应用 index 取第几个，否则取 firstMatch）。
public func resolveElement(_ query: BridgeQuery, app: XCUIApplication) -> XCUIElement {
    let resolved = resolveQuery(query, app: app)
    if let index = query.index {
        return resolved.element(boundBy: index)
    }
    return resolved.firstMatch
}
