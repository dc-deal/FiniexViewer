import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import * as apiClient from '@/api/api_client'
import type { BarAnswer, CoverageResponse } from '@/types/api/bar_types'
import type { RunConfigReport, RunInfo, TradeHistoryReport } from '@/types/api/report_types'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'

import runsList from './fixtures/runs_list.json'
import scenarioFixture from './fixtures/scenario_details.json'
import tradeFixture from './fixtures/trade_history.json'

vi.mock('@/api/api_client', () => ({
  findCoverage: vi.fn(),
  getBars: vi.fn(),
  getTimeframes: vi.fn(),
}))

const RUN = '20261012_205715_c3b41fff'
const RUNS = (runsList as unknown as { runs: RunInfo[] }).runs
const runInfo = RUNS.find(run => run.run_id === RUN)!
const scenarios = scenarioFixture as unknown as ScenarioDetailsReport
const trades = tradeFixture as unknown as TradeHistoryReport
const unitRow = (name: string) => scenarios.units.find(unit => unit.name === name)!

const COVERAGE: CoverageResponse = {
  start: '2025-09-21T00:00:00+00:00',
  end: '2026-10-09T20:56:00+00:00',
  timeframes: ['D1', 'H1', 'H4', 'M1', 'M10', 'M15', 'M30', 'M5'],
}

const ANSWER: BarAnswer = {
  bars: [
    { t: 1761886800, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1 },
    { t: 1761886860, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1 },
  ],
  truncated: false,
}

/** The fixture run chosen, with the reports the app root would have loaded for it. */
function chooseFixtureRun(): void {
  useRunsStore().runs = RUNS
  useContextStore().selectRun(RUN)
  const reports = useRunReportsStore()
  reports.scenarios = scenarios
  reports.tradeHistory = trades
}

/** The unit the chart opens on: the first of the run with trades. */
function firstWithTrades(): string {
  return runInfo.data_windows!.map(window => window.unit_name)
    .find(name => unitRow(name).first_tick_time && trades.trades.some(trade => trade.scenario_name === name))!
}

