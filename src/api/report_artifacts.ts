import type { RunInfo } from '@/types/api/report_types'

/**
 * Which file a report section is served from.
 *
 * The run index lists every artifact a run actually persisted, and **the two pipelines write
 * DIFFERENT sets** — an AutoTrader session has no `scenario_details`, `profiling`, `run_meta` or
 * `aggregated_portfolio`, while only a session writes `safety`. The backend states this
 * plainly and tells consumers to read `artifacts` rather than guess; a client that guesses gets a
 * 404 for the difference.
 *
 * Measured here 2026-09-28 over the 40 runs on this machine: `scenario_details.json` is present on
 * 15 of 16 backtests and on 0 of 24 AutoTrader sessions. Asking anyway produced one wasted request
 * per session AND a notice claiming a section was missing, where the truth is that this kind of run
 * does not have one.
 *
 * Two sections are deliberately absent from this map. `config` is not an artifact of the run at
 * all but the SOURCE configuration, named by `config_snapshot`, with its own two 404s. And
 * `run-summary` is load-bearing: the whole run view gates on whether it arrived, so suppressing
 * the request would suppress a signal the view needs. Both pipelines write it in any case.
 */
export const SECTION_ARTIFACTS: Record<string, string> = {
  warningsErrors: 'warnings_errors.json',
  portfolio: 'portfolio.json',
  broker: 'broker.json',
  aggregated: 'aggregated_portfolio.json',
  bookingPeriods: 'booking_periods.json',
  tradeHistory: 'trade_history.json',
  scenarios: 'scenario_details.json',
}

/**
 * Does this run carry the section's artifact?
 *
 * A run whose `artifacts` list is EMPTY is answered `true`: an empty list means the run wrote
 * nothing at all — logs only, or still running — and that case is already handled one level up by
 * `has_reports`. Reading it as "no section has its file" here would silently suppress the absence
 * notices a half-written run should produce.
 *
 * An unmapped section is also `true`, so adding a getter without a map entry fails loudly with the
 * backend's own 404 rather than silently never being requested.
 */
export function hasArtifact(run: RunInfo, section: string): boolean {
  const file = SECTION_ARTIFACTS[section]
  if (!file || !run.artifacts.length) return true
  return run.artifacts.includes(file)
}
