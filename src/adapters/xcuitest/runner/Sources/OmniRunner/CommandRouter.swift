// CommandRouter.swift
// ───────────────────────────────────────────────────────────────────────────
// 命令分发器：把桥接命令翻译成 XCUI 原生调用。
//
// 【为什么集中分发】
// 26 个命令 + shutdown/ping 的形参各不相同，集中在一处 switch 里，能保证：
//  - 未知命令统一回 unknown_command（不让 Runner 崩、不让管道断）；
//  - 任何 Swift 异常都被兜成 { ok:false, error:{ code, message } }（硬要求③）；
//  - 句柄解析失败统一回 stale_handle；xpath 统一回 unsupported_xpath。
//
// 【线程模型】
// 所有命令都在主线程执行（XCUI 要求）。stdio 模式下主线程直接调 route；
// http 模式下由 BridgeTransport 把 route 调度回主线程再调。Router 本身不碰线程。
// ───────────────────────────────────────────────────────────────────────────

import Foundation
import XCTest
#if canImport(UIKit)
import UIKit
#endif

/// 路由结果：要么是一次响应，要么是「优雅退出」信号（收到 shutdown 命令时）。
public enum RouteOutcome {
    case response(result: JSONValue?, error: OmniBridgeError?)
    case shutdown
}

/// 标 @unchecked Sendable：持有 XCUIApplication / ElementRegistry，会被 HTTP 路径跨队列捕获，
/// 但运行时仅主线程访问，安全。
public final class CommandRouter: @unchecked Sendable {
    private let app: XCUIApplication
    private let registry: ElementRegistry

    public init(app: XCUIApplication, registry: ElementRegistry) {
        self.app = app
        self.registry = registry
    }

    // MARK: - 入口

    /// 分发一条命令。任何抛出都被转成结构化错误，绝不让调用方崩溃。
    public func handle(command: String, params: JSONValue) -> RouteOutcome {
        if command == "shutdown" {
            return .shutdown
        }
        if command == "ping" {
            return .response(result: .object(["pong": .bool(true)]), error: nil)
        }
        do {
            return try dispatch(command: command, params: params)
        } catch {
            // 兜底：任何未预期的异常都结构化回传，绝不让 Runner 崩。
            let message: String
            if let typed = error as? OmniBridgeError {
                message = typed.message
            } else {
                message = "命令执行异常：\(error.localizedDescription)"
            }
            return .response(
                result: nil,
                error: OmniBridgeError(code: "internal_error", message: message)
            )
        }
    }

    // MARK: - 分发

    private func dispatch(command: String, params: JSONValue) throws -> RouteOutcome {
        guard case let .object(p) = params else {
            return .response(
                result: nil,
                error: OmniBridgeError(code: "invalid_params", message: "params 必须是 JSON 对象")
            )
        }

        switch command {
        // ── 元素查询 ──
        case "element.find": return try elementFind(p)
        case "element.findAll": return try elementFindAll(p)
        case "element.probe": return try elementProbe(p)
        case "element.attribute": return try elementAttribute(p)
        case "element.attributes": return try elementAttributes(p)

        // ── 元素交互 ──
        case "element.tap": return try elementTap(p)
        case "element.doubleTap": return try elementDoubleTap(p)
        case "element.press": return try elementPress(p)
        case "element.typeText": return try elementTypeText(p)
        case "element.clearText": return try elementClearText(p)
        case "element.scroll": return try elementScroll(p)
        case "element.swipe": return try elementSwipe(p)

        // ── 设备级 ──
        case "device.tapAt": return try deviceTapAt(p)
        case "device.swipe": return try deviceSwipe(p)
        case "device.pressHome": return devicePressHome()
        case "device.background": return try deviceBackground(p)
        case "device.openUrl": return try deviceOpenUrl(p)
        case "device.info": return deviceInfo()
        case "device.pageSource": return devicePageSource()
        case "device.screenshot": return deviceScreenshot()
        case "device.getOrientation": return deviceGetOrientation()
        case "device.setOrientation": return try deviceSetOrientation(p)
        case "device.dismissKeyboard": return deviceDismissKeyboard()

        // ── App 生命周期 ──
        case "app.launch": return try appLaunch(p)
        case "app.terminate": return appTerminate()
        case "app.descendants": return try appDescendants(p)

        default:
            return .response(
                result: nil,
                error: OmniBridgeError(code: "unknown_command", message: "未识别的命令：\(command)")
            )
        }
    }

