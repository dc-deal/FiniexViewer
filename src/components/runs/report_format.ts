import type { RunInfo } from '@/types/api/report_types'
import type { Figure, Polarity } from '@/types/figure_types'
import { t } from '@/translate'

// Fixed locale on purpose: the rest of the panels format with toFixed (dot decimals), and a
// browser-locale separator would put '-50,60 USD' next to a profit factor of '0.57'.
const decimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// A holding, a size or a price, to the eighth decimal and no further: a satoshi is the finest step
// any venue here quotes, and a figure the session COMPUTED carries float noise below it
// (`0.018555830000000002` ETH) that is no digit of the amount.
const fine = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })

// What a strategy's worker or decision states about itself, to four decimals: a reading, not money.
const reading = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })

/**
 * The bare figure, for a table that states its currency ONCE in the column header. Repeating the
 * code in every cell is what makes such a table too wide to read without scrolling — and it says
 * the same thing N times.
 */
export function figure(value: number): string {
  return decimal.format(value)
}

/**
 * Why a run has no report, in one sentence for every place that says it — the run bundle above its
 * column, and a section opened as a panel of its own. `reporting` tells a run never meant to write
 * one from one that has not yet; a session recording its state frames says which of the two the
 * second is (contract 38), where nothing else on the row can.
 */
export function noReportReason(run: RunInfo): string {
  if (run.reporting !== 'expected') return t('This run exists as logs only — it was never meant to write a report')
  if (run.recording === 'current') return t('This session is still running — its report is written when it ends')
  if (run.recording === 'stopped') {
    return t('This session stopped recording without an end — it hangs or its process died, and wrote no report')
  }
  return t('This run has no report — it is still running, or it died before its report phase')
}

/** A holding, a size or a price, with no decimal the venue could not have quoted. */
export function quantity(value: number): string {
  return fine.format(value)
}

/**
 * A value a worker or a decision reports, under the strategy's own key: a number to four decimals,
 * anything else as it came. The keys are the strategy's, so nothing here knows what a value means.
 */
