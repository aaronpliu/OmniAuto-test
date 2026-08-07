const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  testMatch: ["**/tests/mobile/**/*.spec.ts"],
  globalSetup: "<rootDir>/core/lifecycle/GlobalSetup.ts",
  setupFilesAfterEnv: [
    "<rootDir>/core/lifecycle/hooks/AppiumSetup.ts",
    "<rootDir>/core/lifecycle/TestLifecycle.ts",
  ],
  globalTeardown: "<rootDir>/core/lifecycle/GlobalTeardown.ts",
  forceExit: true,
  reporters: ["default", "<rootDir>/configs/jest/smokeReportReporter.js"],
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    platform: "ios",
  },
};
