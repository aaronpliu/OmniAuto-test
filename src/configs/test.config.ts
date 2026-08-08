import type { TestConfig, ValidationIssue } from '../contracts/types';
import { ERROR_CODES } from '../contracts/types';

/**
 * 测试执行策略默认值 —— 五级合并链的第 ⑥ 级（最底层兜底）。
 *
 * 本文件是**纯数据 + 一个 validate()**，不含任何 I/O 与控制流（§T02 实现要点第 2 条）。
 * 所有值都会被上层（框架 → 设备 → App → 环境变量 → CLI）逐级覆盖，
 * 这里只回答一个问题：「用户什么都不配的时候，应该怎么跑」。
 */

/**
 * 默认测试策略。
 *
 * 【几个非显然默认值的理由】
 * - `maxWorkers: 1`：一台设备同一时刻只能被一个会话驱动（U-3）。并行是设备池问题，不是 jest 配置问题，
 *   默认串行才是安全的；需要并行的人必须显式自备设备池并通过 `--jestArgs` 放开。
 * - `retries: 0`：**默认不重试**。自动重试会把偶发的真实缺陷洗成「偶尔失败」，
 *   让测试从质量守门员退化成噪音源（同 utils/retry.ts 的边界声明）。需要时由 CLI 显式开启。
 * - `bail: 0`：默认跑完全部用例，拿到完整失败面貌；CI 想快速失败可用 `--bail`。
 * - `screenshot.onStep: false`：逐步截图在长用例上会产生上百张图片，拖慢执行并淹没关键证据。
 *   失败截图（onFailure）才是排障主力。
 */
export const defaultTestConfig: TestConfig = {
  testMatch: ['**/tests/**/*.spec.ts'],
  maxWorkers: 1,
  retries: 0,
  bail: 0,
  timeouts: {
    // 单个用例 120s：移动端 E2E 含 App 冷启动、页面渲染与网络往返，30s 的 jest 默认值远远不够
    testMs: 120_000,
    // 钩子 180s：beforeAll 要建会话 + 装/启 App，是全流程最慢的一步
    hookMs: 180_000,
  },
  screenshot: {
    onFailure: true,
    onStep: false,
    dir: 'reports/screenshots',
    format: 'png',
  },
  video: {
    // 视频录制为 P2（R-15），三框架支持度不一，默认关闭避免拖慢主流程
    enabled: false,
    dir: 'reports/videos',
  },
  report: {
    dir: 'reports',
    junit: true,
    json: true,
    html: true,
  },
};

/** 校验测试策略配置 */
export function validate(config: TestConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.testMatch.length === 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'test.testMatch',
      message: 'testMatch 不能为空，否则 jest 找不到任何用例',
      severity: 'error',
    });
  }

  if (config.timeouts.testMs <= 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'test.timeouts.testMs',
      message: `用例超时必须为正数，实际为 ${config.timeouts.testMs}`,
      severity: 'error',
    });
  }

  if (config.timeouts.hookMs <= 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'test.timeouts.hookMs',
      message: `钩子超时必须为正数，实际为 ${config.timeouts.hookMs}`,
      severity: 'error',
    });
  }

  // 钩子要负责建会话 + 启动 App，比单个用例慢是常态；反过来几乎必然是配置笔误
  if (config.timeouts.hookMs < config.timeouts.testMs) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'test.timeouts.hookMs',
      message: `钩子超时（${config.timeouts.hookMs}ms）小于用例超时（${config.timeouts.testMs}ms），beforeAll 可能在建立会话时被提前掐断`,
      severity: 'warning',
      hint: '建议 hookMs >= testMs',
    });
  }

  if (config.retries < 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'test.retries',
      message: `重试次数不能为负，实际为 ${config.retries}`,
      severity: 'error',
    });
  }

  if (config.retries > 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'test.retries',
      message: `已开启用例级重试（retries=${config.retries}），偶发缺陷可能被重试掩盖`,
      severity: 'warning',
      hint: '仅建议在已知环境不稳定时临时开启，不要作为长期配置',
    });
  }

  if (config.bail < 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'test.bail',
      message: `bail 不能为负，实际为 ${config.bail}`,
      severity: 'error',
    });
  }

  const workers = config.maxWorkers;
  if (typeof workers === 'number' && (!Number.isInteger(workers) || workers < 1)) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'test.maxWorkers',
      message: `maxWorkers 为数字时必须是 >= 1 的整数，实际为 ${workers}`,
      severity: 'error',
    });
  }
  if (typeof workers === 'string' && !/^\d+%$/.test(workers)) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'test.maxWorkers',
      message: `maxWorkers 为字符串时必须形如 "50%"，实际为 "${workers}"`,
      severity: 'error',
    });
  }

  if (config.screenshot.dir.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'test.screenshot.dir',
      message: '截图目录不能为空',
      severity: 'error',
    });
  }

  if (config.report.dir.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'test.report.dir',
      message: '报告目录不能为空',
      severity: 'error',
    });
  }

  if (!config.report.junit && !config.report.json && !config.report.html) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: 'test.report',
      message: '三种报告格式全部关闭，本次运行将不产出任何报告',
      severity: 'warning',
      hint: '至少开启 junit / json / html 之一，否则 CI 无法归档结果',
    });
  }

  return issues;
}
