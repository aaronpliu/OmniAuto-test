// BridgeProtocol.swift
// ───────────────────────────────────────────────────────────────────────────
// 桥接协议层：定义 TS 客户端（XCUITestDriver.ts）与 Swift Runner 之间交换的
// 全部帧结构，以及一套「任意 JSON 值」编解码器（JSONValue）。
//
// 【为什么需要 JSONValue】
// 桥接命令的 params / result 是开放结构（每个命令字段不同），Swift 没有内建的
// `AnyCodable`。若用 `[String: Any]` 直接 Codable 会编译失败，因此这里自己实现
// 一个与 JSON 一一对应的枚举，既能 JSON 编解码，又能方便地按字段取值、按字段构造。
// 这正是「协议契约」在 Swift 侧的落地：与 TS 的 BridgeRequestFrame / BridgeResponseFrame
// 字段名逐字对齐（id / type / command / params / ok / result / error）。
// ───────────────────────────────────────────────────────────────────────────

import Foundation

// MARK: - 任意 JSON 值

/// 与 JSON 完全对应的 Swift 值，既能解码（TS 发来的 params），也能编码（回传 result）。
public enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case object([String: JSONValue])
    case array([JSONValue])

    // 【解码】按 JSON 的单值容器依次尝试，命中即定型。顺序很关键：
    // nil 先于其它，Bool 必须在 Number 之前（否则 true/false 会被当成 0/1）。
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let boolValue = try? container.decode(Bool.self) {
            self = .bool(boolValue)
        } else if let doubleValue = try? container.decode(Double.self) {
            self = .number(doubleValue)
        } else if let stringValue = try? container.decode(String.self) {
            self = .string(stringValue)
        } else if let arrayValue = try? container.decode([JSONValue].self) {
            self = .array(arrayValue)
        } else if let objectValue = try? container.decode([String: JSONValue].self) {
            self = .object(objectValue)
        } else {
            throw DecodingError.typeMismatch(
                JSONValue.self,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "无法将值解码为 JSONValue"
                )
            )
        }
    }

    // 【编码】单值容器直接写入对应 JSON 类型。
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        }
    }

    /// 把自身重新序列化为 Data，便于在 JSONValue 与具体 Codable 结构（如 BridgeQuery）之间转译。
    public func encoded() throws -> Data {
        return try JSONEncoder().encode(self)
    }

    /// 从任意 Swift 值（Any）构造 JSONValue，用于把 XCUIElement 的属性回传成 result。
    /// KVC 读出来的属性是 Any，需要规整成 JSON 能表达的类型。
    public static func fromAny(_ value: Any?) -> JSONValue {
        guard let value = value else { return .null }
        if let boolValue = value as? Bool {
            return .bool(boolValue)
        }
        if let numberValue = value as? NSNumber {
            // Bool 已经在上一步拦截；这里统一按 Double 处理，JSON 中都是数字。
            return .number(numberValue.doubleValue)
        }
        if let stringValue = value as? String {
            return .string(stringValue)
        }
        if let arrayValue = value as? [Any] {
            return .array(arrayValue.map { fromAny($0) })
        }
        if let dictValue = value as? [String: Any] {
            var result: [String: JSONValue] = [:]
            for (key, inner) in dictValue {
                result[key] = fromAny(inner)
            }
            return .object(result)
        }
        return .string(String(describing: value))
    }
}

// MARK: - 便捷取值 / 构造

extension JSONValue {
    /// 对象取值：`{"key": value}["key"]`。
    public subscript(_ key: String) -> JSONValue? {
        if case .object(let dict) = self { return dict[key] }
        return nil
    }

    public var objectValue: [String: JSONValue]? {
        if case .object(let dict) = self { return dict }
        return nil
    }

    public var arrayValue: [JSONValue]? {
        if case .array(let arr) = self { return arr }
        return nil
    }

    /// 把某个字段按给定 Codable 类型解码（用于解析 params.query → BridgeQuery）。
    public func decode<T: Decodable>(_ type: T.Type) throws -> T {
        return try JSONDecoder().decode(type, from: try encoded())
    }
}

