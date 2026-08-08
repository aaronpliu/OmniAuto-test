# OmniAutoTest 跨自动化框架统一 E2E 测试工程 — 精简 PRD

> 文档版本：v0.1（精简版，不含竞品分析 / 市场调研）
> 作者：许清楚（Product Manager）
> 项目根目录：`/Users/aaronliu/WorkBuddy/OmniAutoTest/e2e/`
> 文档性质：面向架构师与工程实现的**需求基线**，不定义接口签名、不写实现代码。

---

## 1. 产品目标

**一句话价值主张**
> 一次编写、多框架 / 多平台 / 多设备统一执行的移动端 E2E 测试工程，让测试脚本作者完全屏蔽底层框架差异，像写一份普通 TS 脚本一样写跨框架测试。

**量化目标（交付验收基线）**

| 编号 | 目标 | 指标 |
|------|------|------|
| G1 | 同一份脚本跨框架零改动执行 | 在 Detox / Appium / XCUITest 三框架上的脚本复用率 ≥ 95% |
| G2 | 框架可扩展性 | 新增第 4 种框架（如 Espresso / Maestro）的适配成本 ≤ 3 人日 |
| G3 | 业务 App 可扩展性 | 新增一个业务 App 的测试接入成本 ≤ 0.5 人日（仅配置 + Page Object） |
| G4 | 无设备自检（可验证性底线） | 在无真机 / 无模拟器环境下 dry-run 自检通过率 100% |
| G5 | 失败可观测性 | 测试失败自动截图率 100%，报告产出耗时 < 30s |

---

## 2. 目标用户与使用场景

| 角色 | 核心诉求 | 典型场景 |
|------|----------|----------|
| **测试工程师（脚本作者）** | 用 TypeScript 写 Page Object 与测试脚本，**不感知**用的是哪个框架 | 在 `tests/` 下写一份 smoke 脚本，期望在 Detox 与 Appium 上都能跑 |
| **CI / DevOps 工程师** | 通过**入口脚本 + 参数**在流水线中调度不同 app / 平台 / 框架 | 在 CI job 中用 `--framework=appium --app=buyer --platform=android` 启动回归 |
| **框架扩展开发者** | 以最小成本接入新的底层框架 | 实现一套 Adapter/Driver/LocatorResolver 三件套并注册到工厂 |
| **质量负责人（读者）** | 看报告、看失败截图 / 视频 | 打开 `reports/` 下的产物定位失败原因 |

---

## 3. 用户故事（US-01 ~ US-12）

> 每条含「验收标准」，作为 P0/P1 落地的细化校验点。

**US-01｜一份脚本跨三框架执行**
- 作为测试工程师，我希望写一份登录冒烟脚本，通过 `--framework=detox|appium|xcuitest` 参数在三个框架上执行而**不改脚本一行**，以便降低维护成本。
- 验收：同一份 `tests/mock/smoke/*.spec.ts` 在三种 framework 配置下均能启动并执行（真机/模拟器就绪前提下）。

**US-02｜Page Object 与 Locator 跨框架复用**
- 作为测试工程师，我希望在 `apps/mock/pages`、`apps/mock/locators` 中以**声明式**方式定义页面与定位器，并被所有框架共用，以便避免重复维护。
- 验收：`apps/mock/` 下的 Page Object 与 Locator 不引用任何框架专有 API；三框架的 LocatorResolver 均能将其翻译为原生选择器。

**US-03｜选择业务 App**
- 作为测试工程师，我希望通过 `--app=buyer|seller|wallet|mock` 选择被测 App，以便一套工程覆盖多业务线。
- 验收：切换 `--app` 后，对应 `configs/apps/*.config.ts` 被加载，目标包名 / BundleID 正确注入。

**US-04｜选择平台 / 设备**
- 作为测试工程师，我希望通过 `--platform=ios|android` 与 `--device=simulator|emulator|real` 选择执行环境，以便覆盖主要矩阵。
- 验收：`configs/devices/*` 中对应配置（如 `android.real.config.ts`）被正确选用。

**US-05｜App × 平台 × 设备 × 框架组合**
- 作为 CI 工程师，我希望入口脚本支持四维度的任意合法组合，并拒绝非法组合（如 XCUITest + Android），以便精确调度矩阵。
- 验收：非法组合被入口脚本在启动时即报错退出（非零退出码）；合法组合可运行。

**US-06｜低成本的第四框架扩展**
- 作为框架扩展开发者，我希望新增框架时**仅实现 Adapter / Driver / LocatorResolver 三件套并注册到 Factory**，核心契约与脚本零改动，以便快速扩展。
- 验收：新增一个 mock 框架仅需新增 `adapters/<new>/` 三文件 + Factory 注册，无需修改 `contracts/` 与任何已有 `tests/`。

