#!/bin/bash

# OmniAutoTest 自动化启动脚本
# 使用 Podman 替代 Docker

# 不设置 set -e，以便我们可以自定义错误处理

# Appium 启动模式
# - container: 容器模式（使用 Podman/Docker 启动 Appium 容器）
# - local: 本地模式（在宿主机直接启动 Appium Server）
APPIUM_MODE="${APPIUM_MODE:-local}"

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
    echo -e "  ${YELLOW}start${NC}             启动 Appium 服务器 / Start Appium servers"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh start"
    echo ""
    echo -e "  ${YELLOW}stop${NC}              停止 Appium 服务器 / Stop Appium servers"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh stop"
    echo ""
    echo -e "  ${YELLOW}status${NC}            检查 Appium 服务器状态 / Check Appium servers status"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh status"
    echo ""
    echo -e "  ${YELLOW}install${NC}           安装项目依赖 / Install project dependencies"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh install"
    echo ""
    echo -e "  ${YELLOW}test:ios${NC}          运行 iOS 测试 (使用 Detox) / Run iOS tests (using Detox)"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh test:ios"
    echo ""
    echo -e "  ${YELLOW}test:android${NC}      运行 Android 测试 (使用 Appium) / Run Android tests (using Appium)"
    echo -e "                    ${BLUE}示例/Example:${NC} ./start.sh test:android"
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
    echo -e "${GREEN}不带参数运行 / Run without arguments:${NC}"
    echo "  ./start.sh"
    echo "  将显示交互式菜单 / Will show interactive menu"
    echo ""
    echo -e "${GREEN}Appium 启动模式 / Appium Start Modes:${NC}"
    echo "  - 容器模式 (container): 使用 Podman/Docker 启动 Appium 容器"
    echo "                          Container Mode: Start Appium containers using Podman/Docker"
    echo "  - 本地模式 (local): 在宿主机直接启动 Appium Server"
    echo "                      Local Mode: Start Appium Server directly on host"
    echo "  切换模式 / Switch mode: 在交互式菜单中选择选项 4 / Select option 4 in interactive menu"
    echo "  或设置环境变量 / Or set environment variable: export APPIUM_MODE=local"
    echo ""
    echo -e "${GREEN}快速开始 / Quick Start:${NC}"
    echo "  1. 启动 Appium:     ./start.sh start"
    echo "     Start Appium:    ./start.sh start"
    echo "  2. 运行 iOS 测试:   ./start.sh test:ios"
    echo "     Run iOS tests:   ./start.sh test:ios"
    echo "  3. 生成报告:        ./start.sh report"
    echo "     Generate report: ./start.sh report"
    echo ""
    echo -e "${GREEN}前置要求 / Prerequisites:${NC}"
    echo "  - Podman (容器模式) / Podman (container):     brew install podman"
    echo "  - Podman Compose:                            pip3 install podman-compose"
    echo "  - Appium (本地模式) / Appium (local):         npm install -g appium"
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

# 检查 Podman 是否安装
check_podman() {
    print_info "检查 Podman 安装状态..."
    if ! command -v podman &> /dev/null; then
        print_error "Podman 未安装，请先安装 Podman"
        print_info "安装命令: brew install podman"
        return 1
    fi
    print_success "Podman 已安装: $(podman --version)"
    return 0
}

# 检查 Podman Compose 是否安装
check_podman_compose() {
    print_info "检查 Podman Compose 安装状态..."
    if ! command -v podman-compose &> /dev/null; then
        print_warning "Podman Compose 未安装，正在安装..."
        pip3 install podman-compose
        if [ $? -ne 0 ]; then
            print_error "Podman Compose 安装失败"
            print_error "Failed to install Podman Compose"
            return 1
        fi
    fi
    print_success "Podman Compose 已安装"
    return 0
}

# 启动 Appium 服务器（容器模式）
start_appium_container() {
    print_info "启动 Appium 服务器（容器模式）..."
    print_info "Starting Appium servers (container mode)..."
    
    # 检查 Podman
    check_podman
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    check_podman_compose
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    if podman-compose ps | grep -q "appium"; then
        print_warning "Appium 服务器已经在运行"
        print_warning "Appium servers are already running"
        return 0
    else
        podman-compose up -d
        if [ $? -ne 0 ]; then
            print_error "Appium 容器启动失败"
            print_error "Failed to start Appium containers"
            return 1
        fi
        print_success "Appium 服务器已启动"
        print_success "Appium servers started"
        print_info "Appium 1 端口/Port: 4723"
        print_info "Appium 2 端口/Port: 4724"
        return 0
    fi
}

