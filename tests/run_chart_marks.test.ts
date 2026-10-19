import { describe, it, expect } from 'vitest'
import {
  barOf, executedOpenings, exitMarks, focusTime, openingMarks,
} from '@/components/runs/run_chart_marks'
import type {
  OpenPosition, OrderHistoryReport, OrderHistoryRow, PortfolioReport, TradeHistoryReport, TradeRow,
} from '@/types/api/report_types'
import type { Opening } from '@/types/run_chart_types'

import orderFixture from './fixtures/order_history.json'
import portfolioFixture from './fixtures/portfolio.json'
import tradeFixture from './fixtures/trade_history.json'

const orders = (orderFixture as unknown as OrderHistoryReport).orders
const portfolio = portfolioFixture as unknown as PortfolioReport
const trades = (tradeFixture as unknown as TradeHistoryReport).trades
/** The key the trade history declares for its rows — what an exit mark's id is made of. */
const KEY = (tradeFixture as unknown as TradeHistoryReport).keys.trades
const openings = executedOpenings(orders)

// 2025-10-31 05:00, 05:01, 05:02 UTC
const BARS = [1761886800, 1761886860, 1761886920]

function opening(fields: Partial<Opening>): Opening {
  return { ...openings[0]!, ...fields }
}

function trade(fields: Partial<TradeRow>): TradeRow {
  return { ...trades[0]!, ...fields }
}

const long = trade({
  scenario_name: 'unit', position_id: 'pos_1', direction: 'long',
  entry_time: '2025-10-31T05:00:40+00:00', exit_time: '2025-10-31T05:02:10+00:00', net_pnl: 1.5,
})
const longOpening = opening({
  scenario_name: 'unit', position_id: 'pos_1', order_id: 'pos_1', direction: 'long',
  event_time: '2025-10-31T05:00:40+00:00',
})

