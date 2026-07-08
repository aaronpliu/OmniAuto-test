/**
 * Smoke Report Types
 *
 * Data structures for mobile smoke test reporting.
 * Used by SmokeReportReporter to collect results and by
 * SmokeHtmlGenerator to produce the email-ready HTML report.
 */

export type SmokeTestStatus = "passed" | "failed" | "skipped";

export interface SmokeTestCase {
  /** Full test case name (e.g., "Mobile Login Tests should login successfully") */
  name: string;
  /** Test outcome */
  status: SmokeTestStatus;
  /** Epoch ms when the test started */
  startTime: number;
  /** Epoch ms when the test ended */
  endTime: number;
  /** Failure/error message (only present for failed tests) */
  failureMessage?: string;
}

export interface SmokeSummary {
  /** Total number of test cases */
  total: number;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Number of skipped/pending/disabled tests */
  skipped: number;
  /** Pass rate as a percentage (0-100) */
  passRate: number;
  /** Total duration in milliseconds */
  duration: number;
}

export interface SmokeReport {
  /** Test execution summary */
  summary: SmokeSummary;
  /** Individual test case results */
  testCases: SmokeTestCase[];
  /** Metadata */
  metadata: {
    /** Platform the tests ran on (e.g., "ios", "android") */
    platform: string;
    /** ISO timestamp of when the report was generated */
    timestamp: string;
    /** Environment name (e.g., "development", "staging") */
    environment: string;
  };
}
