// ElementRegistry.swift
// ───────────────────────────────────────────────────────────────────────────
// 元素句柄注册表：Runner 侧持有真正的 XCUIElement，只把不透明 String 句柄返给 TS。
//
// 【为什么需要不透明句柄】
// TS 侧的 XCUITestElementHandle 只携带一个 String handle。XCUIElement 是「惰性查询代理」，
// 不能直接序列化传给 Node 进程，也不应该暴露给上层。Runner 在这里维护 handle→元素的映射，
// 上层每次用 handle 来引用同一个元素。这与 XCUITestDriver.ts 的 XCUITestElementHandle 定义一致。
//
// 【为什么用 UUID 而不是下标】
// 连续下标在 findAll 之后容易被误用成「全局索引」，而 XCUIElementQuery 的 index 是查询内的。
// UUID 句柄强制上层「先查到再持有」，避免越界与悬空引用。
// ───────────────────────────────────────────────────────────────────────────

import XCTest

/// 句柄 → XCUIElement 的持有与回收。所有访问都发生在主线程（XCUI 操作必须在主线程），故无需加锁。
/// 标 @unchecked Sendable：会被跨队列捕获，但运行时仅主线程访问，安全。
public final class ElementRegistry: @unchecked Sendable {
    private var store: [String: XCUIElement] = [:]

    public init() {}

    /// 注册一个元素，返回不透明句柄。同一元素多次注册会得到不同句柄（符合「每次查询都是新代理」的 XCUI 语义）。
    public func register(_ element: XCUIElement) -> String {
        let handle = UUID().uuidString
        store[handle] = element
        return handle
    }

    /// 解析句柄为 XCUIElement；句柄过期（如 App 重启后）返回 nil，由调用方转为 stale_handle 错误。
    public func resolve(_ handle: String) -> XCUIElement? {
        return store[handle]
    }

    /// 释放单个句柄，回收内存。找不到则静默忽略。
    public func release(_ handle: String) {
        store.removeValue(forKey: handle)
    }

    /// 清空全部句柄（App 终止 / 重新 launch 后旧句柄全部失效）。
    public func reset() {
        store.removeAll()
    }
}
