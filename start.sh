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
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${CYAN}   OmniAutoTest - 自动化测试平台启动脚本 / Automated Testing Platform Start Script${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo ""
    echo -e "${GREEN}用法 / Usage:${NC}"
    echo "  ./start.sh [选项 / option]"
    echo ""
    echo -e "${GREEN}选项 / Options:${NC}"
    echo ""
    echo -e "  ${YELLOW}install${NC}           安装项目依赖 / Install project dependencies"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh install"
    echo ""
    echo -e "  ${YELLOW}appium:start${NC}      启动本地 Appium Server（用于调试）/ Start local Appium Server (for debugging)"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh appium:start"
    echo ""
    echo -e "  ${YELLOW}appium:stop${NC}       停止本地 Appium Server / Stop local Appium Server"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh appium:stop"
    echo ""
    echo -e "  ${YELLOW}test:ios${NC}          运行 iOS 测试 (使用 Detox) / Run iOS tests (using Detox)"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh test:ios"
    echo ""
    echo -e "  ${YELLOW}test:ios:appium${NC}    运行 iOS 测试 (使用 Appium) / Run iOS tests (using Appium)"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh test:ios:appium"
    echo ""
    echo -e "  ${YELLOW}test:android${NC}      运行 Android 测试 (使用 Appium) / Run Android tests (using Appium)"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh test:android"
    echo ""
    echo -e "  ${YELLOW}test:android:detox${NC} 运行 Android 测试 (使用 Detox) / Run Android tests (using Detox)"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh test:android:detox"
    echo ""
    echo -e "  ${YELLOW}test:web${NC}          运行 Web 测试 (使用 Playwright) / Run Web tests (using Playwright)"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh test:web"
    echo ""
    echo -e "  ${YELLOW}test:api${NC}          运行 API 测试 / Run API tests"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh test:api"
    echo ""
    echo -e "  ${YELLOW}test:all${NC}          运行所有测试 / Run all tests"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh test:all"
    echo ""
    echo -e "  ${YELLOW}report${NC}            生成并打开测试报告 / Generate and open test report"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh report"
    echo ""
    echo -e "  ${YELLOW}clean${NC}             清理环境和缓存 / Clean environment and cache"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh clean"
    echo ""
    echo -e "  ${YELLOW}-h, --help${NC}        显示此帮助信息 / Show this help message"
    echo ""
    echo -e "${GREEN}不传参运行 / Run without arguments:${NC}"
    echo "  ./start.sh"
    echo "  将显示交互式菜单 / Will show interactive menu"
    echo ""
    echo -e "${GREEN}全局参数（适用于所有移动端测试）/ Global flags (for all mobile tests):${NC}"
    echo "  --screenshot, --ss         启用失败截图（默认）"
    echo "                              Enable screenshot on failure (default: on)"
    echo "  --no-screenshot, --no-ss   禁用失败截图"
    echo "                              Disable screenshot on failure"
    echo "  --recording, --rec         启用测试录屏（默认关闭）"
    echo "                              Enable test recording (default: off)"
    echo "  --no-recording, --no-rec   禁用测试录屏"
    echo "                              Disable test recording"
    echo ""
    echo -e "${BLUE}示例/Examples:${NC}"
    echo "  ./start.sh test:android --recording"
    echo "  ./start.sh test:ios:appium --no-screenshot --recording"
    echo "  ./start.sh test:ios --recording --no-screenshot"
    echo ""
    echo -e "${GREEN}Appium 配置 / Appium Configuration:${NC}"
    echo "  本项目仅支持连接远程 Appium Server"
    echo "  This project only supports connecting to remote Appium Servers"
    echo "  请在配置文件中设置 Appium Server 地址"
    echo "  Please set Appium Server address in configuration file"
    echo "  配置文件位置 / Configuration file location: configs/development.json"
    echo ""
    echo -e "${GREEN}本地调试 / Local Debugging:${NC}"
    echo "  可以使用以下命令启动本地 Appium Server:"
    echo "  You can use the following commands to start a local Appium Server:"
    echo "  ./start.sh appium:start"
    echo ""
    echo -e "${GREEN}快速开始 / Quick Start:${NC}"
    echo "  1. 安装依赖:     ./start.sh install"
    echo "     Install deps: ./start.sh install"
    echo "  2. 运行 iOS 测试:   ./start.sh test:ios"
    echo "     Run iOS tests:   ./start.sh test:ios"
    echo "  3. 生成报告:        ./start.sh report"
    echo "     Generate report: ./start.sh report"
    echo ""
    echo -e "${GREEN}前置要求 / Prerequisites:${NC}"
    echo "  - Appium (可选，用于本地调试) / Appium (optional, for local debugging):"
    echo "                    npm install appium (项目中安装 / install in project)"
    echo "                    npm install -g appium (全局安装 / install globally)"
    echo "  - Appium 驱动 / Appium drivers:"
    echo "                    Android: appium driver install uiautomator2"
    echo "                    iOS:     appium driver install xcuitest"
    echo "  - iOS 测试 (Appium): 需要 Xcode + iOS 模拟器或真机"
    echo "    iOS (Appium): Requires Xcode + iOS simulator or real device"
    echo "  - Node.js >= 22.22.0"
    echo ""
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${CYAN}  文档 / Documentation:${NC}"
    echo -e "${CYAN}  - README.md: 项目概述 / Project overview${NC}"
    echo -e "${CYAN}  - README_zh.md: 中文文档 / Chinese documentation${NC}"
    echo -e "${CYAN}  - examples/docs/: 详细指南 / Detailed guides${NC}"
    echo -e "${CYAN}================================================================${NC}"
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
    if pgrep -f "appium" > /dev/null; then
        print_warning "Appium 服务器已经在运行"
        print_warning "Appium server is already running"
        return 0
    fi
    
    # 创建日志目录
    mkdir -p logs
    
    # 启动 Appium 服务器（后台运行）
    print_info "启动 Appium 服务器（端口/Port: 4723）..."
    nohup $APPIUM_CMD --allow-cors --relaxed-security > logs/appium.log 2>&1 &
    APPIUM_PID=$!
    echo $APPIUM_PID > /tmp/appium.pid
    
    # 等待 Appium 启动
    sleep 3
    
    # 检查是否启动成功
    if pgrep -f "appium" > /dev/null; then
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
        if pgrep -f "appium" > /dev/null; then
            pkill -f "appium"
            print_success "Appium 服务器已停止"
            print_success "Appium server stopped"
        else
            print_warning "未找到运行中的 Appium 服务器"
            print_warning "No running Appium server found"
        fi
    fi
}

