const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/mobile/**/*.spec.ts'],
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    platform: 'ios'
  }
};