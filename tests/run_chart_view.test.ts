import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RunChartView from '@/views/RunChartView.vue'
import RunChartQuickBar from '@/components/RunChartQuickBar.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import { useContextStore } from '@/stores/context_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import * as apiClient from '@/api/api_client'
import type { CoverageResponse } from '@/types/api/bar_types'
import type { RunInfo, TradeHistoryReport } from '@/types/api/report_types'
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
const trades = tradeFixture as unknown as TradeHistoryReport

const COVERAGE: CoverageResponse = {
  start: '2025-09-21T00:00:00+00:00', end: '2026-10-09T20:56:00+00:00', timeframes: ['H1', 'M1', 'M5'],
}

/** One bar a minute over the fixture run's units, so every trade of theirs has a candle. */
function barsOver(fromIso: string, toIso: string): { t: number, o: number, h: number, l: number, c: number, v: number, tc: number }[] {
  const from = Math.floor(Date.parse(fromIso) / 60_000) * 60
  const to = Date.parse(toIso) / 1000
  const bars = []
  for (let t = from; t <= to; t += 60) bars.push({ t, o: 1, h: 1, l: 1, c: 1, v: 1, tc: 1 })
  return bars
}

let mounted: VueWrapper | null = null

function chooseFixtureRun(): void {
  useRunsStore().runs = RUNS
  useContextStore().selectRun(RUN)
  const reports = useRunReportsStore()
  reports.scenarios = scenarioFixture as unknown as ScenarioDetailsReport
  reports.tradeHistory = trades
}

async function mountView(): Promise<VueWrapper> {
  mounted = mount(RunChartView, { attachTo: document.body })
  await flushPromises()
  return mounted
}

describe('RunChartView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(apiClient.findCoverage).mockReset().mockResolvedValue(COVERAGE)
    vi.mocked(apiClient.getBars).mockReset().mockImplementation(async (_broker, _symbol, _timeframe, from, to) =>
      ({ bars: barsOver(from, to), truncated: false, priceBasis: '' }))
    vi.mocked(apiClient.getTimeframes).mockReset().mockResolvedValue([
      { name: 'M1', minutes: 1 }, { name: 'M5', minutes: 5 }, { name: 'H1', minutes: 60 },
    ])
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('asks for a run where none is chosen', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Choose a run to see its trades on the candles')
  })

  /** The marks are on a canvas; the element says how many, which is what a reader could count. */
  it('draws the unit\'s candles with its trades marked on them', async () => {
    chooseFixtureRun()
    const wrapper = await mountView()
    const chart = wrapper.find('.candle-chart')
    expect(chart.exists()).toBe(true)
    expect(Number(chart.attributes('data-marks'))).toBeGreaterThan(0)
    expect(wrapper.find('.chart-notice').exists()).toBe(false)
  })

  /** What the shapes mean, said once over the chart — and dismissible, like every hint. */
  it('explains the shapes of its marks in a hint line', async () => {
    chooseFixtureRun()
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('↑↓ a position opened')
  })

  /** A batch at an edge that failed is said in that corner, and the bars loaded stay drawn (viewer#9). */
  it('says in the corner of an edge that its bars could not be loaded, the chart staying drawn', async () => {
    vi.mocked(apiClient.getBars).mockResolvedValueOnce({
      bars: barsOver('2025-10-31T05:00:00Z', '2025-10-31T05:10:00Z'), truncated: true, priceBasis: '',
    })
    chooseFixtureRun()
    const wrapper = await mountView()
    vi.mocked(apiClient.getBars).mockRejectedValueOnce(new Error('Network Error'))
    useRunChartStore().extendBars('right')
    await flushPromises()
    // inside the chart's frame, over the plot — never a line that moves the chart down
    const corner = wrapper.find('.candle-chart .edge-state.right')
    expect(corner.text()).toBe('Later bars could not be loaded: Network Error')
    expect(corner.find('[data-icon="status-error"]').exists()).toBe(true)
    expect(wrapper.find('.candle-chart').exists()).toBe(true)
  })

  it('names the market the archive holds nothing for', async () => {
    vi.mocked(apiClient.findCoverage).mockResolvedValue(null)
    chooseFixtureRun()
    const wrapper = await mountView()
    const unit = useRunChartStore().unit!
    expect(wrapper.text()).toContain(`The archive holds no bars for ${unit.symbol} · ${unit.broker}`)
  })

  it('names the window without bars rather than drawing an empty chart', async () => {
    vi.mocked(apiClient.getBars).mockResolvedValue({ bars: [], truncated: false, priceBasis: '' })
    chooseFixtureRun()
    const wrapper = await mountView()
    expect(wrapper.find('.candle-chart').exists()).toBe(false)
    expect(wrapper.text()).toContain(`The archive holds no bars in the window this unit covered: ${useRunChartStore().unit!.name}`)
  })

  /** Without its index row the chart said "names no market" through every first load of the index. */
  it('waits for the index rather than saying the run names no market', async () => {
    useContextStore().selectRun(RUN)
    useRunsStore().loadingRuns = true
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('names no market')
    expect(wrapper.findComponent(AppSpinner).exists()).toBe(true)
  })

  it('names the run the index no longer holds', async () => {
    useContextStore().selectRun('gone_run')
    useRunsStore().unknownRunId = 'gone_run'
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('The run you had open is no longer in the index: gone_run')
  })

  it('says a run names no market where its source has arrived without one', async () => {
    const session: RunInfo = { ...RUNS.find(run => run.run_id === RUN)!, run_id: 'session_1', group: 'autotrader' }
    useRunsStore().runs = [session]
    useContextStore().selectRun('session_1')
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('This run names no market for its units')
  })

  it('asks the archive only while it is on show', async () => {
    chooseFixtureRun()
    await mountView()
    mounted!.unmount()
    mounted = null
    vi.mocked(apiClient.getBars).mockClear()
    useRunChartStore().chooseUnit('EURGBP_refusals_02')
    await flushPromises()
    expect(apiClient.getBars).not.toHaveBeenCalled()
  })
})