# 安装依赖
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
    return 0
}

# 运行 iOS 测试（Detox）
run_ios_test() {
    print_info "运行 iOS 测试（Detox）..."
    npm run test:mobile:ios
    return $?
}

# 运行 iOS 测试（Appium）
run_ios_appium_test() {
    print_info "运行 iOS 测试（Appium）..."
    print_info "请确保 Appium Server 已启动并可访问"
    print_info "Please ensure Appium Server is running and accessible"
    npm run test:mobile:ios:appium
    return $?
}

# 运行 Android 测试（Detox）
run_android_detox_test() {
    print_info "运行 Android 测试（Detox）..."
    npm run test:mobile:android:detox
    return $?
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
    npm run test:mobile:android
    return $?
}

# 运行 Web 测试
run_web_test() {
    print_info "运行 Web 测试..."
    npm run test:web
    return $?
}

# 运行 API 测试
run_api_test() {
    print_info "运行 API 测试..."
    npm run test:api
    return $?
}

# 运行所有测试
run_all_tests() {
    print_info "运行所有测试..."
    npm run test:all
    return $?
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
    fi
    print_success "环境清理完成"
    return 0
}

# 菜单项定义
MENU_ITEMS=(
    "安装依赖 / Install dependencies"
    "启动本地 Appium Server / Start local Appium Server"
    "停止本地 Appium Server / Stop local Appium Server"
    "运行 iOS 测试 (Detox) / Run iOS tests (Detox)"
    "运行 iOS 测试 (Appium) / Run iOS tests (Appium)"
    "运行 Android 测试 (Appium) / Run Android tests (Appium)"
    "运行 Android 测试 (Detox) / Run Android tests (Detox)"
    "运行 Web 测试 / Run Web tests"
    "运行 API 测试 / Run API tests"
    "运行所有测试 / Run all tests"
    "生成测试报告 / Generate test report"
    "清理环境 / Clean environment"
    "退出 / Exit"
)

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

