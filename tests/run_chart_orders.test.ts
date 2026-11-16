import { describe, it, expect } from 'vitest'
import { priceAt } from '@/components/runs/report_format'
import { restingOrders } from '@/components/runs/run_chart_orders'
import type { OrderEvent, OrderEventsReport } from '@/types/api/report_types'
import liveFixture from './fixtures/order_events_live.json'

/**
 * The orders of a unit that rested at a price, read off its order-event stream: one segment per
 * stretch at one price, from the step the venue took it at to the step that ended it. Against the
 * captured field study, where limit orders were placed and cancelled, and against steps written here
 * for the cases no run in the archive produced yet — a modification, a trigger.
 */
const LIVE = (liveFixture as unknown as OrderEventsReport).events
const START = Date.parse('2026-01-01T00:00:00Z') / 1000
/** Minute bars over the first hour. */
const BARS = Array.from({ length: 60 }, (_, index) => START + index * 60)

function minute(at: number): string {
  return new Date((START + at * 60) * 1000).toISOString()
}

function step(seq: number, eventType: string, fields: Partial<OrderEvent> = {}): OrderEvent {
  return {
    scenario_name: 'unit', seq, event_type: eventType, order_id: 'pos_1', submitted_seq: 1, record_plane: 'bot',
    position_id: 'pos_1', action: 'open', order_type: 'limit', symbol: 'BTCUSD', direction: 'long',
    client_order_id: null, broker_ref: null, previous_broker_ref: null, trade_id: null, lots: 0.1, cum_lots: null,
    fill_price: null, limit_price: 100, trigger_price: null, fee: null, fee_currency: null, fee_source: null,
    submission_mid: null, submission_time_msc: null, in_flight_ms: null, event_time: minute(seq), ts_init: null,
    initiator: null, end_reason: null, rejection_reason: null, venue_reason: null, message: null, lost_request: null,
    ...fields,
  }
}

function bar(at: number): number {
  return START + at * 60
}

