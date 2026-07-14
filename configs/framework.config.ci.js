/**
 * 框架行为配置 — CI 版本（Git 跟踪）
 *
 * 控制截图、录制、无头模式、Allure 报告等全局行为开关。
 * 优先级链：环境变量 > 本配置文件 > 默认值
 * 被 framework/utils/unifiedConfig.ts 类型化访问，ConfigManager.getFrameworkConfig() 也读取此处作为兜底。
 *
 * 注意：此文件为 CI 基线配置，本地调试请编辑 configs/framework.config.js。
 */
module.exports = {
  // 测试失败时自动截图
  screenshotOnFailure: true,

  // 测试视频录制
  videoRecording: false,

  // 无头模式（主要影响 Web Playwright）
  headless: false,

  // Allure 报告启用
  allureEnabled: true,
};
