export interface TestContext {
  testId: string;
  testName: string;
  platform: string;
  startTime: Date;
  metadata: Record<string, any>;
}

export interface TestResult {
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: Error;
  screenshots: string[];
}
