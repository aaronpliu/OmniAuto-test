/**
 * Detox 模式的 globalTeardown
 *
 * 包装 Detox 原生 teardown，在其完成后将 artifacts/detox/ 下的产物
 * 迁移到统一会话目录（OMNITEST_SESSION_DIR），随后清理原始目录。
 *
 * 注意：此文件使用 CommonJS (.js) 是因为 Jest 的 globalTeardown 在
 *       test environment 之外运行，Detox 上下文中不支持 TypeScript。
 */
const fs = require("fs");
const path = require("path");

// ===========================================================================
//  日志辅助：globalTeardown 中无法使用 winston logger，统一用 console.log
// ===========================================================================
function log(msg) {
  process.stdout.write("[DetoxTeardown] " + msg + "\n");
}

// ===========================================================================
//  递归收集目录下所有文件的绝对路径
// ===========================================================================
function collectFiles(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;

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

// ===========================================================================
//  获取或推断 OMNITEST_SESSION_DIR
//  Priority:
//    1. 环境变量 OMNITEST_SESSION_DIR（由 detoxGlobalSetup.js 在 host 层面设置）
//    2. 扫描 artifacts/logs/ 下最新的 omnitest-* 目录（fallback）
// ===========================================================================
function resolveSessionDir() {
  // 优先使用环境变量
  if (process.env.OMNITEST_SESSION_DIR) {
    log("OMNITEST_SESSION_DIR = " + process.env.OMNITEST_SESSION_DIR);
    return process.env.OMNITEST_SESSION_DIR;
  }

  // Fallback: 扫描 artifacts/logs/ 找到最新的 omnitest-* 目录
  const logsRoot = path.join(process.cwd(), "artifacts", "logs");
  if (!fs.existsSync(logsRoot)) {
    log("WARN: artifacts/logs/ does not exist, skipping migration");
    return null;
  }

  const entries = fs
    .readdirSync(logsRoot, { withFileTypes: true })
    .filter(function (e) {
      return e.isDirectory() && e.name.startsWith("omnitest-");
    })
    .sort(function (a, b) {
      return b.name.localeCompare(a.name); // 降序，最新在前
    });

  if (entries.length === 0) {
    log("WARN: no omnitest-* directory found in artifacts/logs/");
    return null;
  }

  const found = path.join(logsRoot, entries[0].name);
  log("OMNITEST_SESSION_DIR not set, fallback to latest: " + found);
  return found;
}

// ===========================================================================
//  迁移 Detox artifacts 到 OMNITEST_SESSION_DIR
// ===========================================================================
function moveDetoxArtifacts() {
  const sessionDir = resolveSessionDir();
  if (!sessionDir) {
    return;
  }

  const detoxRoot = path.join(process.cwd(), "artifacts", "detox");
  if (!fs.existsSync(detoxRoot)) {
    log("artifacts/detox/ not found, nothing to migrate");
    return;
  }

  log("Scanning " + detoxRoot + " ...");

  // 找到最新的 Detox 运行目录（格式如 ios.sim.debug.2026-07-20 03-26-14Z）
  const entries = fs
    .readdirSync(detoxRoot, { withFileTypes: true })
    .filter(function (e) {
      return e.isDirectory();
    })
    .sort(function (a, b) {
      return b.name.localeCompare(a.name);
    });

  const latestDir = entries[0];
  if (!latestDir) {
    log("No session directory found in artifacts/detox/");
    return;
  }

  const detoxSessionDir = path.join(detoxRoot, latestDir.name);
  log("Found Detox session: " + latestDir.name);

  const allFiles = collectFiles(detoxSessionDir);
  log("Files to migrate: " + allFiles.length);

  // 统计各类文件数量
  let moved = 0;
  let failed = 0;

  for (const filePath of allFiles) {
    const baseName = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();

    let destDir;
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
    } catch (renameErr) {
      // 跨分区 rename 可能失败，尝试 copy + unlink
      try {
        fs.copyFileSync(filePath, destPath);
        fs.unlinkSync(filePath);
        moved++;
      } catch (copyErr) {
        failed++;
        log("FAILED to migrate: " + path.basename(filePath) + " — " + copyErr.message);
      }
    }
  }

  log("Migration result: " + moved + " file(s) moved, " + failed + " failed");

  // 清理空的 Detox 目录
  try {
    fs.rmSync(detoxRoot, { recursive: true, force: true });
    log("Cleaned up: artifacts/detox/");
  } catch (rmErr) {
    log("WARN: Failed to clean up artifacts/detox/: " + rmErr.message);

    // 退而求其次：只删除本次运行的子目录
    try {
      fs.rmSync(detoxSessionDir, { recursive: true, force: true });
      log("Cleaned up: " + detoxSessionDir);
    } catch {
      // 静默忽略
    }
  }
}

// ===========================================================================
//  globalTeardown 入口
// ===========================================================================
module.exports = async function () {
  log("=== Detox global teardown started ===");

  // 1. 执行 Detox 原生 teardown（关闭 Detox server 等）
  try {
    const detoxTeardown = require("detox/runners/jest/globalTeardown");
    if (typeof detoxTeardown === "function") {
      log("Running Detox native teardown...");
      await detoxTeardown();
      log("Detox native teardown completed");
    } else {
      log("WARN: detox globalTeardown is not a function");
    }
  } catch (err) {
    log("ERROR: Detox native teardown failed: " + err.message);
  }

  // 2. 迁移 Detox artifacts 到统一会话目录
  try {
    moveDetoxArtifacts();
  } catch (err) {
    log("ERROR: Artifacts migration failed: " + err.message);
    if (err.stack) {
      log("Stack: " + err.stack);
    }
  }

  log("=== Detox global teardown completed ===");
};