describe('RunChartQuickBar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(apiClient.findCoverage).mockReset().mockResolvedValue(COVERAGE)
    vi.mocked(apiClient.getBars).mockReset().mockResolvedValue({ bars: [], truncated: false, priceBasis: '' })
    vi.mocked(apiClient.getTimeframes).mockReset().mockResolvedValue([
      { name: 'M1', minutes: 1 }, { name: 'M5', minutes: 5 }, { name: 'H1', minutes: 60 },
    ])
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  /** The whole set of units, a unit nothing can be drawn for disabled with its reason. */
  it('lists every unit of the run, the ones that cannot be drawn disabled and saying why', async () => {
    chooseFixtureRun()
    mounted = mount(RunChartQuickBar)
    await flushPromises()
    const options = mounted.findAll('select')[0]!.findAll('option').filter(option => option.attributes('value'))
    const blocked = options.find(option => option.text().startsWith('EURGBP_before_the_archive'))!
    expect(blocked.text()).toContain('processed no tick')
    expect(blocked.attributes('disabled')).toBeDefined()
    expect(options.length).toBe(RUNS.find(run => run.run_id === RUN)!.data_windows!.length)
  })

  it('chooses the unit and the timeframe of the chart', async () => {
    chooseFixtureRun()
    const chart = useRunChartStore()
    chart.attach()
    mounted = mount(RunChartQuickBar)
    await flushPromises()
    const [units, timeframes] = mounted.findAll('select')
    await units!.setValue('EURGBP_refusals_02')
    expect(chart.unit!.name).toBe('EURGBP_refusals_02')
    await flushPromises()
    // shortest first, by their length rather than their names
    expect(timeframes!.findAll('option').map(option => option.attributes('value')).filter(Boolean)).toEqual(['M1', 'M5', 'H1'])
    await timeframes!.setValue('M5')
    expect(chart.timeframe).toBe('M5')
  })

  /** A select is as wide as its widest option: the word stood wider than any timeframe. */
  it('offers the timeframe placeholder only while no timeframe is chosen', async () => {
    const chart = useRunChartStore()
    mounted = mount(RunChartQuickBar)
    await flushPromises()
    const placeholder = (): boolean => mounted!.findAll('select')[1]!.findAll('option')
      .some(option => option.text() === 'Timeframe')
    expect(chart.timeframe).toBeNull()
    expect(placeholder()).toBe(true)
    chooseFixtureRun()
    chart.attach()
    await flushPromises()
    expect(chart.timeframe).not.toBeNull()
    expect(placeholder()).toBe(false)
  })
})
