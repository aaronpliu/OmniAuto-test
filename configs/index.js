/**
 * 统一配置聚合入口
 *
 * 汇总所有模式的配置文件，提供单一 require 入口。
 * 环境配置（environments/*.json）由 ConfigManager 按需加载，不在此聚合。
 *
 * CI/本地分离逻辑：
 *   CI 环境（process.env.CI=true）→ 优先加载 *.config.ci.js
 *   本地环境                     → 优先加载 *.config.local.js（Git 忽略，可自由修改）
 *   加载失败时自动回退到另一版本。
 *
 * 用法：
 *   const { mobile, web, api, framework } = require('./configs');
 */
const isCI = !!process.env.CI;

function loadConfig(name) {
  if (isCI) {
    // CI: 优先 .ci.js，不存在时回退 .local.js
    try {
      return require(`./${name}.config.ci.js`);
    } catch (_e) {
      // fallback to local config
    }
  }
  // 本地: 优先 .local.js，不存在时回退 .ci.js
  try {
    return require(`./${name}.config.local.js`);
  } catch (_e) {
    return require(`./${name}.config.ci.js`);
  }
}

module.exports = {
  mobile: loadConfig("mobile"),
  web: loadConfig("web"),
  api: loadConfig("api"),
  framework: loadConfig("framework"),
};
