# OmniRunner —— XCUITest 设备侧 Runner

这是 `XCUITestDriver.ts` 的**对端**。Detox / Appium 有 Node SDK，可以从 Node 进程直接驱动；
XCUITest 没有 —— 它只能由 `xcodebuild` 拉起、跑在设备/模拟器的 XCTest 进程里，代码必须是 Swift。
所以本目录是「设备侧的服务端」：接收 TS 侧发来的抽象命令，用真正的 `XCUIElement` API 执行，再回传结果。

```
TS 侧 XCUITestDriver.ts  ──spawn──▶  xcrun xcodebuild test-without-building
      （Node 进程）                          │
                                             ▼
                                    XCTest 进程（模拟器/真机内）
                                    OmniRunnerUITests.testOmniBridgeSession()
      ◀────── HTTP(:8642) / NDJSON(stdout) ──┘
```

> ✅ **默认传输模式已是 `http`**（`XCUITEST_RUNNER_DEFAULTS.mode`，端口 `8642`），开箱即为可用配置。
> **不要改回 `stdio`**——stdio 在 xcodebuild 场景下物理上收不到命令，
> 表现为「握手成功 + 第一条命令超时」。原因详见 [§4 传输模式](#4-传输模式必须选-http)。

---

## 1. 文件清单

| 文件 | 作用 |
| --- | --- |
| `Sources/OmniRunner/OmniRunnerUITests.swift` | **唯一入口**。`XCTestCase` 子类，`testOmniBridgeSession()` 是整个 Runner 的 main() |
| `Sources/OmniRunner/HTTPBridgeServer.swift` | HTTP 服务端（`GET /health` + `POST /command`），纯 POSIX socket |
| `Sources/OmniRunner/BridgeTransport.swift` | 传输层协议 + stdio 实现 |
| `Sources/OmniRunner/BridgeProtocol.swift` | 协议帧与 `JSONValue`（与 TS 侧字段逐字对齐），不依赖 XCTest |
| `Sources/OmniRunner/CommandRouter.swift` | 命令分发：26 个命令 → XCUI 原生调用 |
| `Sources/OmniRunner/QueryResolver.swift` | `BridgeQuery` DSL → `XCUIElementQuery` |
| `Sources/OmniRunner/ElementRegistry.swift` | 元素句柄注册表（handle ↔ XCUIElement） |
| `Info.plist` | UI Testing Bundle 的最小 Info.plist（见 §6） |

**这里没有 `Package.swift`，也不该有。** UI Testing Bundle 必须由 Xcode 工程构建（需要
`TEST_TARGET_NAME`、代码签名、Runner.app 打包），SwiftPM 产不出可被 `xcodebuild test-without-building`
执行的 `.xctest` bundle。正确做法是把这些 `.swift` 加进被测 App 工程的一个 UI Testing target。

---

## 2. 在 Xcode 工程里新建 UI Testing Bundle target

以示例 App `apps/mock`（scheme `OmniMock`）为例：

1. 用 Xcode 打开被测 App 的工程（`ios/OmniMock.xcworkspace`，无 workspace 则用 `.xcodeproj`）。
2. **File → New → Target… → iOS → UI Testing Bundle**。
   - **Product Name**：`OmniMockUITests` —— 必须与配置里的 `runnerTarget` 一致（见 §3）。
   - **Target to be Tested**：选被测 App target。
3. ⚠️ **删掉 Xcode 自动生成的 `OmniMockUITests.swift` 和 `OmniMockUITestsLaunchTests.swift`。**
   它们各自带着 `test*` 方法。XCTest 会**串行**跑完 target 内所有 `test*`，而
   `testOmniBridgeSession()` 会一直阻塞到收到 `shutdown`；多出来的 test 方法只会在会话结束后才启动，
   表现为 xcodebuild 迟迟不退出，或报一堆与桥接无关的失败。**本 target 内必须有且只有一个 `test*` 方法。**
4. **File → Add Files to "OmniMock"…**，选中本目录下 `Sources/OmniRunner/` 的全部 7 个 `.swift`：
   - "Copy items if needed" **不勾**（保持单一真源，e2e 工程更新后 Xcode 侧自动同步）；
   - "Add to targets" 只勾 `OmniMockUITests`。
5. 确认 target 的 **Info.plist** 存在（Xcode 通常自动生成；需要手写时见 §6）。
6. `Product → Build For → Testing`（`⇧⌘U`），确保能编出 `.xctestrun`。

之后 TS 侧就不需要 Xcode 了，`xcodebuild test-without-building` 直接复用这份产物。

---

## 3. 把 scheme / 路径回填到配置

以下字段名均**读自代码**，不是凭印象：

### `src/configs/xcuitest/xcuitest.ios.config.ts`

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `workspacePath` | `.xcworkspace` 绝对路径，与 `projectPath` **二选一**，workspace 优先 | `ios/<scheme>.xcworkspace` |
| `projectPath` | `.xcodeproj` 路径 | 无 |
| `scheme` | xcodebuild `-scheme` | 由 app key 推导：`mock` → `OmniMock`（`defaultXcuitestScheme()`） |
| `runnerTarget` | UI Testing target 名，用于 `-only-testing:` | `` `${scheme}UITests` `` → `OmniMockUITests` |
| `testPlan` | `-testPlan`，可选 | 无 |
| `configuration` | `Debug` / `Release` | `Debug` |
| `derivedDataPath` | `-derivedDataPath` | `ios/xcuitest-build` |
| `resultBundlePath` | `.xcresult` 输出 | `reports/xcresult/<runId>.xcresult` |
| `sdk` | `iphonesimulator` / `iphoneos` | 按设备推导 |

同时给 `workspacePath` 与 `projectPath` 会让 xcodebuild 直接报错拒绝执行（配置层已有校验会拦下）。

> 💡 **建议把 `runnerTarget` 写全**。`XCUITestDriver.buildXcodebuildArgs()` 拼的是
> `-only-testing:${config.runnerTarget}`，只给 target 名会选中该 target 下的所有测试。
> 填成完整测试标识更保险，也能防住 §2.3 那个坑：
> ```
> runnerTarget: 'OmniMockUITests/OmniRunnerUITests/testOmniBridgeSession'
> ```

### `src/configs/xcuitest/xcuitest.runner.config.ts`

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `command` | 可执行文件 | `/usr/bin/xcrun` |
| `handshakeTimeoutMs` | 握手超时 | `300_000` |
| `requestTimeoutMs` | 单条命令超时 | `30_000` |
| `XCUITEST_RUNNER_DEFAULTS.mode` | 传输模式 | `'http'` ✅ |
| `XCUITEST_RUNNER_DEFAULTS.host` | http 监听地址 | `'127.0.0.1'` |
| `XCUITEST_RUNNER_DEFAULTS.port` | http 端口 | `8642` |
| `XCUITEST_PROTOCOL_VERSION` | 协议版本 | `'1'` |

`src/configs/xcuitest/index.ts:192` 处 `bridge: toBridgeConfig(runner)`，
即**实际生效的** `mode/host/port` 来自 `XCUITEST_RUNNER_DEFAULTS`，
而不是 `XCUITestDriver.ts` 里的 `DEFAULT_BRIDGE_CONFIG`（后者仅在 `config.bridge`
缺失时兜底）。**两处默认值现已全部对齐**（`mode='http'`、`port=8642`），
早期版本存在的 `8300` vs `8642` 端口分歧、以及 `'1.0'` vs `1` 的协议版本分歧均已消除。

---

## 4. 传输模式：必须选 `http`

### 为什么 stdio 跑不通

`xcodebuild` 会把测试进程的 **stdout** 汇聚转发到自己的 stdout（这正是 TS 侧靠 `@OMNI@`
前缀过滤日志的前提）。但**反方向不成立**：xcodebuild 不会把自己的 stdin 接到跑在
模拟器/真机里的 XCTest 进程上 —— 那是另一台「设备」上的独立进程，stdin 基本就是 `/dev/null`。

结果是：Runner 能发出 `ready` 帧（stdout 通），但 `readLine()` 立刻返回 `nil`，
**永远收不到任何命令**。TS 侧 stdio 模式下会握手成功、随后第一条命令超时。

### 当前状态：已默认 `http`，无需操作

`XCUITestDriver.buildRunnerEnv()` 会把 `bridge.mode` 原样注入 `OMNI_BRIDGE_MODE`，
而 `bridge` 来自 `toBridgeConfig(runner)`。该值现已默认为 `'http'`：

```ts
// src/configs/xcuitest/xcuitest.runner.config.ts
export const XCUITEST_RUNNER_DEFAULTS = {
  // ...
  mode: 'http' as const,
  host: '127.0.0.1',
  port: 8642,
} as const;
```

⚠️ **注意**：`OMNI_BRIDGE_MODE` **没有**从用户环境变量读取的通路（全库仅
`XCUITestDriver.ts` 的 `buildRunnerEnv()` 一处写入），所以**改不了也绕不过**——
若把上面的默认值改回 `'stdio'`，整条链路会立刻失效且没有任何运行期开关能救回来。

---

## 5. 环境变量

Runner 读取规则：**先读裸名，取不到再读 `SIMCTL_CHILD_<name>`**。
因为 `buildRunnerEnv()`（`XCUITestDriver.ts:695-716`）会把每个变量注入两份 ——
裸名给 xcodebuild 自身，`SIMCTL_CHILD_` 那份由 simctl 转投给被测 App 进程，
而 Runner 可能由这两条路径中的任意一条拉起。空串一律视为未设置。

| 变量 | 含义 | Runner 侧默认值 |
| --- | --- | --- |
| `OMNI_BRIDGE_MODE` | `stdio` / `http` | `http`（兜底也取 http，见下） |
| `OMNI_BRIDGE_HOST` | http 监听地址 | `127.0.0.1` |
| `OMNI_BRIDGE_PORT` | http 端口 | `8642` |
| `OMNI_BRIDGE_PREFIX` | 协议帧行前缀哨兵 | `@OMNI@` |
| `OMNI_BRIDGE_PROTOCOL_VERSION` | 协议版本 | `1` |
| `OMNI_RUN_ID` | 本次运行 id，回填进 ready 帧 | 无 |
| `OMNI_APP_ID` | 被测 App bundleId；为空则用 `XCUIApplication()` 默认构造 | 无 |
| `OMNI_PLATFORM` | 平台标识 | `ios` |
| `OMNI_DEVICE_KIND` | `simulator` / `real` | 按 `SIMULATOR_UDID` 是否存在推导 |
| `OMNI_SESSION_TIMEOUT_MS` | 会话总超时兜底（**非 TS 契约字段**，Runner 本地防挂死） | `3600000` |

> 关于 `OMNI_BRIDGE_MODE` 的兜底值：这一栏只在**环境变量没送达 Runner** 时才生效。
> 该场景下刻意取 `http` 而非 `stdio` —— 回落到 stdio 会让 Runner 进入
> 「能发 ready、永远收不到命令」的静默死状态；回落到 http 至少会真的监听端口，
> 主机侧能用 `GET /health` 探到它。**坏情况下也要坏得可诊断。**

---

## 6. 最小 Info.plist

Xcode 新建 UI Testing Bundle 时通常会自动生成。需要手写时用本目录的 `Info.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>BNDL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
</dict>
</plist>
```

在 target 的 **Build Settings → Packaging → Info.plist File** 里指向它。

---

## 7. 真机：必须做端口转发

**这一条不做，真机上会遇到无法诊断的连接超时。**

- **模拟器**：与 host 共享同一个网络栈，host 上的 `127.0.0.1:<port>` 就是模拟器里的
  `127.0.0.1:<port>`。TS 侧可以直连，无需任何额外操作。
- **真机**：设备的 `127.0.0.1` 与 host 的 `127.0.0.1` 是两个完全不同的回环，
  TS 侧直连必然连不上，且现象是 `/health` 一直轮询到握手超时 —— 报错里只有一句
  「等待 Runner HTTP 服务就绪超时」，看不出是网络不通。

  需要经 usbmuxd 建立 USB 端口转发，在**跑测试之前**另起一个终端常驻：

  ```bash
  brew install libimobiledevice   # 提供 iproxy
  iproxy 8642 8642 -u <DEVICE_UDID>
  # 语法：iproxy <host本地端口> <设备端口> -u <udid>
  ```

  之后 host 上访问 `127.0.0.1:8642` 就会被转发到设备的 `8642`。
  Runner 侧保持 `OMNI_BRIDGE_HOST=127.0.0.1` 即可（usbmuxd 转发到的正是设备回环），
  **不要**为了「让外部能连」改成 `0.0.0.0` —— 那会让同网段任意机器都能操控设备。

  自检：
  ```bash
  curl -s http://127.0.0.1:8642/health
  # 期望：{"type":"ready","protocolVersion":1,...}
  ```

---

## 8. 端点契约

### `GET /health`

TS 侧 `HttpBridgeTransport.start()` 用它做就绪轮询（`XCUITestDriver.ts:538-547`）。

```json
{
  "type": "ready",
  "protocolVersion": 1,
  "runnerVersion": "1.0.0",
  "appId": "com.omni.mock",
  "device": {
    "platform": "ios",
    "kind": "simulator",
    "udid": "A1B2C3D4-...",
    "platformVersion": "17.5",
    "deviceName": "iPhone 15",
    "model": "iPhone15,2",
    "screen": { "width": 393, "height": 852, "scale": 3 }
  }
}
```

### `POST /command`

请求体 `BridgeRequestFrame`：

```json
{ "id": "9f1c…", "type": "request", "command": "element.tap", "params": { "handle": "…" } }
```

成功响应（HTTP 200）：

```json
{ "id": "9f1c…", "type": "response", "ok": true, "result": { "pong": true } }
```

失败响应 —— **仍然是 HTTP 200**：

```json
{
  "id": "9f1c…",
  "type": "response",
  "ok": false,
  "error": { "code": "stale_handle", "message": "句柄已失效（App 可能已重启）：…" }
}
```

> **为什么业务失败不用 5xx**：TS 侧 `httpJson()` 对非 2xx 一律 reject 成
> 「HTTP xxx」传输错误（`XCUITestDriver.ts:443-448`），此时 body 根本不会被解析，
> 精心构造的 `error.code` 会被整个丢掉；而 `send()` 只看 body 里的 `ok` 字段判定成败（第 580 行）。
> 所以 5xx 只留给真正的传输层故障。

---

## 9. 已知限制

- **`device.openUrl` 走 `UIApplication.open`，不是 simctl。**
  Runner 跑在设备内部，iOS 不提供 `Process`/`NSTask`（实测 `cannot find 'Process' in scope`），
  Runner 侧不可能 fork 出 `xcrun simctl`。需要更可靠的 deeplink 时应由 TS 侧直接调 simctl。
- **xpath 不支持**，统一回 `unsupported_xpath`。XCUITest 没有原生 xpath 引擎，
  这里遵循项目「不支持就抛错、不静默降级」的原则。
- **`element.typeText` 的 `typeDelayMs` 被忽略**，XCUI 无法逐字控速。
- **`clearText` 是手工实现的**（XCTest 并没有 `XCUIElement.clearText()` 这个 API）：
  读出当前值后逐字符发退格；已特判「`value` 实为 placeholder」的空输入框情况。
- **`CommandRouter.readAttribute` 用 KVC 读任意属性名**，传入不存在的属性名会抛
  ObjC 异常，Swift 侧 catch 不住，会直接崩 Runner。上层应约束 `name` 取值范围。

---

## 10. 排障速查

| 现象 | 原因 |
| --- | --- |
| 握手超时 120s / 300s，stderr 无 Runner 日志 | target 里没有 `test*` 方法，或 `-only-testing:` 名字写错 |
| 握手成功，第一条命令超时 | 十有八九是 `mode` 被改回了 `stdio`，见 §4。确认 `XCUITEST_RUNNER_DEFAULTS.mode === 'http'` |
| 真机 `/health` 一直连不上 | 没做端口转发，见 §7 |
| xcodebuild 跑完 `shutdown` 后仍不退出 | target 里存在第二个 `test*` 方法，见 §2.3 |
| `协议版本不匹配：Driver=1 Runner=…` | `OMNI_BRIDGE_PROTOCOL_VERSION` 被注入成了非整数。当前配置为 `'1'`，正常；若有人改回 `'1.0'` 会触发（`Int("1.0")` 解析失败） |
| 端口连不上，但 `/health` 在别的端口通 | 配置层与 Driver 的默认端口不一致。当前两处均为 `8642`，若有人改动需同步 |
