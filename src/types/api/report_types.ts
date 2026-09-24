/** Single run entry from GET /api/v1/reports/runs — identity only, no report content */
export interface RunInfo {
  run_id: string
  // The PIPELINE that produced the run: 'simulation' | 'live'. Nesting is not in here — it is
  // parent_id. The two axes were briefly one field ('single_runs' | 'sweeps' | 'autotrader') and
  // that could not express a nested live run, which is what split them.
  group: string
  /**
   * The artifact files this run carries. The set VARIES, and not only between the pipelines: live
   * omits scenario_details / profiling / run_meta / aggregated_portfolio, and a simulation writes
   * extra sections only when it has something to say (robustness, block splitting). So never
   * assume a set from the pipeline or from a count observed in one archive — read this list. It
   * says which sections exist and costs no request: it rides on the index row.
   */
  artifacts: string[]
  // Derived from `artifacts` being non-empty, so the two cannot disagree. False means the run
  // exists as LOGS ONLY and every report route answers 404 — a normal state, not a fault.
  has_reports: boolean
  name: string        // scenario-set name (simulation) | profile name (live)
  start_time: string  // ISO-8601 UTC, from the run header
  /**
   * The family this run belongs to, or null for a top-level run in either pipeline. One field,
   * TWO kinds of parent — and `parent_kind` below now SAYS which, so nothing here infers it:
   *
   *   sweep        a COMBINATION of a parameter sweep. The siblings are alternatives,
   *                contemporaneous and comparable, so ranking them is the point.
   *   deployment   a SESSION of a live deployment. The siblings are a sequence of sealed slices
   *                of one bot's life, ordered by start_time; ranking them would be meaningless.
   *                The id addresses GET /api/v1/deployments/{id} directly.
   */
  parent_id: string | null
  // What kind of family parent_id names, null whenever parent_id is. Read this rather than
  // deriving it from `group`: the two axes were one field once and could not express both.
  parent_kind: string | null
  // Content hash of the configuration the run was produced from — two runs sharing it were
  // produced by the same stand, which is what `changed` on a deployment is derived from.
  config_id: string
  // Whether the run was expected to report at all; 'expected' on a normal run
  reporting: string
  // Size of the run's artifact directory in bytes
  size_bytes: number
  // Provenance, straight from the header
  app_version: string
  git_commit: string
  config_snapshot: string
}

/** Response type for GET /api/v1/reports/runs */
export interface RunListResponse {
  // What makes one row unique, declared by the backend rather than assumed here. An unordered
  // list of objects says nothing about its own identity, and a consumer keying on the obvious
  // field folds two rows into one — silently, and in the direction that loses data.
  key: string[]
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
  /**
   * Was `max_drawdown` until contract 2. The deepest decline of the ACCOUNT, as a magnitude —
   * distinct from a booking period's own decline, which is why the name carries the scope.
   */
  account_max_drawdown: number
  // ALREADY a percentage: 3.47 means 3.47 %. `_pct` is a rule and holds everywhere; `_rate` and
  // `_ratio` are NOT one and are read per field. Never pass this to the ratio formatter.
  account_max_dd_pct: number
  max_equity: number
  total_fees: number
  gross_profit: number
  gross_loss: number            // positive magnitude
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
  // Open at the end of the run: stock read at an instant, not flow derived from records. The two
  // differ by exactly the unrealised movement, so neither substitutes for the other.
  unrealized_pnl: number
  final_equity: number
  open_position_count: number
  // Excursion statistics — how far a trade ran against and in favour before it closed
  avg_mae_winners: number
  avg_mae_losers: number
  avg_mfe_losers: number
  largest_mae: number
  largest_mfe: number
  avg_trade_duration_s: number
  max_consecutive_wins: number
  max_consecutive_losses: number
}

/** Response type for GET /api/v1/reports/runs/{run_id}/run-summary */
export interface RunSummary {
  run_id: string                  // the run this body was built from — assert it, never assume it
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
  // Live-only. '' on a simulation run means NOT APPLICABLE rather than unknown. It is DETAIL and
  // never a verdict: 'emergency' is alarming only when run_outcome is 'failed', because an
  // operator stopping a healthy session with Ctrl+C produces the same value.
  shutdown_mode: string       // 'normal' | 'emergency'
  // Resolves that ambiguity — but it is newer than most artifacts, which default it to false, so
  // it cannot be trusted on an older one. Mirrored, deliberately not rendered.
  operator_interrupted: boolean
}

