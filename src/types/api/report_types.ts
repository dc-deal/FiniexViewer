/**
 * The market window a run unit DECLARED, one entry per unit — a backtest has one per scenario, an
 * AutoTrader session exactly one.
 *
 * `end_date: null` means OPEN: a tick-limited scenario, or a session at a venue whose window is
 * recorded at its start and stays open on the record even after the run finished. When it finished
 * is the run's completion, not a field here.
 *
 * There is deliberately no covered-from / covered-to pair per RUN. We asked for one; the backend
 * refused it with the better argument, and it is the argument already written into our own rules:
 * a span across several scenarios covers the gaps between them, so the two edges would describe a
 * stretch that produced nothing. A run matches a window when ANY of its units overlaps it.
 */
export interface DataWindow {
  unit_name: string
  start_date: string
  end_date: string | null
}

/** Single run entry from GET /api/v1/reports/runs — identity only, no report content */
export interface RunInfo {
  run_id: string
  /**
   * The PIPELINE that produced the run: `simulation` | `autotrader`. Nesting is not in here — that
   * is `parent_id`. The two axes were briefly one field (`single_runs` | `sweeps` | `autotrader`)
   * and could not express a nested session, which is what split them.
   *
   * `live` was this field's value until contract 12 and no longer occurs anywhere the API serves,
   * stored runs included. It is also not a word for a KIND of run: an AutoTrader session is a mock
   * session, a dry run or a real-money session, and only the last is live trading.
   */
  group: string
  /**
   * WHERE THE TICKS CAME FROM and WHERE THE ORDERS WENT — the two facts that separate the four
   * kinds of run, recorded at its start from the RESOLVED configuration rather than read back from
   * a profile file that may have changed since:
   *
   *   backtest             simulation   archive   simulated
   *   mock session         autotrader   archive   simulated
   *   dry run              autotrader   venue     simulated
   *   real-money session   autotrader   venue     venue
   *
   * `null` on every run recorded before contract 12 — unknown, never guessed. Measured here
   * 2026-09-29: null on all 40 runs on this machine, so nothing may be derived from their absence.
   */
  ticks_from: string | null
  orders_to: string | null
  /**
   * `null` on a run recorded before contract 12 — the same not-yet-recorded case as the two above,
   * and NOT an empty list. Measured 2026-09-29: null on all 40 runs here. The distinction is the
   * one this project keeps making: an empty list is a run that declared no window, null is a run
   * that never recorded the field, and reading one as the other invents a fact.
   */
  data_windows: DataWindow[] | null
  /**
   * The artifact files this run carries. The set VARIES, and not only between the pipelines: an
   * AutoTrader session omits scenario_details / profiling / run_meta / aggregated_portfolio and
   * adds safety, and a backtest writes
   * extra sections only when it has something to say (robustness, block splitting). So never
   * assume a set from the pipeline or from a count observed in one archive — read this list. It
   * says which sections exist and costs no request: it rides on the index row.
   */
  artifacts: string[]
  /**
   * The STREAMS a run produced, kept OUT of `artifacts` on purpose (contract 23) — their own
   * documentation is explicit about it: *"Ask for a stream whenever it is listed, whatever
   * `artifacts` says."* Today one name appears, `order_events.jsonl`, and it is what makes
   * `order-events` answerable; an artifact gate that only consults `artifacts` would never request
   * it at all.
   */
  stream_files: string[]
  // Derived from `artifacts` being non-empty, so the two cannot disagree. False means the run
  // exists as LOGS ONLY and every report route answers 404 — a normal state, not a fault.
  has_reports: boolean
  name: string        // scenario-set name (backtest) | profile name (AutoTrader session)
  start_time: string  // ISO-8601 UTC, from the run header
  /**
   * The family this run belongs to, or null for a top-level run in either pipeline. One field,
   * TWO kinds of parent — and `parent_kind` below now SAYS which, so nothing here infers it:
   *
   *   sweep        a COMBINATION of a parameter sweep. The siblings are alternatives,
   *                contemporaneous and comparable, so ranking them is the point.
   *   deployment   a SESSION of a deployment. The siblings are a sequence of sealed slices
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
  /**
   * WHAT THE RUN DID, folded from its booking periods by the backend's own reductions — contract
   * 15, and the answer to a request this repo made rather than computing it here. One entry per
   * account currency, because money is never summed across them.
   *
   * THREE states, and reading any two of them as one invents a fact:
   *
   *   null   the ledger holds nothing for this run — still going, died before its close, or
   *          `reporting: none`. Read it together with `reporting`.
   *   []     it closed without figures.
   *   list   what it earned.
   *
   * Measured 2026-09-29 over 41 runs: 38 lists, 2 null, 1 empty — all three occur.
   */
  results: RunResult[] | null
  /**
   * `success` | `finished_with_errors` | `failed` | `crashed` — the same grading the exit code
   * carries. A plain string rather than a closed union: the vocabulary is the backend's, and a
   * fifth value would arrive as itself instead of making the mirror silently wrong.
   *
   * `null` where no ledger record exists, which is the same two runs `results` is null on.
   */
  run_outcome: string | null
  /**
   * Three counts that are NOT interchangeable, and the tiers are the backend's own:
   *
   *   error_count        ERROR records in the error pot
   *   warning_count      Tier 1 — what a validator decided, shown in the report
   *   log_warning_count  Tier 2 — WARNING records from the log pot, ignorable by design
   *
   * `null` where not recorded, never 0 — a count nobody took is not a zero.
   */
  error_count: number | null
  warning_count: number | null
  log_warning_count: number | null
  /**
   * The market time this run's units processed, covered together so a stretch two of them share
   * counts once. `null` on a run recorded before the figure existed — an absence, not a zero.
   */
  tick_timespan_seconds: number | null
}

