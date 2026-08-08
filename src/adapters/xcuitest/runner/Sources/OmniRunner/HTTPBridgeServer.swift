// HTTPBridgeServer.swift
// ───────────────────────────────────────────────────────────────────────────
// 设备侧 HTTP 服务端：TS 侧 XCUITestDriver.ts 的 `HttpBridgeTransport` 的对端。
//
// 【端点契约】（逐字对齐 XCUITestDriver.ts:538-579）
//   GET  /health   → 200，body = BridgeReadyFrame 的 JSON（TS 用它做就绪轮询）
//   POST /command  → 请求体 BridgeRequestFrame { id, type:"request", command, params }
//                    响应体 BridgeResponseFrame { id, type:"response", ok, result?, error? }
//
// 【为什么业务失败也回 200】
// TS 侧 httpJson() 对 status < 200 || >= 300 一律 reject 成「HTTP xxx」传输错误
// （XCUITestDriver.ts:443-448），此时 body 根本不会被解析，我们精心构造的 error.code
// （stale_handle / unknown_command / invalid_params…）会被整个丢掉。
// 而 HttpBridgeTransport.send() 只看 body 里的 ok 字段来判定成败（第 580 行）。
// 所以：**业务失败 = 200 + { ok:false, error:{...} }**，5xx 只留给真正的传输层故障。
//
// 【零第三方依赖】
// 只用 Foundation + POSIX socket。与 TS 侧 XCUITestDriver.ts 的「零第三方 import」对称。
//
// 【并发模型（本文件最容易写错的地方）】
// XCUIElement 的任何操作都必须在**测试主线程**执行，在 socket 的 accept/IO 线程里直接调
// router.handle 会产生随机崩溃与莫名其妙的 XCTest 断言失败，且极难复现。
// 因此：
//   - 所有 socket I/O 在串行队列 `omni.http.io` 上；
//   - 收到 /command 后用 DispatchQueue.main.async 把 router.handle 派发回主线程，
//     再用 DispatchSemaphore 等它执行完，拿到 RouteOutcome 后才在 IO 队列上回包；
//   - 主线程侧由 serve() 跑 RunLoop 轮询，async 块才有机会被执行（见下条）。
//
// 【为什么不用 RunLoop.main.run()】
// `RunLoop.run()` 是「永久循环」，内部会不断重启 run loop，CFRunLoopStop 只能打断当前这一轮，
// 之后立刻又被重新拉起 —— shutdown 会挂死。所以这里用
// `RunLoop.current.run(mode:before:)` 逐轮轮询 + 自查停止标志，才能真正退出。
// ───────────────────────────────────────────────────────────────────────────

import Foundation

// MARK: - 连接状态

/// 单个客户端连接。所有字段仅在 `omni.http.io` 串行队列上访问。
private final class ClientConnection: @unchecked Sendable {
    let fd: Int32
    var source: DispatchSourceRead?
    var buffer: [UInt8] = []
    init(fd: Int32) { self.fd = fd }
}

/// 已完整收到的一次 HTTP 请求。
private struct ParsedRequest {
    let method: String
    let path: String
    let body: Data
}

/// 跨线程搬运 RouteOutcome 的盒子（闭包里不能直接改捕获的局部 var 并保证 Sendable）。
private final class OutcomeBox: @unchecked Sendable {
    var value: RouteOutcome?
}

// MARK: - HTTP 服务端

public final class HttpBridgeTransport: BridgeTransport, @unchecked Sendable {
    private let host: String
    private let port: Int
    /// 会话总超时：兜底防止 TS 侧异常退出后 Runner 永远占着模拟器不放。
    private let sessionTimeout: TimeInterval
    /// 单条命令在主线程上的最长执行时间，超时回结构化错误而不是让 IO 队列永久卡死。
    private let commandTimeout: TimeInterval

    private let ioQueue = DispatchQueue(label: "omni.http.io")
    private let stateLock = NSLock()

    private var listenFd: Int32 = -1
    private var clients: [Int32: ClientConnection] = [:]
    private var stopped = false

    public init(
        host: String,
        port: Int,
        sessionTimeout: TimeInterval = 3600,
        commandTimeout: TimeInterval = 300
    ) {
        self.host = host
        self.port = port
        self.sessionTimeout = sessionTimeout
        self.commandTimeout = commandTimeout
    }

    // MARK: 停止标志