**US-07｜失败自动截图**
- 作为质量负责人，我希望测试失败时**自动截图**并保存到 `reports/screenshots/`，以便快速定位问题。
- 验收：任一断言失败后，对应步骤截图落盘，路径与用例关联可查。

**US-08｜报告产出**
- 作为质量负责人，我希望执行结束后产出结构化报告（含截图 / 视频链接与失败用例聚合），以便复盘。
- 验收：`reports/` 下生成报告，失败用例 100% 关联截图 / 视频路径。

**US-09｜无设备 dry-run 自检（可验证性底线）**
- 作为工程负责人，我希望在**无真机 / 无模拟器**环境下执行 `dry-run`，仅校验配置完整性、TS 类型、脚本结构与契约一致性，以便在任何机器上验证工程健康度。
- 验收：断网 / 无设备下 `npm run dry-run` 通过，输出自检报告且退出码 0。

**US-10｜统一异步动作接口**
- 作为脚本作者，我希望通过统一的 `IActions` 异步接口调用点击 / 输入 / 滑动等动作，屏蔽框架差异，以便脚本写法一致。
- 验收：脚本中调用的动作方法跨框架行为一致（语义层面），且全部为 `async`。

**US-11｜统一执行日志**
- 作为调试者，我希望所有框架的执行轨迹通过统一 `logger` 输出（含 framework / app / device 标签），以便跨框架排障。
- 验收：三框架的运行日志格式一致、可过滤。

**US-12｜环境变量注入**
- 作为 CI 工程师，我希望通过 `.env` / `env.config.ts` 注入 server URL、凭据、超时等变量，以便不同环境复用同一脚本。
- 验收：`configs/env.config.ts` 与 `.env.example` 一致；缺失必填变量时启动报错。

---

## 4. 需求池（P0 / P1 / P2）

> 优先级：P0=必须交付（阻塞验收）；P1=应交付（首版建议包含）；P2=可选增强。

| 编号 | 需求 | 优先级 | 所属模块 |
|------|------|--------|----------|
| R-01 | 定义框架无关的统一契约：`IActions`（异步动作全集）、`IElementLocator`（声明式定位）、`types` | P0 | `contracts/` |
| R-02 | 三套适配器 Appium / XCUITest / Detox 各自实现契约（Adapter + Driver + LocatorResolver） | P0 | `adapters/` |
| R-03 | 工厂层按参数实例化 Adapter / Driver / LocatorResolver | P0 | `factory/` |
| R-04 | 配置体系：jest 四套、appium / xcuitest / detox capabilities、apps、devices、test、env、index 聚合 | P0 | `configs/` |
| R-05 | 入口脚本按 `--framework / --app / --platform / --device` 调度并校验组合合法性 | P0 | `setup/` + 入口 |
| R-06 | 声明式定位器由各框架 LocatorResolver 翻译为原生选择器（testId / accessibilityId / text / type / xpath…） | P0 | `contracts/` + `adapters/` |
| R-07 | 失败自动截图，落盘 `reports/screenshots/` | P0 | `utils/screenshot.ts` + `setup/` |
| R-08 | 报告产出（截图 / 视频链接 + 失败聚合） | P0 | `reports/` + 入口 |
| R-09 | **无设备 dry-run 自检**：配置 / 类型 / 脚本结构校验，退出码可判定 | P0 | 入口 + `setup/` |
| R-10 | 统一异步工具：`logger` / `retry` / `wait` / `screenshot` | P0 | `utils/` |
| R-11 | XCUITest 驱动层设计（进程 / 桥接，无 JS SDK 场景）落地 | P0 | `adapters/xcuitest/` + `configs/xcuitest/` |
| R-12 | 示例资产 mock App 的 pages / workflows / locators 与 smoke 用例 | P1 | `apps/mock/` + `tests/mock/` |
| R-13 | 多 App 配置接入（buyer / seller / wallet 占位配置） | P1 | `configs/apps/` |
| R-14 | `globalSetup` / `globalTeardown` / `testContext` 生命周期管理 | P1 | `setup/` |
| R-15 | 视频录制落盘 `reports/videos/`（与截图配套） | P2 | `utils/` + `reports/` |
| R-16 | 扩展文档：如何新增第 4 框架的 step-by-step 指南 | P2 | `docs/` |
| R-17 | 失败自动重试（retry 策略可配置） | P2 | `utils/retry.ts` |

---

## 5. 关键设计约束（转交架构师的硬约束）

> 以下为产品侧不可妥协的约束，架构师据此做接口与实现设计。

**C-01｜统一定位器必须是声明式、框架无关的描述**
- Locator 仅描述「找什么」，不描述「怎么找」。候选字段：`testId` / `accessibilityId` / `text` / `type` / `xpath` / `index` 等。
- 各框架的 `LocatorResolver` 负责把声明式 Locator 翻译成原生选择器（如 Appium 的 `-ios predicate`、Detox 的 `by.id`、XCUITest 桥接层的 query）。
- **禁止**在 Page Object / 测试脚本中直接写任何框架专有选择器。

