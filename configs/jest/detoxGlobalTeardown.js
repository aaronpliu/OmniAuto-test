/**
 * Detox Global Teardown Wrapper
 *
 * Detox 测试的全局清理入口。
 * 委托给 core/lifecycle/GlobalTeardown 执行框架级清理。
 */
const globalTeardown = require("../../core/lifecycle/GlobalTeardown").default;

module.exports = globalTeardown;
