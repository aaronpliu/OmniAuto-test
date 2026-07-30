#!/bin/bash

# OmniAutoTest 自动化启动脚本
# 仅支持连接远程 Appium Server（本地模式）

# 不设置 set -e，以便我们可以自定义错误处理

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示帮助信息
show_help() {
    echo -e "${CYAN}==============================================================================${NC}"
    echo -e "${CYAN}   OmniAutoTest - 自动化测试平台启动脚本 / Automated Testing Platform Start Script${NC}"
    echo -e "${CYAN}==============================================================================${NC}"
    echo ""
    echo -e "${GREEN}语法 / Syntax:${NC}"
    echo ""
    echo -e "  ./start.sh ${YELLOW}<command>${NC} ${CYAN}[全局参数]${NC} ${CYAN}[CI 配置参数]${NC} [测试目标...]"
    echo ""
    echo -e "  ${DIM}• <command>  必填，必须放在第一个位置${NC}"
    echo -e "  ${DIM}• [全局参数]  可选，位置不限，可放在 command 前后任意位置${NC}"
    echo -e "  ${DIM}• [CI 配置]  可选，位置不限，用于覆盖配置文件默认值${NC}"
    echo -e "  ${DIM}• [测试目标]  可选，必须放在 command 之后，支持文件/目录/模式${NC}"
    echo ""
    echo -e "${GREEN}<command> 必填命令 / Required Commands:${NC}"
    echo ""
    echo -e "  ${YELLOW}install${NC}               安装项目依赖 / Install dependencies"
    echo -e "  ${YELLOW}test:ios${NC}              iOS 测试 (Detox) / iOS tests (Detox)"
    echo -e "  ${YELLOW}test:ios:appium${NC}       iOS 测试 (Appium) / iOS tests (Appium)"
    echo -e "  ${YELLOW}test:android${NC}          Android 测试 (Appium) / Android tests (Appium)"
    echo -e "  ${YELLOW}test:android:detox${NC}    Android 测试 (Detox) / Android tests (Detox)"
    echo -e "  ${YELLOW}test:web${NC}              Web 测试 (Playwright) / Web tests (Playwright)"
    echo -e "  ${YELLOW}test:api${NC}              API 测试 / API tests"
    echo -e "  ${YELLOW}test:all${NC}              运行所有测试 / Run all tests"
    echo -e "  ${YELLOW}report${NC}                生成并打开 Allure 报告 / Generate & open report"
    echo -e "  ${YELLOW}appium:start${NC}          启动本地 Appium Server / Start local Appium Server"
    echo -e "  ${YELLOW}appium:stop${NC}           停止本地 Appium Server / Stop local Appium Server"
    echo -e "  ${YELLOW}clean${NC}                 清理环境和缓存 / Clean environment and cache"
    echo -e "  ${YELLOW}plugin${NC}                插件管理 / Plugin management"
    echo -e "  ${YELLOW}-h, --help${NC}            显示此帮助 / Show this help"
    echo ""
    echo -e "  ${DIM}不传参时显示交互式菜单 / Shows interactive menu when no args given${NC}"
    echo ""
    echo -e "${GREEN}[全局参数] 可选，位置不限 / Global Flags (optional, any position):${NC}"
    echo ""
    echo -e "  ${CYAN}--screenshot${NC}, ${CYAN}--ss${NC}         启用失败截图 ${DIM}(默认)${NC}"
    echo -e "  ${CYAN}--no-screenshot${NC}, ${CYAN}--no-ss${NC}   禁用失败截图"
    echo -e "  ${CYAN}--recording${NC}, ${CYAN}--rec${NC}         启用测试录屏 ${DIM}(默认关闭)${NC}"
    echo -e "  ${CYAN}--no-recording${NC}, ${CYAN}--no-rec${NC}   禁用测试录屏"
    echo -e "  ${CYAN}--log-level${NC} <level>       日志级别: ${CYAN}info${NC} ${DIM}(默认)${NC} | ${CYAN}debug${NC} | ${CYAN}trace${NC}"
    echo ""
    echo -e "${GREEN}[CI 配置参数] 可选，位置不限 / CI Config Overrides (optional, any position):${NC}"
    echo -e "  ${DIM}映射为环境变量，覆盖 configs/mobile.config.*.js 中的默认值${NC}"
    echo ""
    echo -e "  ${CYAN}--appium-host${NC} <host>       Appium Server 地址"
    echo -e "  ${CYAN}--appium-port${NC} <port>       Appium Server 端口"
    echo -e "  ${CYAN}--android-device${NC} <name>    Android 设备名 ${DIM}(ANDROID_DEVICE_NAME)${NC}"
    echo -e "  ${CYAN}--android-version${NC} <ver>    Android 平台版本 ${DIM}(ANDROID_PLATFORM_VERSION)${NC}"
    echo -e "  ${CYAN}--ios-device${NC} <name>        iOS 设备名 ${DIM}(IOS_DEVICE_NAME)${NC}"
    echo -e "  ${CYAN}--ios-version${NC} <ver>        iOS 平台版本 ${DIM}(IOS_PLATFORM_VERSION)${NC}"
    echo -e "  ${CYAN}--mobile-app${NC} <path>        APK/IPA 路径 ${DIM}(相对或绝对路径)${NC}"
    echo -e "  ${CYAN}--app-package${NC} <pkg>        Android appPackage"
    echo -e "  ${CYAN}--app-activity${NC} <act>       Android appActivity"
    echo -e "  ${CYAN}--bundle-id${NC} <id>           iOS Bundle ID"
    echo -e "  ${CYAN}--system-port${NC} <port>       Android systemPort"
    echo -e "  ${CYAN}--no-reset${NC}                 启用 Appium noReset"
    echo -e "  ${CYAN}--full-reset${NC}               启用 Appium fullReset"
    echo -e "  ${CYAN}--language${NC} <lang>          设备语言 ${DIM}(如 zh)${NC}"
    echo -e "  ${CYAN}--locale${NC} <locale>          设备地区 ${DIM}(如 CN)${NC}"
    echo ""
    echo -e "${GREEN}[测试目标] 可选，放在 command 之后 / Test Target (optional, after command):${NC}"
    echo ""
    echo -e "  ${DIM}透传给底层 Jest/Detox/Playwright，支持文件、目录、匹配模式：${NC}"
    echo "    ./start.sh test:android tests/mobile/login.spec.ts"
    echo "    ./start.sh test:android tests/mobile/"
    echo "    ./start.sh test:android --testPathPattern=login"
    echo "    ./start.sh test:web -g \"用户登录\""
    echo ""
    echo -e "${GREEN}插件管理 / Plugin Management:${NC}"
    echo ""
    echo -e "  ${YELLOW}plugin list${NC}              列出插件状态 / List plugin status"
    echo -e "  ${YELLOW}plugin enable${NC} <name>    启用插件 / Enable plugin"
    echo -e "  ${YELLOW}plugin disable${NC} <name>   禁用插件 / Disable plugin"
    echo -e "  ${DIM}可用插件: detox, appium, playwright, api${NC}"
    echo ""
    echo -e "${GREEN}示例 / Examples:${NC}"
    echo ""
    echo -e "  ${DIM}# 基础用法${NC}"
    echo "  ./start.sh test:android"
    echo "  ./start.sh test:ios tests/mobile/login.spec.ts"
    echo ""
    echo -e "  ${DIM}# 带全局参数（位置不限）${NC}"
    echo "  ./start.sh --recording test:android"
    echo "  ./start.sh test:ios --no-screenshot --log-level debug"
    echo ""
    echo -e "  ${DIM}# CI 动态配置（覆盖配置文件默认值）${NC}"
    echo "  ./start.sh test:android --appium-host 192.168.1.100 --android-device Pixel_7 \\"
    echo "    --android-version 14 --mobile-app ./build/app.apk --no-reset"
    echo ""
    echo -e "  ${DIM}# 直接设置环境变量（不走 start.sh）${NC}"
    echo "  APPIUM_HOST=10.0.0.1 APP_PATH=./build/app.apk npm run test:mobile:android"
    echo ""
    echo -e "${GREEN}前置要求 / Prerequisites:${NC}"
    echo -e "  Node.js >= 22.22.0"
    echo -e "  Appium ${DIM}(可选，本地调试用)${NC}:  npm install appium && appium driver install uiautomator2"
    echo ""
    echo -e "${DIM}配置文件: configs/mobile.config.ci.js (CI) / configs/mobile.config.local.js (本地)${NC}"
    echo -e "${DIM}文档: README.md / README_zh.md / examples/docs/${NC}"
    echo -e "${CYAN}==============================================================================${NC}"
    exit 0
}

