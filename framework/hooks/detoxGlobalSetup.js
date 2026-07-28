/**
 * Detox 模式的 globalSetup 包装器
 *
 * 在 Detox 原生 globalSetup 之前设置 OMNITEST_SESSION_DIR 环境变量。
 *
 * 背景：
 *   - Detox 的 testEnvironment 运行在 vm.Context sandbox 内
 *   - sandbox 内的 process.env 变化在 sandbox 销毁后丢失
 *   - globalTeardown 运行在 Host 进程，读不到 sandbox 内设置的 OMNITEST_SESSION_DIR
 *   - 所以必须在 globalSetup（Host 进程层面）设置此环境变量
 */
const fs = require("fs");
const path = require("path");

/** 生成会话目录名：omnitest-{platform}-2026-07-20T11-26-30+0800 */
function generateSessionDirName() {
  var now = new Date();
  var pad = function (n) {
    return String(n).padStart(2, "0");
  };
  var offset = -now.getTimezoneOffset();
  var sign = offset >= 0 ? "+" : "-";
  var absMin = Math.abs(offset);
  var tzStr = sign + pad(Math.floor(absMin / 60)) + pad(absMin % 60);

  var platform = process.env.TEST_PLATFORM || "unknown";
  var y = now.getFullYear();
  var mo = pad(now.getMonth() + 1);
  var d = pad(now.getDate());
  var h = pad(now.getHours());
  var mi = pad(now.getMinutes());
  var s = pad(now.getSeconds());

  return (
    "omnitest-" + platform + "-" + y + "-" + mo + "-" + d + "T" + h + "-" + mi + "-" + s + tzStr
  );
}

/** 确保 OMNITEST_SESSION_DIR 已设置（Host 进程层面） */
function ensureSessionDir() {
  if (process.env.OMNITEST_SESSION_DIR) {
    return;
  }

  var sessionDirName = generateSessionDirName();
  var sessionDir = path.join(process.cwd(), "artifacts", "logs", sessionDirName);
  process.env.OMNITEST_SESSION_DIR = sessionDir;

  // 创建必要的子目录
  var dirs = [path.join(sessionDir, "screenshots"), path.join(sessionDir, "videos")];
  dirs.forEach(function (dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  console.log("[DetoxSetup] Session directory: " + sessionDir);
}

module.exports = async function () {
  // 1. 先设置 OMNITEST_SESSION_DIR（在 Host 进程层面，全局可见）
  ensureSessionDir();

  // 2. 委托给 Detox 原生 globalSetup
  var detoxSetup = require("detox/runners/jest/globalSetup");
  await detoxSetup();
};
