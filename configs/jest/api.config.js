const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  testMatch: ["**/tests/api/**/*.spec.ts"],
  testEnvironment: "allure-jest/node",
  globalSetup: "<rootDir>/framework/hooks/globalSetup.ts",
  globalTeardown: "<rootDir>/framework/hooks/globalTeardown.ts",
  setupFilesAfterEnv: ["<rootDir>/framework/hooks/apiSetup.ts"],
};
