/**
 * mock App 定位器统一出口。
 *
 * 页面对象一律从本文件导入而不是直接引具体文件 ——
 * 将来拆分/合并 locator 文件时，只需维护这里的再导出，
 * 上层 Page / Workflow / 用例一行都不用改。
 */
export { loginLocators } from './login.locators';
export { homeLocators, tabBarLocators } from './home.locators';
export { profileLocators } from './profile.locators';
