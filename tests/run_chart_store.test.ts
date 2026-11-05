import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'
import { useFramePlayerStore } from '@/stores/frame_player_store'
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
    { t: 1761886800, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1, tc: 1 },
    { t: 1761886860, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1, tc: 1 },
  ],
  truncated: false,
  priceBasis: '',
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

/**
 * The ETHUSD unit's window begun ten days earlier, read in M10: half a batch before a position of it
 * then stays inside the window, where at its captured eighteen hours it reaches past the start.
 */
function widenEthusd(): void {
  useRunReportsStore().scenarios = {
    ...scenarios,
    units: scenarios.units.map(row => row.name === 'ETHUSD_spot_two_balances'
      ? { ...row, first_tick_time: '2026-02-01T00:00:00+00:00' }
      : row),
  }
}

const M10 = 600_000

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
    const end = new Date(Date.parse(row.last_tick_time)).toISOString()
    expect(apiClient.getBars).toHaveBeenLastCalledWith(row.data_broker_type, row.symbol, 'M1', before, end, 2000)
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

  /** While the window holds more to the right, an event past the bars loaded has no candle yet, not the last one. */
  it('draws nothing past the bars loaded while the window holds more', async () => {
    chooseFixtureRun()
    vi.mocked(apiClient.getBars).mockResolvedValue({ ...ANSWER, truncated: true, priceBasis: '' })
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

  /** The position looked at brings its levels and the line from its entry to its exit; no other does. */
  it('draws the levels and the line of the position looked at, and of no other', async () => {
    chooseFixtureRun()
    // the unit's whole hour, a bar a minute
    vi.mocked(apiClient.getBars).mockResolvedValue({
      bars: Array.from({ length: 60 }, (_, index) => ({ t: 1761886800 + index * 60, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1, tc: 1 })),
      truncated: false,
      priceBasis: '',
    })
    // no trade of the fixture set a level: one row is given a stop and a target, as a run with levels serves them
    const unitName = firstWithOpenings()
    const traded = trades.trades.find(row => row.scenario_name === unitName)!
    useRunReportsStore().tradeHistory = {
      ...trades,
      trades: trades.trades.map(row => row === traded ? { ...row, stop_loss: 0.86, take_profit: 0.89 } : row),
    }
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    const layer = (id: string) => chart.layers.find(entry => entry.id === id)!.drawings
    expect(chart.layers.map(entry => entry.id)).toEqual(['state-frame', 'levels', 'entry-exit', 'trades'])
    expect(layer('levels')).toEqual([])
    expect(layer('trades').length).toBeGreaterThan(0)

    chart.showPosition({ scenario: traded.scenario_name, position: traded.position_id })
    await flushPromises()
    expect(layer('levels').map(drawing => drawing.kind === 'segment' && drawing.label)).toEqual(['SL', 'TP'])
    expect(layer('entry-exit').every(drawing => drawing.kind === 'line')).toBe(true)
  })

  /** The cards print a price at the tick size once the broker report is there; the drawing keeps the price as served. */
  it('prints the prices of its cards at the tick size of the unit\'s instrument', async () => {
    chooseFixtureRun()
    vi.mocked(apiClient.getBars).mockResolvedValue({
      bars: Array.from({ length: 60 }, (_, index) => ({ t: 1761886800 + index * 60, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1, tc: 1 })),
      truncated: false,
      priceBasis: '',
    })
    const served = 0.8612345678
    const unitName = firstWithOpenings()
    const traded = trades.trades.find(row => row.scenario_name === unitName)!
    useRunReportsStore().tradeHistory = {
      ...trades,
      trades: trades.trades.map(row => row.scenario_name === unitName ? { ...row, stop_loss: served, exit_price: served } : row),
    }
    useRunReportsStore().orderHistory = {
      ...orders,
      orders: orders.orders.map(row => row.scenario_name === unitName && row.executed_price !== null ? { ...row, executed_price: served } : row),
    }
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    chart.showPosition({ scenario: traded.scenario_name, position: traded.position_id })
    await flushPromises()
    const stop = () => chart.layers.find(entry => entry.id === 'levels')!.drawings
      .flatMap(drawing => drawing.kind === 'segment' ? [drawing] : [])[0]!
    expect(stop().card.details[0]!.value).toBe('0.86123457')

    useRunReportsStore().broker = brokerFixture as unknown as BrokerReport
    expect(stop().card.details[0]!.value).toBe('0.86123')
    expect(stop().price).toBe(served)

    // every way the store hands it on: the marks' cards, and with the options the line and every position's levels
    const value = (details: { label: string, value: string }[], label: string) =>
      details.find(pair => pair.label === label)?.value ?? ''
    const marks = chart.events.filter(mark => mark.card.title.startsWith(`${traded.position_id} `))
    expect(marks.some(mark => mark.role === 'entry' && value(mark.card.details, 'Opened').endsWith('@ 0.86123'))).toBe(true)
    expect(marks.some(mark => mark.role !== 'entry' && value(mark.card.details, 'Closed').endsWith('@ 0.86123'))).toBe(true)
    useArrangementStore().setPanelView('run-chart', { layers: { options: { 'every-position': true, 'every-position-line': true } } })
    const drawn = (id: string) => chart.layers.find(entry => entry.id === id)!.drawings
    const lines = drawn('entry-exit')
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every(line => value(line.card.details, 'Closed').endsWith('@ 0.86123'))).toBe(true)
    const levels = drawn('levels')
    expect(levels.length).toBeGreaterThan(1)
    expect(levels.every(level => level.card.details[0]!.value === '0.86123')).toBe(true)
  })

  /** Switched to every position, the line is drawn for each trade of the unit, with none looked at. */
  /**
   * The volume counts what the venue prints: the traded volume where the bars are order-driven, the
   * ticks otherwise — one value a bar, coloured by its candle, and handed apart from the drawings.
   */
  /** The candles layer hands the chart its form, whether it is shown and how strongly — candles at full strength by default. */
  it('hands the chart the candles in the form and the strength the Layers panel set', () => {
    const chart = useRunChartStore()
    expect(chart.candles).toEqual({ form: 'candles', shown: true, opacity: 1 })
    useArrangementStore().setPanelView('run-chart', { layers: { forms: { candles: 'bars' }, opacity: { candles: 30 }, hidden: ['candles'] } })
    expect(chart.candles).toEqual({ form: 'bars', shown: false, opacity: 0.3 })
    expect(chart.layers.map(entry => entry.id)).not.toContain('candles')
  })

  it('draws the traded volume where the venue prints trades, and the ticks where it does not', async () => {
    chooseFixtureRun()
    const served = [
      { t: 1761886800, o: 1, h: 2, l: 0.5, c: 1.5, v: 3.5, tc: 12 },
      { t: 1761886860, o: 1.5, h: 2, l: 1, c: 1.2, v: 0, tc: 4 },
    ]
    vi.mocked(apiClient.getBars).mockResolvedValue({ bars: served, truncated: false, priceBasis: 'order_driven' })
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    expect(chart.volume).toMatchObject({ basis: 'traded', shown: true, opacity: 1 })
    expect(chart.volume!.bars).toEqual([
      { time: 1761886800, value: 3.5, rising: true },
      { time: 1761886860, value: 0, rising: false },
    ])
    expect(chart.layers.map(entry => entry.id)).not.toContain('volume')

    // a dealer-quoted venue prints no trade: its ticks are the measure, and the layer hidden as arranged
    vi.mocked(apiClient.getBars).mockResolvedValue({ bars: served, truncated: false, priceBasis: 'quote_driven' })
    useArrangementStore().setPanelView('run-chart', { layers: { hidden: ['volume'], opacity: { volume: 50 } } })
    chart.chooseTimeframe('M5')
    await flushPromises()
    expect(chart.volume).toMatchObject({ basis: 'ticks', shown: false, opacity: 0.5 })
    expect(chart.volume!.bars.map(bar => bar.value)).toEqual([12, 4])
  })

  it('draws the line of every position of the unit where the Layers panel asks for it', async () => {
    chooseFixtureRun()
    vi.mocked(apiClient.getBars).mockResolvedValue({
      bars: Array.from({ length: 60 }, (_, index) => ({ t: 1761886800 + index * 60, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1, tc: 1 })),
      truncated: false,
      priceBasis: '',
    })
    useArrangementStore().setPanelView('run-chart', { layers: { options: { 'every-position-line': true } } })
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    const lines = chart.layers.find(entry => entry.id === 'entry-exit')!.drawings
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every(drawing => drawing.kind === 'line')).toBe(true)
    // the levels keep their own option: still none drawn while no position is looked at
    expect(chart.layers.find(entry => entry.id === 'levels')!.drawings).toEqual([])
  })

  /** The Layers panel's choices, kept with the run chart's own view, decide what is handed to the chart. */
  it('draws the layers as the reader arranged them in the Layers panel', async () => {
    chooseFixtureRun()
    vi.mocked(apiClient.getBars).mockResolvedValue({
      bars: Array.from({ length: 60 }, (_, index) => ({ t: 1761886800 + index * 60, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1, tc: 1 })),
      truncated: false,
      priceBasis: '',
    })
    const unitName = firstWithOpenings()
    const traded = trades.trades.find(row => row.scenario_name === unitName)!
    useRunReportsStore().tradeHistory = {
      ...trades,
      trades: trades.trades.map(row => row === traded ? { ...row, stop_loss: 0.86, take_profit: 0.89 } : row),
    }
    useArrangementStore().setPanelView('run-chart', {
      layers: {
        order: ['trades', 'levels', 'entry-exit'], hidden: ['entry-exit'], opacity: { levels: 40 },
        options: { 'trade-signs': false, 'every-position': true },
      },
    })
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    // back to front as moved, the fainter one at its share, the hidden one handed over marked so —
    // the chart paints nothing of it and keeps its marks' room
    expect(chart.layers.map(entry => [entry.id, entry.opacity ?? 1, entry.hidden ?? false]))
      .toEqual([['state-frame', 1, false], ['trades', 1, false], ['levels', 0.4, false], ['entry-exit', 1, true]])
    const [, trading, levels] = chart.layers
    expect(trading!.drawings.length).toBeGreaterThan(0)
    // the signs switched off keep their room and paint no text, so the switch rescales nothing
    expect(trading!.drawings.every(drawing => drawing.kind === 'marker' && drawing.textHidden === true)).toBe(true)
    expect(trading!.drawings.some(drawing => drawing.kind === 'marker' && drawing.text !== '')).toBe(true)
    // every position's levels with no position looked at: drawn, none of them putting its price on the axis
    expect(levels!.drawings.map(drawing => drawing.kind === 'segment' && [drawing.label, drawing.focused]))
      .toEqual([['SL', false], ['TP', false]])
  })

  /** What overlaps at the zoom on screen is drawn as one — and nothing is lost by it. */
  it('gathers the marks at the width the chart reports a bar to have, and loses none', async () => {
    chooseFixtureRun()
    // the unit's whole hour, a bar a minute, so its marks stand on bars of their own
    vi.mocked(apiClient.getBars).mockResolvedValue({
      bars: Array.from({ length: 60 }, (_, index) => ({ t: 1761886800 + index * 60, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1, tc: 1 })),
      truncated: false,
      priceBasis: '',
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
        { t: 1760076000, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1, tc: 1 },
        { t: 1760076060, o: 0.87, h: 0.88, l: 0.86, c: 0.87, v: 1, tc: 1 },
      ],
      truncated: false,
      priceBasis: '',
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

  /** The rest of the window arrives as the reader moves toward it, and what stood past the bars with it (viewer#9). */
  it('loads the rest of the window at its right edge, and draws there what was past it', async () => {
    vi.mocked(apiClient.getBars).mockResolvedValueOnce({ ...ANSWER, truncated: true, priceBasis: '' })
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    const last = ANSWER.bars.at(-1)!.t
    expect(chart.events.every(mark => mark.at <= last)).toBe(true)
    const later = Array.from({ length: 58 }, (_, index) => ({ ...ANSWER.bars[0]!, t: last + 60 * (index + 1) }))
    vi.mocked(apiClient.getBars).mockResolvedValueOnce({ bars: later, truncated: false, priceBasis: '' })
    chart.extendBars('right')
    await flushPromises()
    // a millisecond past the last bar loaded, a batch's worth at most
    const [, , , from, , limit] = vi.mocked(apiClient.getBars).mock.lastCall!
    expect(from).toBe(new Date(last * 1000 + 1).toISOString())
    expect(limit).toBe(2000)
    expect(chart.bars).toHaveLength(60)
    expect(chart.events.some(mark => mark.at > last)).toBe(true)
  })

  /** The frame on show in the player of the unit on show, on the session's own clock (viewer#51). */
  describe('the state frame on show', () => {
    const FRAMES = [
      { record_no: 1, frame_time: '2025-10-31T05:00:30+00:00' },
      { record_no: 2, frame_time: '2025-10-31T05:01:30+00:00' },
    ]

    function play(runId: string, unit: string, cursor: number | null, frames: unknown[] = FRAMES): void {
      useFramePlayerStore().players.set(unit, {
        runId, unit, stream: { record_count: 2 }, recording: 'ended', absence: null, error: null, loading: false,
        frames, cursor, playing: false, speed: 1,
      } as never)
    }

    async function shown(): Promise<ReturnType<typeof useRunChartStore>> {
      chooseFixtureRun()
      const chart = useRunChartStore()
      chart.attach()
      await flushPromises()
      return chart
    }

    const moment = (chart: ReturnType<typeof useRunChartStore>) =>
      chart.layers.find(entry => entry.id === 'state-frame')!.drawings

    it('stands at the bar the frame falls in, says which frame it is, and moves with a step', async () => {
      const chart = await shown()
      expect(moment(chart)).toEqual([])
      play(RUN, chart.unit!.name, 1)
      expect(moment(chart)[0]).toMatchObject({ kind: 'time', time: 1761886800, role: 'annotation' })
      const card = moment(chart)[0]!.card
      expect(card.title).toBe('State frame')
      expect(card.details[0]).toEqual({ label: 'Frame', value: '1 of 2' })
      const others = chart.layers.filter(entry => entry.id !== 'state-frame').map(entry => entry.drawings)
      useFramePlayerStore().players.get(chart.unit!.name)!.cursor = 2
      expect(moment(chart)[0]).toMatchObject({ time: 1761886860 })
      // a step moves this layer and rebuilds no other: the frames are played several a second
      chart.layers.filter(entry => entry.id !== 'state-frame').forEach((entry, index) => {
        expect(entry.drawings).toBe(others[index])
      })
    })

    it('follows the newest frame where the player follows it', async () => {
      const chart = await shown()
      play(RUN, chart.unit!.name, null)
      expect(moment(chart)[0]).toMatchObject({ time: 1761886860 })
    })

    it('draws nothing for the player of another unit or another run', async () => {
      const chart = await shown()
      play(RUN, 'another_unit', 1)
      expect(moment(chart)).toEqual([])
      play('another_run', chart.unit!.name, 1)
      expect(moment(chart)).toEqual([])
    })

    it('draws nothing before the bars, and past the bars loaded until they arrive', async () => {
      vi.mocked(apiClient.getBars).mockResolvedValue({ ...ANSWER, truncated: true, priceBasis: '' })
      const chart = await shown()
      play(RUN, chart.unit!.name, 1, [{ record_no: 1, frame_time: '2025-10-31T04:00:00+00:00' }])
      expect(moment(chart)).toEqual([])
      play(RUN, chart.unit!.name, 2)
      expect(moment(chart)).toEqual([])
      play(RUN, chart.unit!.name, 1)
      expect(moment(chart)).toHaveLength(1)
    })

    it('is handed over hidden where the Layers panel switched it off', async () => {
      const chart = await shown()
      play(RUN, chart.unit!.name, 1)
      useArrangementStore().setPanelView('run-chart', { layers: { hidden: ['state-frame'] } })
      expect(chart.layers.find(entry => entry.id === 'state-frame')).toMatchObject({ hidden: true })
    })
  })

  /** A position looked at past half a batch into the window: the first batch starts half a batch before it. */
  it('asks for the first batch from half a batch before the position looked at', async () => {
    chooseFixtureRun()
    widenEthusd()
    const chart = useRunChartStore()
    chart.showPosition({ scenario: 'ETHUSD_spot_two_balances', position: 'pos_ethusd_10' })
    chart.attach()
    await flushPromises()
    const [, , timeframe, from] = vi.mocked(apiClient.getBars).mock.lastCall!
    expect(timeframe).toBe('M10')
    expect(Math.abs(Date.parse(from) - (chart.focusAt! * 1000 - 1000 * M10))).toBeLessThanOrEqual(1)
  })

  /** The chart mark can point past what is loaded: the bars come to the position, not the position to the last bar. */
  it('loads afresh around a position looked at past the bars loaded, and asks nothing for one inside them', async () => {
    const start = Date.parse('2026-02-01T00:00:00Z') / 1000
    vi.mocked(apiClient.getBars).mockResolvedValue({
      bars: [{ ...ANSWER.bars[0]!, t: start }, { ...ANSWER.bars[0]!, t: start + 60 }], truncated: true, priceBasis: '',
    })
    chooseFixtureRun()
    widenEthusd()
    const chart = useRunChartStore()
    chart.chooseUnit('ETHUSD_spot_two_balances')
    chart.attach()
    await flushPromises()
    vi.mocked(apiClient.getBars).mockClear()
    vi.mocked(apiClient.getBars).mockResolvedValue(ANSWER)

    chart.showPosition({ scenario: 'ETHUSD_spot_two_balances', position: 'pos_ethusd_10' })
    await flushPromises()
    expect(apiClient.getBars).toHaveBeenCalledOnce()
    expect(Math.abs(Date.parse(vi.mocked(apiClient.getBars).mock.lastCall![3]) - (chart.focusAt! * 1000 - 1000 * M10))).toBeLessThanOrEqual(1)

    chart.showPosition({ scenario: 'ETHUSD_spot_two_balances', position: 'pos_ethusd_9' })
    await flushPromises()
    expect(apiClient.getBars).toHaveBeenCalledOnce()
  })

  /** Without a position looked at the first batch starts at the window (decided 2026-10-29). */
  it('asks for the first batch from the window on, a period before it', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    await flushPromises()
    const [, , timeframe, from, , limit] = vi.mocked(apiClient.getBars).mock.calls[0]!
    expect(timeframe).toBe('M1')
    expect(Date.parse(from)).toBe(Date.parse(chart.window!.from) - 60_000)
    expect(limit).toBe(2000)
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
    late({ bars: [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1, tc: 1 }], truncated: true, priceBasis: '' })
    await flushPromises()
    expect(chart.bars.map(bar => bar.time)).toEqual([1761886800, 1761886860])
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
    expect(Date.parse(call[4])).toBe(Date.parse(COVERAGE.end))
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
