# OmniAutoTest — 跨平台测试自动化框架

基于 TypeScript 的测试自动化框架，支持 **iOS（Detox / Appium
XCUITest）**、**Android（Appium UiAutomator2 / Detox）**、**Web（Playwright）**
和 **API 测试**，同一套测试脚本覆盖所有平台。

## 核心功能

| 功能                        | 说明                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------- |
| 🔀 **一次编写，多平台运行** | 同一脚本兼容 iOS Detox / iOS Appium / Android Appium / Android Detox               |
| 🎯 **统一选择器**           | `by.id()` / `by.text()` / `by.label()` / `by.xpath()` / `by.platform()` 跨平台通用 |
| 📝 **步骤自动记录**         | 每次点击/输入/断言自动记录到 Allure 报告                                           |
| 📸 **失败自动截图**         | 步骤级 + 测试级截图嵌入报告                                                        |
| 🎥 **屏幕录制**             | Appium 原生录屏（`VIDEO_RECORDING=true`）                                          |
| 📊 **Allure 报告**          | 富文本 HTML 报告，含步骤、截图、日志                                               |
| 🧭 **交互式菜单**           | Node.js 方向键菜单（`./start.sh`）                                                 |

## 快速开始

```bash
# 安装依赖
./start.sh install

# 运行测试
./start.sh test:ios              # iOS Detox
./start.sh test:ios:appium       # iOS Appium (XCUITest)
./start.sh test:android          # Android Appium (UiAutomator2)
./start.sh test:android:detox    # Android Detox

# 开启录屏 / 关闭截图
./start.sh test:android --recording --no-screenshot

# 查看报告
./start.sh report
```

## 平台与模式

| 平台    | 模式           | 框架                  | 切换方式                        |
| ------- | -------------- | --------------------- | ------------------------------- |
| iOS     | Detox（默认）  | Detox                 | —                               |
| iOS     | Appium         | Appium + XCUITest     | `IOS_AUTOMATION_MODE=appium`    |
| Android | Appium（默认） | Appium + UiAutomator2 | —                               |
| Android | Detox          | Detox                 | `ANDROID_AUTOMATION_MODE=detox` |
| Web     | —              | Playwright            | `./start.sh test:web`           |
| API     | —              | Jest + Axios          | `./start.sh test:api`           |

## 项目结构

```
OmniAutoTest/
├── cli/                       # CLI 辅助工具（menu.js）
├── framework/                 # 核心框架
│   ├── actions/               # 平台动作实现（Detox/Appium/Playwright）
│   ├── hooks/                 # 生命周期钩子（截图、录屏）
│   ├── reporters/             # Detox 自定义 Allure Reporter
│   ├── types/                 # TypeScript 类型定义
│   └── utils/                 # 日志、配置、选择器等
├── applications/              # Legacy - use tests/<project>/pages/ instead
│   └── TestGround/pages/      # LoginPage, HomePage
├── tests/                     # 测试脚本
│   ├── mobile/                # 移动端测试（iOS + Android 共享）
│   ├── web/                   # Web 测试
│   └── api/                   # API 测试
├── configs/                   # 环境配置
└── start.sh                   # 入口脚本（CLI + 菜单）
```

## 编写测试

```typescript
import { describe, it, beforeAll } from "@jest/globals";
import { ActionFactory } from "@omnitest/core/actions";
import { LoginPage } from "@tests/mobile/TestGround/pages/LoginPage";

describe("登录测试", () => {
  let loginPage: LoginPage;

  beforeAll(async () => {
    const platform = (process.env.TEST_PLATFORM || "ios") as "ios" | "android";
    loginPage = new LoginPage(ActionFactory.create(platform));
  });

  it("登录成功", async () => {
    await loginPage.login("admin", "123456");
    await loginPage.isVisible();
  });
});
```

## Page Object 示例

```typescript
import { by } from "@omnitest/core/selector";
// by.id() / by.text() / by.label() 跨平台统一

export class LoginPage {
  constructor(private actions: BaseActions) {}

  async login(user: string, pass: string) {
    await this.actions.navigateTo();
    await this.actions.typeText(by.id("usernameInput"), user);
    await this.actions.typeText(by.id("passwordInput"), pass);
    await this.actions.click(by.id("loginButton"));
    await this.actions.waitForElement(by.id("logoutButton"), 10000);
  }
}
```

## 报告功能

- **测试步骤**：每个动作自动记录（点击、输入、断言、等待）
- **失败截图**：步骤级 + 测试级截图，失败时自动生成
- **屏幕录制**：Appium 原生支持，通过 `--recording` 开启
- **Allure 报告**：`./start.sh report` 生成并打开 HTML 报告

## CLI 参数

```
--screenshot, --ss         启用失败截图（默认：开）
--no-screenshot, --no-ss   禁用失败截图
--recording, --rec         启用屏幕录制（默认：关）
--no-recording, --no-rec   禁用屏幕录制

示例:
  ./start.sh test:android --recording
  ./start.sh test:ios:appium --no-screenshot --recording
```

## 环境变量

| 变量                      | 默认值      | 说明                               |
| ------------------------- | ----------- | ---------------------------------- |
| `TEST_PLATFORM`           | `ios`       | 目标平台（`ios` / `android`）      |
| `IOS_AUTOMATION_MODE`     | `detox`     | iOS 框架（`detox` / `appium`）     |
| `ANDROID_AUTOMATION_MODE` | `appium`    | Android 框架（`appium` / `detox`） |
| `SCREENSHOT_ON_FAILURE`   | `true`      | 失败时自动截图                     |
| `VIDEO_RECORDING`         | `false`     | 启用屏幕录制                       |
| `APPIUM_HOST`             | `localhost` | Appium 服务器地址                  |
| `APPIUM_PORT`             | `4723`      | Appium 服务器端口                  |

## 前置要求

- **Node.js** >= 22.22.0
- **Appium 驱动**: `appium driver install uiautomator2 xcuitest`
- **iOS (Appium)**：Xcode + iOS 模拟器或真机
- **Android (Detox)**：Android SDK + 模拟器或真机

## License

MIT
