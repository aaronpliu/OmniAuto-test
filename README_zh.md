# 跨平台测试自动化框架

一个基于 TypeScript 的综合性测试自动化框架，支持 React Native iOS（Detox）、Android（Appium）、Web（Playwright）和 API 测试。

## 特性

- **统一操作层**：为所有平台提供通用接口，各平台独立实现
- **共享移动端测试**：一次编写测试，同时在 iOS 和 Android 上运行
- **独立 Web 测试**：直接集成 Playwright 进行 Web 测试
- **API 测试**：内置 HTTP 客户端，支持 REST API 测试
- **TypeScript**：基于 TypeScript 5.x 的完整类型安全
- **Allure 报告**：丰富的测试报告，包含截图和日志
- **Docker 支持**：Appium 服务在 Docker 中运行，支持多实例
- **日志记录**：基于 Winston 的结构化日志
- **配置管理**：支持不同环境的配置

## 项目结构

```
AppAuto/
├── framework/              # 核心框架组件
│   ├── actions/           # 各平台操作实现
│   ├── api/               # API 测试工具
│   ├── hooks/             # 测试生命周期钩子
│   ├── types/             # TypeScript 类型定义
│   └── utils/             # 工具模块（日志、配置）
├── applications/          # 应用特定的业务逻辑
│   └── your-app/
│       └── pages/         # 页面对象模型
├── tests/                 # 测试脚本
│   ├── mobile/            # 共享移动端测试（iOS + Android）
│   ├── web/               # Web 专用测试
│   └── api/               # API 测试
├── configs/               # 环境配置
└── artifacts/             # 测试输出（gitignore）
```

## 环境要求

- Node.js >= 22.22.0
- npm 或 yarn
- Docker（用于 Appium）
- Xcode（用于 iOS 测试）
- Android Studio（用于 Android 测试）

## 安装

```bash
# 安装依赖
npm install

# 启动 Appium 服务（用于 Android 测试）
npm run appium:start
```

## 运行测试

### 移动端测试（iOS 和 Android 共享）

```bash
# 在 iOS 上运行（使用 Detox）
TEST_PLATFORM=ios npm run test:mobile:ios

# 在 Android 上运行（使用 Appium）
TEST_PLATFORM=android npm run test:mobile:android

# 在两个平台上运行
npm run test:mobile
```

### Web 测试

```bash
# 在所有浏览器上运行
npm run test:web

# 在指定浏览器上运行
npm run test:web:chromium
npm run test:web:firefox
npm run test:web:webkit
```

### API 测试

```bash
npm run test:api
```

### 全部测试

```bash
npm run test:all
```

## 生成报告

```bash
# 生成 Allure 报告
npm run report:generate

# 打开 Allure 报告
npm run report:open
```

## 配置

环境配置文件存放在 `configs/` 目录中：
- `development.json` - 开发环境
- `staging.json` - 预发布环境
- `production.json` - 生产环境

通过以下方式设置环境：
```bash
NODE_ENV=staging npm run test:mobile
```

## 编写测试

### 移动端测试（共享）

```typescript
import { ActionFactory } from '@framework/actions/ActionFactory';
import { LoginPage } from '@applications/your-app/pages/LoginPage';

describe('移动端登录测试', () => {
  let loginPage: LoginPage;

  beforeAll(async () => {
    const platform = process.env.TEST_PLATFORM || 'ios';
    const actions = ActionFactory.create(platform);
    loginPage = new LoginPage(actions);
  });

  it('应该成功登录', async () => {
    await loginPage.login('user', 'pass');
  });
});
```

### Web 测试

```typescript
import { test } from '@playwright/test';
import { PlaywrightActions } from '@framework/actions/PlaywrightActions';

test('应该成功登录', async ({ page }) => {
  const actions = new PlaywrightActions(page);
  await actions.navigateTo('https://app.com');
  await actions.typeText('#username', 'user');
  await actions.click('#login');
});
```

### API 测试

```typescript
import { ApiClient } from '@framework/api/ApiClient';

const apiClient = new ApiClient();

it('应该获取用户数据', async () => {
  const user = await apiClient.get('/users/1');
  expect(user).toHaveProperty('name');
});
```

## 架构说明

### 操作抽象层

框架使用抽象基类模式，为跨平台提供统一接口：

- **BaseActions**：定义通用接口的抽象类
- **DetoxActions**：使用 Detox 的 iOS 实现
- **AppiumActions**：使用 Appium/WebdriverIO 的 Android 实现
- **PlaywrightActions**：使用 Playwright 的 Web 实现

### 工厂模式

平台选择由 `ActionFactory` 处理：

```typescript
// 移动端（iOS/Android）
const actions = ActionFactory.create('ios'); // 或 'android'

// Web 端，直接使用 PlaywrightActions
const actions = new PlaywrightActions(page);
```

## 关键设计决策

1. **共享移动端测试**：通过平台抽象，单一测试套件可同时在 iOS 和 Android 上运行
2. **独立 Web 测试**：Web 测试直接使用 Playwright 的原生特性
3. **路径别名**：使用 `@framework`、`@applications`、`@tests` 实现简洁的导入路径
4. **关注点分离**：框架、应用逻辑和测试明确分离
5. **Docker 化 Appium**：支持并行 Android 测试执行

## 可用操作

框架在所有平台上提供以下通用操作：

- 导航：`navigateTo()`、`reload()`、`back()`
- 交互：`click()`、`tap()`、`doubleClick()`、`longPress()`
- 输入：`typeText()`、`clearText()`、`getText()`
- 断言：`waitForElement()`、`expectVisible()`、`expectText()`
- 手势：`swipe()`、`scroll()`、`pinch()`
- 工具：`takeScreenshot()`、`setOrientation()`、`setLocation()`

## 日志

日志存储在 `artifacts/logs/` 目录中，文件名包含时间戳。设置日志级别：

```bash
LOG_LEVEL=debug npm run test:mobile
```

## 故障排查

### iOS 测试失败
- 确保已安装并配置 Xcode
- 检查模拟器是否可用：`xcrun simctl list`
- 确认 Detox 已正确配置

### Android 测试失败
- 确保 Appium Server 正在运行并可访问
- 检查 `configs/development.json` 中的 Appium Server 配置
- 确认 Android 模拟器/设备已连接：`adb devices`

### Web 测试失败
- 确保已安装 Playwright 浏览器：`npx playwright install`
- 检查与测试 URL 的网络连通性

## 贡献指南

1. 遵循 TypeScript 最佳实践
2. 为新功能添加测试
3. 更新文档
4. 提交前运行代码检查：`npm run lint`

## 许可证

本项目采用 GNU General Public License v3.0 许可证 - 详见 [LICENSE](LICENSE) 文件。

### 许可证摘要

- ✅ 你可以使用、修改和分发本软件
- ✅ 分发时必须公开源代码
- ✅ 衍生作品必须包含相同许可证
- ❌ 不能用于专有/闭源软件
- ❌ 不提供任何担保

更多信息请访问：https://www.gnu.org/licenses/gpl-3.0.html