describe('restingOrders', () => {
  it('draws an order from where the venue took it to the step that ended it, with its words and how it ended', () => {
    const segments = restingOrders([
      step(1, 'submitted'), step(2, 'accepted'), step(4, 'cancel_requested'),
      step(5, 'cancelled', { end_reason: 'cancel_requested', initiator: 'strategy' }),
    ], 'unit', BARS, null)
    expect(segments).toHaveLength(1)
    const [order] = segments
    expect(order).toMatchObject({ from: bar(2), to: bar(5), price: 100, label: 'limit · open long', role: 'order', stroke: 'dotted' })
    const card = Object.fromEntries(order!.card.details.map(figure => [figure.label, figure.value]))
    expect(card['Limit']).toBe(priceAt(100, null))
    expect(card['Ended']).toMatch(/^cancelled · /)
    expect(card['End reason']).toBe('cancel_requested')
    expect(card['Initiator']).toBe('strategy')
  })

  it('ends a filled order at its fill', () => {
    const [order] = restingOrders([step(2, 'accepted'), step(7, 'filled', { fill_price: 100 })], 'unit', BARS, null)
    expect(order).toMatchObject({ from: bar(2), to: bar(7) })
  })

  /** A modification moves the price: the same order goes on at the new one, its words drawn once. */
  it('starts a stretch at the new price where the order was modified', () => {
    const segments = restingOrders([
      step(2, 'accepted'), step(3, 'modify_requested'), step(4, 'modified', { limit_price: 101 }), step(6, 'filled'),
    ], 'unit', BARS, null)
    expect(segments.map(({ from, to, price, label }) => ({ from, to, price, label }))).toEqual([
      { from: bar(2), to: bar(4), price: 100, label: 'limit · open long' },
      { from: bar(4), to: bar(6), price: 101, label: '' },
    ])
    expect(segments[1]!.card.details.map(figure => figure.label)).toContain('Modified')
  })

  /** A stop-limit waits at its trigger, then at its limit; a stop without a limit rests no longer once reached. */
  it('holds a stop at its trigger, and a stop-limit at its limit once triggered', () => {
    const stopLimit = restingOrders([
      step(2, 'accepted', { order_type: 'stop_limit', trigger_price: 105, limit_price: 106 }),
      step(3, 'triggered', { order_type: 'stop_limit', trigger_price: 105, limit_price: 106 }),
      step(5, 'filled', { order_type: 'stop_limit', trigger_price: 105, limit_price: 106 }),
    ], 'unit', BARS, null)
    expect(stopLimit.map(({ from, to, price }) => ({ from, to, price }))).toEqual([
      { from: bar(2), to: bar(3), price: 105 },
      { from: bar(3), to: bar(5), price: 106 },
    ])
    expect(stopLimit[0]!.card.details[0]!.label).toBe('Trigger')
    const stop = restingOrders([
      step(2, 'accepted', { order_type: 'stop', trigger_price: 95, limit_price: null }),
      step(4, 'triggered', { order_type: 'stop', trigger_price: 95, limit_price: null }),
      step(5, 'filled', { order_type: 'stop', trigger_price: 95, limit_price: null }),
    ], 'unit', BARS, null)
    expect(stop.map(({ from, to, price }) => ({ from, to, price }))).toEqual([{ from: bar(2), to: bar(4), price: 95 }])
  })

  it('draws nothing of an order that never rested at a price', () => {
    const never = [
      // refused by the venue
      step(1, 'submitted'), step(2, 'rejected'),
      // denied before anything was sent: no submission
      step(3, 'denied', { submitted_seq: null }),
      // a market order: no price to rest at
      step(4, 'submitted', { submitted_seq: 4, order_type: 'market', limit_price: null }),
      step(5, 'accepted', { submitted_seq: 4, order_type: 'market', limit_price: null }),
      step(6, 'filled', { submitted_seq: 4, order_type: 'market', limit_price: null }),
    ]
    expect(restingOrders(never, 'unit', BARS, null)).toEqual([])
  })

  /** Still resting at the end of the record, or no longer asked about: the venue may hold it still. */
  it('runs an order that never ended to the edge, an unaccounted one as well', () => {
    expect(restingOrders([step(2, 'accepted')], 'unit', BARS, null)[0]).toMatchObject({ from: bar(2), to: null })
    const lost = restingOrders([step(2, 'accepted'), step(9, 'unaccounted')], 'unit', BARS, null)
    expect(lost[0]).toMatchObject({ to: null })
    expect(Object.fromEntries(lost[0]!.card.details.map(figure => [figure.label, figure.value]))['Ended']).toBe('not in the record')
  })

  it('draws an order that rested within one bar as a stroke at that bar', () => {
    const [order] = restingOrders([
      step(1, 'accepted', { event_time: '2026-01-01T00:02:10Z' }), step(2, 'cancelled', { event_time: '2026-01-01T00:02:40Z' }),
    ], 'unit', BARS, null)
    expect(order).toMatchObject({ from: bar(2), to: bar(2) })
  })

  /**
   * The bars loaded so far: an order taken past them waits for its bar; one that ended past them runs
   * to the edge of what is loaded. Before the first bar: over before it, nothing; resting into it, from it.
   */
  it('keeps to the bars loaded', () => {
    expect(restingOrders([step(5, 'accepted')], 'unit', BARS, bar(3))).toEqual([])
    expect(restingOrders([step(2, 'accepted'), step(5, 'cancelled')], 'unit', BARS, bar(3))[0]).toMatchObject({ from: bar(2), to: null })
    const later = BARS.slice(10)
    expect(restingOrders([step(2, 'accepted'), step(5, 'cancelled')], 'unit', later, null)).toEqual([])
    expect(restingOrders([step(2, 'accepted'), step(15, 'cancelled')], 'unit', later, null)[0]).toMatchObject({ from: bar(10), to: bar(15) })
  })

  it('draws only the unit asked for', () => {
    expect(restingOrders([step(2, 'accepted', { scenario_name: 'other' })], 'unit', BARS, null)).toEqual([])
  })

  /** The field study: every order the venue took at a price is drawn from its acceptance, each once. */
  it('draws every order of the captured field study that rested at a price', () => {
    const unit = LIVE[0]!.scenario_name
    const times = LIVE.flatMap(entry => entry.event_time ? [Date.parse(entry.event_time) / 1000] : [])
    const first = Math.floor(Math.min(...times) / 60) * 60
    const bars = Array.from({ length: Math.ceil((Math.max(...times) - first) / 60) + 1 }, (_, index) => first + index * 60)
    const rested = new Set(LIVE
      .filter(entry => entry.event_type === 'accepted' && (entry.limit_price !== null || entry.trigger_price !== null))
      .map(entry => entry.submitted_seq))
    const segments = restingOrders(LIVE, unit, bars, null)
    expect(rested.size).toBeGreaterThan(0)
    expect(segments.filter(segment => segment.label !== '')).toHaveLength(rested.size)
    for (const segment of segments) {
      const order = Number(segment.id.split('|')[2])
      const prices = LIVE.filter(entry => entry.submitted_seq === order).flatMap(entry => [entry.limit_price, entry.trigger_price])
      expect(prices).toContain(segment.price)
    }
  })
})
