# `apps/` —— 业务资产层

本目录存放**与被测 App 绑定、但与自动化框架完全无关**的资产：定位器、页面对象、业务流、测试数据。

它是 OmniAutoTest「一份脚本零改动跑 Detox / Appium / XCUITest」这一核心主张的**证据所在**：
只要本目录里没有任何框架痕迹，切换 `--framework` 就必然能原样运行；反之，只要这里出现一条
`if (framework === 'detox')`，整个工程的卖点就不成立了。

---

## 一、分层与依赖方向

```
tests/<app>/**            用例：描述"验证什么"
      ↓ 只依赖
apps/<app>/workflows/     业务流：描述"怎样从 A 屏走到 B 屏"     —— 只调 Page
      ↓ 只依赖
apps/<app>/pages/         页面对象：描述"在这一屏能做什么"        —— 只调 actions / device
      ↓ 只依赖
apps/<app>/locators/      定位器：描述"找什么"（不描述"怎么找"）
apps/<app>/fixtures/      夹具：纯数据，不 import 任何东西
```

依赖必须**严格单向向下**。特别地：

- `workflows` 之间可以单向引用（如 `auth` → `navigation`），但**禁止形成环**。
  ts-jest 走 CommonJS 转译，循环依赖不会报错，而是让某个导出在运行时变成 `undefined`，
  排查成本极高。
- `pages` 之间**不互相 import**。需要跨页面协作时，请上移到 `workflows`。

## 二、唯一允许的框架侧依赖：`@omni`

资产层与用例层**只允许**从 `@omni` 引入框架能力：

```ts
import { actions, device, defineLocators, getLogger, getRunConfig } from '@omni';
```

明令禁止（CI 会 grep 拦截）：

| 禁止项 | 原因 |
| --- | --- |
| `@adapters/*`、`@factory/*`、`@configs/*`、`@contracts/*` | 绕过统一门面，等于把资产与实现绑死；契约类型一律从 `@omni` 取 |
| `detox` / `webdriverio` / `appium` / `@wdio/*` 等 SDK | 直接引入框架 SDK，换框架必然崩 |
| `if (framework === ...)`、`process.env.OMNI_FRAMEWORK` | 框架分支 = 三份脚本伪装成一份 |
| `platform === 'ios'` 之类的平台分支 | 平台差异必须用 Locator 的 `platform` 覆盖字段表达 |
| Locator 的 `xpath` 字段 | Detox 无法表达 xpath，会抛 `UnsupportedLocatorError` |

## 三、如何新增一个 App 的资产目录

以新增 `buyer` App 为例（约定优于配置，请严格照抄结构）：

```
apps/
  buyer/
    locators/
      <page>.locators.ts      每页一个文件，用 defineLocators 导出一个具名集合
      index.ts                汇总再导出
    pages/
      BasePage.ts             继承或复制 mock 的实现（见下方说明）
      <Page>Page.ts           一页一个 class，构造函数无参
      index.ts
    workflows/
      <domain>.workflow.ts    按业务域切分（auth / order / payment ...）
      index.ts
    fixtures/
      users.ts                纯数据常量
    index.ts                  App 统一出口，用例只从这里 import
tests/
  buyer/
    smoke/
      <domain>.smoke.test.ts
```

对应的用例通过路径别名 `@apps/buyer` 引入（别名已在 `tsconfig.json` 与
`src/configs/jest/jest.base.config.ts` 的 `moduleNameMapper` 中同步登记，两处必须一致）。

### 各层的落地要点

**1. locators —— 只描述"找什么"**

```ts
export const orderLocators = defineLocators({
  screen: { testId: 'order_screen', type: 'other', description: '订单页根容器' },
});
```

- 一律以 `testId` 为主策略：它是三个框架、两个平台的能力交集。
- **每个 locator 都要写 `description`**，它会进入日志、报错与截图文件名；
  缺失时报错里只有一串 testId，值班同学看不懂。
- 被复用的容器（滚动容器、弹窗、Tab 栏）先用 `defineLocator` 抽成模块级常量，
  再在需要处作为 `ancestor` 引用，避免同一个 testId 写两遍后失配。
- 平台差异写进 `platform` 覆盖块，只列**确实不同**的字段：

  ```ts
  navBack: {
    testId: 'nav_back',
    description: '导航栏返回按钮',
    platform: { android: { testId: 'nav_back_android' } },
  }
  ```

  覆盖是"逐字段深度合并"，未在覆盖块中出现的字段（如 `ancestor`）会保留基础层的值，
  不必重复书写。嵌套的 `ancestor` / `descendant` 也会被递归展开，同样支持平台覆盖。
- 通用文案（"确定""返回"）必须配 `ancestor` 收敛范围，否则必然误命中。
- 需要"第 N 个"时，先用 `ancestor` 筛范围、再用 `index` 定序号；单用 `index` 依赖渲染
  顺序，UI 一调整就静默错位。

**2. pages —— 只暴露业务语义**

- class 形式，**构造函数无参、零副作用**：页面对象经常在 `describe` 作用域就被 `new`，
  那时适配器还没 init。需要运行时能力（logger 等）请用 getter 惰性求值。
- 私有持有 locator，对外只给 `login(u, p)`、`toggleNotification(on)` 这类业务方法。
  **不要**对外导出 locator 或返回元素句柄。
- 方法内部只调 `actions` / `device`。
- 继承 `BasePage` 获得 `waitUntilLoaded` / `assertLoaded` / `screenshot` /
  `scrollIntoView` / `setSwitch` / `goBack` / `backgroundAndResume` 等公共能力；
  子类只需声明 `pageName`（中文名，进日志与截图名）与 `root`（就绪判据）。
- 状态相关的操作要**幂等**：开关先读后写、导航先判断再跳，
  这样用例从任何初始状态出发都收敛到同一结果。

**3. workflows —— 只编排 Page**

- 函数式导出，不要 class。
- **一次都不碰 `actions` / `device`**。需要设备能力（切后台、返回）时，
  走 `BasePage` 上已封装的方法。
- 把"必须成对出现"的动作打包（进详情 + 返回），避免用例忘记收尾污染后续用例。
- 跨页面的复合断言（如"登录失败 = 有提示 + 文案对 + 没跳转"）适合固化在这里，
  保证每个同类用例都检查齐全。

**4. fixtures —— 纯数据**

- 不 import 任何模块。
- 账号与其**期望展示值**（昵称、邮箱、等级）绑在一起，用例断言直接引用同一份真理源，
  杜绝"账号换了但断言没换"。

## 四、自检清单（提交前本地跑一遍）

```bash
cd e2e

# 1) 类型必须干净
npx tsc --noEmit

# 2) 不得引入框架实现层或三方 SDK
grep -rn "from '@adapters\|from '@factory\|from '@configs\|from '@contracts\|require('detox')\|from 'detox'\|from 'webdriverio'" apps tests

# 3) 不得使用 xpath（Detox 不支持）
grep -rn "xpath" apps tests

# 4) 不得出现框架/平台分支
grep -rniE "framework ===|OMNI_FRAMEWORK|platform ===" apps tests
```

第 2~4 条均应**无任何输出**。
