# start.sh 脚本使用指南 / Start Script Guide

## 概述 / Overview

`start.sh` 是 OmniAutoTest 项目的自动化启动脚本，提供了一系列命令来管理和运行测试。

`start.sh` is the automated start script for the OmniAutoTest project, providing a series of commands to manage and run tests.

---

## 查看帮助 / View Help

### 命令 / Command

```bash
./start.sh -h
# 或 / or
./start.sh --help
```

### 输出示例 / Output Example

```
================================================================
   OmniAutoTest - 自动化测试平台启动脚本
   OmniAutoTest - Automated Testing Platform Start Script
================================================================

用法 / Usage:
  ./start.sh [选项 / option]

选项 / Options:

  install           安装项目依赖
                    Install project dependencies
                    示例/Example: ./start.sh install

  test:ios          运行 iOS 测试 (使用 Detox)
                    Run iOS tests (using Detox)
                    示例/Example: ./start.sh test:ios

  ... (更多命令 / more commands)

快速开始 / Quick Start:
  1. 安装依赖:     ./start.sh install
  2. 运行 iOS 测试:   ./start.sh test:ios
  3. 生成报告:        ./start.sh report

前置要求 / Prerequisites:
  - Appium (可选，用于本地调试): npm install -g appium
  - Node.js >= 22.22.0
```

---

## 可用命令 / Available Commands

### 1. install - 安装依赖

**中文说明**:
- 检查并安装 Node.js 依赖
- 运行 `npm install`

**English**:
- Check and install Node.js dependencies
- Run `npm install`

**用法 / Usage**:
```bash
./start.sh install
```

---

### 2. test:ios - 运行 iOS 测试

**中文说明**:
- 使用 Detox 运行 iOS 测试
- 需要 iOS 模拟器或真机
- 自动安装依赖

**English**:
- Run iOS tests using Detox
- Requires iOS Simulator or real device
- Automatically install dependencies

**用法 / Usage**:
```bash
./start.sh test:ios
```

**环境变量 / Environment Variables**:
```bash
TEST_PLATFORM=ios
```

---

### 3. test:android - 运行 Android 测试

**中文说明**:
- 使用 Appium/WebdriverIO 运行 Android 测试
- 需要连接远程 Appium Server
- 需要 Android 模拟器或真机

**English**:
- Run Android tests using Appium/WebdriverIO
- Requires connection to remote Appium Server
- Requires Android Emulator or real device

**用法 / Usage**:
```bash
./start.sh test:android
```

**环境变量 / Environment Variables**:
```bash
TEST_PLATFORM=android
```

**配置 Appium Server**:
在 `configs/mobile.config.js` 中配置 Appium Server 地址：
```json
{
  "test": {
    "appium": {
      "host": "localhost",
      "port": 4723
    }
  }
}
```

---

### 4. test:web - 运行 Web 测试

**中文说明**:
- 使用 Playwright 运行 Web 测试
- 支持 Chromium, Firefox, WebKit
- 自动安装依赖

**English**:
- Run Web tests using Playwright
- Support Chromium, Firefox, WebKit
- Automatically install dependencies

**用法 / Usage**:
```bash
./start.sh test:web
```

---

### 5. test:api - 运行 API 测试

**中文说明**:
- 运行 API 接口测试
- 使用 Jest + Axios
- 测试 RESTful API 端点

**English**:
- Run API endpoint tests
- Use Jest + Axios
- Test RESTful API endpoints

**用法 / Usage**:
```bash
./start.sh test:api
```

---

### 6. test:all - 运行所有测试

**中文说明**:
- 依次运行所有测试 (iOS, Android, Web, API)
- 生成完整测试报告

**English**:
- Run all tests sequentially (iOS, Android, Web, API)
- Generate complete test report

**用法 / Usage**:
```bash
./start.sh test:all
```

---

### 7. report - 生成测试报告

**中文说明**:
- 使用 Allure 生成测试报告
- 自动打开浏览器显示报告
- 报告包含截图、日志和统计信息