    // MARK: - 参数小工具

    private func stringParam(_ p: [String: JSONValue], _ key: String) -> String? {
        guard case let .string(s) = p[key] ?? .null else { return nil }
        return s
    }

    private func intParam(_ p: [String: JSONValue], _ key: String) -> Int? {
        guard case let .number(n) = p[key] ?? .null else { return nil }
        return Int(n)
    }

    private func doubleParam(_ p: [String: JSONValue], _ key: String) -> Double? {
        guard case let .number(n) = p[key] ?? .null else { return nil }
        return n
    }

    private func boolParam(_ p: [String: JSONValue], _ key: String) -> Bool? {
        guard case let .bool(b) = p[key] ?? .null else { return nil }
        return b
    }

    /// 把 JSONValue 规整成字符串（用于 launchArgs / permissions 扁平化）。
    private func stringify(_ value: JSONValue) -> String {
        switch value {
        case .string(let s): return s
        case .number(let n): return String(format: "%g", n)
        case .bool(let b): return b ? "true" : "false"
        case .null: return ""
        case .object, .array:
            if let data = try? JSONEncoder().encode(value) {
                return String(data: data, encoding: .utf8) ?? ""
            }
            return ""
        }
    }

    private func ok(_ result: JSONValue? = nil) -> RouteOutcome {
        return .response(result: result, error: nil)
    }

    private func fail(code: String, _ message: String) -> RouteOutcome {
        return .response(result: nil, error: OmniBridgeError(code: code, message: message))
    }

    /// 从 params 解出 BridgeQuery，并处理 xpath 互斥（XCUITest 无原生 xpath 引擎）。
    private func decodeQuery(_ p: [String: JSONValue]) throws -> BridgeQuery {
        guard let queryValue = p["query"] else {
            throw OmniBridgeError(code: "invalid_query", message: "缺少 query 参数")
        }
        let query: BridgeQuery
        do {
            query = try queryValue.decode(BridgeQuery.self)
        } catch {
            throw OmniBridgeError(code: "invalid_query", message: "query 无法解析：\(error.localizedDescription)")
        }
        if query.xpath != nil {
            // 与项目「Detox 不支持就抛错、不静默降级」的硬原则一致。
            throw OmniBridgeError(
                code: "unsupported_xpath",
                message: "XCUITest 没有原生 xpath 引擎，请改用 testId / 结构化字段（identifier/label/value 等）"
            )
        }
        return query
    }

    // MARK: - 快照 / 属性读取

    /// 读取元素最新属性快照，字段与 TS 的 XCUITestElementSnapshot 逐字对齐。
    private func snapshot(of element: XCUIElement) -> JSONValue {
        var dict: [String: JSONValue] = [:]
        dict["identifier"] = .string(element.identifier)
        dict["label"] = .string(element.label)
        // value 是 Any?，用 KVC 读出再规整。
        dict["value"] = JSONValue.fromAny((element as NSObject).value(forKey: "value"))
        dict["title"] = JSONValue.fromAny((element as NSObject).value(forKey: "title"))
        dict["placeholderValue"] = .string(element.placeholderValue ?? "")
        dict["elementType"] = .string(elementTypeToString(element.elementType))
        dict["enabled"] = .bool(element.isEnabled)
        dict["selected"] = .bool(element.isSelected)
        dict["visible"] = .bool(element.isHittable)
        dict["hittable"] = .bool(element.isHittable)
        let frame = element.frame
        dict["frame"] = .object([
            "x": .number(Double(frame.origin.x)),
            "y": .number(Double(frame.origin.y)),
            "width": .number(Double(frame.size.width)),
            "height": .number(Double(frame.size.height)),
        ])
        return .object(dict)
    }

