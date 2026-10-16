import { describe, it, expect } from 'vitest'
import { autoTimeframe, barOf, chartUnits, defaultUnit, focusTime, tradeMarks } from '@/components/runs/run_chart'
import type { RunInfo, TradeHistoryReport, TradeRow } from '@/types/api/report_types'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'

import runsList from './fixtures/runs_list.json'
import scenarioFixture from './fixtures/scenario_details.json'
import tradeFixture from './fixtures/trade_history.json'

const RUN = '20261012_205715_c3b41fff'
const runInfo = (runsList as unknown as { runs: RunInfo[] }).runs.find(run => run.run_id === RUN)!
const scenarios = (scenarioFixture as unknown as ScenarioDetailsReport).units
const trades = (tradeFixture as unknown as TradeHistoryReport).trades
/** The key the trade history declares for its rows — what an exit mark's id is made of. */
const KEY = (tradeFixture as unknown as TradeHistoryReport).keys.trades

/** The server's own timeframe lengths, in minutes. */
const MINUTES: Record<string, number> = { M1: 1, M5: 5, M10: 10, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 }
const minutesFor = (timeframe: string): number | undefined => MINUTES[timeframe]
// as the coverage route lists them: alphabetically, not by length
const COVERED = ['D1', 'H1', 'H4', 'M1', 'M10', 'M15', 'M30', 'M5']

function trade(fields: Partial<TradeRow>): TradeRow {
  return { ...trades[0]!, ...fields }
}

