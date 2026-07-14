/**
 * Detox CLI 配置入口
 *
 * 此文件从 configs/mobile.config*.js 统一配置中提取 detox 配置段，
 * 保持 Detox CLI 所需的完整结构（apps / devices / configurations / behavior / cli）。
 *
 * CI/本地分离：
 *   CI 环境（process.env.CI=true）→ 优先加载 mobile.config.ci.js
 *   本地环境                     → 优先加载 mobile.config.js（Git 忽略，可自由修改）
 *
 * 修改 Detox 配置请编辑 configs/mobile.config.ci.js（CI 基线）或 mobile.config.js（本地），
 * 不要直接修改此文件。
 */

const isCI = !!process.env.CI;
let mobileConfig;

if (isCI) {
  try {
    mobileConfig = require("./configs/mobile.config.ci.js");
  } catch (_e) {
    mobileConfig = require("./configs/mobile.config.js");
  }
} else {
  try {
    mobileConfig = require("./configs/mobile.config.js");
  } catch (_e) {
    mobileConfig = require("./configs/mobile.config.ci.js");
  }
}

module.exports = mobileConfig.detox;