# 检查 Appium 是否安装（可选）
check_appium() {
    print_info "检查 Appium 安装状态..."
    
    # 先检查项目中是否安装了 Appium
    if [ -f "node_modules/.bin/appium" ]; then
        print_success "项目中已安装 Appium: $(node_modules/.bin/appium --version 2>/dev/null || echo 'version unknown')"
        print_info "使用项目中的 Appium: ./node_modules/.bin/appium"
        APPIUM_CMD="./node_modules/.bin/appium"
        return 0
    fi
    
    # 再检查全局是否安装了 Appium
    if command -v appium &> /dev/null; then
        print_success "全局已安装 Appium: $(appium --version)"
        print_info "使用全局 Appium: $(command -v appium)"
        APPIUM_CMD="appium"
        return 0
    fi
    
    # 都未安装
    print_warning "Appium 未安装，但这是可选的（仅用于本地调试）"
    print_warning "Appium not installed, but it's optional (only for local debugging)"
    print_info "安装命令 / Installation command:"
    print_info "  - 项目中安装 / Install in project: npm install appium"
    print_info "  - 全局安装 / Install globally: npm install -g appium"
    APPIUM_CMD=""
    return 0
}

# 启动本地 Appium Server（用于调试）
start_appium_local() {
    print_info "启动本地 Appium Server..."
    
    # 检查 Appium 是否可用
    if [ -z "$APPIUM_CMD" ]; then
        check_appium
    fi
    
    if [ -z "$APPIUM_CMD" ]; then
        print_error "未找到 Appium 命令，请先安装 Appium"
        print_info "安装命令 / Installation command:"
        print_info "  - 项目中安装 / Install in project: npm install appium"
        print_info "  - 全局安装 / Install globally: npm install -g appium"
        return 1
    fi
    
    # 检查 Appium 是否已经在运行
    if pgrep -f "node.*appium" > /dev/null; then
        print_warning "Appium 服务器已经在运行"
        print_warning "Appium server is already running"
        return 0
    fi
    
    # 创建日志目录
    mkdir -p logs
    
    # 启动 Appium 服务器（后台运行）
    print_info "启动 Appium 服务器（端口/Port: 4723）..."
    nohup "$APPIUM_CMD" --allow-cors --relaxed-security > logs/appium.log 2>&1 &
    APPIUM_PID=$!
    echo $APPIUM_PID > /tmp/appium.pid
    
    # 等待 Appium 启动
    sleep 3
    
    # 检查是否启动成功
    if pgrep -f "node.*appium" > /dev/null; then
        print_success "Appium 服务器已启动"
        print_success "Appium server started"
        print_info "进程 ID / Process ID: $APPIUM_PID"
        print_info "日志文件 / Log file: logs/appium.log"
        print_info "停止命令 / Stop command: kill $APPIUM_PID"
        return 0
    else
        print_error "Appium 服务器启动失败"
        print_error "Failed to start Appium server"
        print_info "请查看日志文件 / Please check log file: logs/appium.log"
        return 1
    fi
}

