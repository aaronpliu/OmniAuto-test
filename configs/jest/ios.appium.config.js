const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  testMatch: ["**/tests/mobile/**/*.spec.ts"],
  globalSetup: "<rootDir>/framework/hooks/globalSetup.ts",
  setupFilesAfterEnv: [
    "<rootDir>/framework/hooks/appiumSetup.ts",
    "<rootDir>/framework/hooks/testLifecycle.ts",
  ],
  globalTeardown: "<rootDir>/framework/hooks/globalTeardown.ts",
  forceExit: true,
  reporters: ["default", "<rootDir>/configs/jest/smokeReportReporter.js"],
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    platform: "ios",
  },
};
