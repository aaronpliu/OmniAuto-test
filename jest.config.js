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
  rootDir: __dirname,
  testMatch: ['<rootDir>/tests/**/*.e2e.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // jest does not read tsconfig `paths`; map them explicitly so @aliases resolve.
  moduleNameMapper: {
    '^@omni$': '<rootDir>/src/index.ts',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@contracts/(.*)$': '<rootDir>/src/contracts/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@configs/(.*)$': '<rootDir>/configs/$1',
    '^@adapters$': '<rootDir>/src/adapters/index.ts',
    '^@adapters/(.*)$': '<rootDir>/src/adapters/$1',
    '^@factory/(.*)$': '<rootDir>/src/factory/$1',
    '^@setup/(.*)$': '<rootDir>/src/setup/$1',
    '^@apps/(.*)$': '<rootDir>/apps/$1',
  },
  reporters: ['detox/runners/jest/reporter'],
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  testEnvironment: 'detox/runners/jest/testEnvironment',
};
