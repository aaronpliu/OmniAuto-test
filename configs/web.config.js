/**
 * Web 模式配置（Playwright）
 *
 * 优先级链：环境变量 > 本配置文件 > Playwright 默认值
 * 被 playwright.config.ts 引用，由 framework/utils/unifiedConfig.ts 类型化访问
 */
const path = require('path');

module.exports = {
  // 基础 URL（环境变量 BASE_URL 优先覆盖）
  baseURL: 'http://localhost:3000',

  // 全局超时（毫秒）
  timeout: 60000,
  // 断言超时（毫秒）
  expectTimeout: 10000,

  // 重试次数（CI 环境默认重试 2 次）
  retries: process.env.CI ? 2 : 0,
  // 并发 worker 数（CI 默认 1，本地默认不限制）
  workers: process.env.CI ? 1 : undefined,

  // 追踪 / 截图 / 视频策略
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',

  // 测试产物输出目录
  outputDir: path.resolve(__dirname, '../artifacts/test-results/'),

  // 报告器
  reporter: [
    ['html'],
    ['allure-playwright']
  ],

  // 浏览器项目配置
  // - browser: chromium | firefox | webkit
  // - device: 对应 Playwright 内置 devices 的 key（playwright.config.ts 会展开）
  // - viewport: 可选，覆盖设备的视口尺寸
  projects: [
    {
      name: 'chromium',
      browser: 'chromium',
      device: 'Desktop Chrome',
      viewport: { width: 1920, height: 1080 }
    },
    {
      name: 'firefox',
      browser: 'firefox',
      device: 'Desktop Firefox'
    },
    {
      name: 'webkit',
      browser: 'webkit',
      device: 'Desktop Safari'
    },
    {
      name: 'Mobile Chrome',
      browser: 'chromium',
      device: 'Pixel 5'
    },
    {
      name: 'Mobile Safari',
      browser: 'webkit',
      device: 'iPhone 12'
    }
  ]
};