// MARK: - 结构化错误

/// 与 TS 的 BridgeResponseFrame.error 字段逐字对齐。
/// code 用作机器可读错误分类；message 给人看；stack 仅在开发期附带。
/// 同时遵循 Error，使其可被 throw（硬要求③：任何 Swift 异常都兜成结构化错误）。
public struct OmniBridgeError: Error, Codable, Hashable {
    public let code: String?
    public let message: String
    public let stack: String?

    public init(code: String?, message: String, stack: String? = nil) {
        self.code = code
        self.message = message
        self.stack = stack
    }
}

// MARK: - 帧结构

/// TS → Runner 的请求帧。字段名与 XCUITestDriver.ts 的 BridgeRequestFrame 一致。
public struct BridgeRequestFrame: Codable {
    public let id: String
    public let type: String
    public let command: String
    public let params: JSONValue
}

/// Runner → TS 的响应帧。ok=false 时带 error；ok=true 时带 result。
public struct BridgeResponseFrame: Codable {
    public let id: String
    public let type: String
    public let ok: Bool
    public let result: JSONValue?
    public let error: OmniBridgeError?

    public init(id: String, ok: Bool, result: JSONValue? = nil, error: OmniBridgeError? = nil) {
        self.id = id
        self.type = "response"
        self.ok = ok
        self.result = result
        self.error = error
    }
}

/// Runner → TS 的握手帧。serve loop 必须先发这一帧，否则 TS 侧 120s 握手超时。
public struct BridgeReadyFrame: Codable {
    public let type: String
    public let protocolVersion: Int
    public let runnerVersion: String?
    public let appId: String?
    public let device: JSONValue?

    public init(
        protocolVersion: Int,
        runnerVersion: String? = nil,
        appId: String? = nil,
        device: JSONValue? = nil
    ) {
        self.type = "ready"
        self.protocolVersion = protocolVersion
        self.runnerVersion = runnerVersion
        self.appId = appId
        self.device = device
    }
}

/// Runner → TS 的日志帧。type=ready/response/log 三种，log 只是旁路诊断信息。
public struct BridgeLogFrame: Codable {
    public let type: String
    public let level: String
    public let message: String

    public init(level: String, message: String) {
        self.type = "log"
        self.level = level
        self.message = message
    }
}

// MARK: - BridgeQuery DSL

/// 与 XCUITestLocatorResolver.ts 的 BridgeQuery / BridgeQueryNode / BridgePredicate 逐字对齐。
/// Runner 消费这份结构化描述，翻译成 XCUIElementQuery。

public struct BridgePredicate: Codable, Hashable {
    /// 可参与谓词的 XCUIElement 属性：identifier / label / value / title / placeholderValue。
    public let field: String
    /// 匹配模式：exact / contains / startsWith / regex（与 TS 的 TextMatchModeLite 对应）。
    public let match: String
    public let value: String
}

public struct BridgeQueryNode: Codable, Hashable {
    /// XCUIElementType 名，如 "XCUIElementTypeButton"；"XCUIElementTypeAny" 表示不限类型。
    public let elementType: String
    /// 全部必须成立（AND）。
    public let predicates: [BridgePredicate]
    /// 每个内层数组是一个 OR 组，组内任一成立即可；多个 OR 组之间仍是 AND。
    public let anyOf: [[BridgePredicate]]
}

public struct BridgeQuery: Codable, Hashable {
    public let kind: String
    /// schema 版本，固定 1。
    public let version: Int
    /// 逃生舱：直接用 xpath 查（与 target 互斥）。XCUITest 没有原生 xpath 引擎，见 CommandRouter 处理。
    public let xpath: String?
    public let target: BridgeQueryNode
    public let ancestor: BridgeQueryNode?
    public let descendant: BridgeQueryNode?
    /// 多命中时取第 index 个（0-based）。
    public let index: Int?
    /// target 的等价 NSPredicate 串；有则走快路径，无则走结构化完备路径。
    public let predicateFormat: String?
    public let description: String
}
