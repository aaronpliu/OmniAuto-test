module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'allure-jest/node',
  testEnvironmentOptions: {
    resultsDir: 'artifacts/allure-results'
  },
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleNameMapper: {
    '^@framework/(.*)$': '<rootDir>/framework/$1',
    '^@applications/(.*)$': '<rootDir>/applications/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    '^@configs/(.*)$': '<rootDir>/configs/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/framework/hooks/globalSetup.ts'],
  reporters: [
    'default'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  testTimeout: 120000,
  verbose: true
};
