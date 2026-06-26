#!/usr/bin/env node
/**
 * OmniAutoTest Interactive Menu
 * 使用 @inquirer/prompts 提供方向键选择
 *
 * 用法: node cli/menu.js
 * 结果写入 /tmp/omni-menu-choice（供 start.sh 读取）
 */
const { select } = require('@inquirer/prompts');
const { writeFileSync } = require('fs');
const { join } = require('os');

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

const tmpFile = join(require('os').tmpdir(), 'omni-menu-choice');

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
    writeFileSync(tmpFile, String(index));
  } catch {
    // 用户按 Ctrl+C → 选 "退出"
    writeFileSync(tmpFile, String(items.length - 1));
  }
})();
