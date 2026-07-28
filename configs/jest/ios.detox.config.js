const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  testMatch: ["**/tests/mobile/**/*.spec.ts"],
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    platform: "ios",
  },
  globalSetup: "<rootDir>/framework/hooks/detoxGlobalSetup.js",
  globalTeardown: "<rootDir>/framework/hooks/detoxGlobalTeardown.js",
  testEnvironment: "detox/runners/jest/testEnvironment",
  // Detox reporter + 自定义 Allure reporter
  reporters: [
    "default",
    "<rootDir>/framework/reporters/detoxAllureReporter.ts",
    "<rootDir>/configs/jest/smokeReportReporter.js",
  ],
  setupFilesAfterEnv: ["<rootDir>/framework/hooks/testLifecycle.ts"],
  maxWorkers: 1,
};
