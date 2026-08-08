import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IAdapter } from '../contracts/IActions';
import type { ArtifactKind, ArtifactRef, ILogger, ResolvedRunConfig } from '../contracts/types';
import { ensureDir, sanitizePathSegment, toRelativePath } from './paths';

/**
 * 截图落盘工具。
 *
 * 【本文件的唯一铁律：截图失败绝不能让测试崩掉】
 * 截图是**诊断手段**，不是被测行为。一个已经失败的用例，如果在采集失败截图时又抛出
 * 「会话已断开」，那么 jest 报告里呈现的将是截图的错误，真正的业务失败原因被完全覆盖 ——
 * 这是排障体验最糟糕的一种情况。因此本文件所有对外函数都以「返回 null + warn 日志」
 * 的方式降级，**任何路径都不向上抛异常**。
 *
 * 【为什么 ArtifactRef.path 存绝对路径、relativePath 存相对 reports/ 的路径】
 * 绝对路径供当前进程内后续读写；相对路径写进 JSON/HTML 报告，
 * 这样整个 reports/ 目录可以打包搬去 CI 制品库或另一台机器，HTML 里的 <img src> 依然有效。
 */

/** 截图文件扩展名。契约 TestConfig.screenshot.format 目前锁定为 'png' */
const SCREENSHOT_EXTENSION = '.png';

/** 同一进程内的截图序号，保证同一用例多次截图不互相覆盖 */
let screenshotSequence = 0;

export interface CaptureScreenshotOptions {
  /** 文件名主体，通常是用例名或步骤名 */
  readonly name: string;
  /** 运行配置，提供 runId 与落盘目录 */
  readonly runConfig: ResolvedRunConfig;
  /** 产物类型，默认 'screenshot'；导出视图树快照等场景可传其它值 */
  readonly kind?: ArtifactKind;
  /** 附加标签，写进 ArtifactRef.label 并参与文件名拼装 */
  readonly label?: string;
  /** 归属用例全名，写进 ArtifactRef.testName */
  readonly testName?: string;
  /** 失败降级时使用的日志器；缺省则静默 */
  readonly logger?: ILogger;
}

/**
 * 生成截图文件名：`<runId>__<name>__<seq>[__<label>].png`。
 *
 * 各片段独立 sanitize 再用 `__` 连接：用例名里的空格/斜杠/中文标点/emoji 会被规范化，
 * 而分隔符 `__` 得以保留，报告工具可以反向拆解出 runId 与用例名。
 */
export function buildScreenshotFileName(
  runId: string,
  name: string,
  sequence: number,
  label?: string,
): string {
  const segments: string[] = [
    sanitizePathSegment(runId, 64),
    sanitizePathSegment(name, 120),
    String(sequence).padStart(3, '0'),
  ];
  if (label !== undefined && label !== '') {
    segments.push(sanitizePathSegment(label, 40));
  }
  return `${segments.join('__')}${SCREENSHOT_EXTENSION}`;
}

/**
 * 采集截图并落盘，返回 ArtifactRef；任何失败都降级为 null。
 *
 * @param adapter 已初始化的适配器；未就绪时直接返回 null（不视为错误）
 * @param options 见 CaptureScreenshotOptions
 */
export async function captureScreenshot(
  adapter: IAdapter | undefined,
  options: CaptureScreenshotOptions,
): Promise<ArtifactRef | null> {
  const { name, runConfig, kind = 'screenshot', label, testName, logger } = options;

  if (adapter === undefined) {
    logger?.warn('跳过截图：适配器不存在', { name });
    return null;
  }

  // 会话已关闭时截图必然失败，提前短路可以少一条无意义的 warn 噪音
  if (!adapter.isReady()) {
    logger?.warn('跳过截图：适配器未就绪', { name, state: adapter.state });
    return null;
  }

  try {
    const buffer = await adapter.device.captureScreenshotBuffer();
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      logger?.warn('跳过截图：驱动返回空缓冲区', { name });
      return null;
    }

    screenshotSequence += 1;
    const directory = ensureDir(runConfig.paths.screenshotsDir);
    const fileName = buildScreenshotFileName(runConfig.runId, name, screenshotSequence, label);
    const absolutePath = path.join(directory, fileName);

    fs.writeFileSync(absolutePath, buffer);

    const artifact: ArtifactRef = {
      kind,
      path: absolutePath,
      // 相对 reports/ 而非工程根：HTML 报告本身就落在 reports/ 下，这样 <img src> 可直接用
      relativePath: toRelativePath(absolutePath, runConfig.paths.reportsDir),
      createdAt: new Date().toISOString(),
      testName,
      label,
      bytes: buffer.length,
    };

    logger?.debug('截图已保存', { path: artifact.relativePath, bytes: artifact.bytes });
    return artifact;
  } catch (error) {
    // 关键降级点：截图失败只记 warn，绝不上抛，避免覆盖真正的用例失败原因
    logger?.warn(`截图失败（已忽略）：${readErrorMessage(error)}`, { name });
    return null;
  }
}

/**
 * 采集「用例失败现场」截图。
 * 文件名带时间戳 + 用例名，便于在 screenshots/ 目录里按时间排序定位失败瞬间。
 */
export async function captureFailureScreenshot(
  adapter: IAdapter | undefined,
  testName: string,
  runConfig: ResolvedRunConfig,
  logger?: ILogger,
): Promise<ArtifactRef | null> {
  // 时间戳用 `HHmmss-SSS` 紧凑形式并入文件名主体：ISO 串里的冒号在多数文件系统上非法
  const stamp = formatCompactTimestamp(new Date());
  return captureScreenshot(adapter, {
    name: `${stamp}__${testName}`,
    runConfig,
    kind: 'screenshot',
    label: 'failure',
    testName,
    logger,
  });
}

/**
 * 导出当前视图树并落盘为 .txt，登记为 pageSource 产物。
 * 与截图同样遵循「失败降级为 null」，供失败现场同时留存视觉与结构两份证据。
 */
export async function capturePageSource(
  adapter: IAdapter | undefined,
  testName: string,
  runConfig: ResolvedRunConfig,
  logger?: ILogger,
): Promise<ArtifactRef | null> {
  if (adapter === undefined || !adapter.isReady()) {
    return null;
  }
  try {
    const source = await adapter.device.getPageSource();
    screenshotSequence += 1;
    const directory = ensureDir(runConfig.paths.screenshotsDir);
    const fileName = `${sanitizePathSegment(runConfig.runId, 64)}__${sanitizePathSegment(testName, 120)}__${String(screenshotSequence).padStart(3, '0')}__source.txt`;
    const absolutePath = path.join(directory, fileName);
    fs.writeFileSync(absolutePath, source, 'utf8');

    return {
      kind: 'pageSource',
      path: absolutePath,
      relativePath: toRelativePath(absolutePath, runConfig.paths.reportsDir),
      createdAt: new Date().toISOString(),
      testName,
      label: 'page-source',
      bytes: Buffer.byteLength(source, 'utf8'),
    };
  } catch (error) {
    logger?.warn(`视图树导出失败（已忽略）：${readErrorMessage(error)}`, { testName });
    return null;
  }
}

/** `HHmmss-SSS` 形式的紧凑时间戳，文件名安全 */
function formatCompactTimestamp(date: Date): string {
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
}

/** 读取 unknown 异常的可读信息 */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 重置序号。仅供单测使用，保证文件名断言可重现。 */
export function resetScreenshotSequence(): void {
  screenshotSequence = 0;
}
