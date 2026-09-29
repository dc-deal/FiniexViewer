/**
 * `GET /api/v1/reports/runs/{run_id}/scenario-details` — the ROSTER of a run.
 *
 * Settled with the backend 2026-09-25: this is the authority for "which scenarios does this run
 * have". It is the one section built from the batch ITSELF rather than from results, so a scenario
 * that produced nothing is still a row, carrying the reason it produced nothing. Every other
 * per-unit list is shorter, because each answers a different question — declared, attempted,
 * produced, counted.
 *
 * **Backtests only, by construction.** A session has no scenario grid: a session IS one unit, and
 * the equivalent one level up is a deployment's session list. The route answers
 * `404 artifact_not_produced` for an AutoTrader session, which the client turns into an absence.
 */
export interface ScenarioRow {
  name: string
  symbol: string
  /** The broker type — the row carries no second field for it, by the backend's decision. */
  data_source: string
  /**
   * `crypto` | `forex` — added in contract 5 and NOT back-filled, so a run recorded before that
   * reads `''`. Empty means not stated, never "no market".
   */
  market_type: string
  account_currency: string
  /** False where the currency was inherited rather than named by the scenario. */
  account_currency_explicit: boolean
  /**
   * `success` | `failed` today. Typed as a plain string rather than a closed union: the vocabulary
   * is the backend's and a third value would arrive as itself, where a union would have made the
   * mirror silently wrong instead of merely unfamiliar.
   */
  status: string
  /**
   * Plural fields that hold a COMMA-JOINED list rather than an array — measured over 370 rows, two
   * of them read `'production,unknown'`. Reported to the backend 2026-09-27; until they are arrays
   * these are rendered as they arrive and never split, because splitting invents a list.
   */
  origin_classes: string
  origin_evidence_grades: string
  price_bases: string
  data_format_versions: string
  execution_time_ms: number
  ticks_processed: number
  first_tick_time: string
  last_tick_time: string
  tick_timespan_seconds: number
  /**
   * The four decision counters. `null` means NOTHING COUNTED THEM — the decision tracker sits on
   * the hot path and is off by default in the simulation — and 0 means counted and none. They read
   * 0 on an artifact written before contract 9, which is the not-back-filled case rather than a
   * measurement. Nothing is rendered or sorted from them: a zero nobody reported is not a figure.
   */
  buy_signals: number | null
  sell_signals: number | null
  flat_signals: number | null
  trades_requested: number | null
  /** How many workers the scenario DECLARES — read from its configuration, so a refused one has it too. */
  worker_count: number
  /** Both empty on a scenario that ran; both set on one that did not. */
  error_type: string
  error_message: string
}

/** One data source the run drew on, and which scenarios used it. */
export interface ScenarioDataSource {
  broker_type: string
  market_type: string
  scenario_count: number
  symbols: string[]
  price_bases: string
}

/** What makes one row of each list unique, one entry per list — contract 9. */
export interface ScenarioDetailsKeys {
  units: string[]
  data_sources: string[]
}

export interface ScenarioDetailsReport {
  run_id: string
  units: ScenarioRow[]
  data_sources: ScenarioDataSource[]
  keys: ScenarioDetailsKeys
}
