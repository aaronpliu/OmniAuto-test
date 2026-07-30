/**
 * 本地配置文件自动生成脚本
 *
 * 首次克隆项目时，被 Git 忽略的 *.config.local.js 不存在，
 * 本脚本自动将其从对应的 *.config.ci.js（CI 基线）复制生成。
 *
 * 触发时机：
 *   - start.sh install 安装依赖后自动调用
 *   - postinstall（npm install 后）自动调用
 *
 * 手动运行：
 *   node scripts/setup-configs.js
 */

const fs = require("fs");
const path = require("path");

const CONFIG_NAMES = ["mobile", "web", "api", "framework"];
const CONFIGS_DIR = path.join(__dirname, "..", "configs");

let createdCount = 0;
let skippedCount = 0;

for (const name of CONFIG_NAMES) {
  const localFile = path.join(CONFIGS_DIR, `${name}.config.local.js`);
  const ciFile = path.join(CONFIGS_DIR, `${name}.config.ci.js`);

  if (fs.existsSync(localFile)) {
    console.log(`[setup-configs] ${name}.config.local.js 已存在，跳过`);
    skippedCount++;
    continue;
  }

  if (!fs.existsSync(ciFile)) {
    console.warn(
      `[setup-configs] 警告: CI 基线 ${name}.config.ci.js 不存在，无法生成 ${name}.config.local.js`
    );
    continue;
  }

  try {
    fs.copyFileSync(ciFile, localFile);
    console.log(`[setup-configs] 已从 ${name}.config.ci.js 生成 ${name}.config.local.js`);
    createdCount++;
  } catch (err) {
    console.error(`[setup-configs] 复制 ${name}.config.ci.js 失败: ${err.message}`);
  }
}

if (createdCount > 0) {
  console.log(`[setup-configs] 共同完成 ${createdCount} 个本地配置文件生成`);
}
if (skippedCount > 0) {
  console.log(`[setup-configs] ${skippedCount} 个本地配置文件已存在，跳过`);
}
if (createdCount === 0 && skippedCount === 0) {
  console.log("[setup-configs] 无需生成任何本地配置文件");
}

// ---- plugins.json 自动生成 ----
const pluginsFile = path.join(CONFIGS_DIR, "plugins.json");
if (!fs.existsSync(pluginsFile)) {
  const defaultPlugins = {
    detox: { enabled: true },
    appium: { enabled: true },
    playwright: { enabled: true },
    api: { enabled: true },
  };
  try {
    fs.writeFileSync(pluginsFile, JSON.stringify(defaultPlugins, null, 2) + "\n");
    console.log("[setup-configs] 已生成 configs/plugins.json");
  } catch (err) {
    console.error(`[setup-configs] 生成 plugins.json 失败: ${err.message}`);
  }
} else {
  console.log("[setup-configs] configs/plugins.json 已存在，跳过");
}
