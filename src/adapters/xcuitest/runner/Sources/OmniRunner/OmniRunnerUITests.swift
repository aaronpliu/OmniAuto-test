// OmniRunnerUITests.swift
// ───────────────────────────────────────────────────────────────────────────
// XCUITest 入口：整个 Runner 的唯一 XCTestCase。
//
// 【为什么必须是 XCTestCase】
// `xcodebuild test-without-building` 是靠**发现 XCTestCase 子类的 test* 方法**来决定跑什么的。
// 没有这样一个方法，前面那些 CommandRouter / QueryResolver 写得再完整也永远不会被执行。
// 这个方法就是设备侧服务端的 main()。
//
// ⚠️ 【本 target 内必须有且只有一个 test* 方法】
// XCTest 会**串行**跑完所有 test 方法。本方法会一直阻塞到收到 shutdown，
// 若再加第二个 test 方法，它只会在会话结束后才启动，届时 TS 侧早已断开，
// 表现为 xcodebuild 迟迟不退出 / 报无关的失败。新增能力请扩 CommandRouter，不要新增 test 方法。
//
// 【启动顺序（错一步就是 120s 握手超时）】
// 1) 读环境变量（裸名优先，回退 SIMCTL_CHILD_ 前缀）；
// 2) 启动被测 App；
// 3) 构造 ElementRegistry / CommandRouter；
// 4) 起传输层，**先发 ready 帧**，再进入服务循环。
//    - http：GET /health 返回 ready 帧供 TS 轮询；同时也往 stdout 打一行 ready，便于人工排障；
//    - stdio：直接往 stdout 打 ready 帧。
// ───────────────────────────────────────────────────────────────────────────

import Foundation
import XCTest
#if canImport(UIKit)
import UIKit
#endif

/// 读取 Runner 环境变量。
///
/// 【为什么要两次查找】
/// TS 侧 `buildRunnerEnv()`（XCUITestDriver.ts:695-716）会把每个变量注入两份：
/// 裸名给 xcodebuild 自身，`SIMCTL_CHILD_` 前缀那份由 simctl 转投给**被测 App 进程**。
/// Runner 可能由这两条路径中的任意一条拉起，所以先读裸名，取不到再读带前缀的。
/// 空串一律视为「未设置」，避免把 `OMNI_APP_ID=""` 当成合法 bundleId。
public func omniRunnerEnv(_ name: String) -> String? {
    let env = ProcessInfo.processInfo.environment
    if let value = env[name], !value.isEmpty {
        return value
    }
    if let value = env["SIMCTL_CHILD_" + name], !value.isEmpty {
        return value
    }
    return nil
}

final class OmniRunnerUITests: XCTestCase {

    /// 桥接配置。字段名与 XCUITestDriver.ts:buildRunnerEnv() 逐字对齐。
    private struct BridgeConfig {
        let mode: String
        let host: String
        let port: Int
        let prefix: String
        let protocolVersion: Int
        let runId: String?
        let appId: String?
        let platform: String?
        let deviceKind: String?
        let sessionTimeout: TimeInterval
    }

    private func readConfig() -> BridgeConfig {
        // 默认值全部对齐 TS 侧 DEFAULT_BRIDGE_CONFIG / BRIDGE_LINE_PREFIX / BRIDGE_PROTOCOL_VERSION。
        //
        // ⚠️ mode 的兜底值必须是 "http" 而不是 "stdio"：
        // 这里的 ?? 只在**环境变量没送达**时生效（simctl 未转投、xcodebuild 未透传等）。
        // 那种情况下若回落到 stdio，Runner 会安静地进入一个「能发 ready、永远收不到命令」
        // 的状态，报错现场极难定位；回落到 http 则至少会真的监听端口，
        // 主机侧可以用 GET /health 探到它、拿到明确的连接结果。坏情况下也要坏得可诊断。
        return BridgeConfig(
            mode: omniRunnerEnv("OMNI_BRIDGE_MODE") ?? "http",
            host: omniRunnerEnv("OMNI_BRIDGE_HOST") ?? "127.0.0.1",
            port: Int(omniRunnerEnv("OMNI_BRIDGE_PORT") ?? "") ?? 8642,
            prefix: omniRunnerEnv("OMNI_BRIDGE_PREFIX") ?? "@OMNI@",
            protocolVersion: Int(omniRunnerEnv("OMNI_BRIDGE_PROTOCOL_VERSION") ?? "") ?? 1,
            runId: omniRunnerEnv("OMNI_RUN_ID"),
            appId: omniRunnerEnv("OMNI_APP_ID"),
            platform: omniRunnerEnv("OMNI_PLATFORM"),
            deviceKind: omniRunnerEnv("OMNI_DEVICE_KIND"),
            // 非 TS 契约字段，仅作 Runner 侧兜底：防止 TS 进程异常退出后 Runner 永久占着设备。
            sessionTimeout: TimeInterval(omniRunnerEnv("OMNI_SESSION_TIMEOUT_MS")
                .flatMap { Int($0) } ?? 3_600_000) / 1000.0
        )
    }

