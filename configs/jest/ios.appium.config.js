const baseConfig = require('./base.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/mobile/**/*.spec.ts'],
  globalSetup: '<rootDir>/framework/hooks/globalSetup.ts',
  setupFilesAfterEnv: [
    '<rootDir>/framework/hooks/appiumSetup.ts',
    '<rootDir>/framework/hooks/testLifecycle.ts'
  ],
  globalTeardown: '<rootDir>/framework/hooks/globalTeardown.ts',
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    platform: 'ios'
  }
};
