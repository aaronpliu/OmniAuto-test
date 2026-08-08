import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  ArtifactRef,
  ResolvedRunConfig,
  RunReport,
  TestCaseRecord,
  TestCaseStatus,
} from '../contracts/types';
import { EXIT_CODES } from '../contracts/types';
import { createLogger } from '../utils/logger';
import { ensureDir, toRelativePath } from '../utils/paths';

/**
 * Jest globalTeardown —— 跑在**主进程**，全部 worker 结束之后。
 *
 * 职责：把各 worker 落下的分片 JSON 合并成一份 RunReport，产出三种报告（JUnit XML / JSON / HTML），
 * 清理运行时临时目录，并打印汇总。
 *
 * 【为什么报告在这里生成，而不是用 jest reporter】
 * jest 的自定义 reporter 拿不到「适配器采集的产物」（截图 ArtifactRef 由 worker 侧登记，
 * reporter 与 worker 之间没有这条数据通道）。而分片文件是 worker 唯一能可靠传出结构化数据的方式，
 * 因此合并动作必须发生在「所有分片都已落盘」的时刻 —— 也就是 globalTeardown。
 *
 * 【为什么 HTML 报告零第三方依赖、手工拼字符串】
 * 引入任何模板/报告库都会给这个「无设备也要能跑」的工程增加安装负担，
 * 与 D-1（第三方依赖一律 optional）的取向冲突。报告结构本身很简单，手拼完全可控。
 */

/** worker 分片文件的内容结构。由 jestSetupAfterEnv 写出，本文件读取。 */
export interface WorkerShard {
  readonly runId: string;
  readonly pid: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly cases: readonly TestCaseRecord[];
  readonly artifacts: readonly ArtifactRef[];
}

/** 分片文件扩展名，与 jestSetupAfterEnv 约定一致 */
const SHARD_SUFFIX = '.shard.json';

export default async function globalTeardown(): Promise<void> {
  const logger = createLogger({ scope: 'globalTeardown' });

  const runConfigFile = process.env['OMNI_RUN_CONFIG_FILE'];
  if (runConfigFile === undefined || runConfigFile === '' || !fs.existsSync(runConfigFile)) {
    // globalSetup 未成功执行时会走到这里。没有配置就没有产物目录，静默返回即可，
    // 在 teardown 阶段抛异常只会掩盖 setup 阶段的真实错误。
    logger.warn('未找到运行配置，跳过报告合并', { runConfigFile: runConfigFile ?? '(unset)' });
    return;
  }

  let runConfig: ResolvedRunConfig;
  try {
    runConfig = JSON.parse(fs.readFileSync(runConfigFile, 'utf8')) as ResolvedRunConfig;
  } catch (error) {
    logger.error('运行配置解析失败，跳过报告合并', error);
    return;
  }

  const finishedAt = new Date();
  const shards = readShards(runConfig.paths.shardsDir);
  const report = mergeShards(runConfig, shards, finishedAt);

  const written: string[] = [];
  try {
    ensureDir(runConfig.paths.reportsDir);

    if (runConfig.test.report.json) {
      written.push(writeJsonReport(report, runConfig));
    }
    if (runConfig.test.report.junit) {
      written.push(writeJUnitReport(report, runConfig));
    }
    if (runConfig.test.report.html) {
      written.push(writeHtmlReport(report, runConfig));
    }
  } catch (error) {
    logger.error('报告写入失败', error);
  }

  printSummary(report, written, runConfig);
  cleanupRuntimeDir(runConfig, logger);
}

/* ═══════════════ 分片读取与合并 ═══════════════ */

/** 读取 shardsDir 下全部分片；单个分片损坏不影响其余分片 */
function readShards(shardsDir: string): WorkerShard[] {
  if (!fs.existsSync(shardsDir)) {
    return [];
  }
  const shards: WorkerShard[] = [];
  for (const entry of fs.readdirSync(shardsDir).sort()) {
    if (!entry.endsWith(SHARD_SUFFIX)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(path.join(shardsDir, entry), 'utf8');
      shards.push(JSON.parse(raw) as WorkerShard);
    } catch {
      // 某个 worker 被强杀会留下半截 JSON。丢弃这一片继续合并，
      // 比整份报告生成失败要好得多。
      continue;
    }
  }
  return shards;
}