# 停止本地 Appium Server
stop_appium_local() {
    print_info "停止本地 Appium Server..."
    
    if [ -f /tmp/appium.pid ]; then
        APPIUM_PID=$(cat /tmp/appium.pid)
        if kill -0 $APPIUM_PID 2>/dev/null; then
            kill $APPIUM_PID
            rm /tmp/appium.pid
            print_success "Appium 服务器已停止"
            print_success "Appium server stopped"
        else
            print_warning "Appium 服务器未运行"
            print_warning "Appium server is not running"
            rm -f /tmp/appium.pid
        fi
    else
        # 尝试直接杀死 appium 进程
        if pgrep -f "node.*appium" > /dev/null; then
            pkill -f "node.*appium"
            print_success "Appium 服务器已停止"
            print_success "Appium server stopped"
        else
            print_warning "未找到运行中的 Appium 服务器"
            print_warning "No running Appium server found"
        fi
    fi
}

# 确保依赖已安装（内部处理错误消息）
install_dependencies() {
    print_info "检查并安装依赖..."
    if [ ! -d "node_modules" ]; then
        print_info "安装 Node.js 依赖..."
        npm install
        if [ $? -ne 0 ]; then
            print_error "依赖安装失败"
            print_error "Failed to install dependencies"
            return 1
        fi
        print_success "依赖安装完成"
    else
        print_success "依赖已安装"
    fi

    # 自动生成本地配置文件（缺失时从 .ci.js 模板复制）
    if [ -f "scripts/setup-configs.js" ]; then
        node scripts/setup-configs.js
    fi
    return 0
}

# 辅助函数：先安装依赖，再执行指定命令
# 用法: ensure_deps_and_run "错误消息" command_fn [args...]
ensure_deps_and_run() {
    local err_msg="$1"
    local cmd_fn="$2"
    shift 2
    if ! install_dependencies; then
        return 1
    fi
    if ! "$cmd_fn" "$@"; then
        print_error "$err_msg"
        return 1
    fi
    return 0
}

# 运行 iOS 测试（Detox）
# 透传位置参数：文件/目录/匹配模式，如 tests/mobile/TestGround/login.spec.ts
run_ios_test() {
    print_info "运行 iOS 测试（Detox）..."
    if [ -n "$DETOX_LOGLEVEL" ]; then
        npm run test:mobile:ios -- --loglevel "$DETOX_LOGLEVEL" "$@"
    else
        npm run test:mobile:ios -- "$@"
    fi
}

# 运行 iOS 测试（Appium）
# 透传位置参数：文件/目录/匹配模式
run_ios_appium_test() {
    print_info "运行 iOS 测试（Appium）..."
    print_info "请确保 Appium Server 已启动并可访问"
    print_info "Please ensure Appium Server is running and accessible"
    npm run test:mobile:ios:appium -- "$@"
}

# 运行 Android 测试（Detox）
# 透传位置参数：文件/目录/匹配模式
run_android_detox_test() {
    print_info "运行 Android 测试（Detox）..."
    if [ -n "$DETOX_LOGLEVEL" ]; then
        npm run test:mobile:android:detox -- --loglevel "$DETOX_LOGLEVEL" "$@"
    else
        npm run test:mobile:android:detox -- "$@"
    fi
}

