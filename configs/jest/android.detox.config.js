const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  testMatch: ["**/tests/mobile/**/*.spec.ts"],
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    platform: "android",
  },
  globalSetup: "<rootDir>/configs/jest/detoxGlobalSetup.js",
  globalTeardown: "<rootDir>/configs/jest/detoxGlobalTeardown.js",
  testEnvironment: "detox/runners/jest/testEnvironment",
  // Detox reporter + 自定义 Allure reporter
  reporters: [
    "default",
    "<rootDir>/plugins/detox/reporters/DetoxAllureReporter.ts",
    "<rootDir>/configs/jest/smokeReportReporter.js",
  ],
  setupFilesAfterEnv: ["<rootDir>/core/lifecycle/TestLifecycle.ts"],
  maxWorkers: 1,
};