# 停止 Appium 服务器（容器模式）
stop_appium_container() {
    print_info "停止 Appium 服务器（容器模式）..."
    print_info "Stopping Appium servers (container mode)..."
    
    # 检查 Podman
    if ! command -v podman &> /dev/null; then
        print_error "Podman 未安装，无法停止容器"
        print_error "Podman not installed, cannot stop containers"
        return 1
    fi
    
    podman-compose down
    if [ $? -ne 0 ]; then
        print_error "停止 Appium 容器失败"
        print_error "Failed to stop Appium containers"
        return 1
    fi
    print_success "Appium 服务器已停止"
    print_success "Appium servers stopped"
    return 0
}

# 检查 Appium 服务器状态（容器模式）
check_appium_status_container() {
    print_info "检查 Appium 服务器状态（容器模式）..."
    print_info "Checking Appium servers status (container mode)..."
    
    # 检查 Podman
    if ! command -v podman &> /dev/null; then
        print_error "Podman 未安装，无法检查容器状态"
        print_error "Podman not installed, cannot check container status"
        return 1
    fi
    
    podman-compose ps
    return $?
}

# 启动 Appium 服务器（本地模式）
start_appium_local() {
    print_info "启动 Appium 服务器（本地模式）..."
    print_info "Starting Appium server (local mode)..."
    
    # 检查 Appium 是否安装
    if ! command -v appium &> /dev/null; then
        print_error "未找到 Appium 命令，请先安装 Appium"
        print_error "Appium command not found, please install Appium first"
        print_info "安装命令 / Installation command: npm install -g appium"
        return 1
    fi
    
    # 检查 Appium 是否已经在运行
    if pgrep -x "appium" > /dev/null; then
        print_warning "Appium 服务器已经在运行"
        print_warning "Appium server is already running"
        return 0
    fi
    
    # 创建日志目录
    mkdir -p logs
    
    # 启动 Appium 服务器（后台运行）
    print_info "启动 Appium 服务器（端口/Port: 4723）..."
    nohup appium --allow-cors --relaxed-security > logs/appium.log 2>&1 &
    APPIUM_PID=$!
    echo $APPIUM_PID > /tmp/appium.pid
    
    # 等待 Appium 启动
    sleep 3
    
    # 检查是否启动成功
    if pgrep -x "appium" > /dev/null; then
        print_success "Appium 服务器已启动（本地模式）"
        print_success "Appium server started (local mode)"
        print_info "进程 ID / Process ID: $APPIUM_PID"
        print_info "日志文件 / Log file: logs/appium.log"
    else
        print_error "Appium 服务器启动失败"
        print_error "Failed to start Appium server"
        print_info "请查看日志文件 / Please check log file: logs/appium.log"
        return 1
    fi
}

# 停止 Appium 服务器（本地模式）
stop_appium_local() {
    print_info "停止 Appium 服务器（本地模式）..."
    print_info "Stopping Appium server (local mode)..."
    
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
        if pgrep -x "appium" > /dev/null; then
            pkill -x appium
            print_success "Appium 服务器已停止"
            print_success "Appium server stopped"
        else
            print_warning "未找到运行中的 Appium 服务器"
            print_warning "No running Appium server found"
        fi
    fi
}

# 检查 Appium 服务器状态（本地模式）
check_appium_status_local() {
    print_info "检查 Appium 服务器状态（本地模式）..."
    print_info "Checking Appium server status (local mode)..."
    
    if pgrep -x "appium" > /dev/null; then
        print_success "Appium 服务器正在运行"
        print_success "Appium server is running"
        print_info "进程信息 / Process info:"
        ps aux | grep "[a]ppium"
    else
        print_warning "Appium 服务器未运行"
        print_warning "Appium server is not running"
    fi
}

