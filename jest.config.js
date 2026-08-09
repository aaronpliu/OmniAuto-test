/**
 * Jest configuration for Detox E2E tests.
 *
 * Detox drives the test runner (it launches the app, simulator/emulator, then
 * invokes jest). `testEnvironment: 'node'` is required because the test process
 * talks to the device over a separate bridge — it is not a DOM/jsdom env.
 */
module.exports = {
  maxWorkers: 1,
  testTimeout: 120000,
  verbose: true,
  testMatch: ['<rootDir>/tests/**/*.e2e.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  reporters: ['detox/runners/jest/reporter'],
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  testEnvironment: 'detox/runners/jest/testEnvironment',
};