# 检测 Android 设备
check_android_device() {
    print_info "检测 Android 设备..."
    
    # 检查 adb 是否安装
    if ! command -v adb &> /dev/null; then
        print_error "未找到 adb 命令，请确保 Android SDK 已安装并配置 ANDROID_HOME 环境变量"
        print_info "安装指南 / Installation Guide:"
        print_info "  - macOS: brew install android-platform-tools"
        print_info "  - 或安装 Android Studio: https://developer.android.com/studio"
        return 1
    fi
    
    # 获取设备列表（排除标题行和空行）
    device_list=$(adb devices | grep -v "List of devices" | grep -v "^$" | grep "device$")
    
    if [ -z "$device_list" ]; then
        print_error "未发现可用的 Android 设备或模拟器"
        print_info ""
        print_info "请执行以下操作之一 / Please do one of the following:"
        print_info "  1. 连接 Android 真机并启用 USB 调试"
        print_info "     Connect an Android device and enable USB debugging"
        print_info "  2. 启动 Android 模拟器"
        print_info "     Start an Android emulator"
        print_info "  3. 检查设备是否被授权：adb devices"
        print_info "     Check device authorization: adb devices"
        print_info ""
        return 1
    fi
    
    # 显示检测到的设备
    print_success "发现以下 Android 设备 / Found the following Android devices:"
    adb devices | grep -v "List of devices" | grep -v "^$" | while read line; do
        print_info "  - $line"
    done
    return 0
}

# 运行 Android 测试
# 透传位置参数：文件/目录/匹配模式
run_android_test() {
    print_info "运行 Android 测试..."

    # 先检测 Android 设备
    if ! check_android_device; then
        return 1
    fi

    # 运行测试
    print_info "正在连接远程 Appium Server..."
    print_info "Connecting to remote Appium Server..."
    print_info "请确保 Appium Server 已启动并可访问"
    print_info "Please ensure Appium Server is running and accessible"
    npm run test:mobile:android -- "$@"
}

# 运行 Web 测试
# 透传位置参数：文件名子串过滤 / -g <title-正则>
run_web_test() {
    print_info "运行 Web 测试..."
    if [ -n "$DEBUG_PLAYWRIGHT" ]; then
        DEBUG="$DEBUG_PLAYWRIGHT" npm run test:web -- "$@"
    else
        npm run test:web -- "$@"
    fi
}

# 运行 API 测试
# 透传位置参数：文件/目录/匹配模式
run_api_test() {
    print_info "运行 API 测试..."
    npm run test:api -- "$@"
}

# 运行所有测试（动态，仅运行已启用插件的测试）
run_all_tests() {
    print_info "运行所有已启用插件的测试..."
    local failed=0
    if is_plugin_enabled "detox"; then
        run_ios_test || failed=1
    fi
    if is_plugin_enabled "appium"; then
        run_android_test || failed=1
    fi
    if is_plugin_enabled "playwright"; then
        run_web_test || failed=1
    fi
    if is_plugin_enabled "api"; then
        run_api_test || failed=1
    fi
    return $failed
}

# 生成测试报告
generate_report() {
    print_info "生成测试报告..."
    npm run report:generate
    if [ $? -ne 0 ]; then
        return 1
    fi
    npm run report:open
    return $?
}

# 清理环境
clean_environment() {
    print_info "清理环境..."
    npm run clean
    if [ $? -ne 0 ]; then
        print_warning "清理 npm 缓存失败"
        print_warning "Failed to clean npm cache"
        return 1
    fi
    print_success "环境清理完成"
}

# ========== 插件管理 / Plugin Management ==========

# 检查指定插件是否启用
is_plugin_enabled() {
    local plugin="$1"
    if [ -f "configs/plugins.json" ] && command -v node &>/dev/null; then
        node -e "
            const p = require('./configs/plugins.json');
            process.exit(p['$plugin']?.enabled !== false ? 0 : 1);
        " 2>/dev/null
    else
        return 0  # 无配置文件时默认全部启用（向后兼容）
    fi
}

# 列出所有插件状态
list_plugins() {
    if [ ! -f "configs/plugins.json" ]; then
        print_warning "configs/plugins.json 不存在，所有插件默认启用"
        echo "  detox:      enabled"
        echo "  appium:     enabled"
        echo "  playwright: enabled"
        echo "  api:        enabled"
        return 0
    fi
    print_info "插件状态 / Plugin Status:"
    node -e "
        const p = require('./configs/plugins.json');
        for (const [name, cfg] of Object.entries(p)) {
            const status = cfg.enabled !== false ? 'enabled' : 'disabled';
            console.log('  ' + name.padEnd(12) + status);
        }
    "
}

# 启用插件
enable_plugin() {
    local plugin="$1"
    if [ -z "$plugin" ]; then
        print_error "请指定插件名: detox, appium, playwright, api"
        return 1
    fi
    if [ ! -f "configs/plugins.json" ]; then
        print_error "configs/plugins.json 不存在"
        return 1
    fi
    node -e "
        const fs = require('fs');
        const p = JSON.parse(fs.readFileSync('configs/plugins.json', 'utf-8'));
        if (!p['$plugin']) { p['$plugin'] = {}; }
        p['$plugin'].enabled = true;
        fs.writeFileSync('configs/plugins.json', JSON.stringify(p, null, 2) + '\n');
    " && print_success "插件 $plugin 已启用" || print_error "启用插件 $plugin 失败"
}

