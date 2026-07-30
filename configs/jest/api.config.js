const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  testMatch: ["**/tests/api/**/*.spec.ts"],
  testEnvironment: "allure-jest/node",
  globalSetup: "<rootDir>/core/lifecycle/GlobalSetup.ts",
  globalTeardown: "<rootDir>/core/lifecycle/GlobalTeardown.ts",
  setupFilesAfterEnv: ["<rootDir>/core/lifecycle/hooks/ApiSetup.ts"],
};
