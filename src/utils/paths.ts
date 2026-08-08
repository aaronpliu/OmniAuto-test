import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RunPaths } from '../contracts/types';
import { ERROR_CODES, EXIT_CODES, OmniError } from '../contracts/types';

/**
 * 路径基础设施：定位工程根、构造运行期路径集合、目录保障、绝对↔相对转换。
 *
 * 【为什么不用 process.cwd()】
 * 本工程会以三种姿态被执行：`tsx src/index.ts`（cwd = e2e/）、jest worker（cwd 由 jest 决定）、
 * CI 中从仓库根调用（cwd = 仓库根）。cwd 不可靠，因此一律从 `__dirname` 出发向上回溯定位工程根，
 * 让「产物落在哪」与「从哪里发起命令」彻底解耦。
 */

/** 工程根目录名。回溯时用它区分 e2e/ 与外层仓库根（两者可能都有 package.json） */
export const PROJECT_DIR_NAME = 'e2e';

/** 运行期临时目录（相对 reports/），存放 run-config.json 与分片 */
export const RUNTIME_DIR_NAME = '.run';

/** 工程根缓存。回溯涉及多次 fs 调用，而工程根在进程生命周期内不会变，故只解析一次。 */
let cachedProjectRoot: string | undefined;

/**
 * 从 startDir 向上回溯定位工程根。
 *
 * 判定优先级：
 * 1. 目录含 `package.json` **且** 目录名为 `e2e` —— 最强特征，优先命中；
 * 2. 退化：回溯路径上第一个含 `package.json` 的目录（兼容工程被改名的情况）；
 * 3. 兜底：`process.cwd()`，并不抛错 —— 路径解析失败不该让整个 CLI 崩在启动前。
 *
 * @param startDir 回溯起点，默认为本文件所在目录
 */
