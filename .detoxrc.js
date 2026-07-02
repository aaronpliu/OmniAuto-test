/**
 * Detox CLI 配置入口
 *
 * 此文件从 configs/mobile.config.js 统一配置中提取 detox 配置段，
 * 保持 Detox CLI 所需的完整结构（apps / devices / configurations / behavior / cli）。
 *
 * 修改 Detox 配置请编辑 configs/mobile.config.js 的 detox 区块，不要直接修改此文件。
 */

const mobileConfig = require('./configs/mobile.config.js');

module.exports = mobileConfig.detox;
