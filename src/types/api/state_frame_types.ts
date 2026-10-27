import type { OpenPosition, PendingOrderRow, WarningsErrorsOutcome } from '@/types/api/report_types'

/**
 * What a session's process held, read on its own side. `private_bytes` is what a leak grows.
 */
export interface ProcessMemory {
  rss_bytes: number
  private_bytes: number
}

/**
 * What a session held and decided at one moment (contract 38) — the record it writes as it goes,
 * a frame at a time, because every report section is written only when it ends.
 *
 * TWO CLOCKS stand behind its times and they are never mixed (testingide, 2026-10-22):
 * `frame_time` and `cadence_slot` are the session's own clock — the market data it was processing,
 * months behind in a replay — and what goes on a timeline; `written_at` is the machine's clock and
 * only answers "how long ago".
 *
 * **Null means not checked, never a default** (their state-frames document): `feed_stale` where the
 * session reads no signal, `reconcile_clean` where it runs no reconciliation or none reached the
 * venue yet, `last_price` and `equity` before the first price.
 */
export interface StateFrame {
  /** `frame` on every frame measured. */
  record_kind: string
  frame_time: string
  written_at: string
  /** `cadence` · `bar_close` · `order` · `shutdown` — why the frame was written. */
  written_for: string
  /** The cadence period the frame was written for; null on a frame written for another reason. */
  cadence_slot: string | null
  ticks_processed: number
  symbol: string
  account_currency: string
  /** The mid the account is valued at. */
  last_price: number | null
  balance: number
  /** At spot every currency the account holds, keyed by currency. */
  balances: Record<string, number>
  equity: number | null
  unrealized_pnl: number
  /** The same rows the portfolio serves. */
  open_positions: OpenPosition[]
  /** The same rows the pending orders serve. */
  active_orders: PendingOrderRow[]
  safety_blocked: boolean | null
  safety_drawdown_pct: number | null
  market_stale: boolean | null
  feed_stale: boolean | null
  reconcile_clean: boolean | null
  /** Every output of every worker, keyed by the worker's instance name — the strategy's own keys. */
  worker_outputs: Record<string, Record<string, unknown>>
  decision_action: string | null
  decision_outputs: Record<string, unknown>
  /** On a `bar_close` frame, the bar that closed, by its opening; empty otherwise. */
  closed_bars: Record<string, unknown>
  /** On an `order` frame, the order the decision sent. */
  order_id: string | null
  process_memory: ProcessMemory | null
}

/** The unit's first frame, read from the other end of its stream. */
export interface FirstFrame {
  written_at: string
  process_memory: ProcessMemory | null
}

/**
 * The latest frame of ONE unit, how old it is, and whether the session is still recording.
 */
export interface StateFrameUnit {
  unit_name: string
  /** The unit's cadence as a timeframe, `M1` unless its profile says otherwise. */
  cadence_timeframe: string
  cadence_s: number
  written_at: string
  /** Seconds since the latest frame was written; null where its time lies ahead of the server's clock. */
  age_s: number | null
  /**
   * `current` · `stopped` (its frames stopped without an end: it hangs or its process died) ·
   * `ended`; null for a session replaying recorded data before its end, whose frames come at
   * replay speed so their age says nothing.
   */
  recording: string | null
  /** The stream's last line was being written as it was read; the frame before it is served. */
  truncated_tail: boolean
  first_frame: FirstFrame
  /**
   * How the session ended, exactly as warnings-errors serves it. Written in its report phase, seconds
   * after the last frame — null until then, and for good where the process died in between.
   */
  outcome: WarningsErrorsOutcome | null
  frame: StateFrame
}

/** `GET /api/v1/reports/runs/{run_id}/state-frames/latest`, asked once a cadence and never faster. */
export interface StateFramesLatest {
  /** `["unit_name"]` */
  key: string[]
  served_at: string
  units: StateFrameUnit[]
}

/** A frame read from a unit's stream over time (contract 43): every state-frame field, and its place. */
export interface RecordedStateFrame extends StateFrame {
  /**
   * Its position in the unit's stream, counted from 1 — the key of a frame, since two can share an
   * instant. Unchanged when a trading day is sealed; the newest frame's equals the timeline's count.
   */
  record_no: number
}

/** One stream a unit records over time — today only its state frames. */
export interface RecordedStream {
  /** `state_frames` today; drawings and algo events join as rows of their own (testingide#379). */
  stream_kind: string
  stream_name: string
  /** The field a record's time is read from — `frame_time`, the session's own clock. */
  record_time_field: string
  record_count: number
  /** Null while the stream holds no frame. */
  first_record_time: string | null
  last_record_time: string | null
  cadence_timeframe: string
  cadence_s: number
  truncated_tail: boolean
}

/** `GET …/units/{unit_name}/recorded-streams` — a unit's timeline, made to be asked every second or two. */
export interface RecordedStreams {
  run_id: string
  unit_name: string
  served_at: string
  /** The same verdict as on `state-frames/latest`, from the same function. */
  recording: string | null
  /** `["stream_kind", "stream_name"]` */
  key: string[]
  streams: RecordedStream[]
}

/**
 * `GET …/recorded-streams/window` — a unit's frames whose `frame_time` lies in [from, to), oldest
 * first, at most `limit` of them. A page never ends inside a millisecond, so `returned` can exceed
 * `limit` where a replay's clock stood still.
 */
export interface RecordedWindow {
  run_id: string
  unit_name: string
  served_at: string
  /** The bounds as asked; a bound left out is filled from the frames held, null where none is. */
  window: { from: string | null, to: string | null }
  matched: number
  returned: number
  limit: number
  truncated: boolean
  /** Set only where the page left frames out: the next page starts here, with the same `to`. */
  next_from: string | null
  /** `{ state_frames: ["record_no"] }` */
  keys: Record<string, string[]>
  state_frames: RecordedStateFrame[]
}