export function findProjectRoot(startDir: string = __dirname): string {
  let firstPackageJsonDir: string | undefined;
  let current = path.resolve(startDir);

  // 回溯到文件系统根为止；path.dirname('/') === '/' 是循环终止条件
  for (;;) {
    const hasPackageJson = fs.existsSync(path.join(current, 'package.json'));
    if (hasPackageJson) {
      if (path.basename(current) === PROJECT_DIR_NAME) {
        return current;
      }
      if (firstPackageJsonDir === undefined) {
        firstPackageJsonDir = current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return firstPackageJsonDir ?? process.cwd();
}

/** 获取（并缓存）工程根绝对路径 */
export function getProjectRoot(): string {
  if (cachedProjectRoot === undefined) {
    cachedProjectRoot = findProjectRoot();
  }
  return cachedProjectRoot;
}

/**
 * 覆盖工程根缓存。仅供测试与特殊嵌入场景使用。
 * @param root 传 undefined 表示清空缓存，下次访问时重新回溯
 */
export function setProjectRoot(root: string | undefined): void {
  cachedProjectRoot = root === undefined ? undefined : path.resolve(root);
}

/** 递归创建目录（已存在时静默返回），返回绝对路径 */
export function ensureDir(dir: string): string {
  const absolute = toAbsolutePath(dir);
  try {
    fs.mkdirSync(absolute, { recursive: true });
  } catch (error) {
    throw new OmniError(ERROR_CODES.CONFIG_INVALID, `无法创建目录：${absolute}`, {
      exitCode: EXIT_CODES.CONFIG_INVALID,
      cause: error,
      details: { dir: absolute },
      hint: '请检查该路径的写权限，或通过 OMNI_ARTIFACTS_DIR 指定其它产物目录',
    });
  }
  return absolute;
}

/** 确保文件所在目录存在，返回文件绝对路径 */
export function ensureParentDir(filePath: string): string {
  const absolute = toAbsolutePath(filePath);
  ensureDir(path.dirname(absolute));
  return absolute;
}

/**
 * 相对路径绝对化。
 * @param target 目标路径，已是绝对路径时原样返回
 * @param base 相对基准，默认工程根（**不是 cwd**，理由见文件头注释）
 */
export function toAbsolutePath(target: string, base: string = getProjectRoot()): string {
  return path.isAbsolute(target) ? path.normalize(target) : path.resolve(base, target);
}

/**
 * 绝对路径相对化。
 * 报告中一律存相对路径，这样整个 reports/ 目录可以打包搬到 CI 制品库或其它机器而不失效。
 */
export function toRelativePath(target: string, base: string = getProjectRoot()): string {
  const relative = path.relative(base, toAbsolutePath(target, base));
  // 统一为 POSIX 分隔符：报告可能在 Windows 生成、在 Linux 渲染，反斜杠会破坏 HTML 中的 <img src>
  return relative.split(path.sep).join('/');
}

/**
 * 构造运行期路径集合。
 *
 * @param runId 形如 `20250808-152030-appium-android-a1b2c3`，同时用作运行时目录名与截图前缀
 * @param options.projectRoot 覆盖工程根（测试用）
 * @param options.artifactsDir 产物根目录，相对工程根或绝对路径，默认 `reports`
 */
export function buildRunPaths(
  runId: string,
  options: { readonly projectRoot?: string; readonly artifactsDir?: string } = {},
): RunPaths {
  const projectRoot = options.projectRoot !== undefined
    ? path.resolve(options.projectRoot)
    : getProjectRoot();
  const reportsDir = toAbsolutePath(options.artifactsDir ?? 'reports', projectRoot);
  const runtimeDir = path.join(reportsDir, RUNTIME_DIR_NAME, runId);

  return {
    projectRoot,
    reportsDir,
    screenshotsDir: path.join(reportsDir, 'screenshots'),
    videosDir: path.join(reportsDir, 'videos'),
    runtimeDir,
    runConfigFile: path.join(runtimeDir, 'run-config.json'),
    shardsDir: path.join(runtimeDir, 'shards'),
  };
}

/**
 * 创建 RunPaths 中的全部目录。
 * 由 globalSetup 在主进程调用一次；worker 侧只写文件不建目录，避免并发 mkdir 竞态。
 */
export function ensureRunPaths(paths: RunPaths): RunPaths {
  ensureDir(paths.reportsDir);
  ensureDir(paths.screenshotsDir);
  ensureDir(paths.videosDir);
  ensureDir(paths.runtimeDir);
  ensureDir(paths.shardsDir);
  return paths;
}

/** 路径是否存在（文件或目录皆可） */
export function pathExists(target: string): boolean {
  return fs.existsSync(toAbsolutePath(target));
}

/**
 * 目录是否可写。
 * 用真实写入探针而非 `fs.access(W_OK)` —— 后者在容器与网络卷上会给出假阳性结果，
 * 而 dry-run 的 `artifacts-writable` 检查项需要的是「确实能落盘」的结论。
 */
export function isWritableDir(dir: string): boolean {
  const absolute = toAbsolutePath(dir);
  const probe = path.join(absolute, `.omni-write-probe-${process.pid}-${Date.now()}`);
  try {
    fs.mkdirSync(absolute, { recursive: true });
    fs.writeFileSync(probe, 'ok', 'utf8');
    return true;
  } catch {
    return false;
  } finally {
    try {
      fs.rmSync(probe, { force: true });
    } catch {
      // 探针清理失败不影响结论，忽略即可
    }
  }
}

/**
 * 把任意文件名片段规范化为安全的文件名。
 * 用于截图命名（`<runId>__<suite>__<testName>__<seq>__<label>.png`）：
 * 用例名常含空格、斜杠、中文标点甚至 emoji，直接落盘会在不同文件系统上产生不同结果。
 *
 * @param raw 原始片段
 * @param maxLength 截断长度，默认 180（为完整文件名的其余部分留出 macOS 255 字节上限内的余量）
 */
export function sanitizePathSegment(raw: string, maxLength = 180): string {
  const normalized = raw
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const safe = normalized.length > 0 ? normalized : 'unnamed';
  return safe.length > maxLength ? safe.slice(0, maxLength) : safe;
}
