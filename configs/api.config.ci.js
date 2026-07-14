/**
 * API 模式配置（Jest + Axios）— CI 版本（Git 跟踪）
 *
 * 优先级链：环境变量 > 环境配置(app.apiBaseUrl) > 本配置文件 > 默认值
 * 被 framework/api/ApiClient.ts 引用，由 framework/utils/unifiedConfig.ts 类型化访问
 *
 * 注意：此文件为 CI 基线配置，本地调试请编辑 configs/api.config.js。
 */
module.exports = {
  // 请求超时（毫秒）
  timeout: 30000,

  // 默认请求头
  headers: {
    "Content-Type": "application/json",
  },

  // 重试配置
  retryAttempts: 0,
  // 重试间隔（毫秒）
  retryDelay: 1000,

  // baseURL 兜底默认值（空字符串表示回退到环境配置的 app.apiBaseUrl）
  baseURL: "",
};
