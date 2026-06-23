# 真实测试框架集成指南

## 概述
OmniAutoTest 现已集成真实的测试框架：
- **Appium**: 用于移动端 (Android/iOS) 自动化测试
- **Playwright**: 用于 Web 端自动化测试

---

## 1. 安装依赖

后端已添加以下依赖：
```json
{
  "playwright": "^1.40.0",
  "webdriverio": "^8.0.0"
}
```

安装命令：
```bash
cd backend
npm install
```

---

## 2. Appium 配置 (移动端测试)

### 2.1 安装 Appium Server

```bash
# 安装 Appium (全局)
npm install -g appium

# 安装 Appium drivers
appium driver install uiautomator2  # Android
appium driver install xcuitest      # iOS

# 启动 Appium Server
appium
```

### 2.2 配置设备 (Android)

在数据库中创建 Android 设备，配置以下字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| `type` | 设备类型 | `android` |
| `platform` | 平台名称 | `Android` |
| `version` | 系统版本 | `11` |
| `udid` | 设备 UDID | `emulator-5554` |
| `appPackage` | 应用包名 | `com.example.app` |
| `appActivity` | 启动 Activity | `.MainActivity` |
| `appPath` | APK 文件路径 | `/path/to/app.apk` |

### 2.3 配置设备 (iOS)

| 字段 | 说明 | 示例 |
|------|------|------|
| `type` | 设备类型 | `ios` |
| `platform` | 平台名称 | `iOS` |
| `version` | 系统版本 | `16.0` |
| `udid` | 设备 UDID | `00008020-001234567890` |
| `bundleId` | 应用 Bundle ID | `com.example.app` |
| `appPath` | IPA 文件路径 | `/path/to/app.ipa` |

### 2.4 环境变量配置

创建 `backend/.env` 文件：

```env
# Appium Server 配置
APPIUM_HOST=localhost
APPIUM_PORT=4723
```

---

## 3. Playwright 配置 (Web 端测试)

### 3.1 安装浏览器

```bash
# 安装 Playwright 浏览器 (首次使用)
cd backend
npx playwright install chromium
npx playwright install firefox  # 可选
npx playwright install webkit    # 可选
```

### 3.2 配置设备 (Web)

在数据库中创建 Web 设备，配置以下字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| `type` | 设备类型 | `web` |
| `browser` | 浏览器类型 | `chromium`, `firefox`, `webkit` |
| `width` | 视口宽度 | `1920` |
| `height` | 视口高度 | `1080` |
| `url` | 测试起始 URL | `https://example.com` |

### 3.3 环境变量配置

```env
# Playwright 配置
PLAYWRIGHT_HEADLESS=true      # 是否无头模式
PLAYWRIGHT_SLOW_MO=0         # 慢动作延迟 (ms)
PLAYWRIGHT_TIMEOUT=30000     # 默认超时 (ms)
SCREENSHOT_DIR=./screenshots # 截图保存目录
VIDEO_DIR=./videos          # 视频保存目录
```

---

## 4. 测试用例步骤格式

### 4.1 Appium 测试步骤 (JSON)

```json
[
  {
    "action": "wait",
    "selector": "id=com.example:id/username",
    "timeout": 5000
  },
  {
    "action": "input",
    "selector": "id=com.example:id/username",
    "text": "testuser"
  },
  {
    "action": "click",
    "selector": "id=com.example:id/login_button"
  },
  {
    "action": "assert",
    "selector": "id=com.example:id/home_screen"
  }
]
```

### 4.2 Playwright 测试步骤 (JSON)

```json
[
  {
    "action": "navigate",
    "url": "https://example.com/login"
  },
  {
    "action": "fill",
    "selector": "input[name='username']",
    "text": "testuser"
  },
  {
    "action": "click",
    "selector": "button[type='submit']"
  },
  {
    "action": "assert",
    "selector": ".home-page"
  }
]
```

---

## 5. 支持的测试操作

### 5.1 Appium 支持的操作

| 操作 | 说明 | 参数 |
|------|------|------|
| `click` | 点击元素 | `selector` |
| `input`/`type` | 输入文本 | `selector`, `text` |
| `clear` | 清除文本 | `selector` |
| `wait` | 等待元素 | `selector`, `timeout` |
| `swipe`/`scroll` | 滑动操作 | `startX`, `startY`, `endX`, `endY` |
| `screenshot` | 截图 | - |
| `back` | 返回 | - |
| `assert`/`verify` | 断言元素可见 | `selector` |

### 5.2 Playwright 支持的操作

| 操作 | 说明 | 参数 |
|------|------|------|
| `navigate`/`goto` | 导航到 URL | `url` |
| `click` | 点击元素 | `selector`, `timeout` |
| `fill`/`input` | 填充文本 | `selector`, `text`, `timeout` |
| `press` | 按键 | `selector`, `text` |
| `wait` | 等待 | `selector`/`ms`/`time` |
| `screenshot` | 截图 | `path` |
| `evaluate` | 执行 JS | `script` |
| `assert`/`expect` | 断言 | `selector` |
| `hover` | 悬停 | `selector` |
| `select`/`selectOption` | 选择选项 | `selector`, `text` |
| `check` | 勾选 | `selector` |
| `uncheck` | 取消勾选 | `selector` |
| `reload` | 重新加载 | - |
| `goBack` | 返回 | - |

---

## 6. 运行测试

### 6.1 启动后端

```bash
cd backend
npm run start:dev
```

### 6.2 执行测试

通过 API 触发测试执行：

```bash
# 创建执行记录并启动测试
POST /api/executions/execute
{
  "testCaseId": "uuid",
  "deviceId": "uuid"
}
```

### 6.3 查看实时日志

通过 WebSocket 连接查看实时日志：

```javascript
// 前端代码示例
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/execution');
socket.emit('join-execution', executionId);

socket.on('execution-log', (data) => {
  console.log(data.log);
});
```

---

## 7. 故障排查

### 7.1 Appium 连接失败

- 确保 Appium Server 已启动：`appium`
- 检查设备是否连接：`adb devices` (Android) 或 `xcrun xctrace list devices` (iOS)
- 验证 `APPIUM_HOST` 和 `APPIUM_PORT` 配置

### 7.2 Playwright 浏览器启动失败

- 确保已安装浏览器：`npx playwright install`
- 检查 `PLAYWRIGHT_HEADLESS` 设置
- 查看日志：`logs/` 目录

### 7.3 元素定位失败

- 使用 Appium Inspector 或 Playwright Codegen 获取正确的选择器
- 增加 `timeout` 参数
- 使用 `wait` 操作等待元素加载

---

## 8. 目录结构

```
backend/
├── screenshots/          # 测试失败截图
├── videos/              # Playwright 测试视频
├── logs/                # 日志文件
├── .env                 # 环境变量配置
└── src/
    └── modules/
        └── execution/
            └── executor/
                ├── appium-executor.ts    # Appium 执行器
                └── playwright-executor.ts # Playwright 执行器
```

---

## 9. 后续优化建议

1. **并行执行**: 支持多个设备同时执行测试
2. **测试报告**: 集成 Allure 或自定义 HTML 报告
3. **失败重试**: 自动重试失败的测试步骤
4. **数据驱动**: 支持从 CSV/Excel 读取测试数据
5. **CI/CD 集成**: 与 Jenkins、GitLab CI 等集成
