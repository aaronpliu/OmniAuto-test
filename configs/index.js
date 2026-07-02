/**
 * 统一配置聚合入口
 *
 * 汇总所有模式的配置文件，提供单一 require 入口。
 * 环境配置（environments/*.json）由 ConfigManager 按需加载，不在此聚合。
 *
 * 用法：
 *   const { mobile, web, api, framework } = require('./configs');
 */
const mobile = require('./mobile.config.js');
const web = require('./web.config.js');
const api = require('./api.config.js');
const framework = require('./framework.config.js');

module.exports = {
  mobile,
  web,
  api,
  framework
};