/** What one run earned in one account currency. */
export interface RunResult {
  currency: string
  net_pnl: number
  total_trades: number
}

/** Response type for GET /api/v1/reports/runs */
export interface RunListResponse {
  // What makes one row unique, declared by the backend rather than assumed here. An unordered
  // list of objects says nothing about its own identity, and a consumer keying on the obvious
  // field folds two rows into one — silently, and in the direction that loses data.
  key: string[]
  // The same declaration for the nested `results` list — one row per currency, not per run.
  results_key: string[]
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
  /**
   * Which account the drawdown trio above belongs to. The trio is the DEEPEST account's, taken
   * together from that one account, because a trough and a peak from two different accounts
   * describe a decline that never happened.
   */
  account_max_drawdown_unit: string
  /**
   * TWO fee figures, and they are different populations rather than a rounding apart.
   *
   * `total_fees` is the fees of the CLOSED trades — the same population the trade list, the
   * booking periods and the ledger sum, so those four agree by construction. `fees_charged` is
   * what the run actually charged, open positions included. Measured on one run with three
   * positions still open: 9.17 against 16.22. One file read the first and the next read the
   * second under one name until contract 18.
   */
  total_fees: number
  fees_charged: number
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
  /**
   * ONE account's closing equity — and `null` wherever this currency spans several, which a
   * backtest of N scenarios always does: those are N independent accounts, one balance each, and
   * no account ever held their sum. The sum is `total_final_equity` and says so in its name.
   */
  final_equity: number | null
  total_final_equity: number
  total_initial_balance: number
  /** How many accounts the two totals above are over. 1 means `final_equity` is stated. */
  unit_count: number
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
/**
 * A unit the run declared and that produced nothing, with the reason the backend states.
 *
 * `reason_code` is the machine word for grouping; `reason` is written for a person and is rendered
 * as it arrives. `checks` names the validation checks that failed — the ids `GET
 * /api/v1/validation-checks` gives a title and a description for, so a reader never meets a bare id.
 */
export interface UnitAbsence {
  name: string
  reason: string
  reason_code: string
  checks: string[]
}

export interface RunSummary {
  run_id: string                  // the run this body was built from — assert it, never assume it
  /** One declared key per list in this response, not one for the response. */
  keys: { currencies: string[], units_absent: string[] }
  currencies: RunSummaryCurrency[]
  /**
   * ONE COUNT PER WAY AN ORDER STARTS OR ENDS, replacing the single `orders_sent` (contract 23).
   *
   * Two of these changed MEANING while keeping their name, which no key diff can see and which the
   * contract log is the only place to state: `orders_executed` now counts the fills of CLOSING
   * orders as well, and **`orders_rejected` is the venue's refusals ONLY** — a refusal before
   * anything left the building is `orders_denied`. Rendering the one without the other understates
   * what was turned away, which is why the Executive Summary shows them side by side.
   */
  orders_submitted: number
  orders_adopted: number
  orders_executed: number
  orders_denied: number
  orders_rejected: number
  orders_cancelled: number
  orders_expired: number
  orders_undelivered: number
  orders_unaccounted: number
  sl_tp_triggered: number
  unit_count: number              // backtest: N scenarios | AutoTrader session: 1
  /**
   * What the run was ASKED to do, beside what it produced — the difference between `unit_count`
   * and these is the whole "declared · attempted · produced · counted" distinction in one place.
   *
   * `null` on an artifact written before contract 6, which is not a zero: a run that declared
   * nothing and a run that never recorded the figure are different, and only one of them is a
   * finding. Nothing back-fills a stored artifact.
   */
  units_declared: number | null
  units_disabled: number | null
  /**
   * One entry per unit that produced nothing, each carrying WHY. Empty where all of them ran — and
   * `null`, like the two counts above it, on an artifact written before the field existed.
   *
   * It was typed as a plain array until 2026-10-01, when a run from 2026-09-25 crashed the whole
   * panel column: `units_absent.length` on null throws inside a computed, the render effect dies,
   * and every panel disappears. Measured on `20260925_101700_e63e3980`, which serves
   * `units_declared`, `units_disabled`, `units_absent` and `signal_fresh_ratio` all null.
   */
  units_absent: UnitAbsence[] | null
  // Weakest SIGNAL channel of the run. null = no SIGNAL worker was involved — deliberately
  // not 1.0, which would claim a perfect feed.
  signal_fresh_ratio: number | null
  disturbance_episode_count: number
  disturbance_stale_seconds: number
  disturbance_source_count: number
  disturbance_stress_injected: number
  /**
   * Market time. `tick_timespan_seconds` is what the run's units PROCESSED covered together, so a
   * stretch two scenarios share counts ONCE; `tick_timespan_total_seconds` is the plain sum. They
   * differ by exactly the overlap — measured on one run, 464 h covered against 928 h summed, its
   * eight scenarios being four pairs of identical windows. Never the wall clock the run took.
   */
  tick_timespan_seconds: number | null
  tick_timespan_total_seconds: number | null
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
 * different questions: `observed_at` is the wall clock and answers how long OUR machine took;
 * `event_time` is the canonical clock — the replayed tick's time in a backtest, the processed
 * event's in a live-adapter session — and is null for entries that predate it. Never substitute
 * one for the other: sorting by observed_at looks right and is wrong.
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
  emergency_reason: string    // AutoTrader sessions only
  // AutoTrader sessions only. '' on a backtest means NOT APPLICABLE rather than unknown. DETAIL and
  // never a verdict: 'emergency' is alarming only when run_outcome is 'failed', because an
  // operator stopping a healthy session with Ctrl+C produces the same value.
  shutdown_mode: string       // 'normal' | 'emergency'
  // Resolves that ambiguity — but it is newer than most artifacts, which default it to false, so
  // it cannot be trusted on an older one. Mirrored, deliberately not rendered.
  operator_interrupted: boolean
  /**
   * The same three counts the run index carries, counted once and the same way in both pipelines
   * (contract 15). The 39 stored artifacts written before that were back-filled from their own
   * rows, so `null` here means what it means everywhere else — nothing recorded — and never
   * "written before the counts existed". Verified 2026-09-29 after the back-fill: index and
   * artifact answer 0 / 3 / 547 for the same run.
   *
   * The warning ROWS are not a count. A backtest summarises its whole Tier-2 pot in ONE row while
   * an AutoTrader session writes one per entry, so counting rows compares two different things.
   */
  error_count: number | null
  warning_count: number | null
  log_warning_count: number | null
}

/** Response type for GET /api/v1/reports/runs/{run_id}/warnings-errors */
/**
 * What identifies a row in each of the two lists this response serves.
 *
 * `errors` is `["name"]` — ONE row per unit, so the symbol adds nothing to the identity and a
 * `name + symbol` key was our invention, dropped on the backend's instruction 2026-09-27.
 *
 * `warnings` is an EMPTY tuple, and that is a declaration rather than an omission: a warning has
 * no identity beyond its position. Nothing folds two identical warnings into one, so a session
 * that logged the same sentence twice has two rows carrying the same text, and the index is
 * therefore the right key.
 */
export interface WarningsErrorsKeys {
  errors: string[]
  warnings: string[]
}

export interface WarningsErrorsReport {
  run_id: string
  warnings: WarningRow[]
  errors: UnitErrorRow[]
  outcome: WarningsErrorsOutcome
  keys: WarningsErrorsKeys
}

/**
 * One unit inside a run — a scenario in a backtest, the single profile in a session. This is
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
   * Where the decline is measured FROM. A deployment carries its peak across restarts, so
   * the figure is not about this run alone: `drawdown_restarts` counts how many sessions it has
   * survived, and the two stamps say which stretch it spans.
   */
  drawdown_started_at: string
  drawdown_carried_from: string
  drawdown_restarts: number
  /**
   * TWO fee figures, and they are different populations rather than a rounding apart.
   *
   * `total_fees` is the fees of the CLOSED trades — the same population the trade list, the
   * booking periods and the ledger sum, so those four agree by construction. `fees_charged` is
   * what the run actually charged, open positions included. Measured on one run with three
   * positions still open: 9.17 against 16.22. One file read the first and the next read the
   * second under one name until contract 18.
   */
  total_fees: number
  fees_charged: number
  // Provenance. data_broker_type carries the same broker keys GET /brokers returns ('mt5'), which
  // is what makes the jump into the chart possible; broker_name is a display name ('Kraken') and
  // is not addressable. Filled on both pipelines since the AutoTrader path threads it through.
  //
  // Named `data_source` until contract 14, where that word was split: a report's `data_source`
  // was a BROKER, while a stress configuration's is whichever INPUT an outage hits. Each half now
  // has its own name, and the glossary word for this one is `data broker`.
  data_broker_type: string
  data_sentiment_type: string
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
  /**
   * Per-currency maps. The value is optional because the set of keys differs per unit — a spot unit
   * carries its base currency, a margin one does not — and reading a key that is not there is an
   * absence, not a zero.
   */
  balances: Record<string, number | undefined>
  initial_balances: Record<string, number | undefined>
  // Funds pledged against open orders, and what is left to trade with
  committed_funds: Record<string, number | undefined>
  usable_funds: Record<string, number | undefined>
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
  // What the unit PAID. `total_fees` carries the commission, the swap and — where a venue charges
  // per side — the maker and taker fees; the SPREAD is not in it and is a cost of its own.
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
  /**
   * Which account the drawdown trio above belongs to. The trio is the DEEPEST account's, taken
   * together from that one account, because a trough and a peak from two different accounts
   * describe a decline that never happened.
   */
  account_max_drawdown_unit: string
  /**
   * TWO fee figures, and they are different populations rather than a rounding apart.
   *
   * `total_fees` is the fees of the CLOSED trades — the same population the trade list, the
   * booking periods and the ledger sum, so those four agree by construction. `fees_charged` is
   * what the run actually charged, open positions included. Measured on one run with three
   * positions still open: 9.17 against 16.22. One file read the first and the next read the
   * second under one name until contract 18.
   */
  total_fees: number
  fees_charged: number
  unrealized_pnl: number
  /** One account's closing equity, `null` over several — see the note on its per-currency twin. */
  final_equity: number | null
  total_final_equity: number
  total_initial_balance: number
  open_position_count: number
}