describe('run_chart_marks', () => {
  describe('barOf', () => {
    const bars = [600, 660, 720]

    it('finds the bar that opened last at or before the instant', () => {
      expect(barOf(bars, 660)).toBe(660)
      expect(barOf(bars, 700)).toBe(660)
      expect(barOf(bars, 9999)).toBe(720)
    })

    it('finds none before the first bar, and none among no bars', () => {
      expect(barOf(bars, 599)).toBeNull()
      expect(barOf([], 600)).toBeNull()
    })
  })

  /** Every position the run opened has exactly one executed opening — closed later or not. */
  describe('executedOpenings', () => {
    it('keeps the executed opens, one per position', () => {
      expect(openings.length).toBeGreaterThan(0)
      expect(openings.every(row => row.action === 'open' && row.status === 'executed')).toBe(true)
      const positions = openings.map(row => `${row.scenario_name}~${row.position_id}`)
      expect(new Set(positions).size).toBe(positions.length)
    })

    it('leaves out a refusal, a close and a row that names no position', () => {
      const refused: OrderHistoryRow = { ...openings[0]!, status: 'rejected', position_id: null, executed_price: null }
      const closing: OrderHistoryRow = { ...openings[0]!, action: 'close' }
      const nameless: OrderHistoryRow = { ...openings[0]!, position_id: null }
      expect(executedOpenings([refused, closing, nameless])).toEqual([])
    })

    /** Measured on the fixture run: these positions opened and never produced a trade row. */
    it('holds the positions the trade history never mentions', () => {
      const traded = new Set(trades.map(entry => `${entry.scenario_name}~${entry.position_id}`))
      const untraded = openings.filter(row => !traded.has(`${row.scenario_name}~${row.position_id}`))
      expect(untraded.map(row => row.scenario_name)).toContain('EURGBP_left_open')
    })
  })

  describe('openingMarks', () => {
    /** An event belongs to the bar it fell in — 05:00:40 to the 05:00 bar, never the next one. */
    it('marks a long below its bar and a short above it, on the bar it opened in', () => {
      const short = opening({ ...longOpening, position_id: 'pos_2', direction: 'short' })
      expect(openingMarks([longOpening, short], [], [], 'EUR', BARS, null)).toMatchObject([
        { time: 1761886800, position: 'belowBar', shape: 'arrowUp', role: 'entry', text: '', focused: false },
        { time: 1761886800, position: 'aboveBar', shape: 'arrowDown', role: 'entry', text: '', focused: false },
      ])
    })

    it('draws the opening of the position looked at larger, and none before the bars', () => {
      const early = opening({ ...longOpening, position_id: 'pos_0', event_time: '2025-10-31T04:59:00+00:00' })
      const marks = openingMarks([longOpening, early], [], [], 'EUR', BARS, { scenario: 'unit', position: 'pos_1' })
      expect(marks).toHaveLength(1)
      expect(marks[0]).toMatchObject({ id: 'entry|unit|pos_1', focused: true })
    })

    /**
     * A position the run ended with still open has no trade row, so the portfolio is the only place
     * that says what was left of it — and its value there is a mark, not a result.
     */
    it('says in its card what was left of a position still open at the end', () => {
      const unit = portfolio.units.find(row => row.name === 'EURGBP_left_open')!
      const open = unit.open_positions[0]!
      const row = openings.find(entry => entry.scenario_name === unit.name && entry.position_id === open.position_id)!
      const [mark] = openingMarks([row], unit.open_positions, [], unit.currency, [0], null)
      const pairs = Object.fromEntries(mark!.card.details.map(pair => [pair.label, pair]))
      expect(mark!.card.title).toBe(`${row.position_id} · ${row.direction} ${row.executed_lots}`)
      expect(pairs['Opened']!.value).toContain(String(row.executed_price))
      expect(pairs['Still open']!.value).toBe(String(open.lots))
      expect(pairs['Last price']!.value).toBe(String(open.last_price))
      expect(pairs['Unrealized']!.title).toBe('A mark at the last price, not a result')
      expect(pairs['Unrealized']!.value).toContain(unit.currency)
    })

    it('says nothing of the end for a closed position, and takes its stops from its trade rows', () => {
      const closed = trade({ ...long, stop_loss: 0.86, take_profit: 0.89 })
      const [mark] = openingMarks([longOpening], [], [closed], 'EUR', BARS, null)
      const labels = mark!.card.details.map(pair => pair.label)
      expect(labels).not.toContain('Still open')
      expect(labels).toEqual(expect.arrayContaining(['Opened', 'Stop loss', 'Take profit']))
    })

    it('says a position that could not be marked has no value, rather than a value of zero', () => {
      const open: OpenPosition = {
        position_id: 'pos_1', direction: 'long', lots: 0.1, entry_price: 0.87, entry_time: longOpening.event_time,
        last_price: 0.88, unrealized_pnl: 0, valued: false, stop_loss: null, take_profit: null,
        protective_level_enforcement: '', take_profit_enforcement: '',
      }
      const [mark] = openingMarks([longOpening], [open], [], 'EUR', BARS, null)
      expect(mark!.card.details.find(pair => pair.label === 'Unrealized')).toMatchObject({ value: 'n/a' })
    })
  })

  describe('exitMarks', () => {
    it('marks a long\'s exit above its bar, and a gain with its sign as a word', () => {
      expect(exitMarks([long], KEY, BARS, null)).toMatchObject([
        { time: 1761886920, position: 'aboveBar', shape: 'circle', role: 'positive', text: '+', focused: false },
      ])
    })

    it('marks a short\'s exit the other way round, and a loss with its sign as a word', () => {
      const short = trade({ ...long, direction: 'short', net_pnl: -0.4 })
      expect(exitMarks([short], KEY, BARS, null).map(mark => [mark.position, mark.shape, mark.role, mark.text]))
        .toEqual([['belowBar', 'circle', 'negative', '−']])
    })

    /** A partial close books several trade rows of one position: an exit per part. */
    it('marks every part of a position closed in parts, a flat one as flat', () => {
      const part = trade({ ...long, exit_time: '2025-10-31T05:01:30+00:00', exit_tick_index: long.exit_tick_index + 1, net_pnl: 0 })
      const marks = exitMarks([long, part], KEY, BARS, null)
      expect(marks.map(mark => mark.time)).toEqual([1761886920, 1761886860])
      expect(marks.find(mark => mark.time === 1761886860)).toMatchObject({ role: 'flat', text: '0' })
      expect(new Set(marks.map(mark => mark.id)).size).toBe(2)
    })

    /** What the chart says at the pointer: which position, how it ended and what it came to. */
    it('gives an exit its trade row\'s key as its id, and a card naming how it ended', () => {
      const stopped = trade({ ...long, net_pnl: -0.2, close_reason: 'stop_loss' })
      const [mark] = exitMarks([stopped], KEY, BARS, { scenario: 'unit', position: 'pos_1' })
      expect(mark!.id.startsWith('exit|')).toBe(true)
      expect(mark!.focused).toBe(true)
      expect(mark!.card.details.map(pair => pair.label)).toEqual(expect.arrayContaining(['Closed', 'Closed by', 'Net P&L']))
      expect(mark!.card.details.find(pair => pair.label === 'Net P&L')).toMatchObject({ tone: 'negative' })
    })
  })

  it('stands every mark of the fixture run on a candle that exists', () => {
    const unit = 'EURGBP_refusals_01'
    const minute = (iso: string): number => Math.floor(Date.parse(iso) / 60_000) * 60
    const unitOpenings = openings.filter(row => row.scenario_name === unit)
    const unitTrades = trades.filter(entry => entry.scenario_name === unit)
    const times = [...new Set([
      ...unitOpenings.map(row => minute(row.event_time)),
      ...unitTrades.map(entry => minute(entry.exit_time)),
    ])].sort()
    const marks = [
      ...openingMarks(unitOpenings, [], unitTrades, 'EUR', times, null),
      ...exitMarks(unitTrades, KEY, times, null),
    ]
    expect(marks.filter(mark => mark.role === 'entry')).toHaveLength(unitOpenings.length)
    expect(marks.every(mark => times.includes(mark.time))).toBe(true)
  })

  describe('focusTime', () => {
    it('centres on where the position looked at opened', () => {
      expect(focusTime([longOpening], [], { scenario: 'unit', position: 'pos_1' })).toBe(1761886840)
      expect(focusTime([longOpening], [], null)).toBeNull()
      expect(focusTime([longOpening], [], { scenario: 'unit', position: 'pos_9' })).toBeNull()
    })

    /** A position inherited from an earlier session has no opening in its own run. */
    it('falls back on the earliest entry of its trade rows where the run holds no opening', () => {
      const later = trade({ ...long, entry_time: '2025-10-31T05:03:00+00:00' })
      expect(focusTime([], [later, long], { scenario: 'unit', position: 'pos_1' })).toBe(1761886840)
    })
  })
})