export function readingOf(value: unknown): string {
  if (typeof value === 'number') return reading.format(value)
  if (value === null || value === undefined) return t('none')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** Currency amount. The code is appended as text — quote currencies are not all ISO-4217. */
export function amount(value: number, currency: string): string {
  return `${figure(value)} ${currency}`
}

/**
 * A spread figure, or the words for its absence. null means the data the unit read carried NO
 * QUOTE — every row bid = ask — so no spread was measured, which is not a spread of zero (contract
 * 32; their `portfolio` and `trade-history` documents). `SPREAD_NOT_RECORDED` says so on hover.
 */
export function spreadFigure(value: number | null, format: (value: number) => string): string {
  return value === null ? t('not recorded') : format(value)
}

export const SPREAD_NOT_RECORDED = t('The data this unit read carried no quote, so no spread was measured — not a spread of zero.')

export const MODELLED_SPREAD_NOTE = t('Crossed against quotes the backtest modelled for data recorded without one. It stands beside the measured spread, and the two add up to what the fills crossed.')

/**
 * The spread crossed against quotes a backtest MODELLED for data recorded without one (contract 33;
 * their glossary's *modelled spread*), as a figure to stand beside the measured one — or none where
 * nothing was modelled: 0 on every run over recorded quotes, and null on a period recorded before
 * the contract, would be a line of noise on all of them. An array, so a list can spread it in place.
 */
export function modelledSpreadFigures(value: number | null, format: (value: number) => string): Figure[] {
  if (!value) return []
  return [{ label: t('Modelled spread'), value: format(value), title: MODELLED_SPREAD_NOTE }]
}

/** Backend ratios are 0..1 — the percent conversion happens here, at the render edge. */
export function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/**
 * A figure that is ALREADY a percentage and must not be scaled again.
 *
 * `_pct` IS a rule — the backend swept every field carrying it and found no counterexample, so a
 * `_pct` field is always multiplied. `_rate` and `_ratio` are NOT a rule and must be read per
 * field: `win_rate` is 0..1, `conversion_rate` is an FX price, and `open_at_boundary_ratio` is a
 * percentage despite the name. Confirmed by the backend 2026-09-23.
 *
 * Passing one to the other formatter is out by a factor of 100 and still looks like a percentage.
 * Measured: `max_drawdown_pct: 3.4737` is 3.47 %, which we once rendered as 347.4 %.
 */
export function percentFigure(value: number): string {
  return `${value.toFixed(2)}%`
}

/**
 * Plain decimal, or n/a when the value is undefined rather than zero. Pass the size of the
 * subset it was measured over wherever one exists: not every section sends null for an absent
 * value — an untraded portfolio unit arrives with 0.0, and 0.00 would claim a measurement.
 */
export function numberOrNa(value: number | null, count?: number): string {
  if (value === null || count === 0) return t('n/a')
  return value.toFixed(2)
}

/** Percentage of a 0..1 ratio, gated on the subset it was measured over — see numberOrNa. */
export function percentOrNa(ratio: number, count: number): string {
  return count === 0 ? t('n/a') : percent(ratio)
}

/**
 * R-denominated value, signed like the backend console, and gated on the count of ITS OWN
 * subset. A run can have R-defined trades with no winner among them, so r_trade_count alone
 * would still print a mean nobody measured.
 */
export function rValue(value: number | null, count: number): string {
  if (count === 0 || value === null) return t('n/a')
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}R`
}

// UTC on purpose, and not the viewer's zone. A log entry's event_time is the canonical clock —
// the market time the run read, which in a backtest is the replayed tick's — so relabelling it in
// a local zone would present a simulated moment as a real one.
const utcClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

/**
 * ISO-8601 instant rendered as UTC. Empty for null — an absent time stays a hole.
 *
 * And empty for a stamp that is not a date, which is the SAME hole: `formatToParts` throws a
 * `RangeError` on an invalid date rather than returning anything, so one damaged field in one row
 * took down the whole list it was in. Measured 2026-09-30 on the run list, where a row carrying a
 * damaged `start_time` is a case the column beside it already handles.
 */
export function utcInstant(iso: string | null): string {
  const part = utcParts(iso)
  if (!part) return ''
  return `${part['year']}-${part['month']}-${part['day']} ${part['hour']}:${part['minute']}:${part['second']}Z`
}

/** The pieces of an instant on the UTC clock; null for none and for a stamp that is not a date. */
function utcParts(iso: string | null): Record<string, string> | null {
  if (iso === null) return null
  if (Number.isNaN(new Date(iso).getTime())) return null
  const part: Record<string, string> = {}
  for (const piece of utcClock.formatToParts(new Date(iso))) part[piece.type] = piece.value
  return part
}

/**
 * A stretch between two UTC instants, the date said once where both fall on the same day:
 * `2026-10-12 20:57:34Z → 20:59:06Z`. A deployment's first and last session start.
 */
export function utcSpan(from: string | null, to: string | null): string {
  const start = utcParts(from)
  const end = utcParts(to)
  const sameDay = start !== null && end !== null
    && start['year'] === end['year'] && start['month'] === end['month'] && start['day'] === end['day']
  return `${utcInstant(from)} → ${sameDay ? `${end['hour']}:${end['minute']}:${end['second']}Z` : utcInstant(to)}`
}

/**
 * When something started, in the reader's own zone — a run in the run list and in the run line, a
 * deployment's first and last session. The id encodes the same instant, but nobody reads
 * `20260925_095227` as a date at a glance.
 *
 * A label says only what its neighbours do not, which is the same rule the time axis follows: the
 * year is dropped inside the current one and kept outside it, and the seconds are gone — two runs
 * of the same minute are told apart by the id, not by this. `Sep 29, 2026, 12:27 PM` was 22
 * characters and needed 13rem of a 28rem panel, which is what made the narrowest tier overflow by
 * 24 px. `Sep 29, 12:27` is 13.
 *
 * The MONTH stays a word on purpose. These columns are the reader's own zone while the card beside
 * them carries UTC, and a numeric `2026-09-29 12:27` reads like the canonical clock that it is not.
 * Empty for a stamp that is not a date; the caller says what it says for none. One copy since
 * 2026-10-14 — the run list and the deployment list had one each, and they told an unreadable
 * stamp apart differently.
 */
export function startedAt(iso: string): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const sameYear = at.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(undefined, {
    ...(sameYear ? {} : { year: 'numeric' }),
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(at)
}

/**
 * An ISO-8601 stamp as a sort key. Parsed rather than compared as text: the stamps carry an
 * explicit offset, and two offsets sort lexicographically in the wrong order. An unreadable stamp
 * becomes `0`, so it sorts last under "newest" rather than jumping to the top.
 */
export function sortInstant(iso: string): number {
  const at = Date.parse(iso)
  return Number.isNaN(at) ? 0 : at
}

/**
 * Two sizes compared larger first, for a sort. One that could not be read (`null`) sorts last: it
 * is no figure, and certainly not the smallest.
 */
export function largerFirst(a: number | null, b: number | null): number {
  return (b ?? -1) - (a ?? -1)
}

/** The polarity of a figure, by its sign — the one rule behind every colour that says gain or loss. */
export function polarity(value: number): Polarity {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'flat'
}

/** Sign class for P&L-denominated cells. Empty for zero — no colour claim on a flat result. */
export function signClass(value: number): string {
  const sign = polarity(value)
  return sign === 'flat' ? '' : sign
}

/**
 * A quantity that has only ONE direction by definition — a drawdown, an adverse excursion —
 * rendered as a magnitude whatever sign arrived.
 *
 * The sign is not reliable, and measurably so. A stored booking-period artifact keeps the negative
 * form the backend has since aligned to a magnitude, with nothing in the payload to tell the eras
 * apart. And within ONE trade-history response, `mae_pnl` is signed (−18,399.05) while
 * `largest_mae` is the magnitude of that same number (+18,399.05). Since the direction is already
 * carried by the NAME, dropping the sign loses nothing and is correct under both conventions.
 */
export function magnitude(value: number, currency: string): string {
  return amount(Math.abs(value), currency)
}

/**
 * A figure that may not have been measured, or the dash that says so — their nulls document: show
 * absence as absence, never a zero, which would assert a measurement nobody took. Since contract 40
 * a drawdown and an equity band are null where nothing could value the account, and a session's
 * `ran_hours` until its close is booked.
 */
export function orDash(value: number | null, format: (value: number) => string): string {
  return value === null ? '—' : format(value)
}

/** A drawdown with its share where one is stated (`_pct` is already a percentage), or the dash. */
export function drawdownFigure(value: number | null, share: number | null, currency: string): string {
  if (value === null) return '—'
  const shown = magnitude(value, currency)
  return share === null ? shown : `${shown} (${percentFigure(share)})`
}

/**
 * The time of day of a reading, in the reader's own zone — `19:03:45`: for a figure measured just
 * now, whose date says nothing. A stamp that is not a date is shown as it came. One copy for the
 * menu bar's machine status and the Activities panel.
 */
export function clockTime(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(at)
}

/**
 * A stretch of time in the unit that keeps it truthful. Seconds below a minute on purpose: a
 * session that ran 22 seconds rounds to "0 min", which reads as one that never ran at all.
 */
export function duration(hours: number): string {
  const seconds = hours * 3600
  if (seconds < 60) return `${seconds.toFixed(0)} s`
  if (hours < 1) return `${(hours * 60).toFixed(0)} min`
  if (hours < 48) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} d`
}