    /// 读单个命名属性（KVC 能读 label/value/identifier/title/placeholderValue/enabled/selected/visible 等）。
    private func readAttribute(_ element: XCUIElement, name: String) -> JSONValue {
        let ns = element as NSObject
        return JSONValue.fromAny(ns.value(forKey: name))
    }

    // MARK: - 元素查询命令

    private func elementFind(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let query = try decodeQuery(p)
        let base = resolveQuery(query, app: app)
        let element: XCUIElement
        if let idx = intParam(p, "index") {
            element = base.element(boundBy: idx)
        } else if let qidx = query.index {
            element = base.element(boundBy: qidx)
        } else {
            element = base.firstMatch
        }
        let timeout = (doubleParam(p, "timeoutMs") ?? 0) / 1000.0
        let found = element.waitForExistence(timeout: timeout)
        if !found {
            // 与 TS element.find 的「found===false 或 handle 为空」判定一致。
            return ok(.object([
                "found": .bool(false),
                "handle": .string(""),
                "snapshot": .null,
            ]))
        }
        let handle = registry.register(element)
        return ok(.object([
            "found": .bool(true),
            "handle": .string(handle),
            "snapshot": snapshot(of: element),
        ]))
    }

    private func elementFindAll(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let query = try decodeQuery(p)
        let query_ = resolveQuery(query, app: app)
        let count = query_.count
        var handles: [JSONValue] = []
        var snapshots: [JSONValue] = []
        for i in 0..<count {
            let element = query_.element(boundBy: i)
            handles.append(.string(registry.register(element)))
            snapshots.append(snapshot(of: element))
        }
        return ok(.object([
            "handles": .array(handles),
            "snapshots": .array(snapshots),
        ]))
    }

    private func elementProbe(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let query = try decodeQuery(p)
        let base = resolveQuery(query, app: app)
        let element: XCUIElement
        if let idx = intParam(p, "index") {
            element = base.element(boundBy: idx)
        } else if let qidx = query.index {
            element = base.element(boundBy: qidx)
        } else {
            element = base.firstMatch
        }
        let timeout = (doubleParam(p, "timeoutMs") ?? 0) / 1000.0
        let found = element.waitForExistence(timeout: timeout)
        let count = base.count
        return ok(.object([
            "found": .bool(found),
            "count": .number(Double(count)),
            "snapshot": found ? snapshot(of: element) : .null,
        ]))
    }

    private func elementAttribute(_ p: [String: JSONValue]) throws -> RouteOutcome {
        guard let handle = stringParam(p, "handle") else {
            return fail(code: "invalid_params", "element.attribute 缺少 handle")
        }
        guard let element = registry.resolve(handle) else {
            return fail(code: "stale_handle", "句柄已失效（App 可能已重启）：\(handle)")
        }
        guard let name = stringParam(p, "name") else {
            return fail(code: "invalid_params", "element.attribute 缺少 name")
        }
        return ok(.object(["value": readAttribute(element, name: name)]))
    }

    private func elementAttributes(_ p: [String: JSONValue]) throws -> RouteOutcome {
        guard let handle = stringParam(p, "handle") else {
            return fail(code: "invalid_params", "element.attributes 缺少 handle")
        }
        guard let element = registry.resolve(handle) else {
            return fail(code: "stale_handle", "句柄已失效（App 可能已重启）：\(handle)")
        }
        return ok(snapshot(of: element))
    }

    // MARK: - 元素交互命令

