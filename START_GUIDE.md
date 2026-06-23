# OmniAutoTest 启动指南

## 快速开始

### 1. 首次使用

确保已安装 Node.js (>= 22.22.0)：

```bash
# 检查 Node.js 版本
node --version

# 如果需要安装 Appium（可选，仅用于本地调试）
npm install -g appium
```

### 2. 使用启动脚本

#### 交互式模式（推荐）

```bash
./start.sh
```

然后按照菜单提示选择操作：

1. **安装依赖** - 安装 Node.js 依赖包
2. **运行 iOS 测试** - 运行 iOS 平台测试（需要 Detox）
3. **运行 Android 测试** - 运行 Android 平台测试（需要 Appium）
4. **运行 Web 测试** - 运行 Web 平台测试（需要 Playwright）
5. **运行 API 测试** - 运行 API 接口测试（需要 Jest）
6. **运行所有测试** - 运行所有平台的测试
7. **生成测试报告** - 生成并打开 Allure 测试报告
8. **清理环境** - 清理测试产物

#### 命令行模式

```bash
# 安装依赖
./start.sh install

# 运行 iOS 测试
./start.sh test:ios

# 运行 Android 测试
./start.sh test:android

# 运行 Web 测试
./start.sh test:web

# 运行 API 测试
./start.sh test:api

# 运行所有测试
./start.sh test:all

# 生成测试报告
./start.sh report

# 清理环境
./start.sh clean
```

## 测试平台说明

### iOS 测试
- 使用 Detox 框架
- 需要 macOS 系统和 Xcode
- 配置文件：`jest.ios.config.js`
- 运行命令：`npm run test:mobile:ios`

### Android 测试
- 使用 Appium 框架
- 需要 Android SDK 和模拟器或真机
- 需要连接远程 Appium Server（在配置文件中设置）
- 配置文件：`jest.android.config.js`
- 运行命令：`npm run test:mobile:android`

### Web 测试
- 使用 Playwright 框架
- 支持 Chromium、Firefox、WebKit
- 配置文件：`playwright.config.ts`
- 运行命令：`npm run test:web`

### API 测试
- 使用 Jest 框架
- 配置文件：`jest.api.config.js`
- 运行命令：`npm run test:api`

## 目录结构

```
OmniAutoTest/
├── applications/          # 测试应用程序
│   └── TestGround/       # 测试应用示例
├── apps/                 # 移动应用安装包
├── configs/              # 配置文件
│   ├── development.json  # 开发环境配置
│   ├── staging.json      # 预发布环境配置
│   └── production.json   # 生产环境配置
├── examples/             # 示例代码
├── framework/            # 测试框架核心代码
├── tests/                # 测试用例
│   ├── mobile/          # 移动端测试
│   ├── web/             # Web 端测试
│   └── api/             # API 测试
├── artifacts/            # 测试产物（报告、日志等）
├── start.sh             # 自动化启动脚本
└── package.json         # 项目配置
```

## 配置 Appium Server

在 `configs/development.json` 中配置 Appium Server 地址：

```json
{
  "platform": "android",
  "test": {
    "appium": {
      "host": "localhost",
      "port": 4723
    }
  }
}
```

## 常见问题

### 1. Appium 服务器连接失败

- 确保已在配置文件中正确设置 Appium Server 地址
- 确保 Appium Server 正在运行并可访问
- 检查网络连接和防火墙设置

### 2. 依赖安装失败

```bash
# 清理 npm 缓存
npm cache clean --force

# 删除 node_modules 并重新安装
rm -rf node_modules
./start.sh install
```

### 3. iOS 测试失败

- 确保 Xcode 已安装
- 确保 Detox 环境已配置：`npx detox clean-framework-cache && npx detox build-framework-cache`
- 确保模拟器已启动

### 4. Android 测试失败

- 确保 Android SDK 已安装
- 确保 `ANDROID_HOME` 环境变量已设置
- 确保模拟器或真机已连接：`adb devices`
- 确保已在配置文件中设置正确的 Appium Server 地址

### 5. Android 设备未检测到

```bash
# 检查 adb 是否安装
adb --version

# 如果未安装，在 macOS 上可以：
brew install android-platform-tools

# 检查设备连接状态
adb devices

# 如果设备未授权，请在设备上允许 USB 调试
```

## 高级用法

### 本地调试 Appium

如果需要在本地启动 Appium Server 进行调试：

```bash
# 安装 Appium
npm install -g appium

# 启动 Appium Server
appium --allow-cors --relaxed-security

# 在另一个终端中运行测试
./start.sh test:android
```

### 并行运行测试

可以在多台设备上并行运行测试，需要配置多个 Appium Server 实例。

## 技术支持

如有问题，请检查：
1. 测试日志：`artifacts/` 目录
2. 框架日志：`framework/` 目录中的日志配置
3. Appium 日志（如果使用本地 Appium）

## 下一步

- 查看 `examples/` 目录中的示例代码
- 阅读 `README.md` 了解详细文档
- 根据项目需求修改 `configs/` 中的配置文件
- 配置远程 Appium Server 地址
