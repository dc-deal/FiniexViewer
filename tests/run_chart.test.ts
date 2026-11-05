import { describe, it, expect } from 'vitest'
import {
  autoTimeframe, chartPriceFormat, chartUnits, defaultUnit, unitTickSize,
} from '@/components/runs/run_chart'
import type { BrokerReport, OrderHistoryReport, RunInfo } from '@/types/api/report_types'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'

import brokerFixture from './fixtures/broker.json'
import orderFixture from './fixtures/order_history.json'
import runsList from './fixtures/runs_list.json'
import scenarioFixture from './fixtures/scenario_details.json'

const RUN = '20261012_205715_c3b41fff'
const runInfo = (runsList as unknown as { runs: RunInfo[] }).runs.find(run => run.run_id === RUN)!
const scenarios = (scenarioFixture as unknown as ScenarioDetailsReport).units
const orders = (orderFixture as unknown as OrderHistoryReport).orders

/** The server's own timeframe lengths, in minutes. */
const MINUTES: Record<string, number> = { M1: 1, M5: 5, M10: 10, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 }
const minutesFor = (timeframe: string): number | undefined => MINUTES[timeframe]
// as the coverage route lists them: alphabetically, not by length
const COVERED = ['D1', 'H1', 'H4', 'M1', 'M10', 'M15', 'M30', 'M5']

describe('run_chart', () => {
  describe('chartUnits', () => {
    const units = chartUnits({
      group: 'simulation', windows: runInfo.data_windows, scenarios, config: null, orders,
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

    it('counts the positions the unit opened, closed or not', () => {
      const unit = units.find(entry => entry.name === 'EURGBP_refusals_01')!
      const executed = orders.filter(row =>
        row.scenario_name === 'EURGBP_refusals_01' && row.action === 'open' && row.status === 'executed')
      expect(unit.openings).toBe(executed.length)
      expect(unit.openings).toBeGreaterThan(0)
    })

    it('says a unit that processed no tick cannot be drawn', () => {
      expect(units.find(entry => entry.name === 'EURGBP_before_the_archive')!.block).toBe('no-ticks')
    })

    /** Nothing is guessed while the source that names the market is still on its way. */
    it('waits for scenario-details on a backtest, and for the configuration on a session', () => {
      expect(chartUnits({ group: 'simulation', windows: runInfo.data_windows, scenarios: null, config: {}, orders })).toBeNull()
      expect(chartUnits({ group: 'autotrader', windows: runInfo.data_windows, scenarios, config: null, orders })).toBeNull()
    })

    /** A session names one market for the run, and declares only where its window starts. */
    it('draws a session in the market its configuration names, its window open at the end', () => {
      const window = { unit_name: 'demo_btcusd_bot', start_date: '2026-02-06T18:00:00+00:00', end_date: null }
      const [unit] = chartUnits({
        group: 'autotrader', windows: [window], scenarios: null,
        config: { broker_type: 'kraken_spot', symbol: 'BTCUSD' }, orders: [],
      })!
      expect(unit).toEqual({
        name: 'demo_btcusd_bot', broker: 'kraken_spot', symbol: 'BTCUSD',
        from: window.start_date, to: null, openings: 0, block: null,
      })
    })

    it('says a session whose configuration names no market cannot be drawn', () => {
      const window = { unit_name: 'bot', start_date: '2026-02-06T18:00:00+00:00', end_date: null }
      const [unit] = chartUnits({ group: 'autotrader', windows: [window], scenarios: null, config: {}, orders: [] })!
      expect(unit!.block).toBe('no-market')
    })
  })

  describe('defaultUnit', () => {
    const units = chartUnits({ group: 'simulation', windows: runInfo.data_windows, scenarios, config: null, orders })!

    it('opens on the first unit that opened a position, and never on one that cannot be drawn', () => {
      const first = units.find(unit => unit.block === null && unit.openings > 0)!
      expect(defaultUnit(units)!.name).toBe(first.name)
      expect(defaultUnit(units)!.block).toBeNull()
      expect(defaultUnit(units.filter(unit => unit.block !== null))).toBeNull()
    })

    /** A unit whose positions never closed has no trade row, and is still the one to look at. */
    it('opens on a unit whose positions never closed', () => {
      const drawable = units.filter(unit => unit.block === null)
      const quiet = drawable.map(unit => ({ ...unit, openings: 0 }))
      quiet[1] = { ...drawable[1]!, openings: 1 }
      expect(defaultUnit(quiet)!.name).toBe(drawable[1]!.name)
    })
  })

  /**
   * A price at its instrument's tick size — the backend's rule for showing a price it computed. Without
   * a format the chart library rounds every price to two decimals, and EURUSD read `1.16` on every label.
   */
  describe('the price format', () => {
    const units = chartUnits({
      group: 'simulation', windows: runInfo.data_windows, scenarios, config: null, orders,
    })!
    const broker = brokerFixture as unknown as BrokerReport
    const named = (name: string) => units.find(unit => unit.name === name)!

    it('reads the tick size off the broker the unit traded through, for the symbol it names', () => {
      expect(unitTickSize(broker, named('EURGBP_refusals_01'))).toBe(0.00001)
      expect(unitTickSize(broker, named('ETHUSD_spot_two_balances'))).toBe(0.01)
    })

    it('has none while the report is on its way, or where it names no such unit or symbol', () => {
      const unit = named('EURGBP_refusals_01')
      expect(unitTickSize(null, unit)).toBeNull()
      expect(unitTickSize({ ...broker, units: [] }, unit)).toBeNull()
      expect(unitTickSize(broker, { ...unit, symbol: 'USDJPY' })).toBeNull()
    })

    /** A session's report is one row that lists no scenario (measured 2026-10-31), so it answers for every unit. */
    it('reads a session\'s tick size off its one row, and stays silent among several', () => {
      const one = broker.units[0]!
      const session = { ...broker, units: [{ ...one, scenarios: [], symbols: [{ ...one.symbols[0]!, symbol: 'BTCUSD', tick_size: 0.1 }] }] }
      expect(unitTickSize(session, { name: 'a_session', symbol: 'BTCUSD' })).toBe(0.1)
      expect(unitTickSize(session, { name: 'a_session', symbol: 'ETHUSD' })).toBeNull()
      // several brokers, none of which lists the unit: nobody can say whose it is
      expect(unitTickSize(broker, { name: 'no_such_unit', symbol: one.symbols[0]!.symbol })).toBeNull()
    })

    it('draws as many decimals as the step has, and moves by the step', () => {
      expect(chartPriceFormat(0.00001)).toEqual({ precision: 5, minMove: 0.00001 })
      expect(chartPriceFormat(0.001)).toEqual({ precision: 3, minMove: 0.001 })
      expect(chartPriceFormat(0.01)).toEqual({ precision: 2, minMove: 0.01 })
      expect(chartPriceFormat(0.25)).toEqual({ precision: 2, minMove: 0.25 })
      expect(chartPriceFormat(1)).toEqual({ precision: 0, minMove: 1 })
    })

    it('hands the chart no format where there is no tick size', () => {
      expect(chartPriceFormat(null)).toBeNull()
      expect(chartPriceFormat(0)).toBeNull()
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
})
