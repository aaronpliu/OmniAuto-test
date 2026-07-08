# Start Script Guide

`start.sh` 是 OmniAutoTest 项目的统一入口，支持 CLI 命令和交互式菜单两种方式。

## 交互式菜单

```bash
./start.sh
```

显示 Node.js 交互式菜单（方向键选择，Enter 确认），包含所有可用操作。

首次使用无 node_modules 时自动降级为键盘选择模式（w/s 键上/下移，Enter 确认，q 退出）。

## CLI 命令

```bash
./start.sh <command> [flags]
```

| 命令 | 说明 |
|------|------|
| `install` | 安装项目依赖 |
| `appium:start` | 启动本地 Appium Server（调试用） |
| `appium:stop` | 停止本地 Appium Server |
| `test:ios` | iOS 测试（Detox） |
| `test:ios:appium` | iOS 测试（Appium XCUITest） |
| `test:android` | Android 测试（Appium） |
| `test:android:detox` | Android 测试（Detox） |
| `test:web` | Web 测试（Playwright） |
| `test:api` | API 测试 |
| `test:all` | 全部测试 |
| `report` | 生成并打开 Allure 报告 |
| `clean` | 清理环境和缓存 |

## 全局参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `--screenshot` / `--ss` | 开 | 启用失败截图 |
| `--no-screenshot` / `--no-ss` | — | 禁用失败截图 |
| `--recording` / `--rec` | 关 | 启用屏幕录制 |
| `--no-recording` / `--no-rec` | — | 禁用屏幕录制 |

```bash
./start.sh test:android --recording
./start.sh test:ios:appium --no-screenshot --recording
```

## 帮助

```bash
./start.sh --help
```