# 禁用插件
disable_plugin() {
    local plugin="$1"
    if [ -z "$plugin" ]; then
        print_error "请指定插件名: detox, appium, playwright, api"
        return 1
    fi
    if [ ! -f "configs/plugins.json" ]; then
        print_error "configs/plugins.json 不存在"
        return 1
    fi
    node -e "
        const fs = require('fs');
        const p = JSON.parse(fs.readFileSync('configs/plugins.json', 'utf-8'));
        if (!p['$plugin']) { p['$plugin'] = {}; }
        p['$plugin'].enabled = false;
        fs.writeFileSync('configs/plugins.json', JSON.stringify(p, null, 2) + '\n');
    " && print_success "插件 $plugin 已禁用" || print_error "禁用插件 $plugin 失败"
}

# 动态菜单构建 — 仅显示已启用插件对应的操作
MENU_ITEMS=()
MENU_ACTIONS=()

build_menu_items() {
    MENU_ITEMS=()
    MENU_ACTIONS=()

    MENU_ITEMS+=("安装依赖 / Install dependencies")
    MENU_ACTIONS+=("install_dependencies")

    if is_plugin_enabled "appium"; then
        MENU_ITEMS+=("启动本地 Appium Server / Start local Appium Server")
        MENU_ACTIONS+=("start_appium_local")
        MENU_ITEMS+=("停止本地 Appium Server / Stop local Appium Server")
        MENU_ACTIONS+=("stop_appium_local")
    fi

    if is_plugin_enabled "detox"; then
        MENU_ITEMS+=("运行 iOS 测试 (Detox) / Run iOS tests (Detox)")
        MENU_ACTIONS+=("run_ios_test")
    fi

    if is_plugin_enabled "appium"; then
        MENU_ITEMS+=("运行 iOS 测试 (Appium) / Run iOS tests (Appium)")
        MENU_ACTIONS+=("run_ios_appium_test")
        MENU_ITEMS+=("运行 Android 测试 (Appium) / Run Android tests (Appium)")
        MENU_ACTIONS+=("run_android_test")
    fi

    if is_plugin_enabled "detox"; then
        MENU_ITEMS+=("运行 Android 测试 (Detox) / Run Android tests (Detox)")
        MENU_ACTIONS+=("run_android_detox_test")
    fi

    if is_plugin_enabled "playwright"; then
        MENU_ITEMS+=("运行 Web 测试 / Run Web tests")
        MENU_ACTIONS+=("run_web_test")
    fi

    if is_plugin_enabled "api"; then
        MENU_ITEMS+=("运行 API 测试 / Run API tests")
        MENU_ACTIONS+=("run_api_test")
    fi

    # 通用项（不依赖插件）
    MENU_ITEMS+=("运行所有测试 / Run all tests")
    MENU_ACTIONS+=("run_all_tests")
    MENU_ITEMS+=("生成测试报告 / Generate test report")
    MENU_ACTIONS+=("generate_report")
    MENU_ITEMS+=("清理环境 / Clean environment")
    MENU_ACTIONS+=("clean_environment")
    MENU_ITEMS+=("插件管理 / Plugin management")
    MENU_ACTIONS+=("list_plugins")
    MENU_ITEMS+=("退出 / Exit")
    MENU_ACTIONS+=("exit_program")
}

# 显示菜单（带高亮）
# $1: 当前选中项索引
show_menu() {
    local selected=$1
    local items_count=${#MENU_ITEMS[@]}

    # 清除屏幕并显示菜单
    clear
    echo -e "${CYAN}================================================${NC}"
    echo -e "${CYAN}   OmniAutoTest 自动化测试平台 / Testing Platform${NC}"
    echo -e "${CYAN}================================================${NC}"

    for i in "${!MENU_ITEMS[@]}"; do
        if [ $i -eq $selected ]; then
            # 高亮显示选中项
            echo -e "${GREEN} > [$(printf "%2d" $((i+1)))] ${MENU_ITEMS[$i]}${NC}"
        else
            echo "   [$(printf "%2d" $((i+1)))] ${MENU_ITEMS[$i]}"
        fi
    done

    echo -e "${CYAN}================================================${NC}"
    echo ""
    echo -e "${YELLOW}操作说明 / Instructions:${NC}"
    echo "  w/k: 上移 / Up | s/j: 下移 / Down"
    echo "  数字: 直接选择 / Direct select | Enter: 确认 / Confirm"
    echo "  q: 退出 / Quit"
    echo ""
}

# 处理键盘选择菜单
# 使用全局变量 MENU_SELECTION 存储选择结果
# 兼容 macOS bash 3.x
handle_menu_selection() {
    local selected=0
    local items_count=${#MENU_ITEMS[@]}
    local key=""

    # 首次绘制菜单
    show_menu $selected

    while true; do
        # 读取按键（阻塞，等待用户输入）
        read -rs -n1 key

        case "$key" in
            "w"|"W"|"k"|"K") # 上移
                if [ $selected -gt 0 ]; then
                    selected=$((selected - 1))
                    show_menu $selected
                fi
                ;;
            "s"|"S"|"j"|"J") # 下移
                if [ $selected -lt $((items_count - 1)) ]; then
                    selected=$((selected + 1))
                    show_menu $selected
                fi
                ;;
            "q"|"Q") # 退出
                clear
                print_info "退出程序 / Exiting program"
                exit 0
                ;;
            "") # Enter 键确认
                clear
                MENU_SELECTION=$selected
                return 0
                ;;
            [0-9]) # 数字键直接选择
                local num=$((key - 1))
                if [ $num -ge 0 ] && [ $num -lt $items_count ]; then
                    clear
                    MENU_SELECTION=$num
                    return 0
                fi
                ;;
        esac
    done
}