    private func resolveHandle(_ p: [String: JSONValue]) throws -> XCUIElement {
        guard let handle = stringParam(p, "handle") else {
            throw OmniBridgeError(code: "invalid_params", message: "缺少 handle")
        }
        guard let element = registry.resolve(handle) else {
            throw OmniBridgeError(code: "stale_handle", message: "句柄已失效（App 可能已重启）：\(handle)")
        }
        return element
    }

    /// XCTest **没有** `XCUIElement.clearText()` 这个 API（常见误记，实测 Xcode 26.6 报
    /// "value of type 'XCUIElement' has no member 'clearText'"）。这里手工实现：
    /// 读出当前值 → 逐字符发退格键。
    ///
    /// 注意 `element.value` 在输入框为空时返回的是 **placeholder 文本**，
    /// 直接按其长度退格会把光标退到上一个控件。故先与 placeholderValue 比对，相等即视为空。
    private func clearText(_ element: XCUIElement) {
        guard let current = element.value as? String, !current.isEmpty else { return }
        if let placeholder = element.placeholderValue, placeholder == current { return }
        if !element.hasFocus {
            element.tap()
        }
        let deletes = String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count)
        element.typeText(deletes)
    }

    private func elementTap(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let element = try resolveHandle(p)
        if let ox = doubleParam(p, "offsetX"), let oy = doubleParam(p, "offsetY") {
            // 以元素原点为基准的归一化零偏移，再叠加绝对像素偏移。
            element.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
                .withOffset(CGVector(dx: ox, dy: oy))
                .tap()
        } else {
            element.tap()
        }
        return ok()
    }

    private func elementDoubleTap(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let element = try resolveHandle(p)
        element.doubleTap()
        return ok()
    }

    private func elementPress(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let element = try resolveHandle(p)
        guard let durationMs = doubleParam(p, "durationMs") else {
            return fail(code: "invalid_params", "element.press 缺少 durationMs")
        }
        element.press(forDuration: durationMs / 1000.0)
        return ok()
    }

    private func elementTypeText(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let element = try resolveHandle(p)
        guard let text = stringParam(p, "text") else {
            return fail(code: "invalid_params", "element.typeText 缺少 text")
        }
        let clearFirst = boolParam(p, "clearFirst") ?? true
        let submit = boolParam(p, "submit") ?? false
        if clearFirst {
            clearText(element)
        }
        var toType = text
        if submit {
            toType += "\n"
        }
        element.typeText(toType)
        // typeDelayMs 用于 TS 侧放大超时，原生输入无法逐字控速，此处忽略（已在日志说明）。
        return ok()
    }

    private func elementClearText(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let element = try resolveHandle(p)
        clearText(element)
        return ok()
    }

    private func elementScroll(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let element = try resolveHandle(p)
        guard let direction = stringParam(p, "direction") else {
            return fail(code: "invalid_params", "element.scroll 缺少 direction")
        }
        // 滚动量：优先 distance（绝对值），否则按 percent * 元素尺寸估算。
        let frame = element.frame
        let base = doubleParam(p, "distance")
            ?? (doubleParam(p, "percent") ?? 0.6) * Double(max(frame.size.height, frame.size.width))
        let (dx, dy): (CGFloat, CGFloat)
        switch direction {
        case "up": (dx, dy) = (0, -CGFloat(base))
        case "down": (dx, dy) = (0, CGFloat(base))
        case "left": (dx, dy) = (-CGFloat(base), 0)
        case "right": (dx, dy) = (CGFloat(base), 0)
        default:
            return fail(code: "invalid_params", "element.scroll 非法 direction：\(direction)")
        }
        // 实测签名是 scroll(byDeltaX:deltaY:)（不是 byDeltaY:）。
        element.scroll(byDeltaX: dx, deltaY: dy)
        return ok()
    }

    private func elementSwipe(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let element = try resolveHandle(p)
        guard let direction = stringParam(p, "direction") else {
            return fail(code: "invalid_params", "element.swipe 缺少 direction")
        }
        switch direction {
        case "up": element.swipeUp()
        case "down": element.swipeDown()
        case "left": element.swipeLeft()
        case "right": element.swipeRight()
        default:
            return fail(code: "invalid_params", "element.swipe 非法 direction：\(direction)")
        }
        return ok()
    }

    // MARK: - 设备级命令

    private func deviceTapAt(_ p: [String: JSONValue]) throws -> RouteOutcome {
        guard let x = doubleParam(p, "x"), let y = doubleParam(p, "y") else {
            return fail(code: "invalid_params", "device.tapAt 缺少 x/y")
        }
        // App 坐标空间里 (0,0) 是左上角，叠加绝对像素偏移得到点击点。
        app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
            .withOffset(CGVector(dx: x, dy: y))
            .tap()
        return ok()
    }

    private func deviceSwipe(_ p: [String: JSONValue]) throws -> RouteOutcome {
        guard let direction = stringParam(p, "direction") else {
            return fail(code: "invalid_params", "device.swipe 缺少 direction")
        }
        switch direction {
        case "up": app.swipeUp()
        case "down": app.swipeDown()
        case "left": app.swipeLeft()
        case "right": app.swipeRight()
        default:
            return fail(code: "invalid_params", "device.swipe 非法 direction：\(direction)")
        }
        return ok()
    }

    private func devicePressHome() -> RouteOutcome {
        XCUIDevice.shared.press(.home)
        return ok()
    }

    private func deviceBackground(_ p: [String: JSONValue]) throws -> RouteOutcome {
        guard let seconds = doubleParam(p, "seconds") else {
            return fail(code: "invalid_params", "device.background 缺少 seconds")
        }
        // 回到主屏即「后台」；停 seconds 后重新回到前台。
        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval: seconds)
        app.activate()
        return ok()
    }

    private func deviceOpenUrl(_ p: [String: JSONValue]) throws -> RouteOutcome {
        guard let urlString = stringParam(p, "url"), let url = URL(string: urlString) else {
            return fail(code: "invalid_params", "device.openUrl 缺少合法 url")
        }
        // 【为什么不用 simctl】
        // Runner 跑在**设备/模拟器内部**的 XCTest 进程里，iOS 根本不提供 Process/NSTask
        // （实测报 "cannot find 'Process' in scope"），所以 Runner 侧不可能 fork 出 xcrun simctl。
        // simctl 只能由 host 侧的 Node 进程执行 —— 若需要更可靠的 deeplink，
        // 应由 TS 侧 XCUITestDriver 直接调用 simctl，而不是绕道桥接下发。
        // 这里退回 UIApplication.open：Runner 进程本身是一个 App（XCTRunner.app），可以发起系统跳转。
        #if canImport(UIKit)
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
        return ok()
        #else
        return fail(code: "unsupported", "当前平台无法打开 URL：\(urlString)")
        #endif
    }

    private func deviceInfo() -> RouteOutcome {
        let env = ProcessInfo.processInfo.environment
        let info: [String: JSONValue] = [
            "platformVersion": .string(UIDevice.current.systemVersion),
            "deviceName": .string(env["SIMULATOR_DEVICE_NAME"] ?? UIDevice.current.name),
            "udid": .string(env["SIMULATOR_UDID"] ?? ""),
            "screen": .object([
                "width": .number(Double(UIScreen.main.bounds.width)),
                "height": .number(Double(UIScreen.main.bounds.height)),
                "scale": .number(Double(UIScreen.main.scale)),
            ]),
        ]
        return ok(.object(info))
    }

    private func devicePageSource() -> RouteOutcome {
        // debugDescription 是 XCUIElement 的 AX 层级文本描述，等价于「页面源码」。
        return ok(.object(["source": .string(app.debugDescription)]))
    }

    private func deviceScreenshot() -> RouteOutcome {
        let screenshot = app.screenshot()
        let data: Data
        if #available(iOS 18.0, *) {
            data = screenshot.image.pngData() ?? Data()
        } else {
            data = screenshot.pngRepresentation
        }
        let base64 = data.base64EncodedString()
        return ok(.object(["base64": .string(base64)]))
    }

    private func deviceGetOrientation() -> RouteOutcome {
        let orientation = XCUIDevice.shared.orientation
        let name: String
        switch orientation {
        case .portrait, .portraitUpsideDown:
            name = "portrait"
        case .landscapeLeft, .landscapeRight:
            name = "landscape"
        default:
            name = "unknown"
        }
        return ok(.object(["orientation": .string(name)]))
    }

    private func deviceSetOrientation(_ p: [String: JSONValue]) throws -> RouteOutcome {
        guard let orientation = stringParam(p, "orientation") else {
            return fail(code: "invalid_params", "device.setOrientation 缺少 orientation")
        }
        if orientation.contains("landscape") {
            XCUIDevice.shared.orientation = .landscapeLeft
        } else if orientation.contains("portrait") {
            XCUIDevice.shared.orientation = .portrait
        } else {
            return fail(code: "invalid_params", "device.setOrientation 非法 orientation：\(orientation)")
        }
        return ok()
    }

    private func deviceDismissKeyboard() -> RouteOutcome {
        let keyboard = app.keyboards.firstMatch
        if keyboard.exists {
            if keyboard.buttons["Done"].exists {
                keyboard.buttons["Done"].tap()
            } else {
                keyboard.typeText("\n")
            }
        }
        return ok()
    }

    // MARK: - App 生命周期命令

    private func appLaunch(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let newInstance = boolParam(p, "newInstance") ?? true

        // launchArgs 对象扁平化为 ["-key", "value", ...]，供 App 启动时读取。
        var args: [String] = []
        if let dict = p["launchArgs"]?.objectValue {
            for (key, value) in dict {
                args.append("-" + key)
                args.append(stringify(value))
            }
        }
        if let url = stringParam(p, "url") {
            args.append(url)
        }

        // permissions 作为启动环境变量注入（App 自行消费）。
        var env: [String: String] = [:]
        if let dict = p["permissions"]?.objectValue {
            for (key, value) in dict {
                env[key] = stringify(value)
            }
        }

        app.launchArguments = args
        app.launchEnvironment = env
        if newInstance {
            app.terminate()
        }
        app.launch()
        // App 重启后旧句柄全部失效，必须清空。
        registry.reset()
        return ok()
    }

    private func appTerminate() -> RouteOutcome {
        app.terminate()
        registry.reset()
        return ok()
    }

    private func appDescendants(_ p: [String: JSONValue]) throws -> RouteOutcome {
        let query: XCUIElementQuery
        if let queryValue = p["query"] {
            let decoded = try decodeQueryHelper(queryValue)
            query = resolveQuery(decoded, app: app)
        } else {
            query = app.descendants(matching: .any)
        }
        let count = query.count
        var handles: [JSONValue] = []
        var snapshots: [JSONValue] = []
        for i in 0..<count {
            let element = query.element(boundBy: i)
            handles.append(.string(registry.register(element)))
            snapshots.append(snapshot(of: element))
        }
        return ok(.object([
            "handles": .array(handles),
            "snapshots": .array(snapshots),
        ]))
    }

    /// appDescendants 内部复用：把 JSONValue 解析为 BridgeQuery（xpath 互斥）。
    private func decodeQueryHelper(_ queryValue: JSONValue) throws -> BridgeQuery {
        let query: BridgeQuery
        do {
            query = try queryValue.decode(BridgeQuery.self)
        } catch {
            throw OmniBridgeError(code: "invalid_query", message: "query 无法解析：\(error.localizedDescription)")
        }
        if query.xpath != nil {
            throw OmniBridgeError(
                code: "unsupported_xpath",
                message: "XCUITest 没有原生 xpath 引擎，请改用 testId / 结构化字段"
            )
        }
        return query
    }

}
