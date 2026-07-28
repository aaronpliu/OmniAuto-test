/**
 * 跨平台 postinstall 脚本
 *
 * 原始 postinstall 使用 `cp` 命令拷贝 applesimutils，仅在 macOS 可用，
 * 在 Linux/Windows CI 环境会导致 npm install 失败。
 * 本脚本仅在 macOS 上执行拷贝，其余平台静默跳过。
 */

// ---------- 本地配置文件自动生成 ----------
try {
  require("./setup-configs.js");
} catch (err) {
  console.warn("[postinstall] setup-configs 执行失败:", err.message);
}
// ------------------------------------------

const fs = require("fs");
const path = require("path");

// applesimutils 是 macOS 专用工具，非 macOS 环境直接退出
if (process.platform !== "darwin") {
  process.exit(0);
}

const src = path.join(__dirname, "..", "offline_library", "applesimutils");
const dest = path.join(__dirname, "..", "node_modules", ".bin", "applesimutils");

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log("[postinstall] Copied applesimutils to node_modules/.bin");
} else {
  console.warn("[postinstall] applesimutils not found in offline_library, skipping");
}
