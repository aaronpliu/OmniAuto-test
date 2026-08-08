/**
 * Jest configuration for Detox E2E tests.
 *
 * Detox drives the test runner (it launches the app, simulator/emulator, then
 * invokes jest). `testEnvironment: 'node'` is required because the test process
 * talks to the device over a separate bridge — it is not a DOM/jsdom env.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.e2e.ts'],
  testTimeout: 120000,
  reporters: ['detox/runners/jest/streamlineReporter'],
  verbose: true,
};