/** Response type for GET /api/v1/reports/runs/{run_id}/portfolio */
export interface PortfolioReport {
  run_id: string
  /**
   * One declared key per list in this response. It is what makes the roster's join on `unit.name`
   * a documented foreign key rather than a guess — stated on 46 of 46 responses and, until
   * 2026-10-05, dropped at this boundary where every other report kept it.
   */
  keys: { units: string[], aggregates: string[] }
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
  period_no: number
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
  // The costs of the trades this period CLOSED, attributed the way `net_pnl` is. A swap accruing
  // on a position still open belongs to the open book and is deliberately not here.
  //
  // `total_fees` is commission + swap and NOTHING ELSE — measured 2026-10-08 over 1,044 booking
  // periods, 506 of them with a non-zero spread: the two-term identity holds on all 1,044 and the
  // three-term one only where the spread is zero. `spread_cost` is a cost of its own, not a part
  // of the total, which is why the aggregated panel lists it as its own figure rather than as a
  // breakdown of fees.
  commission_cost: number
  swap_cost: number
  spread_cost: number
  /**
   * Stamped at the source rather than derived — `final_equity - net_pnl` would be wrong as well as
   * derived, because `net_pnl` is realised while equity also values what is still open.
   *
   * `null` on a period recorded before the field existed. Measured across two captures: stated on
   * all 10 run periods and absent on 4 of 8 deployment periods. Nothing back-fills a stored
   * artifact, so the absence is the data.
   */
  opening_equity: number | null
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
 * One unit's periods folded into its total — SERVED, never folded here.
 *
 * The backend applies its own declared reductions, which is the whole reason this is a response
 * field rather than three lines of ours: the drawdown trio comes from the period that won it
 * rather than from a separate min and max, a rate is rebuilt from the summed components rather
 * than averaged, and a figure with no honest fold answers `null`.
 */
export interface BookingPeriodUnitTotal {
  unit_name: string
  currency: string
  period_count: number
  opened_at: string
  closed_at: string
  trade_count: number
  net_pnl: number
  total_fees: number
  commission_cost: number
  swap_cost: number
  spread_cost: number
  gross_profit: number
  gross_loss: number
  win_rate: number
  profit_factor: number | null
  /**
   * `null` where the unit's FIRST period recorded no opening. Until contract 18 the fold skipped
   * the missing value and showed the SECOND period's instead, which is why this carried a "do not
   * render" note for a day.
   */
  opening_equity: number | null
  final_equity: number
  min_equity: number
  max_equity: number
  /** The deepest decline WITHIN one period, against the account's own decline across them all. */
  deepest_period_drawdown: number
  account_max_drawdown: number
  account_max_dd_pct: number
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
  /** One declared key per list in this response, not one for the response. */
  keys: { periods: string[], unit_totals: string[] }
  periods: BookingPeriodRow[]
  unit_totals: BookingPeriodUnitTotal[]
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
  /**
   * The sum over `unit_totals`, and named as a total for that reason. It was `final_equity` and
   * was the LAST period row's own figure — one of the run's eight accounts, printed as though it
   * were the run's.
   *
   * Nullable for the same reason as `run_net_pnl` above it: the run states no figure in this
   * currency. Measured 2026-10-01 on `20260924_165923_4d6c2f5f`, which books no period at all and
   * serves it null — and `Intl.NumberFormat` turns null into `0.00` without complaining, so the
   * footnote printed a closing equity nobody had reported.
   */
  total_final_equity: number | null
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
  /**
   * How many trade rows of this unit carry this fill. 1 is the ordinary case; more means one
   * position was closed in pieces and each piece is its own trade row, which is why four rows can
   * share an entry price. Served rather than counted: the record is byte-identical on every trade
   * that shares it, so counting here would also be wrong under a narrowing or a row cap.
   */
  shared_by: number
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
  // What the trade cost. `total_fees` is the swap plus the commission; the SPREAD is beside it and
  // not in it — measured over 1,591 trade rows, 1,563 of them with a non-zero spread.
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
  /**
   * `partial` or `full` — WHICH part of a position's chain this row ended, new in contract 23.
   * It answers the third of the three questions we put to testingide on 2026-10-05: the `full`
   * row is the last one, and before this field nothing on the row said so.
   */
  close_type: string | null
  // the position's size at ENTRY, so no fill has to be summed to know what was opened
  entry_lots: number
  // how many records this position produced in its unit, counted before any filter — the
  // replacement for reading `entry_executions[0].shared_by` and its documented [0] assumption
  position_closes: number
  stop_loss: number | null
  take_profit: number | null
  entry_side: string
  exit_side: string
  entry_executions: TradeExecution[]
  exit_executions: TradeExecution[]
  entry_slippage: number
  entry_slippage_pct: number
  /**
   * NULL on a trade that records no exit slippage — measured 2026-09-29 over 437 trades from eight
   * runs: null on 118 of them, 27 %. The entry half was stated on every one of the 437, so it is
   * mirrored as a plain number; whether that is guaranteed or only true of this archive is a
   * question for the backend rather than something to infer from a sample.
   *
   * The mirror said `number` until this measurement and the panel called `.toFixed()` on it, which
   * threw while rendering an expanded scenario group and took the whole panel with it. The contract
   * test could not catch it: it proves the mirror against ONE capture, and that run had no null.
   */
  exit_slippage: number | null
  exit_slippage_pct: number | null
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
export interface TradeHistoryKeys {
  trades: string[]
  analytics: string[]
  scenario_totals: string[]
}

export interface TradeHistoryReport {
  run_id: string
  trades: TradeRow[]
  count: number
  symbols: string[]
  analytics: TradeAnalytics[]
  scenario_totals: ScenarioTotals[]
  /**
   * What makes one row of each list unique. A response serving SEVERAL lists declares `keys` —
   * plural, one entry per list — because a single tuple over two row types would name fields one
   * of them does not have. Contract 9.
   *
   * `trades` is the one where guessing would have been wrong: `position_id` alone repeats, because
   * a partial close books several records of ONE position and two scenarios of a symbol both count
   * from `pos_<symbol>_1`. Measured here in 3 of 11 runs before it was declared.
   */
  keys: TradeHistoryKeys
}


/**
 * One SYMBOL as a broker defines it — the trading rules that make an order legal or illegal.
 *
 * These are not properties of the market, they are properties of this broker's instrument: the same
 * pair at two brokers has two minimum volumes and two swap rates, which is exactly why a run using
 * several brokers cannot be read as one set of conditions.
 */
export interface BrokerSymbol {
  symbol: string
  volume_min: number
  volume_max: number
  volume_step: number
  contract_size: number
  tick_size: number
  base_currency: string
  quote_currency: string
  /**
   * The financing rate for holding the position overnight, per direction. Measured on a spot
   * broker: both are 0.0, which is a stated zero rather than an absence — spot has no swap.
   */
  swap_long: number
  swap_short: number
}

/**
 * One broker a run traded through, with the scenarios that used it.
 *
 * `margin_mode`, `margin_call_level` and `stopout_level` are required only **where leverage > 1** —
 * stated in `ide_docs/broker_config_guide.md` and repeated in the adapter guide. Below that a
 * broker states none of them, so what arrives is a default rather than a measurement: the captured
 * spot broker reads `margin_mode: 'none'` with both levels at `0.0`, and rendering that as "margin
 * call at 0%" says the opposite of what is true. The leverage is the gate, not the mode.
 */
export interface BrokerUnit {
  // the same broker keys GET /brokers returns, which is what ties a scenario to the data plane
  broker_type: string
  market_type: string
  // what the venue calls itself, and which of its servers this was — a display identity
  company: string
  server: string
  // `demo` | `live` — the venue's own word for the account, NOT whether money moved. A backtest
  // against a live-server definition is still a simulation; where the orders went is `orders_to`.
  trade_mode: string
  leverage: number
  margin_mode: string
  // ALREADY percentages: 50.0 means 50 %. Both read 0.0 where `margin_mode` is `none`.
  margin_call_level: number
  stopout_level: number
  hedging_allowed: boolean
  // content hash of the broker configuration — two units sharing it were configured identically
  config_hash: string
  /**
   * The frozen broker configuration itself, beside the hash that only digests it (contract 19).
   * An AutoTrader session freezes at its start what it trades with — the venue's symbol
   * specifications, the seed's fee structure, the detected fee tier — and this names that content.
   *
   * EMPTY on a simulation unit, which reads the archive's broker files when it runs, and on any
   * session recorded before contract 19. It is not on the API as a document: this is the id only.
   */
  broker_config_id: string
  // which scenarios of the run traded through this broker, by the unit name every other section
  // keys on
  scenarios: string[]
  symbols: BrokerSymbol[]
}

/** Response type for GET /api/v1/reports/runs/{run_id}/broker */
export interface BrokerReport {
  run_id: string
  units: BrokerUnit[]
  // what makes one unit unique, declared rather than assumed
  key: string[]
}

/**
 * One SPOT account of the run, as a quote balance plus a base-asset holding.
 *
 * A spot account is an inventory, not a balance with margin arithmetic (`ide_docs/glossary.md`,
 * *account model*), so its worth is the quote balance plus the base holding valued at a price —
 * which is why `est_current` is an ESTIMATE and `last_price` is served beside it. Nothing here is
 * multiplied by us.
 */
export interface SpotScenarioRow {
  scenario_name: string
  quote_currency: string
  base_currency: string
  quote_balance: number
  base_balance: number
  quote_initial: number
  base_initial: number
  last_price: number
  est_current: number
  est_initial: number
  has_base_holdings: boolean
}

/**
 * The run-wide headline of an aggregate. Twenty-one fields, and almost every one of them is also on
 * `run-summary.currencies[]` — the Executive Summary shows those. Three are not: `total_profit`,
 * `total_loss` and `net_profit`, which name the same quantities `gross_profit` / `gross_loss` /
 * `net_pnl` do on the other route.
 */
export interface AggregatedHeadline {
  currency: string
  unit_count: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number              // ratio 0..1
  // null where it is undefined — no losing trade to divide by. Measured 2026-10-02 over a sample
  // of 12 runs; every other profit factor in this mirror already said so and this one did not.
  profit_factor: number | null
  total_profit: number
  total_loss: number
  net_profit: number
  account_max_drawdown: number
  max_equity: number
  account_max_dd_pct: number    // ALREADY a percentage
  account_max_drawdown_unit: string
  total_fees: number
  fees_charged: number
  unrealized_pnl: number
  // ONE account's figure, null over several — the same rule run-summary states
  final_equity: number | null
  total_final_equity: number
  total_initial_balance: number
  open_position_count: number
}

/**
 * Everything the run came to in one account model, folded by the backend over the scenarios.
 *
 * What is HERE and nowhere else on the page: the run-wide cost split, the highest equity ANY
 * account reached with the scenario that reached it, the realised BALANCE beside the equity, and
 * the averages behind the profit factor. The `pending_*` block is the subject of the
 * `pending-orders` route and is mirrored rather than shown, so this panel does not pre-empt it.
 */
export interface AggregatedCombined {
  headline: AggregatedHeadline
  is_spot: boolean
  // empty on the combined fold; the backend names the half where a run mixes account models
  label: string
  total_long_trades: number
  total_short_trades: number
  avg_win: number
  avg_loss: number
  initial_balance: number
  /**
   * REALISED, where `headline.total_final_equity` values what is still open as well. The two differ
   * by exactly the unrealised movement, and a reader meeting only one of them concludes the other
   * is broken.
   */
  final_balance: number
  avg_initial: number
  balance_pnl: number
  balance_pnl_pct: number       // ALREADY a percentage
  // null where it is undefined rather than zero — a run with no decline has no recovery to measure
  recovery_factor: number | null
  account_max_dd_pct: number
  account_max_drawdown_scenario: string
  /**
   * The highest peak ANY account reached, with the scenario that reached it. Distinct from
   * `headline.max_equity`, which belongs to the DEEPEST account's drawdown trio and is therefore a
   * different account's number. Contract 18.
   */
  highest_equity: number
  highest_equity_scenario: string
  total_spread_cost: number
  total_commission: number
  total_swap: number
  maker_fee: number
  taker_fee: number
  avg_spread: number
  // the same nine as on `RunSummary`, and the same two changed meanings — see the note there
  orders_submitted: number
  orders_adopted: number
  orders_executed: number
  orders_denied: number
  orders_rejected: number
  orders_cancelled: number
  orders_expired: number
  orders_undelivered: number
  orders_unaccounted: number
  sl_tp_triggered: number
  /**
   * Executed over submitted PLUS adopted — their definition, not ours, and it is the reason the
   * Executive Summary shows counts and no rate: this figure is served HERE and not on `run-summary`,
   * so computing it there would be deriving a number the API already states one route away.
   */
  execution_rate_pct: number
  // the funnel, renamed to what it counts (contract 23). `total_accepted` replaced `total_filled`
  // because the old name claimed a fill where an order had only ARRIVED — their defect, their fix.
  pending_total_submitted: number
  pending_total_accepted: number
  pending_total_rejected: number
  pending_total_never_confirmed: number
  pending_total_expired: number
  // null where nothing was in flight in this currency — not a time of zero. `latency` became
  // `in_flight` in contract 23, which is what the window actually measures.
  pending_avg_in_flight_ms: number | null
  pending_min_in_flight_ms: number | null
  pending_max_in_flight_ms: number | null
  pending_active_limit_count: number
  pending_active_stop_count: number
  spot_scenarios: SpotScenarioRow[]
  spot_total_est_current: number
  spot_total_est_initial: number
  spot_has_base_holdings: boolean
}

/**
 * One account currency of the run, folded three ways.
 *
 * `combined` is every scenario of that currency together. `margin` and `spot` are the two halves
 * where a currency holds BOTH account models, and they are `null` otherwise — measured on the
 * captured run, both null with `is_mixed: false`. Reading a null half as "nothing there" rather
 * than as "not split" would invent a run that traded nothing.
 */
export interface AggregatedCurrency {
  currency: string
  scenario_count: number
  scenario_names: string[]
  is_spot: boolean
  is_mixed: boolean
  combined: AggregatedCombined
  margin: AggregatedCombined | null
  spot: AggregatedCombined | null
}

/** Response type for GET /api/v1/reports/runs/{run_id}/aggregated-portfolio */
export interface AggregatedPortfolioReport {
  run_id: string
  currencies: AggregatedCurrency[]
}

/**
 * One order that was still open when its scenario ran out of data.
 *
 * NOT a resting order, and the difference is testingide's (2026-10-01): in a backtest the
 * simulation records every such order as `expired` with reason `scenario_end` in the same step, and
 * deliberately leaves it in these lists so this snapshot still shows it. The `order-history` row
 * and this entry are one order at one instant, seen twice. In an AutoTrader session an order left
 * standing at the venue gets NO expired row and is genuinely still live — `units` is empty on such
 * a run today, so nothing on screen can show that yet.
 *
 * `order_type` says which kind it is, and it is the ONLY thing that says so: the two lists an order
 * can arrive in are a grouping, not a distinction. Measured 2026-10-01 over 219 units,
 * `active_stop_orders` carried a `stop_limit` — so the array does not name the type.
 */
export interface PendingOrderRow {
  /**
   * The DECLARED key of the two order lists — but only WITHIN its unit (testingide, 2026-10-01).
   * One executor per unit mints the ids and a resting order sits in exactly one of the two lists,
   * so it identifies an order there and nowhere else: measured on `20260929_085949_ccc36468`,
   * `pos_gbpusd_1` rests in two different scenarios of one run. The declaration is not on the wire
   * yet — contract 18 serves no key at all — so nothing is keyed on it today.
   */
  order_id: string
  /**
   * Closed at three values here (testingide, 2026-10-01): `limit` · `stop` · `stop_limit`.
   * `active_stop_orders` holds a stop or a stop-limit whose trigger has not been reached;
   * `active_limit_orders` holds a limit. A stop-limit whose stop HAS triggered becomes a limit
   * order, moves to the other list and reads `limit` from then on. Their enum also knows
   * `trailing_stop`, `iceberg` and `unknown`; none can enter these lists today.
   */
  order_type: string
  direction: string
  lots: number
  entry_price: number
  limit_price: number
  stop_loss: number
  take_profit: number
}

/**
 * What became of one scenario's pending orders, and what is still open.
 *
 * The counts are a FUNNEL and the backend states every part of it:
 * `submitted = accepted + rejected + never_confirmed + expired`, measured 2026-10-08 on **all 230
 * units across 44 runs** without exception. Nothing is computed from it here; the identity is
 * stated so a reader can see that 527 submitted against 0 accepted means 527 refused.
 *
 * **Every name changed in contract 23, and one of them because the old one lied.** `total_filled`
 * counted an order that had only ARRIVED — a limit or stop order that began resting and might
 * never fill — which the backend called a known defect of its own. `total_accepted` says what it
 * counts. `resolved` → `submitted`, `timed_out` → `never_confirmed`, `force_closed` → `expired`,
 * and the latency trio became `in_flight`, which is what the window measures.
 *
 * A resting order is NOT a fifth bucket: it is already counted as `accepted`, so showing it beside
 * the funnel adds information rather than double-counting. Measured 2026-10-08 — exactly one unit
 * in the archive holds one, and `total_expired` is 0 there as everywhere.
 */
export interface PendingOrderUnit {
  // the unit name every other section keys on, and the symbol it traded
  name: string
  symbol: string
  total_submitted: number
  total_accepted: number
  /**
   * Rare and large when it happens: non-zero on 7 of 230 units measured 2026-10-08, and 31 on one
   * of them. That shape is the reason this section exists — a run can submit five hundred orders
   * and fill none of them while every other panel shows a normal-looking result.
   */
  total_rejected: number
  // zero on all 230 units measured: it comes only from a LIVE venue that never answered, which a
  // simulation cannot produce. Part of the vocabulary, not of this archive's data.
  total_never_confirmed: number
  // likewise zero everywhere — an order still on its way when the data ended
  total_expired: number
  /**
   * MILLISECONDS, confirmed by testingide 2026-10-01 — their execution-layer table said
   * "ticks (sim)" and was stale, corrected the same day. In a simulation it is the MODELLED delay
   * on the market clock (`broker_fill_msc − placed_at_msc`), not a measurement of anything. The
   * three figures cover every outcome that left the queue, not fills only.
   */
  avg_in_flight_ms: number
  min_in_flight_ms: number
  max_in_flight_ms: number
  in_flight_count: number
  // the orders behind `total_never_confirmed`, new in contract 23 — empty wherever that count is 0
  never_confirmed_orders: PendingOrderRow[]
  active_limit_orders: PendingOrderRow[]
  active_stop_orders: PendingOrderRow[]
}

/**
 * One LIFECYCLE RECORD of an order — not an order.
 *
 * The distinction is the backend's and it decides the whole panel: an order appears as several
 * rows. `pending` when it enters the pipeline, `executed` when it fills, a `close` row when its
 * position closes, one more per partial close. Measured 2026-10-02 over 40 runs and 4,660 rows,
 * the vocabulary is five `action`/`status` pairs: `open/pending` 1561 · `close/executed` 1554 ·
 * `open/executed` 994 · `open/rejected` 548 · `open/expired` 3. A sixth the code can write and this
 * archive does not hold is `close/rejected` — a partial close below the symbol minimum.
 *
 * `order_id` is NOT an identity: it is a per-unit position counter (`pos_<symbol>_<n>`), and 167
 * rows carried one id on a single measured run. The route declares no key; a row is identified by
 * its POSITION within its scenario, in append order, and a field for it is planned in
 * testingide#557. Their words: *please do not adopt the content key* — two partial closes on one
 * tick would collide.
 */
export interface OrderHistoryRow {
  // the per-unit position counter, shown as data and never as identity
  order_id: string
  // the unit name every other section keys on — this is the join to `pending-orders`
  scenario_name: string
  /**
   * The position this row opened or closed, once there IS one. Null on 45 % of rows, which is
   * exactly those where no position exists yet or never will (pending, rejected, expired).
   */
  position_id: string | null
  symbol: string
  // null where the record never held one: a rejection stored before contract 20, on 12 % of rows
  direction: string | null
  // `open` or `close`. Nullable because the backend states it as a field that can be absent, not
  // because this archive has one — contract 20 fills it on every row measured here.
  action: string | null
  /**
   * Contract 23 rewrote this vocabulary: `pending` · `executed` · `denied` · `rejected` ·
   * `cancelled` · `expired` · `undelivered` · `unaccounted`, with `submitted` and `partial` gone.
   *
   * **`denied` and `rejected` are two halves of one idea and must be read together:** `rejected` is
   * the venue's refusal, `denied` is a refusal before anything was sent. Measured 2026-10-08, one
   * run carries both — 35 refusals across the two — and no other run in the archive carries either.
   */
  status: string
  requested_lots: number | null
  executed_lots: number | null
  executed_price: number | null
  /**
   * When THIS ROW's event happened, on the run's clock — the fill on `executed`, the refusal on
   * `rejected`, the EXPIRY on `expired`, null on `pending`. It was `execution_time` until contract
   * 20 and was renamed because everywhere else in this API that name means a DURATION.
   */
  event_time: string | null
  commission: number
  // `market` · `limit` · `stop` · `stop_limit` — what was asked for, new in contract 23
  order_type: string | null
  // `partial` or `full` on a closing row: WHICH part ended the position's chain. The question we
  // put to testingide on 2026-10-05 and could not answer from `shared_by` alone.
  close_type: string | null
  // who asked: `strategy` · `framework` · `venue`. A framework close is a guard or a session end,
  // not a decision the bot made, and reading the two alike credits the strategy with neither.
  initiator: string | null
  // why the row ended as it did, beside the status that says WHAT it ended as
  end_reason: string | null
  // a whole sentence of the backend's, on a refused row and nowhere else. Contract 23 added
  // `unaccounted_order`, `position_not_found` and `close_withheld`, and dropped
  // `broker_unreachable` and `unresolved_write`.
  rejection_reason: string | null
  rejection_message: string | null
}

/**
 * Response type for GET /api/v1/reports/runs/{run_id}/order-history
 *
 * No declared key, and that IS the answer rather than an omission — see `OrderHistoryRow`.
 *
 * The `symbol` query parameter exists and is safe since contract 20; before it, a rejected row had
 * an empty symbol and the filter silently dropped every rejection. This app filters by SCENARIO
 * anyway, because one scenario is one symbol and the scenario is what the panel groups by.
 */
export interface OrderHistoryReport {
  run_id: string
  orders: OrderHistoryRow[]
  count: number
  symbols: string[]
}

/**
 * One STEP in an order's life, as the stream wrote it.
 *
 * `order-history` keeps a row for the submission and one for each way an order ENDED; what happened
 * between them exists only here - the venue taking the order, a stop triggering, every cancel asked
 * for and how it was answered, an answer that never came and the asking that settled it.
 *
 * Read it in `seq` order and NEVER sort it by time. Several steps often carry the same instant - a
 * backtest's market order is taken and filled at once - so a sort by time leaves their order to
 * chance. Their sentence, and it is a rule rather than a preference.
 */
export interface OrderEvent {
  scenario_name: string
  /** Counts the lines of ONE unit, never repeating inside it across both lists. Half of the key. */
  seq: number
  /**
   * What happened. Sixteen values, and which of them a run can produce depends on its KIND: a
   * backtest reports no `cancel_deferred`, `partially_filled`, `undelivered`, `unaccounted`,
   * `unresolved`/`resolved` or `adopted`, and no `triggered` comes from a live venue.
   */
  event_type: string
  /** The POSITION, as everywhere else in this API - it repeats across an order's open and closes. */
  order_id: string
  /**
   * The `seq` of the submission these steps belong to, and the ONLY thing that identifies one
   * order: group by `scenario_name` and this field. Null on a `denied` order, which was never
   * submitted; on an order adopted from a previous session it points at the `adopted` event.
   */
  submitted_seq: number | null
  /** `bot` on every line of `events` - what the session did and what it was told. */
  record_plane: string
  position_id: string | null
  action: string | null
  order_type: string | null
  symbol: string | null
  direction: string | null
  client_order_id: string | null
  broker_ref: string | null
  previous_broker_ref: string | null
  trade_id: string | null
  lots: number | null
  cum_lots: number | null
  fill_price: number | null
  limit_price: number | null
  trigger_price: number | null
  fee: number | null
  fee_currency: string | null
  submission_mid: number | null
  submission_time_msc: number | null
  /**
   * How long the venue's answer took, on the `accepted` or `rejected` answering a submission. Null
   * everywhere else - including an acceptance learned later by asking, where the span would be the
   * asking rather than the venue.
   */
  in_flight_ms: number | null
  /** The run's own clock. Null on a line written before the session's first market data. */
  event_time: string | null
  /** The machine's clock, LIVE ONLY - null in a backtest, which has to come out the same each run. */
  ts_init: string | null
  initiator: string | null
  end_reason: string | null
  rejection_reason: string | null
  /** The venue's own code where it gave one, passed on as it came. */
  venue_reason: string | null
  message: string | null
  /** `submit` / `cancel` / `modify` / `status_read` - which request's answer was lost. */
  lost_request: string | null
}

/**
 * What the venue said when the session asked it: its whole account at that moment, and never a step
 * of one order. A backtest has none, and a request narrowed to one order returns none.
 *
 * **A part has THREE states and collapsing them loses the distinction that matters.** A value - an
 * empty one included - is what the venue holds, so `[]` means "no open order". `null` WITH the part
 * named in `unread_parts` means the venue could not be read. `null` without the name means this
 * line does not read that part at all: positions on a spot account, balances on a `reconcile` line
 * that did not turn.
 *
 * The three collections are typed no deeper than measured. Their rows are the subject of the
 * `venue-account` panel, which is its own undertaking, and a shape nobody has seen is not mirrored.
 */
export interface BrokerTruthRow {
  scenario_name: string
  seq: number
  /** `broker_truth` on every line of this list. */
  record_plane: string
  /** `session_start` / `session_end` / `reconcile` - what made the session ask. */
  read_reason: string
  /** `clean` or `divergent`, on a `reconcile` line and nowhere else. */
  reconcile_state: string | null
  /** The named members where the picture turned divergent - ghost, abandoned, orphan, stale. */
  divergence: Record<string, unknown> | null
  /** Every order the venue reports as open, including orders this session did not place. */
  venue_orders: unknown[] | null
  /** The venue's balance sheet, every asset, the quote currency included. */
  venue_balances: Record<string, number> | null
  /** A margin account only. */
  venue_positions: unknown[] | null
  /** Which parts could not be read - what separates an absence from an unread part. */
  unread_parts: string[]
  event_time: string | null
  ts_init: string | null
}

/**
 * Response type for GET /api/v1/reports/runs/{run_id}/order-events
 *
 * Narrowed with `?scenario_name=&order_id=`, which is how one position is asked for without
 * pulling a whole run: 3 KB for one position against 138 KB for the run it belongs to, measured
 * 2026-10-08. A run that wrote no stream answers 404, and a stream in an older form answers 409.
 *
 * The run list says whether there is one at all, in `stream_files` - the gate every other section
 * takes from `artifacts`, which does not name this file because it is not a report artifact.
 */
export interface OrderEventsReport {
  run_id: string
  events: OrderEvent[]
  /** Empty on a backtest, and empty on any request narrowed to one order. */
  broker_truth: BrokerTruthRow[]
  count: number
  /** A key PER LIST, not one for the response: both are `["scenario_name", "seq"]`. */
  keys: Record<string, string[]>
  /**
   * The session was stopped while a line was being written, so that last line was left out and
   * everything before it is complete. It exists because the stream is served while a run is STILL
   * GOING - a live session writes it from its first order onwards.
   */
  truncated_tail: boolean
}

/**
 * Response type for GET /api/v1/reports/runs/{run_id}/pending-orders
 *
 * `units` was said here to be empty on an AutoTrader run. Measured 2026-10-08, it is NOT: both
 * stored AutoTrader runs carry a unit, the field study with 46 submitted and 46 timed in flight.
 * The sentence came from an archive in which no such run had orders yet.
 */
export interface PendingOrdersReport {
  run_id: string
  units: PendingOrderUnit[]
  /**
   * What makes one unit unique, declared since contract 19 — this was the one list route this app
   * consumed without a declaration. One field is enough where `trades` needs three: a unit name IS
   * a scenario name, and a scenario set whose names repeat is refused at validation.
   */
  key: string[]
}
