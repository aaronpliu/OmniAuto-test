const path = require('path');

/**
 * Jest 基础配置
 *
 * 所有平台子配置（ios.detox / ios.appium / android.appium / android.detox / api）
 * 均通过 require('./base.config') 继承此配置。
 *
 * rootDir 显式指向项目根目录（configs/jest/ 的上两级），
 * 确保 <rootDir>/tests、<rootDir>/framework/... 等路径在迁移后仍然正确。
 */
module.exports = {
  rootDir: path.resolve(__dirname, '../..'),
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
