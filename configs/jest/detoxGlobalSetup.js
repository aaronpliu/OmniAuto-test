/**
 * Detox Global Setup Wrapper
 *
 * Detox 测试的全局初始化入口。
 * 委托给 core/lifecycle/GlobalSetup 执行框架级初始化。
 */
const globalSetup = require("../../core/lifecycle/GlobalSetup").default;

module.exports = globalSetup;