# 根据模式启动 Appium 服务器
start_appium() {
    if [ "$APPIUM_MODE" = "local" ]; then
        start_appium_local
        return $?
    else
        start_appium_container
        return $?
    fi
}

# 根据模式停止 Appium 服务器
stop_appium() {
    if [ "$APPIUM_MODE" = "local" ]; then
        stop_appium_local
        return $?
    else
        stop_appium_container
        return $?
    fi
}

# 根据模式检查 Appium 服务器状态
check_appium_status() {
    if [ "$APPIUM_MODE" = "local" ]; then
        check_appium_status_local
        return $?
    else
        check_appium_status_container
        return $?
    fi
}

# 切换 Appium 模式
switch_appium_mode() {
    echo ""
    echo -e "${CYAN}================================================${NC}"
    echo -e "${CYAN}   选择 Appium 启动模式 / Select Appium Start Mode${NC}"
    echo -e "${CYAN}================================================${NC}"
    echo "1. 容器模式（连接远程 Appium 容器）"
    echo "   Container Mode (Connect to remote Appium container)"
    echo "2. 本地模式（在宿主机直接启动 Appium）"
    echo "   Local Mode (Start Appium directly on host)"
    echo -e "${CYAN}================================================${NC}"
    echo ""
    echo -e "当前模式 / Current mode: ${GREEN}$APPIUM_MODE${NC}"
    echo ""
    
    read -p "请选择模式 [1-2] / Please select mode [1-2]: " mode_choice
    
    case $mode_choice in
        1)
            APPIUM_MODE="container"
            print_success "已切换到容器模式 / Switched to container mode"
            ;;
        2)
            APPIUM_MODE="local"
            print_success "已切换到本地模式 / Switched to local mode"
            ;;
        *)
            print_error "无效选择，保持当前模式: $APPIUM_MODE"
            print_error "Invalid choice, keeping current mode: $APPIUM_MODE"
            ;;
    esac
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

# 运行 iOS 测试
run_ios_test() {
    print_info "运行 iOS 测试..."
    npm run test:mobile:ios
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
    
    # 设备检测通过，启动 Appium 服务
    if ! start_appium; then
        print_error "启动 Appium 失败，无法运行测试"
        print_error "Failed to start Appium, cannot run tests"
        return 1
    fi
    
    # 运行测试
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
    podman-compose down -v
    if [ $? -ne 0 ]; then
        print_warning "停止容器失败"
        print_warning "Failed to stop containers"
    fi
    print_success "环境清理完成"
    return 0
}

# 显示菜单
show_menu() {
    echo ""
    echo -e "${CYAN}================================================${NC}"
    echo -e "${CYAN}   OmniAutoTest 自动化测试平台 / Testing Platform${NC}"
    echo -e "${CYAN}   Appium 模式 / Appium Mode: ${GREEN}$APPIUM_MODE${NC}${CYAN}${NC}"
    echo -e "${CYAN}================================================${NC}"
    echo "1.  启动 Appium 服务器 / Start Appium servers"
    echo "2.  停止 Appium 服务器 / Stop Appium servers"
    echo "3.  检查服务器状态 / Check server status"
    echo "4.  切换 Appium 模式 / Switch Appium mode"
    echo "5.  安装依赖 / Install dependencies"
    echo "6.  运行 iOS 测试 / Run iOS tests"
    echo "7.  运行 Android 测试 / Run Android tests"
    echo "8.  运行 Web 测试 / Run Web tests"
    echo "9.  运行 API 测试 / Run API tests"
    echo "10. 运行所有测试 / Run all tests"
    echo "11. 生成测试报告 / Generate test report"
    echo "12. 清理环境 / Clean environment"
    echo "0.  退出 / Exit"
    echo -e "${CYAN}================================================${NC}"
    echo ""
}