/** Response type for GET /api/v1/reports/runs/{run_id}/warnings-errors */
export interface WarningsErrorsReport {
  run_id: string
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
  // Renamed in contract 2, from max_drawdown / max_dd_pct. Magnitude, and `_pct` is ALREADY a
  // percentage — see the same pair on RunSummaryCurrency.
  account_max_drawdown: number
  account_max_dd_pct: number
  /**
   * Where the decline is measured FROM. A live deployment carries its peak across restarts, so
   * the figure is not about this run alone: `drawdown_restarts` counts how many sessions it has
   * survived, and the two stamps say which stretch it spans.
   */
  drawdown_started_at: string
  drawdown_carried_from: string
  drawdown_restarts: number
  total_fees: number
  // Provenance. data_source carries the same broker keys GET /brokers returns ('mt5'), which is
  // what makes the jump into the chart possible; broker_name is a display name ('Kraken') and
  // is not addressable. Filled on both pipelines since the live path threads it through.
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
  // Funds pledged against open orders, and what is left to trade with
  committed_funds: Record<string, number>
  usable_funds: Record<string, number>
  last_price: number
  /**
   * Open at the close of the run. `final_equity_valued` says whether the valuation succeeded — an
   * equity figure that could not be marked is not the same as one that came out at zero.
   * `open_positions` is on the wire as well and deliberately not mirrored yet: it needs a type of
   * its own, and no panel reads it.
   */
  unrealized_pnl: number
  final_equity: number
  final_equity_valued: boolean
  session_end_policy: string
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
  // Renamed in contract 2, like its per-unit twin. `_pct` is already a percentage.
  account_max_drawdown: number
  account_max_dd_pct: number
  max_equity: number
  total_fees: number
  unrealized_pnl: number
  final_equity: number
  open_position_count: number
}

/** Response type for GET /api/v1/reports/runs/{run_id}/portfolio */
export interface PortfolioReport {
  run_id: string
  units: PortfolioUnitRow[]
  aggregates: PortfolioAggregateRow[]
}

/**
 * One booking period of one unit — the stretch between two bookkeeping closes. `reason` says why
 * it closed: 'anchor' (a trading-day boundary), 'session_end', 'manual'.
 */
export interface BookingPeriodRow {
  unit_name: string
  // A per-BOT counter, not a per-run one: it restarts wherever a session wrote no carry-over
  // floor, so two periods of one deployment can both be number 1. Never a key on its own.
  segment_no: number
  opened_at: string             // ISO-8601 with explicit timezone
  closed_at: string
  reason: string
  currency: string
  trade_count: number
  net_pnl: number
  total_fees: number
  win_rate: number              // ratio 0..1, not a percentage
  // null = undefined rather than zero, as everywhere: a period without a losing trade has none
  profit_factor: number | null
  final_equity: number
  min_equity: number
  max_equity: number
  /**
   * Sign is NOT reliable across the archive. The backend aligned this to a magnitude, but stored
   * artifacts written before that keep the negative form and nothing in the payload distinguishes
   * them. Rendered as a magnitude for that reason — a decline is a decline, so no information is
   * lost by dropping a sign that means nothing here.
   */
  max_drawdown: number
}

/**
 * Response type for GET /api/v1/reports/runs/{run_id}/booking-periods — ONE account currency per
 * response. The closing figures are a CHECK, not a footer, and what they check is COMPLETENESS:
 * `total_*` are summed over the periods, `run_*` are the run's own counters, and both descend
 * from a single value handed to two carriers. A disagreement therefore means a record was LOST on
 * the way — evicted by a history cap, falling in no period's window — and can never mean the P&L
 * is wrong: an arithmetic defect moves both figures together and the check stays green.
 */
export interface BookingPeriodsReport {
  run_id: string
  key: string[]
  periods: BookingPeriodRow[]
  // the currency the totals below are about
  currency: string
  // EVERY account currency the run booked, including `currency` above. Empty on an artifact
  // written before the field existed — an absence, not a run that booked in one currency.
  currencies: string[]
  total_net_pnl: number
  total_fees: number
  total_trades: number
  // null when the run reports no figure in this currency — which is also when the check did not
  // run. Defaulting these to 0.0 once let a small period sum "agree" with a number never reported.
  run_net_pnl: number | null
  run_total_trades: number | null
  /**
   * Three-state, and null is not a pass:
   *   true   the periods account for the run's figure
   *   false  they do not — a FINDING, surfaced, never hidden
   *   null   the run reports nothing in this currency, so the check DID NOT RUN
   * A missing check renders as loudly as a failed one; a tick would claim evidence that is absent.
   */
  reconciles: boolean | null
  deepest_period_drawdown: number
  final_equity: number
}

/**
 * The strategy a run was commissioned with. Mirrored as an interface — unlike the configuration
 * around it — because these four keys are the FRAMEWORK's own composition model rather than
 * something an operator writes: `worker_factory.py` reads `worker_instances` and `workers` by
 * exactly these names, and both pipelines carry the same four.
 *
 * What hangs UNDER them stays open. `decision_logic_config` holds whatever the chosen logic
 * declares — RSI and Bollinger thresholds in one run, a scripted trade sequence in another — and
 * a worker's parameters belong to that worker. Mirror what the framework guarantees; leave open
 * what the operator authors.
 */
