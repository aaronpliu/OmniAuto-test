#!/usr/bin/env tsx
/**
 * Send the most recent smoke report by email.
 *
 * Reads the latest smoke JSON artifact from REPORT_DIR (written by
 * SmokeReporter.finish when REPORT_DIR is set), renders an HTML report, writes
 * it next to the JSON, and emails it if SMTP is configured.
 *
 *   REPORT_DIR=reports/mock/smoke npm run report:email
 *
 * Exit code is 0 whether or not the email sent (email is best-effort). The JSON
 * artifact is the source of truth; this script only renders + delivers it.
 */
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { env } from "../configs/env";
import type { SmokeSummary } from "../src/utils/SmokeReporter";
import { sendSmokeReport } from "../src/utils/SmokeEmail";

async function main(): Promise<void> {
  const dir = resolve(env.REPORT_DIR);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    console.error(`[report:email] no REPORT_DIR found at ${dir}`);
    process.exit(1);
    return;
  }
  if (files.length === 0) {
    console.error(`[report:email] no smoke JSON artifacts in ${dir}`);
    process.exit(1);
    return;
  }

  // Latest by file name (includes a timestamp suffix).
  files.sort();
  const latest = files[files.length - 1]!;
  const summary = JSON.parse(readFileSync(join(dir, latest), "utf8")) as SmokeSummary;
  console.log(`[report:email] loaded ${latest} (${summary.passed}/${summary.cases.length} passed)`);

  const sent = await sendSmokeReport(summary, { reportDir: dir, reportName: "smoke" });
  console.log(sent ? "[report:email] email sent" : "[report:email] email skipped (see logs)");
}

main().catch((err) => {
  console.error("[report:email] fatal:", err);
  process.exit(1);
});
