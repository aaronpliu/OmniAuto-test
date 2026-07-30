import * as fs from "fs";
import * as path from "path";
import { Logger } from "./Logger";

const logger = Logger.getInstance();

/** 生成会话目录名：omnitest-android-2026-07-17T10-30-00+0800 */
export function generateSessionDirName(platform: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absMin = Math.abs(offset);
  const tzStr = `${sign}${pad(Math.floor(absMin / 60))}${pad(absMin % 60)}`;

  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hour = pad(now.getHours());
  const minute = pad(now.getMinutes());
  const second = pad(now.getSeconds());

  return `omnitest-${platform}-${year}-${month}-${day}T${hour}-${minute}-${second}${tzStr}`;
}

/**
 * 初始化会话目录：
 *   - 生成目录名并写入环境变量 OMNITEST_SESSION_DIR（仅首次）
 *   - 绑定 Logger file transport（每次调用都执行，因为 globalSetup 可能已在 host 层面设置了 env var）
 *   - 创建 screenshots、videos、allure-results 子目录（幂等）
 *
 * 兼容 globalSetup 和 setupFilesAfterEnv 两种调用场景。
 *
 * 注意：
 *   对于 Detox 配置，detoxGlobalSetup.js 会在 host 进程层面先设置
 *   OMNITEST_SESSION_DIR，然后 testLifecycle.ts（sandbox 内）再次调用
 *   本函数。此时 env var 已有值，但 Logger file transport 仍需绑定。
 */
export function ensureSessionDir(platform?: string): string {
  const wasAlreadySet = !!process.env.OMNITEST_SESSION_DIR;

  if (!wasAlreadySet) {
    const resolvedPlatform = platform || process.env.TEST_PLATFORM || "unknown";
    const sessionDirName = generateSessionDirName(resolvedPlatform);
    const sessionDir = path.join(process.cwd(), "artifacts", "logs", sessionDirName);
    process.env.OMNITEST_SESSION_DIR = sessionDir;
  }

  const sessionDir = process.env.OMNITEST_SESSION_DIR!;

  // 将会话目录绑定到 Logger 的 file transport（每次调用都执行，确保 test.log 写入）
  logger.ensureFileLogging(sessionDir);
  if (!wasAlreadySet) {
    logger.info(`Session directory: ${sessionDir}`);
  }

  // 创建必要的子目录（幂等）
  const dirs = [
    path.join(sessionDir, "screenshots"),
    path.join(sessionDir, "videos"),
    "artifacts/allure-results",
  ];

  dirs.forEach((dir) => {
    const fullPath = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });

  return sessionDir;
}

/**
 * 将 Detox artifacts 目录中的文件迁移到统一会话目录，随后清理原始目录。
 *
 * Detox 默认将产物写入 artifacts/detox/<config>.<timestamp>/ 下：
 *   - device.log              → {sessionDir}/device.log
 *   - *.png (截图)            → {sessionDir}/screenshots/
 *   - *.mp4 (录屏)            → {sessionDir}/videos/
 *   - 原 artifacts/detox/ 目录随后被删除
 *
 * 此函数应在 Detox 测试完成、global teardown 阶段调用。
 */
export function moveDetoxArtifacts(): void {
  const sessionDir = process.env.OMNITEST_SESSION_DIR;
  if (!sessionDir) {
    logger.debug("OMNITEST_SESSION_DIR not set, skipping Detox artifacts migration");
    return;
  }

  const detoxRoot = path.join(process.cwd(), "artifacts", "detox");
  if (!fs.existsSync(detoxRoot)) {
    return;
  }

  // 找到最新的 Detox 运行目录
  const entries = fs
    .readdirSync(detoxRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name)); // 降序，最新的在前
  const latestDir = entries[0];
  if (!latestDir) {
    return;
  }

  const detoxSessionDir = path.join(detoxRoot, latestDir.name);
  const allFiles = collectFiles(detoxSessionDir);

  let moved = 0;
  for (const filePath of allFiles) {
    const relPath = path.relative(detoxSessionDir, filePath);
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath).toLowerCase();

    let destDir: string;
    if (baseName === "device.log") {
      destDir = sessionDir;
    } else if (ext === ".png" || ext === ".jpg") {
      destDir = path.join(sessionDir, "screenshots");
    } else if (ext === ".mp4" || ext === ".mov") {
      destDir = path.join(sessionDir, "videos");
    } else {
      destDir = sessionDir;
    }

    const destPath = path.join(destDir, path.basename(filePath));
    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.renameSync(filePath, destPath);
      moved++;
    } catch (err) {
      // 跨分区 rename 可能失败，尝试 copy + unlink
      try {
        fs.copyFileSync(filePath, destPath);
        fs.unlinkSync(filePath);
        moved++;
      } catch {
        logger.warn(`无法迁移 Detox artifact: ${filePath}`);
      }
    }
  }

  // 清理空的 Detox 目录
  try {
    fs.rmSync(detoxRoot, { recursive: true, force: true });
  } catch {
    logger.warn("无法清理 artifacts/detox 目录");
  }

  logger.info(`Detox artifacts migrated: ${moved} file(s) → ${sessionDir}`);
}

/** 递归收集目录下所有文件 */
function collectFiles(dir: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dir)) {
    return result;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(fullPath));
    } else {
      result.push(fullPath);
    }
  }
  return result;
}
