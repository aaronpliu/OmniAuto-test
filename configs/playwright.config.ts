import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 配置 —— 参数来源：configs/web.config.local.js
 * 优先级：环境变量 > configs/web.config.local.js > Playwright 默认值
 *
 * 配置文件位于 configs/ 目录，testDir 和 outputDir 通过相对路径指向项目根。
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires -- Playwright config loads JS config at runtime
const webConfig = require("./web.config.local.js");

// 将 web.config.local.js 中的 projects 定义展开为 Playwright 所需格式
const projects = webConfig.projects.map((p: any) => ({
  name: p.name,
  use: {
    ...(p.device ? devices[p.device] : {}),
    ...(p.viewport ? { viewport: p.viewport } : {}),
  },
}));

export default defineConfig({
  testDir: "../tests/web",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: webConfig.retries,
  workers: webConfig.workers,
  reporter: webConfig.reporter,
  use: {
    baseURL: process.env.BASE_URL || webConfig.baseURL,
    trace: webConfig.trace,
    screenshot: webConfig.screenshot,
    video: webConfig.video,
  },
  projects,
  outputDir: webConfig.outputDir,
  timeout: webConfig.timeout,
  expect: {
    timeout: webConfig.expectTimeout,
  },
});
