const baseConfig = require('./base.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/mobile/**/*.spec.ts'],
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    platform: 'android'
  },
  // 使用 Detox 运行器
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  testEnvironment: 'detox/runners/jest/testEnvironment',
  // Detox reporter + 自定义 Allure reporter
  reporters: [
    'default',
    '<rootDir>/framework/reporters/detoxAllureReporter.ts',
    '<rootDir>/configs/jest/smokeReportReporter.js'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/framework/hooks/testLifecycle.ts'
  ],
  maxWorkers: 1
};