# 执行菜单对应的操作（通过 MENU_ACTIONS 数组动态分发）
execute_menu_action() {
    local choice=$1
    local action="${MENU_ACTIONS[$choice]}"
    local _menu_rc=0

    case "$action" in
        install_dependencies)  install_dependencies ;;
        start_appium_local)
            check_appium
            start_appium_local
            ;;
        stop_appium_local)     stop_appium_local ;;
        run_ios_test)          ensure_deps_and_run "iOS 测试运行失败" run_ios_test ;;
        run_ios_appium_test)   ensure_deps_and_run "iOS (Appium) 测试运行失败" run_ios_appium_test ;;
        run_android_test)      ensure_deps_and_run "Android (Appium) 测试运行失败" run_android_test ;;
        run_android_detox_test) ensure_deps_and_run "Android (Detox) 测试运行失败" run_android_detox_test ;;
        run_web_test)          ensure_deps_and_run "Web 测试运行失败" run_web_test ;;
        run_api_test)          ensure_deps_and_run "API 测试运行失败" run_api_test ;;
        run_all_tests)         ensure_deps_and_run "测试运行失败" run_all_tests ;;
        generate_report)       generate_report ;;
        clean_environment)     clean_environment ;;
        list_plugins)          list_plugins ;;
        exit_program)
            print_info "退出程序 / Exiting program"
            exit 0
            ;;
        *)
            print_warning "未知操作: $action"
            ;;
    esac
    _menu_rc=$?

    if [ $_menu_rc -ne 0 ]; then
        print_warning "操作执行失败，返回菜单"
        print_warning "Operation failed, returning to menu"
        return 1
    fi
    return 0
}

# 主函数
main() {
    # 检查帮助参数 / Check for help argument
    if [[ "$1" == "-h" || "$1" == "--help" ]]; then
        show_help
    fi

    # 如果没有参数，显示交互式菜单
    if [ $# -eq 0 ]; then
        build_menu_items  # 动态构建菜单
        MENU_TMP=$(dirname "$(mktemp -u)")/omni-menu-choice 2>/dev/null || MENU_TMP=/tmp/omni-menu-choice
        while true; do
            MENU_SELECTION=""
            if command -v node &> /dev/null && [ -f "cli/menu.js" ]; then
                # Node.js 交互式菜单（支持方向键）
                node cli/menu.js 2>/dev/null && MENU_SELECTION=$(cat "$MENU_TMP" 2>/dev/null)
            fi

            # 降级：Node.js 不可用或失败时使用纯 bash 键盘选择
            if [ -z "$MENU_SELECTION" ]; then
                handle_menu_selection
            fi

            # 执行选中的操作
            execute_menu_action $MENU_SELECTION

            # 操作完成后暂停
            echo ""
            read -rs -n1 -p "按任意键返回菜单... / Press any key to return to menu..."
            echo ""

            # 重新构建菜单（插件状态可能已变更）
            build_menu_items
        done
    else
        # 根据参数执行对应操作
        case $1 in
            install)
                install_dependencies || exit 1
                ;;
            appium:start)
                check_appium
                start_appium_local || exit 1
                ;;
            appium:stop)
                stop_appium_local || exit 1
                ;;
            test:ios)
                if ! is_plugin_enabled "detox"; then
                    print_error "Detox 插件未启用，无法运行 iOS (Detox) 测试"
                    print_info "启用命令: ./start.sh plugin enable detox"
                    exit 1
                fi
                ensure_deps_and_run "iOS test failed" run_ios_test "${@:2}" || exit 1
                ;;
            test:ios:appium)
                if ! is_plugin_enabled "appium"; then
                    print_error "Appium 插件未启用，无法运行 iOS (Appium) 测试"
                    print_info "启用命令: ./start.sh plugin enable appium"
                    exit 1
                fi
                ensure_deps_and_run "iOS (Appium) test failed" run_ios_appium_test "${@:2}" || exit 1
                ;;
            test:android)
                if ! is_plugin_enabled "appium"; then
                    print_error "Appium 插件未启用，无法运行 Android (Appium) 测试"
                    print_info "启用命令: ./start.sh plugin enable appium"
                    exit 1
                fi
                ensure_deps_and_run "Android test failed" run_android_test "${@:2}" || exit 1
                ;;
            test:android:detox)
                if ! is_plugin_enabled "detox"; then
                    print_error "Detox 插件未启用，无法运行 Android (Detox) 测试"
                    print_info "启用命令: ./start.sh plugin enable detox"
                    exit 1
                fi
                ensure_deps_and_run "Android (Detox) test failed" run_android_detox_test "${@:2}" || exit 1
                ;;
            test:web)
                if ! is_plugin_enabled "playwright"; then
                    print_error "Playwright 插件未启用，无法运行 Web 测试"
                    print_info "启用命令: ./start.sh plugin enable playwright"
                    exit 1
                fi
                ensure_deps_and_run "Web test failed" run_web_test "${@:2}" || exit 1
                ;;
            test:api)
                if ! is_plugin_enabled "api"; then
                    print_error "API 插件未启用，无法运行 API 测试"
                    print_info "启用命令: ./start.sh plugin enable api"
                    exit 1
                fi
                ensure_deps_and_run "API test failed" run_api_test "${@:2}" || exit 1
                ;;
            test:all)
                ensure_deps_and_run "Test failed" run_all_tests || exit 1
                ;;
            report)
                generate_report || exit 1
                ;;
            clean)
                clean_environment || exit 1
                ;;
            plugin)
                case "$2" in
                    list)    list_plugins ;;
                    enable)  enable_plugin "$3" ;;
                    disable) disable_plugin "$3" ;;
                    *)
                        print_error "用法: ./start.sh plugin [list|enable|disable] <name>"
                        print_info "可用插件: detox, appium, playwright, api"
                        ;;
                esac
                ;;
            *)
                print_error "未知命令: $1"
                echo "可用命令: install, appium:start, appium:stop, test:ios, test:ios:appium, test:android, test:android:detox, test:web, test:api, test:all, report, clean, plugin"
                exit 1
                ;;
        esac
    fi
}