# 主函数
main() {
    # 检查帮助参数 / Check for help argument
    if [[ "$1" == "-h" || "$1" == "--help" ]]; then
        show_help
    fi
    
    # 检查 Podman（仅在容器模式下需要）
    # 在交互式模式下，如果检查失败，给出警告但继续显示菜单
    # 在命令行模式下，如果检查失败，直接退出
    if [ "$APPIUM_MODE" = "container" ] || [ $# -eq 0 ]; then
        if ! check_podman; then
            if [ $# -eq 0 ]; then
                # 交互式模式，给出警告但继续
                print_warning "Podman 未安装，容器模式不可用"
                print_warning "Podman not installed, container mode unavailable"
            else
                # 命令行模式，直接退出
                print_error "Podman 检查失败，退出程序"
                print_error "Podman check failed, exiting program"
                exit 1
            fi
        fi
        
        if ! check_podman_compose; then
            if [ $# -eq 0 ]; then
                # 交互式模式，给出警告但继续
                print_warning "Podman Compose 未安装，容器模式可能不可用"
                print_warning "Podman Compose not installed, container mode may be unavailable"
            else
                # 命令行模式，直接退出
                print_error "Podman Compose 检查失败，退出程序"
                print_error "Podman Compose check failed, exiting program"
                exit 1
            fi
        fi
    fi
    
    # 如果没有参数，显示交互式菜单
    if [ $# -eq 0 ]; then
        while true; do
            show_menu
            read -p "请选择操作 [0-11]: " choice
            echo ""
            
            case $choice in
                1)
                    if ! start_appium; then
                        print_warning "启动 Appium 失败，返回菜单"
                        print_warning "Failed to start Appium, returning to menu"
                    fi
                    ;;
                2)
                    if ! stop_appium; then
                        print_warning "停止 Appium 失败，返回菜单"
                        print_warning "Failed to stop Appium, returning to menu"
                    fi
                    ;;
                3)
                    check_appium_status
                    ;;
                4)
                    switch_appium_mode
                    ;;
                5)
                    install_dependencies
                    ;;
                6)
                    install_dependencies
                    if ! run_ios_test; then
                        print_warning "iOS 测试运行失败，返回菜单"
                        print_warning "iOS test failed, returning to menu"
                    fi
                    ;;
                7)
                    install_dependencies
                    if ! run_android_test; then
                        print_warning "Android 测试运行失败，返回菜单"
                        print_warning "Android test failed, returning to menu"
                    fi
                    ;;
                8)
                    install_dependencies
                    if ! run_web_test; then
                        print_warning "Web 测试运行失败，返回菜单"
                        print_warning "Web test failed, returning to menu"
                    fi
                    ;;
                9)
                    install_dependencies
                    if ! run_api_test; then
                        print_warning "API 测试运行失败，返回菜单"
                        print_warning "API test failed, returning to menu"
                    fi
                    ;;
                10)
                    install_dependencies
                    if ! start_appium; then
                        print_warning "启动 Appium 失败，返回菜单"
                        print_warning "Failed to start Appium, returning to menu"
                    else
                        if ! run_all_tests; then
                            print_warning "测试运行失败，返回菜单"
                            print_warning "Test failed, returning to menu"
                        fi
                    fi
                    ;;
                11)
                    if ! generate_report; then
                        print_warning "生成报告失败，返回菜单"
                        print_warning "Failed to generate report, returning to menu"
                    fi
                    ;;
                12)
                    if ! clean_environment; then
                        print_warning "清理环境失败，返回菜单"
                        print_warning "Failed to clean environment, returning to menu"
                    fi
                    ;;
                0)
                    print_info "退出程序 / Exiting program"
                    exit 0
                    ;;
                *)
                    print_error "无效选择，请重新选择"
                    print_error "Invalid choice, please try again"
                    ;;
            esac
            
            echo ""
            read -p "按 Enter 键继续..."
        done
    else
        # 根据参数执行对应操作
        case $1 in
            start)
                if ! start_appium; then
                    print_error "启动 Appium 失败"
                    print_error "Failed to start Appium"
                    exit 1
                fi
                ;;
            stop)
                if ! stop_appium; then
                    print_error "停止 Appium 失败"
                    print_error "Failed to stop Appium"
                    exit 1
                fi
                ;;
            status)
                check_appium_status
                ;;
            install)
                if ! install_dependencies; then
                    print_error "安装依赖失败"
                    print_error "Failed to install dependencies"
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
                if ! start_appium; then
                    print_error "启动 Appium 失败"
                    print_error "Failed to start Appium"
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
                echo "可用命令: start, stop, status, install, test:ios, test:android, test:web, test:api, test:all, report, clean"
                exit 1
                ;;
        esac
    fi
}

# 执行主函数
main "$@"