**English**:
- Generate test report using Allure
- Automatically open browser to display report
- Report includes screenshots, logs, and statistics

**用法 / Usage**:
```bash
./start.sh report
```

**报告位置 / Report location**:
```
artifacts/allure-report/
```

---

### 8. clean - 清理环境

**中文说明**:
- 删除 `dist/` 目录
- 删除 `artifacts/` 目录
- 清理 npm 缓存

**English**:
- Remove `dist/` directory
- Remove `artifacts/` directory
- Clean npm cache

**用法 / Usage**:
```bash
./start.sh clean
```

---

## 交互式菜单 / Interactive Menu

如果不带任何参数运行脚本，将显示交互式菜单：

If you run the script without any arguments, it will show an interactive menu:

```bash
./start.sh
```

**菜单选项 / Menu options**:
```
================================================
   OmniAutoTest 自动化测试平台 / Testing Platform
================================================
1.  安装依赖 / Install dependencies
2.  运行 iOS 测试 / Run iOS tests
3.  运行 Android 测试 / Run Android tests
4.  运行 Web 测试 / Run Web tests
5.  运行 API 测试 / Run API tests
6.  运行所有测试 / Run all tests
7.  生成测试报告 / Generate test report
8.  清理环境 / Clean environment
0.  退出 / Exit
================================================
```

---

## 快速开始示例 / Quick Start Examples

### 示例 1: 首次运行

```bash
# 1. 查看帮助
./start.sh --help

# 2. 安装依赖
./start.sh install

# 3. 运行测试
./start.sh test:android

# 4. 查看报告
./start.sh report
```

### 示例 2: Android 测试

```bash
# 1. 安装依赖 (首次)
./start.sh install

# 2. 确保已配置 Appium Server 地址
#    编辑 configs/mobile.config.js

# 3. 确保 Android 设备已连接
adb devices

# 4. 运行 Android 测试
./start.sh test:android
```

### 示例 3: iOS 测试

```bash
# 1. 安装依赖 (首次)
./start.sh install

# 2. 确保 iOS 模拟器已启动

# 3. 运行 iOS 测试
./start.sh test:ios

# 4. 查看报告
./start.sh report
```

---

## 故障排查 / Troubleshooting

### 问题 1: Appium 服务器连接失败

**错误信息**:
```
[ERROR] 无法连接到 Appium Server
```

**解决方案**:
1. 检查配置文件中 Appium Server 地址是否正确
2. 确保 Appium Server 正在运行
3. 检查网络连接和防火墙设置

---

### 问题 2: Android 设备未检测到

**错误信息**:
```
[ERROR] 未发现可用的 Android 设备或模拟器
```

**解决方案**:
```bash
# 检查 adb 是否安装
adb --version

# 如果未安装，在 macOS 上可以：
brew install android-platform-tools

# 检查设备连接状态
adb devices

# 如果设备未授权，请在设备上允许 USB 调试
```

---

### 问题 3: iOS 测试失败 (Detox)

**错误信息**:
```
Test Failed: No elements found for "MATCHER(id == "usernameInput")"
```

**解决方案**:
1. 检查 iOS 模拟器是否已启动
2. 检查应用是否正确安装了 TestID
3. 查看 Detox 日志: `artifacts/` 目录

---

### 问题 4: 依赖安装失败

**解决方案**:
```bash
# 清理 npm 缓存
npm cache clean --force

# 删除 node_modules 并重新安装
rm -rf node_modules
./start.sh install
```

---

## 本地调试 Appium

如果需要在本地启动 Appium Server 进行调试：

```bash
# 安装 Appium
npm install -g appium

# 启动 Appium Server
appium --allow-cors --relaxed-security

# 在另一个终端中运行测试
./start.sh test:android
```

---

## 更多文档 / More Documentation

- [README.md](../..README.md) - 项目概述
- [README_zh.md](../..README_zh.md) - 中文文档
- [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md) - 环境配置指南