# ========== 全局参数解析 / Global Flag Parsing ==========
# 在所有命令之前解析，提取并导出环境变量
SCREENSHOT_ON_FAILURE=true
VIDEO_RECORDING=false
LOG_LEVEL=info
DETOX_LOGLEVEL=""
DEBUG_PLAYWRIGHT=""
# CI 动态配置参数（默认空，由 CLI 或环境变量覆盖）
APPIUM_HOST="${APPIUM_HOST:-}"
APPIUM_PORT="${APPIUM_PORT:-}"
ANDROID_DEVICE_NAME="${ANDROID_DEVICE_NAME:-}"
ANDROID_PLATFORM_VERSION="${ANDROID_PLATFORM_VERSION:-}"
IOS_DEVICE_NAME="${IOS_DEVICE_NAME:-}"
IOS_PLATFORM_VERSION="${IOS_PLATFORM_VERSION:-}"
APP_PATH="${APP_PATH:-}"
APP_PACKAGE="${APP_PACKAGE:-}"
APP_ACTIVITY="${APP_ACTIVITY:-}"
BUNDLE_ID="${BUNDLE_ID:-}"
APPIUM_SYSTEM_PORT="${APPIUM_SYSTEM_PORT:-}"
APPIUM_NO_RESET="${APPIUM_NO_RESET:-}"
APPIUM_FULL_RESET="${APPIUM_FULL_RESET:-}"
APPIUM_LANGUAGE="${APPIUM_LANGUAGE:-}"
APPIUM_LOCALE="${APPIUM_LOCALE:-}"
REMAINING_ARGS=()

i=0
args_count=$#
args_array=("$@")
while [ $i -lt $args_count ]; do
    arg="${args_array[$i]}"
    case "$arg" in
        --screenshot|--ss)
            SCREENSHOT_ON_FAILURE=true
            ;;
        --no-screenshot|--no-ss)
            SCREENSHOT_ON_FAILURE=false
            ;;
        --recording|--rec)
            VIDEO_RECORDING=true
            ;;
        --no-recording|--no-rec)
            VIDEO_RECORDING=false
            ;;
        --log-level)
            i=$((i + 1))
            if [ $i -lt $args_count ]; then
                LOG_LEVEL="${args_array[$i]}"
                case "$LOG_LEVEL" in
                    info|debug|trace) ;;
                    *)
                        print_error "无效的日志级别: $LOG_LEVEL"
                        print_info "可用级别: info, debug, trace"
                        exit 1
                        ;;
                esac
            else
                print_error "--log-level 需要参数: info, debug, trace"
                exit 1
            fi
            ;;
        # ---- CI 动态配置参数 ----
        --appium-host)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--appium-host 需要一个值"
                exit 1
            fi
            APPIUM_HOST="${args_array[$i]}"
            ;;
        --appium-port)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--appium-port 需要一个值"
                exit 1
            fi
            APPIUM_PORT="${args_array[$i]}"
            ;;
        --android-device)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--android-device 需要一个值"
                exit 1
            fi
            ANDROID_DEVICE_NAME="${args_array[$i]}"
            ;;
        --android-version)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--android-version 需要一个值"
                exit 1
            fi
            ANDROID_PLATFORM_VERSION="${args_array[$i]}"
            ;;
        --ios-device)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--ios-device 需要一个值"
                exit 1
            fi
            IOS_DEVICE_NAME="${args_array[$i]}"
            ;;
        --ios-version)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--ios-version 需要一个值"
                exit 1
            fi
            IOS_PLATFORM_VERSION="${args_array[$i]}"
            ;;
        --mobile-app)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--mobile-app 需要一个值"
                exit 1
            fi
            APP_PATH="${args_array[$i]}"
            ;;
        --app-package)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--app-package 需要一个值"
                exit 1
            fi
            APP_PACKAGE="${args_array[$i]}"
            ;;
        --app-activity)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--app-activity 需要一个值"
                exit 1
            fi
            APP_ACTIVITY="${args_array[$i]}"
            ;;
        --bundle-id)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--bundle-id 需要一个值"
                exit 1
            fi
            BUNDLE_ID="${args_array[$i]}"
            ;;
        --system-port)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--system-port 需要一个值"
                exit 1
            fi
            APPIUM_SYSTEM_PORT="${args_array[$i]}"
            ;;
        --no-reset)
            APPIUM_NO_RESET=true
            ;;
        --full-reset)
            APPIUM_FULL_RESET=true
            ;;
        --language)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--language 需要一个值"
                exit 1
            fi
            APPIUM_LANGUAGE="${args_array[$i]}"
            ;;
        --locale)
            i=$((i + 1))
            if [ $i -ge $args_count ] || [ -z "${args_array[$i]}" ]; then
                print_error "--locale 需要一个值"
                exit 1
            fi
            APPIUM_LOCALE="${args_array[$i]}"
            ;;
        *)
            REMAINING_ARGS+=("$arg")
            ;;
    esac
    i=$((i + 1))
