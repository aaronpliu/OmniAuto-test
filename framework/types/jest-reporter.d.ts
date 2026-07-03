/**
 * 补充 jest 命名空间中缺失的 Reporter 相关类型。
 *
 * @types/jest@29.x 移除了 Reporter/Test/TestResult/Context/AggregatedResult，
 * 改由 @jest/reporters 和 @jest/test-result 包提供。
 * 本声明通过 declaration merging 将这些类型重新注入 jest 全局命名空间，
 * 使 framework/reporters/detoxAllureReporter.ts 中的 `jest.Reporter` 等引用可正确解析。
 *
 * 类型直接引用 @jest 包的真实定义，确保类型安全。
 */
declare namespace jest {
  /** Jest 自定义 Reporter 接口（@jest/reporters.Reporter） */
  type Reporter = import("@jest/reporters").Reporter;

  /** 测试文件（onTestStart / onTestResult 第一参数） */
  type Test = import("@jest/test-result").Test;

  /** 测试上下文（onRunComplete 第一参数，对应 @jest/test-result.TestContext） */
  type Context = import("@jest/test-result").TestContext;

  /** 文件级测试结果（onTestResult 第二参数，含 testFilePath 和 testResults） */
  type TestResult = import("@jest/test-result").TestResult;

  /** 整个运行的聚合结果（onRunComplete 第二参数） */
  type AggregatedResult = import("@jest/test-result").AggregatedResult;
}