describe('useRunChartStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(apiClient.findCoverage).mockReset().mockResolvedValue(COVERAGE)
    vi.mocked(apiClient.getBars).mockReset().mockResolvedValue(ANSWER)
    vi.mocked(apiClient.getTimeframes).mockReset().mockResolvedValue([
      { name: 'M1', minutes: 1 }, { name: 'M5', minutes: 5 }, { name: 'M10', minutes: 10 }, { name: 'M15', minutes: 15 },
      { name: 'M30', minutes: 30 }, { name: 'H1', minutes: 60 }, { name: 'H4', minutes: 240 }, { name: 'D1', minutes: 1440 },
    ])
  })

  /** A reader who never opens the chart pays nothing for it: the units come from what is loaded. */
  it('reads the units off the reports the run loaded, and asks the archive nothing while no chart is on show', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    await flushPromises()
    expect(chart.units!.map(unit => unit.name)).toEqual(runInfo.data_windows!.map(window => window.unit_name))
    expect(chart.unit!.name).toBe(firstWithTrades())
    expect(apiClient.findCoverage).not.toHaveBeenCalled()
    expect(apiClient.getBars).not.toHaveBeenCalled()
  })

  it('asks the coverage and the bars of the unit once a chart is on show, in the finest timeframe that fits', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    const row = unitRow(firstWithTrades())
    expect(apiClient.findCoverage).toHaveBeenCalledWith(row.data_broker_type, row.symbol)
    expect(chart.timeframe).toBe('M1')
    // from one period before the first tick: the route answers the bars that OPEN in the range
    const before = new Date(Date.parse(row.first_tick_time) - 60_000).toISOString()
    expect(apiClient.getBars).toHaveBeenLastCalledWith(row.data_broker_type, row.symbol, 'M1', before, row.last_tick_time)
    expect(chart.bars.map(bar => bar.time)).toEqual([1761886800, 1761886860])
    expect(chart.loading).toBe(false)
  })

  it('says it is waiting while what names the market is still on its way', () => {
    useRunsStore().runs = RUNS
    useContextStore().selectRun(RUN)
    useRunReportsStore().loadingScenarios = true
    const chart = useRunChartStore()
    expect(chart.units).toBeNull()
    expect(chart.waiting).toBe(true)
  })

  /** The unit is the chart's own choice, kept with the run it was made for and no other. */
  it('keeps the reader\'s unit and timeframe for the run, and drops them for another', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.chooseUnit('EURGBP_refusals_02')
    chart.attach()
    await flushPromises()
    chart.chooseTimeframe('M5')
    await flushPromises()
    expect(chart.unit!.name).toBe('EURGBP_refusals_02')
    expect(chart.timeframe).toBe('M5')
    expect(useArrangementStore().runChart).toEqual({ run: RUN, unit: 'EURGBP_refusals_02', timeframe: 'M5' })

    useContextStore().selectRun(RUNS.find(run => run.run_id !== RUN)!.run_id)
    expect(chart.unit?.name).not.toBe('EURGBP_refusals_02')
  })

  /** The chart mark on a row points the chart at the position, and the link marks it for every panel. */
  it('shows a position: its unit, the position marked, centred where it opened', async () => {
    chooseFixtureRun()
    const trade = trades.trades.find(entry => entry.scenario_name === 'EURGBP_refusals_02')!
    const chart = useRunChartStore()
    chart.showPosition({ scenario: trade.scenario_name, position: trade.position_id })
    chart.attach()
    await flushPromises()
    expect(chart.unit!.name).toBe('EURGBP_refusals_02')
    expect(useContextStore().main.run.position).toEqual({ scenario: trade.scenario_name, position: trade.position_id })
    const opened = trades.trades
      .filter(entry => entry.scenario_name === trade.scenario_name && entry.position_id === trade.position_id)
      .map(entry => Date.parse(entry.entry_time) / 1000)
    expect(chart.focusAt).toBe(Math.min(...opened))
  })

  it('marks the unit\'s trades on the bars it holds', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    // every mark stands on a bar that was served
    expect(chart.marks.every(mark => [1761886800, 1761886860].includes(mark.time))).toBe(true)
  })

  it('says the archive holds nothing for a market it does not know, and asks for no bars', async () => {
    vi.mocked(apiClient.findCoverage).mockResolvedValue(null)
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    expect(chart.unitCoverage).toBe('none')
    expect(apiClient.getBars).not.toHaveBeenCalled()
  })

  it('says when the route answered with less than the window holds', async () => {
    vi.mocked(apiClient.getBars).mockResolvedValue({ ...ANSWER, truncated: true })
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    expect(chart.truncated).toBe(true)
  })

  /** A quick change of unit must not leave the earlier unit's candles behind when they arrive late. */
  it('writes nothing from an answer for a unit no longer on show', async () => {
    let late: (answer: BarAnswer) => void = () => {}
    vi.mocked(apiClient.getBars)
      .mockImplementationOnce(() => new Promise(resolve => { late = resolve }))
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    chart.chooseUnit('EURGBP_refusals_02')
    await flushPromises()
    late({ bars: [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }], truncated: true })
    await flushPromises()
    expect(chart.bars.map(bar => bar.time)).toEqual([1761886800, 1761886860])
    expect(chart.truncated).toBe(false)
  })

  /** A session declares only where its window starts: it is drawn to the end of what is covered. */
  it('draws a session in the market its configuration names, to the end of the coverage', async () => {
    const session: RunInfo = {
      ...runInfo, run_id: 'session_1', group: 'autotrader',
      data_windows: [{ unit_name: 'demo_btcusd_bot', start_date: '2026-10-01T00:00:00+00:00', end_date: null }],
    }
    useRunsStore().runs = [session]
    useContextStore().selectRun('session_1')
    const reports = useRunReportsStore()
    reports.config = { run_id: 'session_1', config: { broker_type: 'kraken_spot', symbol: 'BTCUSD' } } as unknown as RunConfigReport
    reports.tradeHistory = { trades: [] } as unknown as TradeHistoryReport
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    expect(apiClient.findCoverage).toHaveBeenCalledWith('kraken_spot', 'BTCUSD')
    const call = vi.mocked(apiClient.getBars).mock.lastCall!
    // the session's window from its start, one period earlier, to the end of the coverage
    expect(call[4]).toBe(COVERAGE.end)
    expect(Date.parse(call[3])).toBeLessThan(Date.parse('2026-10-01T00:00:00+00:00'))
  })

  it('asks nothing more once the last chart is gone', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    chart.detach()
    vi.mocked(apiClient.getBars).mockClear()
    chart.chooseUnit('EURGBP_refusals_02')
    await flushPromises()
    expect(apiClient.getBars).not.toHaveBeenCalled()
  })
})