/** 合并分片为 RunReport */
function mergeShards(
  runConfig: ResolvedRunConfig,
  shards: readonly WorkerShard[],
  finishedAt: Date,
): RunReport {
  const cases: TestCaseRecord[] = [];
  const artifacts: ArtifactRef[] = [];

  for (const shard of shards) {
    cases.push(...shard.cases);
    artifacts.push(...shard.artifacts);
  }

  // 按 fullName 排序：worker 完成顺序不确定，不排序的话同一套用例每次运行的
  // 报告顺序都不同，两次运行的报告无法直接 diff
  cases.sort((left, right) => left.fullName.localeCompare(right.fullName));

  const summary = {
    total: cases.length,
    passed: cases.filter((item) => item.status === 'passed').length,
    failed: cases.filter((item) => item.status === 'failed').length,
    skipped: cases.filter((item) => item.status === 'skipped' || item.status === 'todo').length,
  };

  const startedAt = new Date(runConfig.startedAt);
  const exitCode = summary.failed > 0 ? EXIT_CODES.TESTS_FAILED : EXIT_CODES.SUCCESS;

  return {
    runId: runConfig.runId,
    startedAt: runConfig.startedAt,
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    options: runConfig.options,
    summary,
    cases,
    artifacts,
    exitCode,
  };
}

/* ═══════════════ 报告产出 ═══════════════ */

/** JSON 报告：机器消费的完整真理源 */
function writeJsonReport(report: RunReport, runConfig: ResolvedRunConfig): string {
  const target = path.join(runConfig.paths.reportsDir, 'run-report.json');
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return target;
}

/**
 * JUnit XML：CI 系统（Jenkins / GitLab / GitHub Actions）的通用摄入格式。
 * 按 suite 分组为多个 <testsuite>，失败信息写进 <failure>。
 */
function writeJUnitReport(report: RunReport, runConfig: ResolvedRunConfig): string {
  const bySuite = new Map<string, TestCaseRecord[]>();
  for (const record of report.cases) {
    const suite = record.suite !== '' ? record.suite : '(root)';
    const bucket = bySuite.get(suite);
    if (bucket === undefined) {
      bySuite.set(suite, [record]);
    } else {
      bucket.push(record);
    }
  }

  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(
    `<testsuites name="${escapeXmlAttribute(`omni-${report.runId}`)}"`
    + ` tests="${report.summary.total}" failures="${report.summary.failed}"`
    + ` skipped="${report.summary.skipped}" time="${toSeconds(report.durationMs)}">`,
  );

  for (const [suite, records] of bySuite) {
    const failures = records.filter((item) => item.status === 'failed').length;
    const skipped = records.filter((item) => item.status === 'skipped' || item.status === 'todo').length;
    const suiteDuration = records.reduce((sum, item) => sum + item.durationMs, 0);

    lines.push(
      `  <testsuite name="${escapeXmlAttribute(suite)}" tests="${records.length}"`
      + ` failures="${failures}" skipped="${skipped}" time="${toSeconds(suiteDuration)}">`,
    );

    for (const record of records) {
      const caseOpen =
        `    <testcase classname="${escapeXmlAttribute(suite)}"`
        + ` name="${escapeXmlAttribute(record.name)}" time="${toSeconds(record.durationMs)}"`;

      if (record.status === 'failed') {
        lines.push(`${caseOpen}>`);
        const message = record.failureMessages[0] ?? '用例失败';
        lines.push(
          `      <failure message="${escapeXmlAttribute(firstLine(message))}" type="AssertionError">`
          + escapeXmlText(record.failureMessages.join('\n\n'))
          + '</failure>',
        );
        for (const artifact of record.artifacts) {
          lines.push(`      <system-out>${escapeXmlText(`[artifact] ${artifact.relativePath}`)}</system-out>`);
        }
        lines.push('    </testcase>');
      } else if (record.status === 'skipped' || record.status === 'todo') {
        lines.push(`${caseOpen}><skipped/></testcase>`);
      } else {
        lines.push(`${caseOpen}/>`);
      }
    }
    lines.push('  </testsuite>');
  }

  lines.push('</testsuites>');

  const target = path.join(runConfig.paths.reportsDir, 'junit.xml');
  fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
  return target;
}

