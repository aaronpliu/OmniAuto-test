// BridgeTransport.swift
// ───────────────────────────────────────────────────────────────────────────
// 传输层抽象 + stdio 实现。http 实现见 HTTPBridgeServer.swift。
//
// 【stdio】
//  - 每一帧一行，行首带 @OMNI@ 哨兵（OMNI_BRIDGE_PREFIX），后接 JSON。
//  - Runner 往 stdout 写 ready / response / log 帧，从 stdin 读请求帧。
//  - 用 FileHandle 直接写 fd，绕过 stdio 缓冲，保证 TS 侧能及时读到帧。
//
// ⚠️ 【stdio 模式的先天限制 —— 必读】
// xcodebuild 会把测试进程的 **stdout** 汇聚转发到自己的 stdout（所以 TS 侧靠 @OMNI@
// 前缀过滤日志是可行的），但**反方向不成立**：xcodebuild 不会把自己的 stdin 接到
// 跑在模拟器/真机里的 XCTest 进程上 —— 那是另一台「设备」上的独立进程，
// 它的 stdin 通常直接是 /dev/null。
// 因此 `readLine()` 在真实 xcodebuild 场景下会立刻返回 nil，循环随即结束：
// **Runner 能发出 ready 帧，但永远收不到任何命令。**
// 结论：真正可用的是 http 模式（OMNI_BRIDGE_MODE=http）。
// stdio 实现保留下来是因为 TS 侧 StdioBridgeTransport 仍在，且本机直跑 Runner
// 二进制做协议联调时它是有效的；但不要把它当作 xcodebuild 路径下的默认选择。
//
// 【并发说明】
// 本机 Xcode 26 的 XCTest 类型已是 Sendable 且非 actor 隔离，但 ElementRegistry / CommandRouter
// 持有可变状态，且会被跨队列捕获，故标 @unchecked Sendable（运行时仅主线程访问，安全）。
// ───────────────────────────────────────────────────────────────────────────

import Foundation
import XCTest

/// 传输层协议：进入服务循环，直到 shutdown 或进程终止。
public protocol BridgeTransport {
    func serve(
        ready: BridgeReadyFrame,
        router: CommandRouter,
        prefix: String,
        log: @escaping @Sendable (String, String) -> Void
    )
}

// MARK: - stdio 传输

public final class StdioBridgeTransport: BridgeTransport {
    public init() {}

    public func serve(
        ready: BridgeReadyFrame,
        router: CommandRouter,
        prefix: String,
        log: @escaping @Sendable (String, String) -> Void
    ) {
        let encoder = JSONEncoder()

        // 把任意 Codable 帧写成「哨兵 + JSON + 换行」直接落到 stdout fd（不缓冲）。
        func emit(_ value: some Encodable) {
            guard let data = try? encoder.encode(value),
                  var text = String(data: data, encoding: .utf8) else { return }
            text = prefix + text + "\n"
            if let out = text.data(using: .utf8) {
                FileHandle.standardOutput.write(out)
            }
        }

        func logFrame(_ level: String, _ message: String) {
            emit(BridgeLogFrame(level: level, message: message))
        }

        logFrame("info", "stdio 桥接已启动，等待命令…")
        // 先发 ready 再进循环，否则 TS 侧 120s 握手超时。
        emit(ready)

        // 主线程直接读 stdin。命令也在主线程执行，天然满足 XCUI 的线程要求。
        while let line = readLine() {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmed.hasPrefix(prefix) else { continue }
            let payload = String(trimmed.dropFirst(prefix.count))
            guard let data = payload.data(using: .utf8),
                  let frame = try? JSONDecoder().decode(BridgeRequestFrame.self, from: data) else {
                continue
            }
            let outcome = router.handle(command: frame.command, params: frame.params)
            switch outcome {
            case .shutdown:
                // 先把响应写回去再返回，避免 TS 侧把正常关闭误判成 Runner 崩溃。
                emit(BridgeResponseFrame(
                    id: frame.id,
                    ok: true,
                    result: .object(["shutdown": .bool(true)])
                ))
                logFrame("info", "收到 shutdown，优雅退出")
                return
            case .response(let result, let error):
                emit(BridgeResponseFrame(id: frame.id, ok: error == nil, result: result, error: error))
            }
        }
        logFrame("warn", "stdin 已关闭（xcodebuild 场景下这是预期行为，见文件头说明），桥接循环结束")
    }
}
