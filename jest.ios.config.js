const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/mobile/**/*.spec.ts'],
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    platform: 'ios'
  },
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  testEnvironment: 'detox/runners/jest/testEnvironment',
  maxWorkers: 1
};