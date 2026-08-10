/**
 * Framework-agnostic smoke test reporter.
 *
 * Why not a Jest/wdio reporter? Smoke checks run under BOTH runners (Detox→Jest,
 * Appium→Mocha). A runner-specific reporter would have to be written twice and
 * wired into each runner config. This reporter is plain TS: any smoke case —
 * regardless of driver — records its outcome here, then {@link SmokeReporter.finish}
 * prints a unified summary and (optionally) writes a JSON artifact. That keeps
 * the smoke report identical across frameworks.
 */
import { Logger } from './logger';

const logger = Logger.getInstance();

export type SmokeStatus = 'passed' | 'failed' | 'skipped';

export interface SmokeCaseResult {
  name: string;
  status: SmokeStatus;
  durationMs: number;
  error?: string;
}

export interface SmokeSummary {
  cases: SmokeCaseResult[];
  passed: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  success: boolean;
  finishedAt: string;
}

export interface SmokeReporterOptions {
  /** Write a JSON report to this directory (created if missing). */
  reportDir?: string;
  /** Prefix for the JSON report file name. */
  reportName?: string;
}

export class SmokeReporter {
  private readonly cases: SmokeCaseResult[] = [];
  private readonly opts: SmokeReporterOptions;

  constructor(opts: SmokeReporterOptions = {}) {
    this.opts = opts;
  }

  /** Record a finished case. */
  record(name: string, status: SmokeStatus, durationMs: number, error?: unknown): void {
    const message = error instanceof Error ? error.message : String(error ?? '');
    this.cases.push({ name, status, durationMs, ...(message ? { error: message } : {}) });
  }

  /** Convenience: mark a case as skipped (e.g. not applicable on this platform). */
  skip(name: string): void {
    this.cases.push({ name, status: 'skipped', durationMs: 0 });
  }

  /** Finalize: print a summary and optionally persist a JSON report. */
  async finish(): Promise<SmokeSummary> {
    const passed = this.cases.filter((c) => c.status === 'passed').length;
    const failed = this.cases.filter((c) => c.status === 'failed').length;
    const skipped = this.cases.filter((c) => c.status === 'skipped').length;
    const totalDurationMs = this.cases.reduce((sum, c) => sum + c.durationMs, 0);
    const summary: SmokeSummary = {
      cases: this.cases,
      passed,
      failed,
      skipped,
      totalDurationMs,
      success: failed === 0,
      finishedAt: new Date().toISOString(),
    };

    this.printSummary(summary);
    if (this.opts.reportDir) {
      await this.writeJson(summary);
    }
    return summary;
  }

  private printSummary(s: SmokeSummary): void {
    const total = s.cases.length;
    const ms = (n: number) => `${Math.round(n)}ms`;
    logger.info('── Smoke report ─────────────────────────────');
    for (const c of s.cases) {
      const tag = c.status === 'passed' ? 'PASS' : c.status === 'failed' ? 'FAIL' : 'SKIP';
      const tail = c.status === 'skipped' ? '' : ` (${ms(c.durationMs)})`;
      const line = `[${tag}] ${c.name}${tail}`;
      if (c.status === 'failed') logger.error(line + (c.error ? ` — ${c.error}` : ''));
      else if (c.status === 'skipped') logger.warn(line);
      else logger.info(line);
    }
    logger.info('──────────────────────────────────────────────');
    logger.info(`Smoke: ${s.passed}/${total} passed, ${s.failed} failed, ${s.skipped} skipped, total ${ms(s.totalDurationMs)}`);
    if (!s.success) logger.error('Smoke run FAILED');
    else logger.info('Smoke run OK');
  }

  private async writeJson(s: SmokeSummary): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.resolve(this.opts.reportDir as string);
    fs.mkdirSync(dir, { recursive: true });
    const name = this.opts.reportName ?? 'smoke';
    const file = path.join(dir, `${name}-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(s, null, 2), 'utf8');
    logger.info(`Smoke report written: ${file}`);
  }
}

/**
 * Run a single smoke case and record its outcome on the reporter.
 * Returns the recorded result so callers can branch if needed.
 */
export async function runSmoke(
  name: string,
  fn: () => unknown | Promise<unknown>,
  reporter: SmokeReporter,
): Promise<SmokeCaseResult> {
  const start = Date.now();
  try {
    await fn();
    const result: SmokeCaseResult = { name, status: 'passed', durationMs: Date.now() - start };
    reporter.record(result.name, result.status, result.durationMs);
    return result;
  } catch (err) {
    const result: SmokeCaseResult = {
      name,
      status: 'failed',
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
    reporter.record(result.name, result.status, result.durationMs, result.error);
    return result;
  }
}