# 执行菜单对应的操作
execute_menu_action() {
    local choice=$1

    case $choice in
        0)
            install_dependencies
            ;;
        1)
            check_appium
            if ! start_appium_local; then
                print_warning "启动 Appium 失败，返回菜单"
                print_warning "Failed to start Appium, returning to menu"
                return 1
            fi
            ;;
        2)
            if ! stop_appium_local; then
                print_warning "停止 Appium 失败，返回菜单"
                print_warning "Failed to stop Appium, returning to menu"
                return 1
            fi
            ;;
        3)
            install_dependencies
            if ! run_ios_test; then
                print_warning "iOS 测试运行失败，返回菜单"
                print_warning "iOS test failed, returning to menu"
                return 1
            fi
            ;;
        4)
            install_dependencies
            if ! run_ios_appium_test; then
                print_warning "iOS (Appium) 测试运行失败，返回菜单"
                print_warning "iOS (Appium) test failed, returning to menu"
                return 1
            fi
            ;;
        5)
            install_dependencies
            if ! run_android_test; then
                print_warning "Android (Appium) 测试运行失败，返回菜单"
                print_warning "Android (Appium) test failed, returning to menu"
                return 1
            fi
            ;;
        6)
            install_dependencies
            if ! run_android_detox_test; then
                print_warning "Android (Detox) 测试运行失败，返回菜单"
                print_warning "Android (Detox) test failed, returning to menu"
                return 1
            fi
            ;;
        7)
            install_dependencies
            if ! run_web_test; then
                print_warning "Web 测试运行失败，返回菜单"
                print_warning "Web test failed, returning to menu"
                return 1
            fi
            ;;
        8)
            install_dependencies
            if ! run_api_test; then
                print_warning "API 测试运行失败，返回菜单"
                print_warning "API test failed, returning to menu"
                return 1
            fi
            ;;
        9)
            install_dependencies
            if ! run_all_tests; then
                print_warning "测试运行失败，返回菜单"
                print_warning "Test failed, returning to menu"
                return 1
            fi
            ;;
        10)
            if ! generate_report; then
                print_warning "生成报告失败，返回菜单"
                print_warning "Failed to generate report, returning to menu"
                return 1
            fi
            ;;
        11)
            if ! clean_environment; then
                print_warning "清理环境失败，返回菜单"
                print_warning "Failed to clean environment, returning to menu"
                return 1
            fi
            ;;
        12)
            print_info "退出程序 / Exiting program"
            exit 0
            ;;
    esac
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
        done
    else
        # 根据参数执行对应操作
        case $1 in
            install)
                if ! install_dependencies; then
                    print_error "安装依赖失败"
                    print_error "Failed to install dependencies"
                    exit 1
                fi
                ;;
            appium:start)
                check_appium
                if ! start_appium_local; then
                    print_error "启动 Appium 失败"
                    print_error "Failed to start Appium"
                    exit 1
                fi
                ;;
            appium:stop)
                if ! stop_appium_local; then
                    print_error "停止 Appium 失败"
                    print_error "Failed to stop Appium"
                    exit 1
                fi
                ;;
            test:ios)
                if ! install_dependencies; then
                    print_error "安装依赖失败"
                    print_error "Failed to install dependencies"
                    exit 1
                fi
                if ! run_ios_test; then
                    print_error "iOS 测试运行失败"
                    print_error "iOS test failed"
                    exit 1
                fi
                ;;
            test:ios:appium)
                if ! install_dependencies; then
                    print_error "安装依赖失败"
                    print_error "Failed to install dependencies"
                    exit 1
                fi
                if ! run_ios_appium_test; then
                    print_error "iOS (Appium) 测试运行失败"
                    print_error "iOS (Appium) test failed"
                    exit 1
                fi
                ;;
            test:android)
                if ! install_dependencies; then
                    print_error "安装依赖失败"
                    print_error "Failed to install dependencies"
                    exit 1
                fi
                if ! run_android_test; then
                    print_error "Android 测试运行失败"
                    print_error "Android test failed"
                    exit 1
                fi
                ;;
            test:android:detox)
                if ! install_dependencies; then
                    print_error "安装依赖失败"
                    print_error "Failed to install dependencies"
                    exit 1
                fi
                if ! run_android_detox_test; then
                    print_error "Android (Detox) 测试运行失败"
                    print_error "Android (Detox) test failed"
                    exit 1
                fi
                ;;
            test:web)
                if ! install_dependencies; then
                    print_error "安装依赖失败"
                    print_error "Failed to install dependencies"
                    exit 1
                fi
                if ! run_web_test; then
                    print_error "Web 测试运行失败"
                    print_error "Web test failed"
                    exit 1
                fi
                ;;
            test:api)
                if ! install_dependencies; then
                    print_error "安装依赖失败"
                    print_error "Failed to install dependencies"
                    exit 1
                fi
                if ! run_api_test; then
                    print_error "API 测试运行失败"
                    print_error "API test failed"
                    exit 1
                fi
                ;;
            test:all)
                if ! install_dependencies; then
                    print_error "安装依赖失败"
                    print_error "Failed to install dependencies"
                    exit 1
                fi
                if ! run_all_tests; then
                    print_error "测试运行失败"
                    print_error "Test failed"
                    exit 1
                fi
                ;;
            report)
                if ! generate_report; then
                    print_error "生成报告失败"
                    print_error "Failed to generate report"
                    exit 1
                fi
                ;;
            clean)
                if ! clean_environment; then
                    print_error "清理环境失败"
                    print_error "Failed to clean environment"
                    exit 1
                fi
                ;;
            *)
                print_error "未知命令: $1"
                echo "可用命令: install, appium:start, appium:stop, test:ios, test:ios:appium, test:android, test:android:detox, test:web, test:api, test:all, report, clean"
                exit 1
                ;;
        esac
    fi
}

# ========== 全局参数解析 / Global Flag Parsing ==========
# 在所有命令之前解析，提取并导出环境变量
SCREENSHOT_ON_FAILURE=true
VIDEO_RECORDING=false
REMAINING_ARGS=()

for arg in "$@"; do
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
        *)
            REMAINING_ARGS+=("$arg")
            ;;
    esac
done

export SCREENSHOT_ON_FAILURE
export VIDEO_RECORDING

# 如果传入了开关参数，打印当前配置
if [ "$SCREENSHOT_ON_FAILURE" != true ] || [ "$VIDEO_RECORDING" = true ]; then
    print_info "截图 / Screenshot: $([ "$SCREENSHOT_ON_FAILURE" = true ] && echo '开启(ON)' || echo '关闭(OFF)')"
    print_info "录屏 / Recording: $([ "$VIDEO_RECORDING" = true ] && echo '开启(ON)' || echo '关闭(OFF)')"
fi

# 执行主函数（传入过滤后的参数）
main "${REMAINING_ARGS[@]}"
