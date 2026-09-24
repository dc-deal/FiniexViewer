/**
 * How booking periods are ordered for display — and the ONE answer both the chart and the table
 * under it use.
 *
 * They sit one above the other, so two orders means the reader has to find every row again after
 * looking at a bar. The backend returns periods oldest-first by opening time, which puts a scenario
 * set's bars in an order that reads as scattered; ordering the LANES by start time gives the
 * diagonal that makes such a chart legible. Either way this is a presentation decision and is
 * stated as one.
 *
 * The order itself is a stored preference, so `LaneOrder` lives in `settings_types` — this module
 * only applies it.
 */
import type { LaneOrder } from '@/types/settings_types'

/** The minimum a row needs for either ordering. */
export interface OrderableRow {
  opened_at: string
  segment_no: number
}

/**
 * Rows grouped by lane and, inside a lane, by segment. The lanes themselves come first by their
 * earliest opening (`time`) or by name (`name`).
 *
 * `laneOf` says what a lane IS, which differs by scope: the unit inside one run, the session across
 * a deployment. Nothing is dropped and nothing is merged — only the order changes.
 */
export function orderPeriods<T extends OrderableRow>(
  rows: T[],
  order: LaneOrder,
  laneOf: (row: T) => string
): T[] {
  const earliest = new Map<string, number>()
  for (const row of rows) {
    const lane = laneOf(row)
    const at = new Date(row.opened_at).getTime()
    const known = earliest.get(lane)
    if (known === undefined || at < known) earliest.set(lane, at)
  }

  const laneRank = (row: T): number =>
    order === 'time' ? (earliest.get(laneOf(row)) ?? 0) : 0

  return [...rows].sort((a, b) => {
    if (order === 'name') {
      const byName = laneOf(a).localeCompare(laneOf(b))
      if (byName !== 0) return byName
    } else {
      const byTime = laneRank(a) - laneRank(b)
      if (byTime !== 0) return byTime
      // two lanes that opened at the same instant still need a stable order
      const byName = laneOf(a).localeCompare(laneOf(b))
      if (byName !== 0) return byName
    }
    return a.segment_no - b.segment_no
  })
}
