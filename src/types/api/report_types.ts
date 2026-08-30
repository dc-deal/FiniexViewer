/** Single run entry from GET /api/v1/reports/runs — identity only, no report content */
export interface RunInfo {
  run_id: string
  // The run's category: 'single_runs' (a standalone simulation) | 'autotrader' (a live session) |
  // 'sweeps' (one combination of a parameter sweep). The index lists all three.
  group: string
  // False means the run exists as LOGS ONLY — every report route answers 404 for it. A normal
  // state, not a fault: a test session writes logs and no artifacts.
  has_reports: boolean
  name: string        // scenario-set name (simulation) | profile name (live)
}

/** Response type for GET /api/v1/reports/runs */
export interface RunListResponse {
  runs: RunInfo[]
  count: number
}

/** Run-wide KPIs for one account currency. Per currency so P&L-denominated fields never mix. */
export interface RunSummaryCurrency {
  currency: string
  net_pnl: number
  // null = undefined, not zero: a run without a losing trade has no profit factor
  profit_factor: number | null
  win_rate: number              // ratio 0..1, not a percentage
  max_drawdown: number          // positive magnitude in account currency; the sign is display
  total_fees: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  expectancy: number            // mean R — only meaningful when r_trade_count > 0
  // null when the matching subset is empty. Gate each on ITS OWN count: a run can have
  // R-defined trades with no winner among them, so r_trade_count alone is not enough.
  avg_win_r: number | null
  avg_loss_r: number | null
  r_trade_count: number
  r_win_count: number
  r_loss_count: number
}

/** Response type for GET /api/v1/reports/runs/{run_id}/run-summary */
export interface RunSummary {
  currencies: RunSummaryCurrency[]
  orders_sent: number
  orders_executed: number
  orders_rejected: number
  sl_tp_triggered: number
  unit_count: number              // simulation: N scenarios | live: 1
  // Weakest SIGNAL channel of the run. null = no SIGNAL worker was involved — deliberately
  // not 1.0, which would claim a perfect feed.
  signal_fresh_ratio: number | null
  disturbance_episode_count: number
  disturbance_stale_seconds: number
  disturbance_source_count: number
  disturbance_stress_injected: number
}

/**
 * One warning notice. Tier 1 ('major') is validator-produced and belongs in the report; tier 2
 * ('minor') is whatever sat at WARNING level in the log and is only summarised.
 */
export interface WarningRow {
  tier: string          // 'major' (tier 1, validator) | 'minor' (tier 2, log pot)
  scope: string         // 'run' (run-wide) | the name of a unit
  message: string
}

/**
 * One buffered log record, as it was recorded rather than as it was rendered. The two times are
 * different questions: `observed_at` is wall-clock and answers how long OUR machine took;
 * `event_time` is the run's own clock — simulated market time in a backtest, the live clock in a
 * session — and is null for entries that predate it. Never substitute one for the other: sorting
 * by observed_at looks right and is wrong.
 */
export interface LogEntryRow {
  level: string
  observed_at: string           // ISO-8601 with explicit timezone
  scope: string                 // the unit that logged it, '' when run-wide
  message: string
  event_time: string | null
}

/** Per-unit error record: the crash, the validation failures and the logged error pot. */
export interface UnitErrorRow {
  name: string
  symbol: string
  error_type: string          // '' when the unit did not crash
  error_message: string
  validation_errors: string[]
  logged_errors: LogEntryRow[]
  traceback: string           // '' when there is none
}

/** Run-level outcome, stamped once by the pipeline — no consumer re-derives a verdict from counts. */
export interface WarningsErrorsOutcome {
  // '' on artifacts written before the grading existed — absent, never a state
  run_outcome: string
  failed_count: number
  total_units: number
  failed_unit_names: string[]
  first_failure_name: string
  first_failure_error: string
  emergency_reason: string    // live villain
  shutdown_mode: string       // 'normal' | 'emergency'
}

/** Response type for GET /api/v1/reports/runs/{run_id}/warnings-errors */
export interface WarningsErrorsReport {
  warnings: WarningRow[]
  errors: UnitErrorRow[]
  outcome: WarningsErrorsOutcome
}

/**
 * One unit inside a run — a scenario in a simulation, the single profile in a live run. This is
 * the breakdown `run-summary` cannot show: its currency rows are already summed over all units.
 */
export interface PortfolioUnitRow {
  name: string
  symbol: string
  currency: string
  total_trades: number
  winning_trades: number
  losing_trades: number
  // Both are 0.0 on an untraded unit rather than null, so the render edge gates on total_trades
  win_rate: number              // ratio 0..1, not a percentage
  profit_factor: number | null
  total_profit: number
  total_loss: number            // positive magnitude
  net_profit: number
  max_drawdown: number          // positive magnitude
  max_dd_pct: number
  total_fees: number
  // Provenance. data_source carries the same broker keys GET /brokers returns ('mt5'), which is
  // what makes the jump into the chart possible; broker_name is a display name ('Kraken') and
  // is not addressable. Empty data_source on live runs — see viewer#21.
  data_source: string
  sentiment_source: string
  broker_name: string
  spot_mode: boolean
  has_error: boolean
  total_long_trades: number
  total_short_trades: number
  // Balances, per asset for spot units
  max_equity: number
  current_balance: number
  initial_balance: number
  conversion_rate: number | null
  base_currency: string
  quote_currency: string
  balances: Record<string, number>
  initial_balances: Record<string, number>
  last_price: number
  // Quote-denominated estimate of a spot base holding
  spot_est_current: number
  spot_est_initial: number
  spot_est_pnl: number
  spot_est_pnl_pct: number
  // Cost breakdown behind total_fees
  total_spread_cost: number
  total_commission: number
  total_swap: number
  maker_fee: number
  taker_fee: number
}

/** Run totals for one account currency — the units above, summed. */
export interface PortfolioAggregateRow {
  currency: string
  unit_count: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  profit_factor: number | null
  total_profit: number
  total_loss: number
  net_profit: number
  max_drawdown: number
  total_fees: number
}

/** Response type for GET /api/v1/reports/runs/{run_id}/portfolio */
export interface PortfolioReport {
  units: PortfolioUnitRow[]
  aggregates: PortfolioAggregateRow[]
}