**C-02｜IActions 必须覆盖移动端常用动作全集且为异步接口**
- 至少覆盖：tap / longPress / typeText / clearText / scroll / swipe / waitForVisible / getText / getValue / assertExists 等。
- 所有方法均为 `async`（返回 Promise），以支持隐式 / 显式等待与桥接网络的异步语义。

**C-03｜XCUITest 无 JS SDK 的驱动方式（产品预期）**
- XCUITest 生态（Apple XCTest）没有 Node/TS SDK，因此**不要求**走 JS 直接驱动。
- 产品预期：以**进程 / 桥接层**方式驱动 —— 即工程通过子进程启动 XCTest Runner（或借助 xcrun / 第三方桥接），由 `XCUITestDriver` 负责进程生命周期与结果回传，`XCUITestAdapter` 复用统一契约。
- 验收时不强求三框架在 CI 真机上全绿，但 `XCUITestDriver` 的桥接契约与 dry-run 必须通过。

**C-04｜无真机 / 无模拟器可做 dry-run 自检（可验证性底线）**
- 入口脚本必须支持 `--dry-run`（或子命令），在**无任何设备**环境下：
  1. 校验所有配置文件可被加载且必填项齐全；
  2. 跑 TypeScript 类型检查（`tsc --noEmit`）；
  3. 校验 `tests/` 脚本结构与契约引用一致性；
  4. 输出自检报告并以退出码 0/非0 表达健康度。
- 这是本次交付**最先可验证**的里程碑，优先于真机联调。

**C-05｜目录结构为硬约束**
- 用户给定的 `e2e/` 目录树（configs / contracts / adapters / factory / setup / utils / apps / tests / reports 等）**必须完全遵循**，不得增删顶层结构。新增资产（如第 4 框架、新 App）须落在既有约定目录下。

**C-06｜TypeScript 为唯一脚本语言**
- 测试脚本、Page Object、Locator、配置均以 TS 编写；统一经 `tsconfig.json` 编译 / 类型约束。

---

## 6. 验收标准（交付完成的可执行检查项）

1. **AC-1 类型基线**：`npx tsc --noEmit` 在 `e2e/` 全量通过，无类型错误。
2. **AC-2 Dry-run 自检**：无设备环境下 `npm run dry-run`（或等价入口）执行通过，退出码 0，产出自检报告。
3. **AC-3 组合校验**：入口脚本对非法组合（如 `xcuitest+android`）启动即非零退出；合法组合可进入执行流程。
4. **AC-4 契约落地**：`contracts/` 三文件存在且被三套适配器实现；脚本中无任何框架专有选择器 / API 直接引用。
5. **AC-5 示例可用**：`tests/mock/smoke/` 用例在至少 **Appium（Android emulator）或 Detox（iOS simulator）** 之一真环境跑通（其余框架 dry-run 通过即可）；失败用例 100% 触发截图落盘 `reports/screenshots/`。
6. **AC-6 扩展验证**：以「新增第四 mock 框架」为探针，验证仅需 `adapters/<new>/` 三件套 + Factory 注册，核心契约与 `tests/` 零改动。
7. **AC-7 报告产出**：执行结束生成报告，失败用例关联截图 / 视频路径，可人工打开查看。
8. **AC-8 目录合规**：实际产出目录与用户给定结构逐条比对一致，无顶层增删。

---

## 7. 待确认问题（需用户拍板，先给默认假设）

| 编号 | 待确认点 | 默认假设（先按此推进） |
|------|----------|------------------------|
| Q-1 | 测试运行器是否锁定 Jest？ | **是**，按给定结构以 Jest 为唯一运行器（`configs/jest/*` 已预设四套）。如需切换 Vitest 再议。 |
| Q-2 | 三框架「真机联调」在本交付中的达标范围？ | 默认**仅要求 Dry-run 全绿 + 至少一套框架真环境跑通示例**；其余框架以契约 + dry-run 验收，真机矩阵留作后续。 |
| Q-3 | XCUITest 桥接层的具体实现选型（自研子进程 vs 第三方如 `appium-xcuitest-driver` / `idb`）？ | 默认先用**子进程 + xcrun 启动 XCTest Runner** 的轻量桥接；不引入额外商业依赖，保留可替换空间。 |
| Q-4 | 报告格式与持久化（JUnit XML / HTML / Allure）？ | 默认先产出 **JUnit XML + 截图/视频链接清单**（CI 友好），Allure 作为 P2 增强。 |
| Q-5 | 多 App 是否本期就接真实 buyer/seller/wallet 工程，还是先用 mock 占位？ | 默认 **mock 为示例资产，buyer/seller/wallet 仅提供配置占位**；真实包接入留作后续接入任务。 |

---

*（本 PRD 为精简版，不含竞品分析与市场调研，符合范围约定。）*
