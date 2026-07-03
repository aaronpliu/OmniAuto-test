/**
 * Commitlint 配置
 * 强制 Conventional Commits 规范：type(scope): subject
 * type 可选: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
};
