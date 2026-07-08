/**
 * Smoke HTML Report Generator
 *
 * Reads the smoke-report.json produced by SmokeReportReporter and generates
 * a self-contained HTML email template with inline CSS.
 *
 * Can be called:
 *   1. Programmatically from the reporter's onRunComplete()
 *   2. Standalone via: ts-node framework/reporters/smokeHtmlGenerator.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { SmokeReport } from "../types/smokeReport";
import { Logger } from "../utils/logger";

const logger = Logger.getInstance();

const RESULTS_DIR = join(process.cwd(), "artifacts", "smoke-results");

/**
 * Format milliseconds into a human-readable duration string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format an epoch timestamp into a locale time string.
 */
function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Return a status badge color based on test status.
 */
function statusColor(status: string): string {
  switch (status) {
    case "passed":
      return "#22c55e";
    case "failed":
      return "#ef4444";
    case "skipped":
      return "#f59e0b";
    default:
      return "#6b7280";
  }
}

/**
 * Generate a self-contained HTML smoke report from the JSON data.
 *
 * @param jsonPath - Path to smoke-report.json (defaults to artifacts/smoke-results/smoke-report.json)
 * @returns The path to the generated HTML file
 */
export function generateSmokeHtmlReport(
  jsonPath: string = join(RESULTS_DIR, "smoke-report.json")
): string {
  if (!existsSync(jsonPath)) {
    throw new Error(`Smoke report JSON not found: ${jsonPath}`);
  }

  const report: SmokeReport = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const { summary, testCases, metadata } = report;

  const testRows = testCases
    .map(
      (tc, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(tc.name)}</td>
        <td><span style="background:${statusColor(tc.status)};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${tc.status.toUpperCase()}</span></td>
        <td>${formatTime(tc.startTime)}</td>
        <td>${formatTime(tc.endTime)}</td>
        <td>${formatDuration(tc.endTime - tc.startTime)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mobile Smoke Test Report</title>
</head>
<body style="margin:0;padding:20px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:900px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:24px 32px;color:#fff;">
      <h1 style="margin:0;font-size:22px;font-weight:600;">Mobile Smoke Test Report</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">
        Platform: <strong>${escapeHtml(metadata.platform)}</strong> &nbsp;|&nbsp;
        Environment: <strong>${escapeHtml(metadata.environment)}</strong> &nbsp;|&nbsp;
        ${formatTime(new Date(metadata.timestamp).getTime())}
      </p>
    </div>

    <!-- Summary Cards -->
    <div style="display:flex;gap:16px;padding:24px 32px;flex-wrap:wrap;">
      <div style="flex:1;min-width:120px;background:#f9fafb;border-radius:6px;padding:16px;text-align:center;border:1px solid #e5e7eb;">
        <div style="font-size:28px;font-weight:700;color:#1e3a5f;">${summary.total}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Total</div>
      </div>
      <div style="flex:1;min-width:120px;background:#f0fdf4;border-radius:6px;padding:16px;text-align:center;border:1px solid #bbf7d0;">
        <div style="font-size:28px;font-weight:700;color:#16a34a;">${summary.passed}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Passed</div>
      </div>
      <div style="flex:1;min-width:120px;background:#fef2f2;border-radius:6px;padding:16px;text-align:center;border:1px solid #fecaca;">
        <div style="font-size:28px;font-weight:700;color:#dc2626;">${summary.failed}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Failed</div>
      </div>
      <div style="flex:1;min-width:120px;background:#fffbeb;border-radius:6px;padding:16px;text-align:center;border:1px solid #fde68a;">
        <div style="font-size:28px;font-weight:700;color:#d97706;">${summary.skipped}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Skipped</div>
      </div>
      <div style="flex:1;min-width:120px;background:#f9fafb;border-radius:6px;padding:16px;text-align:center;border:1px solid #e5e7eb;">
        <div style="font-size:28px;font-weight:700;color:#1e3a5f;">${summary.passRate}%</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Pass Rate</div>
      </div>
      <div style="flex:1;min-width:120px;background:#f9fafb;border-radius:6px;padding:16px;text-align:center;border:1px solid #e5e7eb;">
        <div style="font-size:28px;font-weight:700;color:#1e3a5f;">${formatDuration(summary.duration)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Duration</div>
      </div>
    </div>

    <!-- Test Cases Table -->
    <div style="padding:0 32px 32px;">
      <h2 style="font-size:16px;font-weight:600;color:#374151;margin-bottom:12px;">Test Cases</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;width:40px;">#</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;">Test Case Name</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;width:100px;">Status</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;width:160px;">Start Time</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;width:160px;">End Time</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;width:80px;">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${testRows}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
      Generated by OmniAuto Smoke Report &middot; ${formatTime(new Date(metadata.timestamp).getTime())}
    </div>

  </div>
</body>
</html>`;

  const htmlPath = join(RESULTS_DIR, "smoke-report.html");
  writeFileSync(htmlPath, html);
  return htmlPath;
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Allow standalone execution: ts-node framework/reporters/smokeHtmlGenerator.ts
if (require.main === module) {
  try {
    const htmlPath = generateSmokeHtmlReport();
    logger.info(`Smoke HTML report generated: ${htmlPath}`);
  } catch (err) {
    logger.error("Failed to generate smoke HTML report", err);
    process.exit(1);
  }
}
