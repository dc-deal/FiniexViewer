import { describe, it, expect } from 'vitest'
import { periodCard } from '@/components/runs/booking_period_card'
import { ORDER_REFUSALS } from '@/components/runs/report_format'
import { periodSpans, refusalMarks } from '@/components/runs/run_chart_lane'
import type { BookingPeriodRow, BookingPeriodsReport, OrderHistoryReport, OrderHistoryRow } from '@/types/api/report_types'

import periodsFixture from './fixtures/run_booking_periods.json'
import ordersFixture from './fixtures/order_history.json'

const PERIOD = (periodsFixture as BookingPeriodsReport).periods[0] as BookingPeriodRow
const ORDERS = (ordersFixture as OrderHistoryReport).orders
const REFUSING = 'EURGBP_refusals_01'

const HOUR = 3600
const T0 = Date.parse('2025-10-10T00:00:00Z') / 1000

/** Hourly bars from `T0`, `count` of them — stamped with their open, as the bars are. */
function hours(count: number, from = T0): number[] {
  return Array.from({ length: count }, (_, index) => from + index * HOUR)
}

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function period(fields: Partial<BookingPeriodRow>): BookingPeriodRow {
  return { ...PERIOD, unit_name: 'u', ...fields }
}

function order(fields: Partial<OrderHistoryRow>): OrderHistoryRow {
  return { ...ORDERS[0]!, scenario_name: 'u', ...fields }
}