done

# 根据 LOG_LEVEL 计算 Detox --loglevel 参数
case "$LOG_LEVEL" in
    debug|trace)
        DETOX_LOGLEVEL="$LOG_LEVEL"
        ;;
esac

# 根据 LOG_LEVEL 设置 Playwright DEBUG 环境变量
if [ "$LOG_LEVEL" = "trace" ]; then
    DEBUG_PLAYWRIGHT="pw:api"
fi

export SCREENSHOT_ON_FAILURE VIDEO_RECORDING LOG_LEVEL DEBUG_PLAYWRIGHT DETOX_LOGLEVEL \
    APPIUM_HOST APPIUM_PORT ANDROID_DEVICE_NAME ANDROID_PLATFORM_VERSION \
    IOS_DEVICE_NAME IOS_PLATFORM_VERSION APP_PATH APP_PACKAGE APP_ACTIVITY BUNDLE_ID \
    APPIUM_SYSTEM_PORT APPIUM_NO_RESET APPIUM_FULL_RESET APPIUM_LANGUAGE APPIUM_LOCALE

# 打印非默认配置
_has_custom_config=false
[ "$SCREENSHOT_ON_FAILURE" != true ] && _has_custom_config=true
[ "$VIDEO_RECORDING" = true ] && _has_custom_config=true
[ "$LOG_LEVEL" != info ] && _has_custom_config=true
{ [ -n "$APPIUM_HOST" ] || [ -n "$APPIUM_PORT" ] || [ -n "$ANDROID_DEVICE_NAME" ] || [ -n "$IOS_DEVICE_NAME" ]; } && _has_custom_config=true
{ [ -n "$APP_PATH" ] || [ -n "$APP_PACKAGE" ] || [ -n "$BUNDLE_ID" ]; } && _has_custom_config=true

if [ "$_has_custom_config" = true ]; then
    print_info "截图 / Screenshot: $([ "$SCREENSHOT_ON_FAILURE" = true ] && echo '开启(ON)' || echo '关闭(OFF)')"
    print_info "录屏 / Recording: $([ "$VIDEO_RECORDING" = true ] && echo '开启(ON)' || echo '关闭(OFF)')"
    print_info "日志级别 / Log Level: $LOG_LEVEL"
    [ -n "$APPIUM_HOST" ] && print_info "Appium Host: $APPIUM_HOST"
    [ -n "$APPIUM_PORT" ] && print_info "Appium Port: $APPIUM_PORT"
    [ -n "$ANDROID_DEVICE_NAME" ] && print_info "Android Device: $ANDROID_DEVICE_NAME"
    [ -n "$ANDROID_PLATFORM_VERSION" ] && print_info "Android Version: $ANDROID_PLATFORM_VERSION"
    [ -n "$IOS_DEVICE_NAME" ] && print_info "iOS Device: $IOS_DEVICE_NAME"
    [ -n "$IOS_PLATFORM_VERSION" ] && print_info "iOS Version: $IOS_PLATFORM_VERSION"
    [ -n "$APP_PATH" ] && print_info "App Path: $APP_PATH"
    [ -n "$APP_PACKAGE" ] && print_info "App Package: $APP_PACKAGE"
    [ -n "$APP_ACTIVITY" ] && print_info "App Activity: $APP_ACTIVITY"
    [ -n "$BUNDLE_ID" ] && print_info "Bundle ID: $BUNDLE_ID"
    [ -n "$APPIUM_SYSTEM_PORT" ] && print_info "System Port: $APPIUM_SYSTEM_PORT"
    [ -n "$APPIUM_NO_RESET" ] && print_info "No Reset: $APPIUM_NO_RESET"
    [ -n "$APPIUM_FULL_RESET" ] && print_info "Full Reset: $APPIUM_FULL_RESET"
    [ -n "$APPIUM_LANGUAGE" ] && print_info "Language: $APPIUM_LANGUAGE"
    [ -n "$APPIUM_LOCALE" ] && print_info "Locale: $APPIUM_LOCALE"
fi

# 执行主函数（传入过滤后的参数）
main "${REMAINING_ARGS[@]}"