export interface StrategyConfig {
  decision_logic_type: string
  decision_logic_config: Record<string, unknown>
  /** Instance name -> worker type, e.g. `rsi_fast` -> `CORE/rsi`. */
  worker_instances: Record<string, string>
  /** Instance name -> that instance's parameters. Same keys as `worker_instances`. */
  workers: Record<string, Record<string, unknown>>
}

/**
 * Response type for GET /api/v1/reports/runs/{run_id}/config — the configuration a run was
 * commissioned with, resolved from the run-config store through the run's `config_id`.
 *
 * `config` is deliberately NOT mirrored, and that is a considered exception to the typing rule
 * rather than a lapse: this document is written by the OPERATOR, its shape differs between the two
 * pipelines (an autotrader profile against a scenario set), and it grows a new branch whenever
 * someone writes a new strategy. An interface for it would be a claim the type-checker then
 * enforces against reality.
 *
 * `config_snapshot` is the SOURCE file name, not a file inside the run directory — the per-run
 * copy was retired once the store existed. The content arrives parsed and NORMALISED (sorted
 * keys), so the order here is not the order its author wrote.
 */
export interface RunConfigReport {
  run_id: string
  config_snapshot: string
  config_id: string
  config: Record<string, unknown>
}

/** One fill behind a trade's entry or exit — a position can be opened in several pieces. */
export interface TradeExecution {
  trade_id: string
  side: string
  volume: number
  price: number
  fee: number
  fee_currency: string
  liquidity: string        // 'maker' | 'taker'
  timestamp: string
}

/**
 * One closed position, as it happened. The only place individual trades exist — every other
 * section of a run is already summed over them.
 *
 * MAE and MFE are the worst and best the position ever stood at while it was open, which is a
 * different question from how it ended: a trade closed at −17 that stood at −104 on the way was
 * a different trade from one that never moved. Each is given three ways — as a PRICE, as the
 * unrealised P&L at that price, and as a distance in `price_unit`.
 */
export interface TradeRow {
  position_id: string
  symbol: string
  direction: string        // 'long' | 'short'
  lots: number
  entry_price: number
  entry_time: string
  exit_price: number
  exit_time: string
  duration_s: number
  // '' where the close was not attributed — an absence, never rendered as a state
  close_reason: string
  gross_pnl: number
  total_fees: number
  net_pnl: number
  currency: string
  // the three halves of total_fees
  swap_cost: number
  commission_cost: number
  spread_cost: number
  /**
   * Maximum ADVERSE excursion. `mae_pnl` arrives signed while the analytics block's `largest_mae`
   * carries the magnitude of the same number — so the sign says nothing the name has not already
   * said, and the render edge drops it.
   */
  mae_price: number
  mfe_price: number
  mae_pnl: number
  mfe_pnl: number
  mae_distance: number
  mfe_distance: number
  // what mae_distance / mfe_distance are counted in: 'pip' | 'tick' | …
  price_unit: string
  // null where no stop was set, so the trade has no R to be a multiple of
  r_multiple: number | null
  scenario_name: string
  entry_tick_index: number
  exit_tick_index: number
  entry_type: string
  stop_loss: number | null
  take_profit: number | null
  entry_side: string
  exit_side: string
  entry_executions: TradeExecution[]
  exit_executions: TradeExecution[]
  entry_slippage: number
  exit_slippage: number
  entry_slippage_pct: number
  exit_slippage_pct: number
}

/** Run-wide trade statistics for one account currency. */
export interface TradeAnalytics {
  currency: string
  trade_count: number
  expectancy: number
  // null when no trade carried a stop, so nothing is denominated in R
  avg_win_r: number | null
  avg_loss_r: number | null
  r_trade_count: number
  r_win_count: number
  r_loss_count: number
  // Excursion means. `largest_mae` is a MAGNITUDE while `avg_mae_losers` is signed — see TradeRow.
  avg_mae_winners: number
  avg_mae_losers: number
  avg_mfe_losers: number
  largest_mae: number
  largest_mfe: number
  gross_pnl: number
  net_pnl: number
  total_fees: number
  avg_trade_duration_s: number
  max_consecutive_wins: number
  max_consecutive_losses: number
}

/** Per-scenario totals — the same trades grouped by the unit that produced them. */
export interface ScenarioTotals {
  scenario_name: string
  currency: string
  trade_count: number
  gross_pnl: number
  net_pnl: number
  total_fees: number
  total_swap: number
}

/** Response type for GET /api/v1/reports/runs/{run_id}/trade-history */
export interface TradeHistoryReport {
  run_id: string
  trades: TradeRow[]
  count: number
  symbols: string[]
  analytics: TradeAnalytics[]
  scenario_totals: ScenarioTotals[]
}

/**
 * What the trade view renders: the positions that closed, and the order funnel that produced
 * them. Composed by the host rather than served as one response, because the two live on
 * different routes — and they belong together, since 544 rejected orders behind 11 closed
 * positions is a finding that neither half states on its own.
 */
export interface TradeView {
  history: TradeHistoryReport
  /** The run summary, for its four order counters. Null where the run carries no summary. */
  summary: RunSummary | null
}
