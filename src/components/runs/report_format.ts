import { t } from '@/translate'

// Fixed locale on purpose: the rest of the panels format with toFixed (dot decimals), and a
// browser-locale separator would put '-50,60 USD' next to a profit factor of '0.57'.
const decimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Currency amount. The code is appended as text — quote currencies are not all ISO-4217. */
export function amount(value: number, currency: string): string {
  return `${decimal.format(value)} ${currency}`
}

/** Backend ratios are 0..1 — the percent conversion happens here, at the render edge. */
export function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
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

// UTC on purpose, and not the viewer's zone. A log entry's event_time is the RUN's own clock —
// simulated market time in a backtest — so relabelling it in a local zone would present a
// simulated moment as a real one.
const utcClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

/** ISO-8601 instant rendered as UTC. Empty for null — an absent time stays a hole. */
export function utcInstant(iso: string | null): string {
  if (iso === null) return ''
  const part: Record<string, string> = {}
  for (const piece of utcClock.formatToParts(new Date(iso))) part[piece.type] = piece.value
  return `${part['year']}-${part['month']}-${part['day']} ${part['hour']}:${part['minute']}:${part['second']}Z`
}

/** Sign class for P&L-denominated cells. Empty for zero — no colour claim on a flat result. */
export function signClass(value: number): string {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return ''
}