/**
 * MARKET time — how much of the market a run read, which is the question `duration` above does not
 * answer. Kept separate from it on purpose: a holding period shortens to seconds, while a market
 * span is read in hours and then in days, and the backend's own printout states both together once
 * it passes a day. `null` is the figure a run never recorded, never a zero.
 */
export function marketSpan(seconds: number | null): string {
  if (seconds === null) return t('n/a')
  const hours = seconds / 3600
  if (hours < 48) return `${hours.toFixed(1)} h`
  return `${hours.toFixed(1)} h (${(hours / 24).toFixed(1)} ${t('days')})`
}

/**
 * A size in bytes, in the step a reader can hold. Decimal steps and decimal names, deliberately:
 * kB at 1024 is the wrong name for the number, and the figure is here for orientation — how much
 * an archived run weighs — never for accounting.
 */
export function bytes(value: number): string {
  if (value < 1000) return `${value} B`
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)} kB`
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)} MB`
  return `${(value / 1_000_000_000).toFixed(2)} GB`
}

/**
 * A long hash shortened to the part that distinguishes it, with the whole of it a hover away —
 * the same treatment the run id gets in the list. A `config_id` is 64 characters, and a card
 * carrying one in full is wider than the panel it sits over.
 */
export function shortHash(value: string): string {
  return value.length > 14 ? `${value.slice(0, 12)}…` : value
}
