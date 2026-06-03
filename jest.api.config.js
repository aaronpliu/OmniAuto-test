const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/api/**/*.spec.ts'],
  testEnvironment: 'allure-jest/node',
  setupFilesAfterSetup: ['<rootDir>/framework/hooks/apiSetup.ts']
};