/**
 * 自包含 HTML 报告：零第三方依赖，样式内联，截图用相对链接引用。
 * 相对链接而非 base64 内嵌：截图可能有几十张，内嵌会让 HTML 膨胀到几十 MB 打不开。
 */
function writeHtmlReport(report: RunReport, runConfig: ResolvedRunConfig): string {
  const rows = report.cases.map((record) => renderCaseRow(record)).join('\n');
  const statusClass = report.summary.failed > 0 ? 'fail' : 'pass';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OmniAutoTest 报告 ${escapeHtml(report.runId)}</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f6f7f9; color: #1f2328; }
h1 { font-size: 20px; margin: 0 0 4px; }
.meta { color: #656d76; font-size: 13px; margin-bottom: 20px; }
.cards { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
.card { flex: 1 1 140px; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 14px 16px; }
.card .num { font-size: 26px; font-weight: 600; line-height: 1.2; }
.card .lbl { font-size: 12px; color: #656d76; margin-top: 2px; }
.card.pass .num { color: #1a7f37; }
.card.fail .num { color: #cf222e; }
.card.skip .num { color: #9a6700; }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; overflow: hidden; }
th, td { text-align: left; padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #eaeef2; vertical-align: top; }
th { background: #f6f8fa; font-weight: 600; }
tr:last-child td { border-bottom: none; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge.passed { background: #dafbe1; color: #1a7f37; }
.badge.failed { background: #ffebe9; color: #cf222e; }
.badge.skipped, .badge.todo { background: #fff8c5; color: #9a6700; }
pre { margin: 8px 0 0; padding: 10px; background: #f6f8fa; border-radius: 6px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
.shots { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
.shots a { display: block; }
.shots img { max-width: 200px; border: 1px solid #d0d7de; border-radius: 6px; }
.empty { padding: 32px; text-align: center; color: #656d76; }
footer { margin-top: 20px; font-size: 12px; color: #656d76; }
</style>
</head>
<body>
<h1>OmniAutoTest 运行报告</h1>
<div class="meta">
runId <strong>${escapeHtml(report.runId)}</strong> ·
框架 <strong>${escapeHtml(String(runConfig.framework))}</strong> ·
平台 <strong>${escapeHtml(runConfig.platform)}</strong> ·
设备 <strong>${escapeHtml(runConfig.deviceKind)}</strong> ·
App <strong>${escapeHtml(String(runConfig.app.key))}</strong><br>
开始 ${escapeHtml(report.startedAt)} · 结束 ${escapeHtml(report.finishedAt)} · 耗时 ${formatDuration(report.durationMs)}
</div>

<div class="cards">
  <div class="card"><div class="num">${report.summary.total}</div><div class="lbl">总用例</div></div>
  <div class="card pass"><div class="num">${report.summary.passed}</div><div class="lbl">通过</div></div>
  <div class="card fail"><div class="num">${report.summary.failed}</div><div class="lbl">失败</div></div>
  <div class="card skip"><div class="num">${report.summary.skipped}</div><div class="lbl">跳过</div></div>
  <div class="card ${statusClass}"><div class="num">${report.exitCode}</div><div class="lbl">退出码</div></div>
</div>

${report.cases.length === 0
    ? '<div class="empty">本次运行没有采集到任何用例记录。</div>'
    : `<table>
<thead><tr><th style="width:90px">状态</th><th>用例</th><th style="width:90px">耗时</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`}

<footer>由 OmniAutoTest 生成，无第三方依赖。截图以相对路径引用，可随 reports/ 目录整体迁移。</footer>
</body>
</html>
`;

  const target = path.join(runConfig.paths.reportsDir, 'report.html');
  fs.writeFileSync(target, html, 'utf8');
  return target;
}

/** 渲染单条用例的表格行 */
function renderCaseRow(record: TestCaseRecord): string {
  const failureBlock = record.failureMessages.length > 0
    ? `<pre>${escapeHtml(record.failureMessages.join('\n\n'))}</pre>`
    : '';

  const shots = record.artifacts.filter((item) => item.kind === 'screenshot');
  const shotBlock = shots.length > 0
    ? `<div class="shots">${shots
      .map((item) => {
        const href = escapeHtml(item.relativePath);
        return `<a href="${href}" target="_blank" rel="noreferrer"><img src="${href}" alt="${escapeHtml(item.label ?? 'screenshot')}" loading="lazy"></a>`;
      })
      .join('')}</div>`
    : '';

  const others = record.artifacts.filter((item) => item.kind !== 'screenshot');
  const otherBlock = others.length > 0
    ? `<div class="shots">${others
      .map((item) => `<a href="${escapeHtml(item.relativePath)}" target="_blank" rel="noreferrer">${escapeHtml(item.kind)}</a>`)
      .join(' · ')}</div>`
    : '';

  return `<tr>
  <td><span class="badge ${record.status}">${statusLabel(record.status)}</span></td>
  <td><strong>${escapeHtml(record.name)}</strong><br><span style="color:#656d76;font-size:12px">${escapeHtml(record.suite)}</span>${failureBlock}${shotBlock}${otherBlock}</td>
  <td>${formatDuration(record.durationMs)}</td>
</tr>`;
}

/* ═══════════════ 汇总输出与清理 ═══════════════ */

/** 打印人类可读的运行汇总 */
function printSummary(report: RunReport, written: readonly string[], runConfig: ResolvedRunConfig): void {
  const { summary } = report;
  const verdict = summary.failed > 0 ? '❌ 失败' : summary.total === 0 ? '⚠️  无用例' : '✅ 通过';

  const lines: string[] = [
    '',
    '─'.repeat(66),
    `  运行汇总  ${verdict}`,
    '─'.repeat(66),
    `  runId      ${report.runId}`,
    `  组合       ${String(runConfig.framework)} / ${runConfig.platform} / ${runConfig.deviceKind} / ${String(runConfig.app.key)}`,
    `  用例       总 ${summary.total} · 通过 ${summary.passed} · 失败 ${summary.failed} · 跳过 ${summary.skipped}`,
    `  耗时       ${formatDuration(report.durationMs)}`,
  ];

  for (const file of written) {
    lines.push(`  报告       ${toRelativePath(file, runConfig.paths.projectRoot)}`);
  }
  lines.push('─'.repeat(66), '');

  process.stdout.write(`${lines.join('\n')}\n`);
}

/**
 * 清理运行时临时目录（reports/.run/<runId>）。
 * 设 OMNI_KEEP_RUNTIME=1 可保留，用于排查「分片没写出来」这类问题。
 */
function cleanupRuntimeDir(runConfig: ResolvedRunConfig, logger: ReturnType<typeof createLogger>): void {
  if (process.env['OMNI_KEEP_RUNTIME'] === '1') {
    logger.info('已保留运行时目录', { dir: toRelativePath(runConfig.paths.runtimeDir) });
    return;
  }
  try {
    fs.rmSync(runConfig.paths.runtimeDir, { recursive: true, force: true });
  } catch (error) {
    // 清理失败不影响任何结论，降级为 debug
    logger.debug(`运行时目录清理失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

/* ═══════════════ 纯函数工具 ═══════════════ */

/**
 * XML 文本节点转义。
 * 五个实体一个都不能少：& 必须**最先**替换，否则后续替换产生的 &lt; 会被二次转义成 &amp;lt;。
 */
export function escapeXmlText(raw: string): string {
  return stripXmlInvalidChars(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** XML 属性值转义（在文本转义基础上再处理引号） */
export function escapeXmlAttribute(raw: string): string {
  return escapeXmlText(raw).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * 剔除 XML 1.0 不允许出现的控制字符。
 * 终端色彩转义码（\u001b）常混在 jest 的失败信息里，直接写进 XML 会让解析器报
 * 「not well-formed」，整份 CI 报告作废。
 */
function stripXmlInvalidChars(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** HTML 转义 */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 毫秒 → JUnit 要求的秒（三位小数） */
function toSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** 毫秒 → 人类可读时长 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m${String(seconds).padStart(2, '0')}s`;
}

/** 取多行文本的首行，供 XML 属性使用 */
function firstLine(raw: string): string {
  const index = raw.indexOf('\n');
  return index === -1 ? raw : raw.slice(0, index);
}

/** 状态的中文标签 */
function statusLabel(status: TestCaseStatus): string {
  switch (status) {
    case 'passed':
      return '通过';
    case 'failed':
      return '失败';
    case 'skipped':
      return '跳过';
    case 'todo':
      return '待办';
    default:
      return String(status);
  }
}
