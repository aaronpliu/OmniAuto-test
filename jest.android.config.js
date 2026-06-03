const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/mobile/**/*.spec.ts'],
  setupFilesAfterSetup: [
    '<rootDir>/framework/hooks/globalSetup.ts',
    '<rootDir>/framework/hooks/appiumSetup.ts'
  ],
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    platform: 'android'
  }
};
