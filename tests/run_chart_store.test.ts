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
import type {
  BrokerReport, OrderHistoryReport, PortfolioReport, RunConfigReport, RunInfo, TradeHistoryReport,
} from '@/types/api/report_types'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'

import brokerFixture from './fixtures/broker.json'
import orderFixture from './fixtures/order_history.json'
import portfolioFixture from './fixtures/portfolio.json'
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
const orders = orderFixture as unknown as OrderHistoryReport
const portfolio = portfolioFixture as unknown as PortfolioReport
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
  reports.orderHistory = orders
  reports.portfolio = portfolio
}

/** The executed opening of a position — where it opened, closed later or not. */
function openingOf(scenario: string, position: string) {
  return orders.orders.find(row => row.scenario_name === scenario && row.position_id === position
    && row.action === 'open' && row.status === 'executed')!
}

/** The unit the chart opens on: the first of the run that opened a position. */
function firstWithOpenings(): string {
  return runInfo.data_windows!.map(window => window.unit_name)
    .find(name => unitRow(name).first_tick_time && orders.orders.some(row =>
      row.scenario_name === name && row.action === 'open' && row.status === 'executed'))!
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
    expect(chart.unit!.name).toBe(firstWithOpenings())
    expect(apiClient.findCoverage).not.toHaveBeenCalled()
    expect(apiClient.getBars).not.toHaveBeenCalled()
  })

  it('asks the coverage and the bars of the unit once a chart is on show, in the finest timeframe that fits', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    const row = unitRow(firstWithOpenings())
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

  /**
   * ONE focus for the lists and the chart (operator, 2026-10-16): the scenario in focus is the chart's
   * unit whatever was chosen before, and a unit chosen in the chart is the focus of every panel.
   */
  it('shows the scenario in focus, and puts a unit chosen in the chart in focus', () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.chooseUnit('EURGBP_refusals_02')
    expect(useContextStore().main.run.units).toEqual(['EURGBP_refusals_02'])

    // a click in the scenario list moves the focus, and the chart with it
    useContextStore().toggleUnit('EURGBP_partial_close')
    expect(chart.unit!.name).toBe('EURGBP_partial_close')
  })

  it('stays on the unit it showed once the focus is cleared', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    useContextStore().toggleUnit('EURGBP_partial_close')
    await flushPromises()
    expect(chart.unit!.name).toBe('EURGBP_partial_close')

    useContextStore().clearUnits()
    await flushPromises()
    expect(chart.unit!.name).toBe('EURGBP_partial_close')
  })

  /** The lists keep the whole run where nothing was in focus; a focus on another unit moves along. */
  it('moves the focus with a position shown from another unit, and sets none where there was none', () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    const trade = trades.trades.find(entry => entry.scenario_name === 'EURGBP_refusals_02')!
    chart.showPosition({ scenario: trade.scenario_name, position: trade.position_id })
    expect(useContextStore().main.run.units).toEqual([])

    useContextStore().toggleUnit('EURGBP_partial_close')
    chart.showPosition({ scenario: trade.scenario_name, position: trade.position_id })
    expect(useContextStore().main.run.units).toEqual(['EURGBP_refusals_02'])
    expect(chart.unit!.name).toBe('EURGBP_refusals_02')
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
    expect(chart.focusAt).toBe(Date.parse(openingOf(trade.scenario_name, trade.position_id).event_time!) / 1000)
  })

  /** The broker report the root loaded states the tick size; the chart is handed it, and nothing before. */
  it('hands the chart the price format of the unit\'s instrument once the broker report is there', () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.chooseUnit('EURGBP_refusals_01')
    expect(chart.priceFormat).toBeNull()

    useRunReportsStore().broker = brokerFixture as unknown as BrokerReport
    expect(chart.priceFormat).toEqual({ precision: 5, minMove: 0.00001 })
    chart.chooseUnit('ETHUSD_spot_two_balances')
    expect(chart.priceFormat).toEqual({ precision: 2, minMove: 0.01 })
  })

  it('marks the unit\'s openings and trades on the bars it holds', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    // every mark stands on a bar that was served, in the order the chart takes them
    expect(chart.marks.some(mark => mark.role === 'entry')).toBe(true)
    expect(chart.marks.every(mark => [1761886800, 1761886860].includes(mark.time))).toBe(true)
    expect(chart.marks.map(mark => mark.time)).toEqual([...chart.marks.map(mark => mark.time)].sort())
  })

  /** A window the route cut ends at its last bar: an event past it has no candle, not the last one. */
  it('draws nothing past the last bar of a window the route cut', async () => {
    chooseFixtureRun()
    vi.mocked(apiClient.getBars).mockResolvedValue({ ...ANSWER, truncated: true })
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    const last = ANSWER.bars.at(-1)!.t
    expect(chart.events.every(mark => mark.at <= last)).toBe(true)

    vi.mocked(apiClient.getBars).mockResolvedValue(ANSWER)
    chart.chooseTimeframe('M5')
    await flushPromises()
    // the same unit uncut: its later events stand on the last bar, which reaches to its last tick
    expect(chart.events.some(mark => mark.at > last)).toBe(true)
  })

  /** What overlaps at the zoom on screen is drawn as one — and nothing is lost by it. */
  it('gathers the marks at the width the chart reports a bar to have, and loses none', async () => {
    chooseFixtureRun()
    // the unit's whole hour, a bar a minute, so its marks stand on bars of their own
    vi.mocked(apiClient.getBars).mockResolvedValue({
      bars: Array.from({ length: 60 }, (_, index) => ({ t: 1761886800 + index * 60, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1 })),
      truncated: false,
    })
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    const stood = (marks: { count?: number }[]) => marks.reduce((sum, mark) => sum + (mark.count ?? 1), 0)
    chart.setSpacing(100)
    const apart = chart.marks.length
    expect(stood(chart.marks)).toBe(chart.events.length)
    chart.setSpacing(0.1)
    expect(chart.marks.length).toBeLessThan(apart)
    expect(stood(chart.marks)).toBe(chart.events.length)
  })

  /**
   * Several marks in one candle that a finer timeframe draws apart: the offer names it, and taking
   * it draws the chart in it, centred on the first such candle — until the reader chooses again.
   */
  it('offers a finer timeframe where one draws a candle\'s marks apart, and centres on it when taken', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    chart.chooseTimeframe('M5')
    await flushPromises()
    const offer = chart.offer!
    expect(offer.timeframe).toBe('M1')
    expect(offer.apart).toBeGreaterThan(0)

    chart.acceptOffer()
    await flushPromises()
    expect(chart.timeframe).toBe('M1')
    expect(chart.focusAt).toBe(offer.at)
    chart.chooseTimeframe('M5')
    expect(chart.focusAt).toBeNull()
  })

  /** A position the run ended with still open has no trade — its opening is marked all the same. */
  it('marks the opening of a position that never closed, and says in its card it was still open', async () => {
    chooseFixtureRun()
    // the unit traded on 2025-10-10 from 06:00 UTC: bars of its own hour, not the shared answer's
    vi.mocked(apiClient.getBars).mockResolvedValue({
      bars: [
        { t: 1760076000, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1 },
        { t: 1760076060, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1 },
      ],
      truncated: false,
    })
    const chart = useRunChartStore()
    chart.chooseUnit('EURGBP_left_open')
    chart.attach()
    await flushPromises()
    const open = portfolio.units.find(row => row.name === 'EURGBP_left_open')!.open_positions[0]!
    const mark = chart.marks.find(entry => entry.id === `entry|EURGBP_left_open|${open.position_id}`)!
    expect(mark.card.details.find(pair => pair.label === 'Still open')!.value).toBe(String(open.lots))
    expect(trades.trades.some(trade => trade.scenario_name === 'EURGBP_left_open')).toBe(false)
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
