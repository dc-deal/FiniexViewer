/** Single run entry from GET /api/v1/reports/runs — identity only, no report content */
export interface RunInfo {
  run_id: string
  group: string       // 'scenario_sets' (simulation) | 'autotrader' (live)
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