    /// ready 帧里的 device 信息（模拟器上 SIMULATOR_* 由 simctl 注入）。
    private func buildDeviceInfo(_ config: BridgeConfig) -> JSONValue {
        let env = ProcessInfo.processInfo.environment
        var info: [String: JSONValue] = [
            "platform": .string(config.platform ?? "ios"),
            "kind": .string(config.deviceKind ?? (env["SIMULATOR_UDID"] != nil ? "simulator" : "real")),
            "udid": .string(env["SIMULATOR_UDID"] ?? ""),
        ]
        if let runId = config.runId {
            info["runId"] = .string(runId)
        }
        #if canImport(UIKit)
        info["platformVersion"] = .string(UIDevice.current.systemVersion)
        info["deviceName"] = .string(env["SIMULATOR_DEVICE_NAME"] ?? UIDevice.current.name)
        info["model"] = .string(env["SIMULATOR_MODEL_IDENTIFIER"] ?? UIDevice.current.model)
        info["screen"] = .object([
            "width": .number(Double(UIScreen.main.bounds.width)),
            "height": .number(Double(UIScreen.main.bounds.height)),
            "scale": .number(Double(UIScreen.main.scale)),
        ])
        #endif
        return .object(info)
    }

    // MARK: - 唯一入口

    func testOmniBridgeSession() {
        // 桥接是长连接会话：中途任何一次断言失败都不该让后续命令处理链继续跑在半损状态上。
        continueAfterFailure = false

        let config = readConfig()

        // OMNI_APP_ID 为空时用默认构造（读 target 的 TEST_TARGET_NAME / 宿主 App）。
        let app: XCUIApplication
        if let appId = config.appId {
            app = XCUIApplication(bundleIdentifier: appId)
        } else {
            app = XCUIApplication()
        }
        app.launch()

        let registry = ElementRegistry()
        let router = CommandRouter(app: app, registry: registry)

        let ready = BridgeReadyFrame(
            protocolVersion: config.protocolVersion,
            runnerVersion: "1.0.0",
            appId: config.appId,
            device: buildDeviceInfo(config)
        )

        // 旁路日志帧：始终写 stdout，xcodebuild 会把它转发给 TS 侧当 log 帧消费。
        let prefix = config.prefix
        let log: @Sendable (String, String) -> Void = { level, message in
            Self.emitLine(prefix: prefix, value: BridgeLogFrame(level: level, message: message))
        }

        if config.mode == "http" {
            // http 模式下 TS 侧靠轮询 GET /health 握手，但仍在 stdout 打一行 ready，
            // 便于人在 xcodebuild 日志里一眼确认 Runner 起来了、监听在哪个端口。
            Self.emitLine(prefix: prefix, value: ready)
            log("info", "bridge mode=http, listening on \(config.host):\(config.port)")
            let transport = HttpBridgeTransport(
                host: config.host,
                port: config.port,
                sessionTimeout: config.sessionTimeout
            )
            transport.serve(ready: ready, router: router, prefix: prefix, log: log)
        } else {
            // stdio 模式由 StdioBridgeTransport 自己发 ready 帧（先 ready 后循环）。
            let transport = StdioBridgeTransport()
            transport.serve(ready: ready, router: router, prefix: prefix, log: log)
        }
    }

    /// 输出一行协议帧：`<prefix><JSON>\n`，前缀与 JSON 之间无空格，整行单行。
    /// 直接写 fd 而不用 print，避免 stdio 行缓冲让帧滞留在缓冲区里。
    private static func emitLine(prefix: String, value: some Encodable) {
        guard let data = try? JSONEncoder().encode(value),
              let json = String(data: data, encoding: .utf8),
              let out = (prefix + json + "\n").data(using: .utf8) else {
            return
        }
        FileHandle.standardOutput.write(out)
    }
}
