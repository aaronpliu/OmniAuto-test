#!/usr/bin/env node
/**
 * OmniAutoTest Interactive Menu
 * 使用 @inquirer/prompts 提供方向键选择，输出选中项的索引
 *
 * 用法: node cli/menu.js
 * 输出: 选中项的索引号（0-based）到 stdout
 */
const { select } = require('@inquirer/prompts');

const items = [
  '安装依赖 / Install dependencies',
  '启动本地 Appium Server / Start local Appium Server',
  '停止本地 Appium Server / Stop local Appium Server',
  '运行 iOS 测试 (Detox) / Run iOS tests (Detox)',
  '运行 iOS 测试 (Appium) / Run iOS tests (Appium)',
  '运行 Android 测试 (Appium) / Run Android tests (Appium)',
  '运行 Android 测试 (Detox) / Run Android tests (Detox)',
  '运行 Web 测试 / Run Web tests',
  '运行 API 测试 / Run API tests',
  '运行所有测试 / Run all tests',
  '生成测试报告 / Generate test report',
  '清理环境 / Clean environment',
  '退出 / Exit',
];

(async () => {
  try {
    const index = await select({
      message: 'OmniAutoTest 自动化测试平台',
      choices: items.map((name, i) => ({
        name,
        value: i,
        description: i === items.length - 1 ? '退出程序' : `选项 ${i + 1}`,
      })),
      pageSize: 12,
    });
    // 输出选中的索引，start.sh 捕获
    console.log(index);
  } catch {
    // 用户按 Ctrl+C 退出
    console.log(String(items.length - 1)); // 默认输出 "退出" 的索引
  }
})();