    private func isStopped() -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return stopped
    }

    private func markStopped() {
        stateLock.lock()
        stopped = true
        stateLock.unlock()
    }

    // MARK: - 服务主循环（在测试主线程调用）

    public func serve(
        ready: BridgeReadyFrame,
        router: CommandRouter,
        prefix: String,
        log: @escaping @Sendable (String, String) -> Void
    ) {
        // 往已被对端关闭的 socket 写数据默认会投递 SIGPIPE 直接杀进程；
        // 这里全局忽略，配合每个连接上的 SO_NOSIGPIPE 双保险。
        signal(SIGPIPE, SIG_IGN)

        let encoder = JSONEncoder()
        guard let readyData = try? encoder.encode(ready) else {
            log("error", "无法序列化 ready 帧，HTTP 桥接无法启动")
            return
        }

        let fd = setupListener()
        guard fd >= 0 else {
            log("error", "HTTP 监听套接字创建失败：\(host):\(port)（端口被占用？errno=\(errno)）")
            return
        }
        listenFd = fd
        log("info", "http 桥接已启动，监听 \(host):\(port)")

        let acceptSource = DispatchSource.makeReadSource(fileDescriptor: fd, queue: ioQueue)
        acceptSource.setEventHandler { [weak self] in
            self?.acceptPending(router: router, encoder: encoder, readyData: readyData, log: log)
        }
        acceptSource.resume()

        // 【必须有一个常驻输入源】
        // 若 run loop 里一个输入源都没有，run(mode:before:) 会立刻返回，
        // 整个 while 变成 100% CPU 的忙等。挂一个空转 timer 把每轮阻塞在 50ms 上。
        let keepAlive = Timer(timeInterval: 0.05, repeats: true) { _ in }
        RunLoop.current.add(keepAlive, forMode: .default)

        let deadline = Date().addingTimeInterval(sessionTimeout)
        while !isStopped() && Date() < deadline {
            // 主线程在这里空转，DispatchQueue.main.async 派发过来的命令得以执行。
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }

        if !isStopped() {
            log("warn", "会话超时（\(Int(sessionTimeout))s），HTTP 桥接主动退出")
        }

        keepAlive.invalidate()
        acceptSource.cancel()
        ioQueue.sync {
            for (_, conn) in clients {
                conn.source?.cancel()
            }
            clients.removeAll()
        }
        close(fd)
        listenFd = -1
        log("info", "http 桥接已关闭")
    }

    // MARK: - 监听套接字

    /// 解析监听地址。`inet_addr("localhost")` 会返回 INADDR_NONE 导致 bind 到 255.255.255.255，
    /// 所以这里显式处理 localhost / 空串 / 0.0.0.0 三种写法。
    private func resolveHostAddress(_ raw: String) -> in_addr_t {
        let normalized = raw.trimmingCharacters(in: .whitespaces).lowercased()
        if normalized.isEmpty || normalized == "localhost" {
            return inet_addr("127.0.0.1")
        }
        if normalized == "0.0.0.0" || normalized == "*" {
            return in_addr_t(0) // INADDR_ANY
        }
        let value = inet_addr(normalized)
        if value == in_addr_t.max { // INADDR_NONE：非法字面量，退回回环
            return inet_addr("127.0.0.1")
        }
        return value
    }

    private func setupListener() -> Int32 {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return -1 }

        var yes: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))

        // 【非阻塞】accept 在 DispatchSource 事件里循环调用，直到 EWOULDBLOCK 才退出循环。
        // 若 fd 是阻塞的，第二次 accept 会永久阻塞并把整个串行 IO 队列钉死 —— 之后所有请求全部失联。
        let flags = fcntl(fd, F_GETFL, 0)
        _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)

        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        // htons 是函数式宏，Swift 不可见；等价写法是主机序转大端。
        addr.sin_port = UInt16(truncatingIfNeeded: port).bigEndian
        addr.sin_addr = in_addr(s_addr: resolveHostAddress(host))

        let bound = withUnsafePointer(to: &addr) { pointer -> Int32 in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                bind(fd, sockaddrPointer, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0 else { close(fd); return -1 }
        guard listen(fd, 16) == 0 else { close(fd); return -1 }
        return fd
    }

    // MARK: - 接受连接

    private func acceptPending(
        router: CommandRouter,
        encoder: JSONEncoder,
        readyData: Data,
        log: @escaping @Sendable (String, String) -> Void
    ) {
        while true {
            var clientAddr = sockaddr_in()
            var clientLen = socklen_t(MemoryLayout<sockaddr_in>.size)
            let clientFd = withUnsafeMutablePointer(to: &clientAddr) { pointer -> Int32 in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                    accept(listenFd, sockaddrPointer, &clientLen)
                }
            }
            if clientFd < 0 {
                // 待接受队列已排空（非阻塞语义），或监听 fd 已被关闭。
                if errno == EINTR { continue }
                break
            }

            var one: Int32 = 1
            setsockopt(clientFd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))

            let conn = ClientConnection(fd: clientFd)
            clients[clientFd] = conn

            let source = DispatchSource.makeReadSource(fileDescriptor: clientFd, queue: ioQueue)
            source.setEventHandler { [weak self] in
                self?.onReadable(conn, router: router, encoder: encoder, readyData: readyData, log: log)
            }
            // 【关闭时机】cancelHandler 与 eventHandler 同在串行 ioQueue 上，
            // 所以「先 respond 再 cancel」时，close 一定发生在写完之后，不会截断响应。
            source.setCancelHandler { [weak self] in
                close(clientFd)
                self?.clients[clientFd] = nil
            }
            conn.source = source
            source.resume()
        }
    }

    // MARK: - 读取与分帧

    private func onReadable(
        _ conn: ClientConnection,
        router: CommandRouter,
        encoder: JSONEncoder,
        readyData: Data,
        log: @escaping @Sendable (String, String) -> Void
    ) {
        var chunk = [UInt8](repeating: 0, count: 8192)
        let n = read(conn.fd, &chunk, chunk.count)
        if n == 0 {
            conn.source?.cancel() // 对端已关闭
            return
        }
        if n < 0 {
            if errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK { return }
            conn.source?.cancel()
            return
        }
        conn.buffer.append(contentsOf: chunk[0..<n])

        // 【分帧】一次 read 不保证收全 body（Content-Length 可能跨多个 TCP 段）。
        // parse 返回 nil 表示「还没收全」，直接返回等下一次可读事件即可。
        guard let request = Self.parse(conn.buffer) else { return }

        switch (request.method, request.path) {
        case ("GET", "/health"):
            respond(conn.fd, status: 200, reason: "OK", body: readyData)
            conn.source?.cancel()
        case ("POST", "/command"):
            handleCommand(conn, request: request, router: router, encoder: encoder, log: log)
        default:
            respondPlain(conn.fd, status: 404, reason: "Not Found", message: "unknown endpoint \(request.path)")
            conn.source?.cancel()
        }
    }

    /// 解析 HTTP/1.1 请求。收全返回 ParsedRequest，未收全返回 nil。
    private static func parse(_ bytes: [UInt8]) -> ParsedRequest? {
        let separator: [UInt8] = [0x0D, 0x0A, 0x0D, 0x0A] // \r\n\r\n
        guard let headerEnd = indexOf(separator, in: bytes) else { return nil }

        let headerBytes = Array(bytes[0..<headerEnd])
        guard let headerText = String(bytes: headerBytes, encoding: .utf8) else { return nil }
        let lines = headerText.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else { return nil }
        let parts = requestLine.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        guard parts.count >= 2 else { return nil }

        var contentLength = 0
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[line.startIndex..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            guard name == "content-length" else { continue }
            let rawValue = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            contentLength = Int(rawValue) ?? 0
        }

        let bodyStart = headerEnd + separator.count
        // body 尚未收全 → 等下一次可读事件。
        guard bytes.count >= bodyStart + contentLength else { return nil }
        // 严格按 Content-Length 截断，多余字节（流水线请求）不当成本次 body。
        let body = Data(bytes[bodyStart..<(bodyStart + contentLength)])
        return ParsedRequest(method: parts[0], path: parts[1], body: body)
    }

    private static func indexOf(_ pattern: [UInt8], in bytes: [UInt8]) -> Int? {
        guard !pattern.isEmpty, bytes.count >= pattern.count else { return nil }
        let limit = bytes.count - pattern.count
        var i = 0
        while i <= limit {
            var matched = true
            var j = 0
            while j < pattern.count {
                if bytes[i + j] != pattern[j] { matched = false; break }
                j += 1
            }
            if matched { return i }
            i += 1
        }
        return nil
    }

    // MARK: - 命令处理（派发回主线程）

    private func handleCommand(
        _ conn: ClientConnection,
        request: ParsedRequest,
        router: CommandRouter,
        encoder: JSONEncoder,
        log: @escaping @Sendable (String, String) -> Void
    ) {
        let frame: BridgeRequestFrame
        do {
            frame = try JSONDecoder().decode(BridgeRequestFrame.self, from: request.body)
        } catch {
            // 帧结构非法仍回 200 + ok:false —— 让 TS 侧拿到 error.code 而不是一句「HTTP 400」。
            let fallbackId = Self.bestEffortId(from: request.body)
            writeResponse(
                conn,
                encoder: encoder,
                frame: BridgeResponseFrame(
                    id: fallbackId,
                    ok: false,
                    error: OmniBridgeError(
                        code: "invalid_frame",
                        message: "请求体不是合法的 BridgeRequestFrame：\(error.localizedDescription)"
                    )
                )
            )
            return
        }

        // 【回主线程执行】XCUIElement 只能在测试主线程操作。
        let box = OutcomeBox()
        let semaphore = DispatchSemaphore(value: 0)
        DispatchQueue.main.async {
            box.value = router.handle(command: frame.command, params: frame.params)
            semaphore.signal()
        }

        if semaphore.wait(timeout: .now() + commandTimeout) == .timedOut {
            writeResponse(
                conn,
                encoder: encoder,
                frame: BridgeResponseFrame(
                    id: frame.id,
                    ok: false,
                    error: OmniBridgeError(
                        code: "main_thread_timeout",
                        message: "命令 \(frame.command) 在主线程上超过 \(Int(commandTimeout))s 未返回"
                    )
                )
            )
            return
        }

        guard let outcome = box.value else {
            writeResponse(
                conn,
                encoder: encoder,
                frame: BridgeResponseFrame(
                    id: frame.id,
                    ok: false,
                    error: OmniBridgeError(code: "internal_error", message: "命令未产生任何结果")
                )
            )
            return
        }

        switch outcome {
        case .shutdown:
            // 【顺序至关重要】必须先把 200 响应完整写回去，再停 run loop。
            // 反过来做的话 TS 侧 dispose() 里的 send('shutdown') 会收到连接重置，
            // 把一次**正常关闭**误判成 Runner 崩溃，日志里全是假故障。
            writeResponse(
                conn,
                encoder: encoder,
                frame: BridgeResponseFrame(id: frame.id, ok: true, result: .object(["shutdown": .bool(true)]))
            )
            log("info", "收到 shutdown，优雅退出")
            markStopped()
            CFRunLoopStop(CFRunLoopGetMain()) // 立刻唤醒主线程，不用等轮询间隔
        case .response(let result, let error):
            writeResponse(
                conn,
                encoder: encoder,
                frame: BridgeResponseFrame(id: frame.id, ok: error == nil, result: result, error: error)
            )
        }
    }

    /// 帧解码失败时尽力从原始 JSON 里捞出 id，让 TS 侧仍能把响应配对上。
    private static func bestEffortId(from body: Data) -> String {
        guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let id = object["id"] as? String else {
            return ""
        }
        return id
    }

    private func writeResponse(_ conn: ClientConnection, encoder: JSONEncoder, frame: BridgeResponseFrame) {
        let data = (try? encoder.encode(frame)) ?? Data(#"{"id":"","type":"response","ok":false}"#.utf8)
        respond(conn.fd, status: 200, reason: "OK", body: data)
        conn.source?.cancel()
    }

    // MARK: - 写响应

    private func respond(_ fd: Int32, status: Int, reason: String, body: Data) {
        let header = "HTTP/1.1 \(status) \(reason)\r\n"
            + "Content-Type: application/json; charset=utf-8\r\n"
            + "Content-Length: \(body.count)\r\n"
            + "Connection: close\r\n\r\n"
        writeAll(fd, Data(header.utf8))
        writeAll(fd, body)
    }

    private func respondPlain(_ fd: Int32, status: Int, reason: String, message: String) {
        let payload = Data(message.utf8)
        let header = "HTTP/1.1 \(status) \(reason)\r\n"
            + "Content-Type: text/plain; charset=utf-8\r\n"
            + "Content-Length: \(payload.count)\r\n"
            + "Connection: close\r\n\r\n"
        writeAll(fd, Data(header.utf8))
        writeAll(fd, payload)
    }

    /// 循环写直到写完。截图命令的 base64 body 可达数 MB，单次 write 几乎必然是部分写。
    private func writeAll(_ fd: Int32, _ data: Data) {
        data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            guard var pointer = raw.baseAddress else { return }
            var remaining = raw.count
            while remaining > 0 {
                let written = write(fd, pointer, remaining)
                if written > 0 {
                    pointer = pointer.advanced(by: written)
                    remaining -= written
                    continue
                }
                if written < 0 && (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK) {
                    usleep(1000)
                    continue
                }
                return // 对端已断开，放弃本次写
            }
        }
    }
}