/** The time lane along the bottom of the run chart (viewer#41, section D), read from what the run's reports hold. */
describe('run_chart_lane', () => {
  describe('periodSpans', () => {
    it('spans a period from the bar it opened in to the bar it closed in, its sign and colour from its net, its card that of the table', () => {
      const row = period({ period_no: 4, opened_at: iso(T0 + HOUR / 2), closed_at: iso(T0 + 3 * HOUR), net_pnl: 12.5 })
      const [span] = periodSpans([row], 'u', hours(6), null)
      expect(span).toMatchObject({ kind: 'span', from: T0, to: T0 + 3 * HOUR, endsAtOpen: true, label: '+', role: 'positive' })
      expect(span!.card).toEqual(periodCard(row))
      // closed inside a bar, the period reaches to that bar's right edge
      const inside = periodSpans([period({ closed_at: iso(T0 + 3 * HOUR + 60), opened_at: iso(T0) })], 'u', hours(6), null)[0]!
      expect(inside.endsAtOpen).toBe(false)
      expect(periodSpans([period({ net_pnl: -1 })], 'u', hours(48), null)[0]).toMatchObject({ label: '−', role: 'negative' })
    })

    it('starts a period that opened before the first bar at it, and draws none that closed before it or opened past the bars loaded', () => {
      const bars = hours(4, T0 + 10 * HOUR)
      const early = period({ opened_at: iso(T0), closed_at: iso(T0 + 12 * HOUR) })
      expect(periodSpans([early], 'u', bars, null)[0]!.from).toBe(T0 + 10 * HOUR)
      expect(periodSpans([period({ opened_at: iso(T0), closed_at: iso(T0 + 5 * HOUR) })], 'u', bars, null)).toEqual([])
      const cut = T0 + 11 * HOUR
      expect(periodSpans([period({ opened_at: iso(T0 + 12 * HOUR), closed_at: iso(T0 + 13 * HOUR) })], 'u', bars, cut)).toEqual([])
      expect(periodSpans([], 'u', [], null)).toEqual([])
    })

    it('draws the periods of the unit on show and of no other', () => {
      const rows = [period({ opened_at: iso(T0), closed_at: iso(T0 + HOUR) }), period({ unit_name: 'other', opened_at: iso(T0), closed_at: iso(T0 + HOUR) })]
      expect(periodSpans(rows, 'u', hours(4), null)).toHaveLength(1)
    })
  })

  describe('refusalMarks', () => {
    it('marks each order refused or expired at the bar it ended in: a cross in the warning role, a ring in the quiet one', () => {
      const rows = [
        order({ order_id: 'a', status: 'denied', event_time: iso(T0 + 10) }),
        order({ order_id: 'b', status: 'expired', event_time: iso(T0 + 2 * HOUR + 10), rejection_reason: null, end_reason: 'data_end' }),
        order({ order_id: 'c', status: 'executed', event_time: iso(T0 + HOUR) }),
        order({ order_id: 'd', status: 'rejected', event_time: null }),
        order({ order_id: 'e', status: 'denied', event_time: iso(T0 + 10), scenario_name: 'other' }),
      ]
      const marks = refusalMarks(rows, 'u', hours(4), null, 1)
      expect(marks.map(mark => [mark.time, mark.shape, mark.role, mark.text])).toEqual([
        [T0, 'cross', 'warning', ''],
        [T0 + 2 * HOUR, 'ring', 'flat', ''],
      ])
      expect(marks[0]!.card.title).toBe('Order refused')
      expect(marks[0]!.card.details).toContainEqual({ label: 'Status', value: 'denied' })
      expect(marks[0]!.card.details.at(-1)).toEqual({ label: 'Order id', value: 'a' })
      expect(marks[1]!.card.title).toBe('Order expired')
      expect(marks[1]!.card.details).toContainEqual({ label: 'Reason', value: 'data_end' })
      // the refusals the Orders panel marks, all four of them, not only the two this archive carries
      expect(refusalMarks([order({ status: 'undelivered', event_time: iso(T0 + 10) })], 'u', hours(4), null, 1)[0])
        .toMatchObject({ shape: 'cross', role: 'warning' })
    })

    /** The refusing unit of the capture, its refusals over three weeks: gathered where they would cover each other, never lost. */
    it('gathers the marks that would cover each other into one with a count, its card listing them', () => {
      const refused = ORDERS.filter(row => row.scenario_name === REFUSING && ORDER_REFUSALS.has(row.status) && row.event_time)
      expect(refused.length).toBeGreaterThan(8)
      const bars = hours(24 * 22)
      const apart = refusalMarks(ORDERS, REFUSING, bars, null, 1)
      const counted = apart.reduce((sum, mark) => sum + (mark.text ? Number(mark.text.slice(1)) : 1), 0)
      expect(counted).toBe(refused.length)

      const [all] = refusalMarks(ORDERS, REFUSING, bars, null, bars.length)
      expect(all!.text).toBe(`×${refused.length}`)
      expect(all!.card.title).toBe(`${refused.length} orders refused`)
      // a handful of lines, then how many more
      expect(all!.card.details.at(-1)).toEqual({ label: `+${refused.length - 8}`, value: 'more — zoom in to draw them apart' })
    })

    /** One row: a cross and a ring kept apart stood over each other, and a count beside its mark under the next one. */
    it('gathers a refusal and an expiry together as a cross, and keeps the room of a count free of the next mark', () => {
      const both = refusalMarks([
        order({ order_id: 'a', status: 'expired', event_time: iso(T0 + 10) }),
        order({ order_id: 'b', status: 'rejected', event_time: iso(T0 + 20) }),
      ], 'u', hours(4), null, 1)
      expect(both).toHaveLength(1)
      expect(both[0]).toMatchObject({ shape: 'cross', role: 'warning', text: '×2' })
      expect(both[0]!.card.title).toBe('1 order refused · 1 expired')
      expect(both[0]!.card.details.map(line => line.label)).toEqual(['Between', 'expired', 'rejected'])

      // two in the first bar carry a count, so the one two bars on joins them; alone, the first would not reach it
      const at = (hour: number, id: string): OrderHistoryRow => order({ order_id: id, status: 'denied', event_time: iso(T0 + hour * HOUR + 10) })
      expect(refusalMarks([at(0, 'a'), at(0, 'b'), at(2, 'c')], 'u', hours(4), null, 1).map(mark => mark.text)).toEqual(['×3'])
      expect(refusalMarks([at(0, 'a'), at(2, 'c')], 'u', hours(4), null, 1).map(mark => mark.text)).toEqual(['', ''])
    })

    it('draws nothing that ended past the bars loaded', () => {
      const rows = [order({ status: 'denied', event_time: iso(T0 + 3 * HOUR) })]
      expect(refusalMarks(rows, 'u', hours(4), T0 + 2 * HOUR, 1)).toEqual([])
    })
  })
})
