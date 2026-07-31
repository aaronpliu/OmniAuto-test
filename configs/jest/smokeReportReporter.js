/**
 * Smoke Report Reporter – JS bootstrap
 *
 * Detox loads reporter files through Node's ESM resolver, which cannot
 * resolve bare `.ts` imports (e.g. `../types/smokeReport`). This thin
 * CommonJS bootstrap registers ts-node first so that all subsequent
 * require() calls for `.ts` files are handled correctly, then re-exports
 * the actual TypeScript reporter.
 *
 * The Jest config points to this file instead of the .ts source directly.
 */
require("ts-node/register/transpile-only");

module.exports = require("../../core/reporting/SmokeReportReporter").default;