describe('run_chart', () => {
  describe('chartUnits', () => {
    const units = chartUnits({
      group: 'simulation', windows: runInfo.data_windows, scenarios, config: null, trades,
    })!

    it('lists a backtest\'s units in the order the index declares their windows', () => {
      expect(units.map(unit => unit.name)).toEqual(runInfo.data_windows!.map(window => window.unit_name))
    })

    /** The span the ticks covered is drawn — it can run past the declared window, and trades with it. */
    it('draws a backtest unit over the span its ticks covered, in the market it names', () => {
      const unit = units.find(entry => entry.name === 'ETHUSD_spot_two_balances')!
      const row = scenarios.find(entry => entry.name === unit.name)!
      expect(unit).toMatchObject({
        broker: row.data_broker_type, symbol: row.symbol, from: row.first_tick_time, to: row.last_tick_time, block: null,
      })
    })

    it('counts the unit\'s rows in the trade history', () => {
      const unit = units.find(entry => entry.name === 'EURGBP_refusals_01')!
      expect(unit.trades).toBe(trades.filter(entry => entry.scenario_name === 'EURGBP_refusals_01').length)
      expect(unit.trades).toBeGreaterThan(0)
    })

    it('says a unit that processed no tick cannot be drawn', () => {
      expect(units.find(entry => entry.name === 'EURGBP_before_the_archive')!.block).toBe('no-ticks')
    })

    /** Nothing is guessed while the source that names the market is still on its way. */
    it('waits for scenario-details on a backtest, and for the configuration on a session', () => {
      expect(chartUnits({ group: 'simulation', windows: runInfo.data_windows, scenarios: null, config: {}, trades })).toBeNull()
      expect(chartUnits({ group: 'autotrader', windows: runInfo.data_windows, scenarios, config: null, trades })).toBeNull()
    })

    /** A session names one market for the run, and declares only where its window starts. */
    it('draws a session in the market its configuration names, its window open at the end', () => {
      const window = { unit_name: 'demo_btcusd_bot', start_date: '2026-02-06T18:00:00+00:00', end_date: null }
      const [unit] = chartUnits({
        group: 'autotrader', windows: [window], scenarios: null,
        config: { broker_type: 'kraken_spot', symbol: 'BTCUSD' }, trades: [],
      })!
      expect(unit).toEqual({
        name: 'demo_btcusd_bot', broker: 'kraken_spot', symbol: 'BTCUSD',
        from: window.start_date, to: null, trades: 0, block: null,
      })
    })

    it('says a session whose configuration names no market cannot be drawn', () => {
      const window = { unit_name: 'bot', start_date: '2026-02-06T18:00:00+00:00', end_date: null }
      const [unit] = chartUnits({ group: 'autotrader', windows: [window], scenarios: null, config: {}, trades: [] })!
      expect(unit!.block).toBe('no-market')
    })
  })

  describe('defaultUnit', () => {
    const units = chartUnits({ group: 'simulation', windows: runInfo.data_windows, scenarios, config: null, trades })!

    it('opens on the one scenario the run is narrowed to', () => {
      expect(defaultUnit(units, ['EURGBP_refusals_02'])!.name).toBe('EURGBP_refusals_02')
    })

    it('opens on the first unit with trades otherwise, and never on one that cannot be drawn', () => {
      const first = units.find(unit => unit.block === null && unit.trades > 0)!
      expect(defaultUnit(units, [])!.name).toBe(first.name)
      expect(defaultUnit(units, ['EURGBP_refusals_01', 'EURGBP_refusals_02'])!.name).toBe(first.name)
      expect(defaultUnit(units, ['EURGBP_before_the_archive'])!.block).toBeNull()
      expect(defaultUnit(units.filter(unit => unit.block !== null), [])).toBeNull()
    })
  })

  describe('autoTimeframe', () => {
    it('draws an hour in minutes and a fortnight in hours — the finest within the bar limit', () => {
      expect(autoTimeframe(COVERED, minutesFor, 60)).toBe('M1')
      expect(autoTimeframe(COVERED, minutesFor, 18 * 60)).toBe('M1')
      // ten days: M5 would be 2,880 bars, M10 is 1,440
      expect(autoTimeframe(COVERED, minutesFor, 10 * 24 * 60)).toBe('M10')
      expect(autoTimeframe(COVERED, minutesFor, 14 * 24 * 60)).toBe('M15')
    })

    it('takes the longest where even that draws more, and none where nothing is covered', () => {
      expect(autoTimeframe(COVERED, minutesFor, 10 * 365 * 24 * 60)).toBe('D1')
      expect(autoTimeframe([], minutesFor, 60)).toBeNull()
      expect(autoTimeframe(['X9'], minutesFor, 60)).toBeNull()
    })
  })

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

  describe('tradeMarks', () => {
    // 2025-10-31 05:00, 05:01, 05:02 UTC
    const bars = [1761886800, 1761886860, 1761886920]
    const long = trade({
      scenario_name: 'unit', position_id: 'pos_1', direction: 'long',
      entry_time: '2025-10-31T05:00:40+00:00', exit_time: '2025-10-31T05:02:10+00:00', net_pnl: 1.5,
    })

    /** An event belongs to the bar it fell in — 05:00:40 to the 05:00 bar, never the next one. */
    it('marks a long\'s entry below its bar and its exit above, on the bars they fell in', () => {
      expect(tradeMarks([long], KEY, bars, null)).toMatchObject([
        { time: 1761886800, position: 'belowBar', shape: 'arrowUp', role: 'entry', text: '', focused: false },
        { time: 1761886920, position: 'aboveBar', shape: 'circle', role: 'gain', text: '+', focused: false },
      ])
    })

    it('marks a short the other way round, and a loss with its sign as a word', () => {
      const short = trade({ ...long, direction: 'short', net_pnl: -0.4 })
      expect(tradeMarks([short], KEY, bars, null).map(mark => [mark.position, mark.shape, mark.role, mark.text])).toEqual([
        ['aboveBar', 'arrowDown', 'entry', ''],
        ['belowBar', 'circle', 'loss', '−'],
      ])
    })

    /** A partial close books several trade rows of one position: one entry, an exit per part. */
    it('marks one entry and every exit of a position closed in parts', () => {
      const part = trade({ ...long, exit_time: '2025-10-31T05:01:30+00:00', net_pnl: 0 })
      const marks = tradeMarks([long, part], KEY, bars, null)
      expect(marks.filter(mark => mark.role === 'entry')).toHaveLength(1)
      expect(marks.map(mark => mark.time)).toEqual([1761886800, 1761886860, 1761886920])
      expect(marks.find(mark => mark.time === 1761886860)).toMatchObject({ role: 'flat', text: '0' })
    })

    it('draws the marks of the position looked at larger, and none for an event before the bars', () => {
      const early = trade({ ...long, position_id: 'pos_0', entry_time: '2025-10-31T04:59:00+00:00' })
      const marks = tradeMarks([long, early], KEY, bars, { scenario: 'unit', position: 'pos_1' })
      expect(marks.filter(mark => mark.focused)).toHaveLength(2)
      // the early position's entry has no candle; its exit does
      expect(marks.filter(mark => mark.role === 'entry')).toHaveLength(1)
    })

    it('marks the fixture run\'s trades on candles that exist', () => {
      const unitTrades = trades.filter(entry => entry.scenario_name === 'EURGBP_refusals_01')
      const minute = (iso: string): number => Math.floor(Date.parse(iso) / 60_000) * 60
      const times = [...new Set(unitTrades.flatMap(entry => [minute(entry.entry_time), minute(entry.exit_time)]))].sort()
      const marks = tradeMarks(unitTrades, KEY, times, null)
      expect(marks.length).toBeGreaterThan(0)
      expect(marks.every(mark => times.includes(mark.time))).toBe(true)
    })

    /**
     * What the chart says at the pointer: which position, and how it opened or ended. An exit is a
     * trade row and takes the row's declared key as its id; an entry is the position's.
     */
    it('gives every mark an id of its own and a card naming its position', () => {
      const part = trade({
        ...long, exit_time: '2025-10-31T05:01:30+00:00', exit_tick_index: long.exit_tick_index + 1,
        net_pnl: -0.2, close_reason: 'stop_loss',
      })
      const marks = tradeMarks([{ ...long, close_reason: '' }, part], KEY, bars, null)
      expect(new Set(marks.map(mark => mark.id)).size).toBe(marks.length)
      expect(marks.every(mark => mark.card.title.startsWith('pos_1 · long'))).toBe(true)

      const labels = (role: string) => marks.find(mark => mark.role === role)!.card.details.map(pair => pair.label)
      expect(labels('entry')).toContain('Opened')
      expect(labels('entry')).not.toContain('Net')
      expect(labels('loss')).toEqual(expect.arrayContaining(['Closed', 'Closed by', 'Net']))
      // the close is named only where one was recorded
      expect(labels('gain')).not.toContain('Closed by')
      expect(marks.find(mark => mark.role === 'loss')!.card.details.find(pair => pair.label === 'Net'))
        .toMatchObject({ tone: 'negative' })
    })
  })

  describe('focusTime', () => {
    it('centres on the earliest entry of the position looked at', () => {
      const first = trade({ scenario_name: 'unit', position_id: 'pos_1', entry_time: '2025-10-31T05:00:40+00:00' })
      const later = trade({ ...first, entry_time: '2025-10-31T05:03:00+00:00' })
      expect(focusTime([later, first], { scenario: 'unit', position: 'pos_1' })).toBe(1761886840)
      expect(focusTime([first], null)).toBeNull()
      expect(focusTime([first], { scenario: 'unit', position: 'pos_9' })).toBeNull()
    })
  })
})
