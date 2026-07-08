const baseConfig = require('./base.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/api/**/*.spec.ts'],
  testEnvironment: 'allure-jest/node',
  setupFilesAfterEnv: ['<rootDir>/framework/hooks/apiSetup.ts']
};
