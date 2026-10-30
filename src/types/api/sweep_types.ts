/**
 * One row of GET /api/v1/sweeps — one parameter search, newest first, keyed by `sweep_id` as the
 * response declares. A sweep is not a run: it has no report of its own, and its combinations are
 * runs whose `parent_id` is the sweep's id and whose `parent_kind` is `sweep`.
 */
export interface SweepRow {
  sweep_id: string
  // the earliest run start in the sweep, ISO-8601 UTC
  started: string
  /**
   * The SPREAD OF THE STARTS — the last run's start minus the first's — not how long the sweep
   * took: the last run's own duration falls outside it. `0.0` for a sweep of one run.
   */
  duration_s: number
  // how many distinct combinations it holds; `count` on one sweep's response counts ROWS instead
  run_count: number
  ok_count: number
  error_count: number
  decision_logic_type: string
  decision_version: string
  // the scenario set that was swept, with the sweep's own tag stripped off
  base_config: string
  symbols: string[]
  /** The KPI it ranks by — their vocabulary (`expectancy`, `net_pnl`, …). Empty where it recorded none. */
  objective: string
  maximize: boolean
}

export interface SweepList {
  key: string[]
  sweeps: SweepRow[]
  count: number
}

/**
 * One combination of one sweep, as GET /api/v1/sweeps/{sweep_id} serves it: one row per run and
 * account currency, folded from the run's booking-period ledger rows (`key`). Ranked by the
 * route, within each currency — the order is the answer, and nothing here re-sorts it.
 *
 * Two groups are null on a folded row BY DESIGN, each for its reason (their `sweeps` document): a
 * reading of one account (`final_equity`, `unrealized_pnl`, `open_position_count`), and the streaks.
 * The order counts (every `orders_*`, `sl_tp_triggered`) fold since contract 42, each period counting
 * the orders it handled; null on a row written before. Render the absence as absence.
 */
export interface SweepCombination {
  run_id: string
  currency: string
  sweep_id: string
  sweep_objective: string
  sweep_maximize: boolean
  /** This combination's grid point: the parameters, by their configuration key, that make it the row it is. */
  sweep_params: Record<string, number | string | boolean | null>
  // `ok`, or `error` with the reason in `error` — an error row never ranks, so the route leaves it out
  status: string
  error: string | null
  run_kind: string
  run_type: string
  run_outcome: string
  run_timestamp: string
  recorded_at_utc: string
  scenario_set_name: string
  unit_name: string
  symbols: string[]
  data_broker_type: string
  orders_to: string
  bot_id: string
  deployment_id: string
  // The order features this row was allowed beyond its venue, comma-joined (contract 45): such a row
  // does not predict a session on that venue. Empty for every other row
  features_beyond_venue: string

  /**
   * The mean R, which a sweep usually ranks on. R is `net_pnl` over the loss the stop would have
   * taken, and measured 2026-10-19 that stop is the one OF THE ROW: a stop trailed to break-even
   * gave one partial close 308.9 R, and this mean read +11.07 on a set that lost 93.99. Asked of
   * FiniexTestingIDE; rendered as served meanwhile, with the count it rests on beside it.
   */
  expectancy: number
  avg_win_r: number | null
  avg_loss_r: number | null
  r_trade_count: number
  r_win_count: number
  r_loss_count: number
  net_pnl: number
  // null where the combination had no losing trade: the ratio is undefined, not zero
  profit_factor: number | null
  win_rate: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  // null on rows written before the column existed
  gross_profit: number | null
  gross_loss: number | null
  total_fees: number
  // null where no drawdown was measured (contract 40)
  account_max_drawdown: number | null
  account_max_drawdown_pct: number | null
  max_equity: number | null
  final_equity: number | null
  unrealized_pnl: number | null
  open_position_count: number | null
  avg_trade_duration_s: number | null
  avg_mae_winners: number | null
  avg_mae_losers: number | null
  // the losers' only: the row serves no `avg_mfe_winners` (measured 2026-10-19)
  avg_mfe_losers: number | null
  largest_mae: number
  largest_mfe: number
  max_consecutive_wins: number | null
  max_consecutive_losses: number | null
  orders_submitted: number | null
  orders_executed: number | null
  orders_rejected: number | null
  orders_cancelled: number | null
  orders_expired: number | null
  orders_denied: number | null
  orders_adopted: number | null
  orders_undelivered: number | null
  orders_unaccounted: number | null
  sl_tp_triggered: number | null
  warning_count: number
  error_count: number
  log_warning_count: number
  // the weakest signal channel, null where no signal worker was involved — never 1.0 for "none"
  signal_fresh_ratio: number | null
  tick_timespan_seconds: number

  // — what makes a ranking comparable: rows that differ here compare measures that changed underneath —
  // null: written before row versioning, so the version is UNKNOWN rather than old
  logic_version: number | null
  app_version: string
  decision_logic_type: string
  decision_version: string
  worker_versions: Record<string, string>
  git_commit: string
  git_branch: string
  // true also where the code state could not be determined: it never says the code was clean
  git_dirty: boolean
  // how many candidates this run was selected FROM; null is unknown, 1 a statement
  trial_count: number | null
  // a fingerprint of the strategy parameters: equal means the same, it does not say which differ
  param_hash: string
  // a fingerprint of the simulator settings after the defaults were merged in; empty on older rows
  profile_hash: string
  // the run's full resolved strategy configuration, as a JSON STRING rather than an object
  strategy_config_json: string
  input_plane: string
  data_format_versions: string
  origin_classes: string
  origin_evidence_grades: string
  price_bases: string
  input_files: number | null
  unstamped_input_files: number | null
  // when a prune removed the run's records; empty while it did not — then the figures cannot be checked
  records_pruned_at: string
  /**
   * What the combination ran with (contract 40): the run-config store's ids of its rendered scenario
   * set and of its broker configuration, comma-joined where it traded under several. Empty on a row
   * written before. For comparing, not a handle: no route serves a rendered document yet.
   */
  rendered_config_id: string
  broker_config_id: string
  // the ticks its booking periods applied, summed; null on a row written before
  period_tick_count: number | null

  // the ledger row's own period fields, carried on the folded row; their sweeps document names none
  period_no: number
  period_opened_at: string
  period_closed_at: string
  period_close_reason: string
  period_opening_equity: number | null
  period_max_equity: number
  period_min_equity: number
  period_max_drawdown: number
  period_commission_cost: number
  period_spread_cost: number
  period_modelled_spread_cost: number | null
  period_swap_cost: number
}

/**
 * GET /api/v1/sweeps/{sweep_id}. `objective` and `maximize` are what the ranking USED: the sweep's
 * own where it declared them, and where it declared neither, what was used instead (`expectancy`,
 * maximized). `count` counts rows — one per combination and currency — not combinations.
 */
export interface SweepDetail {
  key: string[]
  sweep_id: string
  objective: string
  maximize: boolean
  combinations: SweepCombination[]
  /**
   * Contract 40: the combinations the ranking LEFT OUT because they carry no value for its objective —
   * a figure some runs did not measure. Without it a shorter list would read as the whole sweep.
   */
  unranked: number
  count: number
}
