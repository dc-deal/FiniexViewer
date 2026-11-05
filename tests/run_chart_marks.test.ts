import { describe, it, expect } from 'vitest'
import {
  SERVED_BAR_MAX, barOf, barsPerMark, executedOpenings, exitMarks, focusTime, gatherMarks, openingMarks, timeframeOffer,
} from '@/components/runs/run_chart_marks'
import type {
  OpenPosition, OrderHistoryReport, OrderHistoryRow, PortfolioReport, TradeHistoryReport, TradeRow,
} from '@/types/api/report_types'
import type { ChartMark, Opening } from '@/types/run_chart_types'

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

    /** The card and the line a gathered mark lists print the price at the tick size of the unit's instrument. */
    it('prints the prices of an opening at the tick size', () => {
      const widened = opening({ ...longOpening, executed_price: 1.1625800132751465 })
      const closed = trade({ ...long, stop_loss: 1.1654013009624113, take_profit: 1.1699000000000002 })
      const [mark] = openingMarks([widened], [], [closed], 'EUR', BARS, null, 0.00001)
      expect(mark!.card.details.find(pair => pair.label === 'Opened')?.value.endsWith('@ 1.16258')).toBe(true)
      expect(mark!.card.details).toContainEqual({ label: 'Stop loss', value: '1.16540' })
      expect(mark!.card.details).toContainEqual({ label: 'Take profit', value: '1.16990' })
      expect(mark!.line!.value).toContain('@ 1.16258 ·')
      const open: OpenPosition = {
        position_id: 'pos_1', direction: 'long', lots: 0.1, entry_price: 1.1, entry_time: longOpening.event_time,
        last_price: 1.1677499513751617, unrealized_pnl: 0, valued: true, stop_loss: null, take_profit: null,
      }
      const [held] = openingMarks([widened], [open], [], 'EUR', BARS, null, 0.00001)
      expect(held!.card.details.find(pair => pair.label === 'Last price')?.value).toBe('1.16775')
    })

    /** An own level says how a part ended, whichever part that was: it stands on that exit's card. */
    it('leaves an own level off the card of the opening', () => {
      const own = trade({ ...long, stop_loss: null, take_profit: null, exit_level: 0.86, close_reason: 'sl_triggered' })
      const [mark] = openingMarks([longOpening], [], [own], 'EUR', BARS, null)
      const labels = mark!.card.details.map(pair => pair.label)
      expect(labels).not.toContain('Own level')
      expect(labels).not.toContain('Stop loss')
    })

    it('says a position that could not be marked has no value, rather than a value of zero', () => {
      const open: OpenPosition = {
        position_id: 'pos_1', direction: 'long', lots: 0.1, entry_price: 0.87, entry_time: longOpening.event_time,
        last_price: 0.88, unrealized_pnl: 0, valued: false, stop_loss: null, take_profit: null,
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

    it('prints the prices of an exit at the tick size', () => {
      const widened = trade({
        ...long, entry_price: 1.1625800132751465, exit_price: 1.1677499513751617, stop_loss: null, take_profit: null,
        exit_level: 1.1677499513751617, close_reason: 'tp_triggered',
      })
      const [mark] = exitMarks([widened], KEY, BARS, null, 0.00001)
      expect(mark!.card.details.find(pair => pair.label === 'Opened')?.value.endsWith('@ 1.16258')).toBe(true)
      expect(mark!.card.details.find(pair => pair.label === 'Closed')?.value.endsWith('@ 1.16775')).toBe(true)
      expect(mark!.card.details).toContainEqual({ label: 'Own level', value: 'take profit 1.16775' })
    })

    /** A position closed in parts: the own level stands on the part it closed (contract 45), the partial's says none. */
    it('names an own level on the card of the part it closed, and on no other', () => {
      const levels = { stop_loss: null, take_profit: null }
      const rung = trade({ ...long, ...levels, exit_time: '2025-10-31T05:01:30+00:00', exit_tick_index: long.exit_tick_index + 1, exit_level: null, close_reason: '' })
      const fired = trade({ ...long, ...levels, exit_level: 0.86, close_reason: 'sl_triggered' })
      const [first, last] = exitMarks([rung, fired], KEY, BARS, null)
      expect(first!.card.details.map(pair => pair.label)).not.toContain('Own level')
      expect(last!.card.details).toContainEqual({ label: 'Own level', value: 'stop loss 0.86' })
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

  /** A mark is never narrower than the library's 12 px: at a bar of 0.5 px it covers thirty bars. */
  describe('barsPerMark', () => {
    it('counts the bars one mark covers at the width a bar has on screen', () => {
      expect(barsPerMark(null)).toBe(1)
      expect(barsPerMark(20)).toBe(1)
      expect(barsPerMark(6)).toBe(3)
      expect(barsPerMark(0.5)).toBe(30)
    })
  })

  describe('gatherMarks', () => {
    // ten bars a minute apart, 05:00 to 05:09
    const bars = Array.from({ length: 10 }, (_, index) => 1761886800 + index * 60)
    function entryAt(bar: number, position: string): ChartMark {
      return openingMarks(
        [opening({ ...longOpening, position_id: position, event_time: new Date((bars[bar]! + 5) * 1000).toISOString() })],
        [], [], 'EUR', bars, null,
      )[0]!
    }
    function exitAt(bar: number, position: string, net: number): ChartMark {
      return exitMarks([trade({
        ...long, position_id: position, exit_tick_index: bar, net_pnl: net,
        exit_time: new Date((bars[bar]! + 5) * 1000).toISOString(),
      })], KEY, bars, null)[0]!
    }

    it('draws marks that do not cover each other as they are', () => {
      const marks = [entryAt(0, 'pos_1'), entryAt(5, 'pos_2')]
      expect(gatherMarks(marks, bars, 3)).toEqual(marks)
    })

    /** One mark with a count where several would cover each other — its id and card its own. */
    it('gathers the marks of one kind and side that one mark would cover', () => {
      const [first, ...rest] = gatherMarks([entryAt(0, 'pos_1'), entryAt(1, 'pos_2'), entryAt(2, 'pos_3'), entryAt(3, 'pos_4')], bars, 3)
      expect(first).toMatchObject({ time: bars[0], role: 'entry', text: '×3', count: 3, id: 'gathered|entry|unit|pos_1' })
      // the next group starts where the first one's reach ends
      expect(rest).toHaveLength(1)
      expect(rest[0]!.count).toBeUndefined()
    })

    it('never gathers an opening with an exit, nor a mark above the bar with one below it', () => {
      const short = openingMarks([opening({ ...longOpening, position_id: 'pos_9', direction: 'short' })], [], [], 'EUR', bars, null)[0]!
      expect(gatherMarks([entryAt(0, 'pos_1'), exitAt(0, 'pos_2', 1), short], bars, 3)).toHaveLength(3)
    })

    /** An exit's sign stands before the count, and a mixed bundle claims no direction. */
    it('writes a gathered exit\'s results as one sign, or as mixed where they differ', () => {
      const gains = gatherMarks([exitAt(0, 'pos_1', 1), exitAt(1, 'pos_2', 2)], bars, 3)
      expect(gains[0]).toMatchObject({ role: 'positive', text: '+×2' })
      const mixed = gatherMarks([exitAt(0, 'pos_1', 1), exitAt(1, 'pos_2', -2), exitAt(2, 'pos_3', 0)], bars, 3)
      expect(mixed[0]).toMatchObject({ role: 'mixed', text: '±×3' })
    })

    it('leaves the position looked at standing apart', () => {
      const focused = { ...entryAt(1, 'pos_2'), focused: true }
      const marks = gatherMarks([entryAt(0, 'pos_1'), focused, entryAt(2, 'pos_3')], bars, 3)
      expect(marks.find(mark => mark.focused)).toBe(focused)
      expect(marks.find(mark => mark.count === 2)).toBeDefined()
    })

    /** The card lists the members one line each, a handful at most — never a total. */
    it('lists the members in the card, eight at most, and sums nothing', () => {
      const members = Array.from({ length: 10 }, (_, index) => exitAt(index % 10, `pos_${index}`, 1))
      const [gathered] = gatherMarks(members, bars, 30)
      expect(gathered!.card.title).toBe('10 trades closed')
      const labels = gathered!.card.details.map(pair => pair.label)
      expect(labels[0]).toBe('Between')
      expect(labels.slice(1, 9)).toEqual(members.slice(0, 8).map(member => member.line.label))
      expect(labels.at(-1)).toBe('+2')
      expect(labels).not.toContain('Net P&L')
    })
  })

  /**
   * A finer timeframe offered where it draws apart marks that share a candle — and only there:
   * marks of one instant no timeframe separates, and a window too long for it is not offered.
   */
  describe('timeframeOffer', () => {
    const MINUTES: Record<string, number> = { M1: 1, M5: 5, M15: 15, H1: 60 }
    const minutesFor = (timeframe: string): number | undefined => MINUTES[timeframe]
    const COVERED = ['M1', 'M5', 'M15', 'H1']
    const HOUR = [1761886800]
    function exitAtSecond(second: number, position: string): ChartMark {
      return exitMarks([trade({
        ...long, position_id: position, exit_tick_index: second,
        exit_time: new Date((HOUR[0]! + second) * 1000).toISOString(),
      })], KEY, HOUR, null)[0]!
    }

    it('offers the coarsest finer timeframe that draws the marks of a candle apart', () => {
      // seven and a half minutes apart: M5 draws them apart, M15 does not
      const offer = timeframeOffer([exitAtSecond(30, 'pos_1'), exitAtSecond(480, 'pos_2')], 'H1', COVERED, minutesFor, 24 * 60)
      expect(offer).toEqual({ timeframe: 'M5', candles: 1, apart: 1, at: HOUR[0]! + 30 })
    })

    it('offers nothing where the marks share an instant, or where no candle holds two', () => {
      expect(timeframeOffer([exitAtSecond(30, 'pos_1'), exitAtSecond(30, 'pos_2')], 'H1', COVERED, minutesFor, 60)).toBeNull()
      expect(timeframeOffer([exitAtSecond(30, 'pos_1')], 'H1', COVERED, minutesFor, 60)).toBeNull()
    })

    /** M5 would draw them apart, but past its 10,000 bars the route cuts the window. */
    it('offers nothing the route would cut: the window past its bars at that timeframe', () => {
      const marks = [exitAtSecond(30, 'pos_1'), exitAtSecond(480, 'pos_2')]
      expect(timeframeOffer(marks, 'H1', COVERED, minutesFor, (SERVED_BAR_MAX + 1) * 5)).toBeNull()
    })
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
