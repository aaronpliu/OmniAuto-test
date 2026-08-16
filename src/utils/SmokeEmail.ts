/**
 * Smoke report → HTML + email.
 *
 * Two independent pieces so they can be used separately:
 *  - {@link renderSmokeHtml}: turns a {@link SmokeSummary} into a self-contained
 *    HTML string (inline styles, no external assets) suitable for a file OR for
 *    embedding in an email body.
 *  - {@link sendSmokeReport}: writes that HTML to `REPORT_DIR`, then (if SMTP is
 *    configured) emails it. Email is best-effort: misconfiguration logs a warning
 *    and returns `false` rather than failing the smoke run.
 *
 * `nodemailer` is lazy-required so the HTML rendering path works in environments
 * without the dependency installed.
 */
import type { SmokeSummary } from "./SmokeReporter";
import { Logger } from "./logger";

const logger = Logger.getInstance();

/** Escape a string for safe interpolation inside HTML text/attribute context. */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STATUS_COLOR: Record<string, string> = {
  passed: "#1a7f37",
  failed: "#cf222e",
  skipped: "#9a6700",
};

const STATUS_LABEL: Record<string, string> = {
  passed: "PASS",
  failed: "FAIL",
  skipped: "SKIP",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Render a smoke summary as a self-contained HTML document.
 * Inline styles only — renders correctly in email clients and browsers.
 */
export function renderSmokeHtml(summary: SmokeSummary): string {
  const total = summary.cases.length;
  const bannerColor = summary.success ? "#1a7f37" : "#cf222e";
  const bannerText = summary.success ? "PASSED" : "FAILED";

  const rows = summary.cases
    .map((c) => {
      const color = STATUS_COLOR[c.status] ?? "#57606a";
      const label = STATUS_LABEL[c.status] ?? c.status.toUpperCase();
      const tail =
        c.status === "skipped"
          ? ""
          : `<span style="color:#57606a">${formatDuration(c.durationMs)}</span>`;
      const error = c.error
        ? `<tr><td colspan="3" style="padding:2px 10px 10px;color:#cf222e;font-family:monospace;font-size:12px;white-space:pre-wrap">${escapeHtml(
            c.error
          )}</td></tr>`
        : "";
      return `
        <tr>
          <td style="padding:8px 10px;border-top:1px solid #e1e4e8;font-weight:600;color:${color}">${label}</td>
          <td style="padding:8px 10px;border-top:1px solid #e1e4e8">${escapeHtml(c.name)}</td>
          <td style="padding:8px 10px;border-top:1px solid #e1e4e8;text-align:right">${tail}</td>
        </tr>
        ${error}`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Smoke Report</title>
</head>
<body style="margin:0;background:#f6f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24292f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e1e4e8;border-radius:8px;overflow:hidden">
        <tr>
          <td style="background:${bannerColor};color:#ffffff;padding:18px 24px;font-size:20px;font-weight:700">
            Smoke Test Report — ${bannerText}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#57606a">
              <tr>
                <td style="padding:2px 0"><strong>Finished:</strong> ${escapeHtml(summary.finishedAt)}</td>
              </tr>
              <tr>
                <td style="padding:2px 0"><strong>Result:</strong>
                  <span style="color:${bannerColor};font-weight:700">${summary.passed}/${total} passed</span>,
                  ${summary.failed} failed, ${summary.skipped} skipped
                </td>
              </tr>
              <tr>
                <td style="padding:2px 0"><strong>Total duration:</strong> ${formatDuration(summary.totalDurationMs)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 20px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e1e4e8;border-radius:6px;font-size:14px">
              <thead>
                <tr style="background:#f6f8fa">
                  <th style="padding:8px 10px;text-align:left;font-size:12px;text-transform:uppercase;color:#57606a">Status</th>
                  <th style="padding:8px 10px;text-align:left;font-size:12px;text-transform:uppercase;color:#57606a">Case</th>
                  <th style="padding:8px 10px;text-align:right;font-size:12px;text-transform:uppercase;color:#57606a">Duration</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="3" style="padding:12px 10px;color:#57606a">No cases recorded.</td></tr>`}
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 24px;background:#f6f8fa;color:#8c959f;font-size:11px;border-top:1px solid #e1e4e8">
            Generated by OmniAutoTest smoke reporter. This is an automated message — do not reply.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface SendSmokeReportOptions {
  /** Directory to write the HTML report into (defaults to env.REPORT_DIR). */
  reportDir?: string;
  /** File name for the HTML report (without extension). */
  reportName?: string;
  /** Skip writing the HTML file (e.g. when the caller already wrote it). */
  skipWrite?: boolean;
}

/**
 * Persist the HTML report and email it if SMTP is configured.
 *
 * Returns `true` if an email was attempted and accepted by the transport,
 * `false` otherwise (no config, or send failed). Failures are logged, never thrown,
 * so callers in a smoke run don't fail the suite on email issues.
 */
export async function sendSmokeReport(
  summary: SmokeSummary,
  opts: SendSmokeReportOptions = {}
): Promise<boolean> {
  const html = renderSmokeHtml(summary);

  // Always write the HTML artifact when a directory is available.
  const dir = opts.reportDir ?? process.env.REPORT_DIR;
  if (dir && !opts.skipWrite) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const resolved = path.resolve(dir);
      fs.mkdirSync(resolved, { recursive: true });
      const name = opts.reportName ?? "smoke";
      const file = path.join(resolved, `${name}-${Date.now()}.html`);
      fs.writeFileSync(file, html, "utf8");
      logger.info(`Smoke HTML report written: ${file}`);
    } catch (err) {
      logger.warn(`Failed to write HTML report: ${(err as Error).message}`);
    }
  }

  const apiUrl = process.env.SMOKE_REPORT_API_URL;
  const recipients = process.env.SMOKE_REPORT_RECIPIENTS;
  const from = process.env.SMOKE_REPORT_FROM;
  if (!apiUrl || !recipients || !from) {
    logger.info(
      "Smoke email API not fully configured (SMOKE_REPORT_API_URL/SMOKE_REPORT_RECIPIENTS/SMOKE_REPORT_FROM); skipping email."
    );
    return false;
  }

  try {
    const subject = `${process.env.SMOKE_REPORT_SUBJECT ?? "OmniAuto Smoke Report"} — ${
      summary.success ? "PASSED" : "FAILED"
    }`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SMOKE_REPORT_API_TOKEN
          ? { Authorization: `Bearer ${process.env.SMOKE_REPORT_API_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        to: recipients
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean),
        from,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      logger.warn(`Smoke report API responded ${res.status} ${res.statusText}`);
      return false;
    }
    logger.info(`Smoke report emailed to ${recipients} via ${apiUrl}`);
    return true;
  } catch (err) {
    logger.warn(`Failed to send smoke report email: ${(err as Error).message}`);
    return false;
  }
}
