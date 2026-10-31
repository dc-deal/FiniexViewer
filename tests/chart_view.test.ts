import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import ChartView from '@/views/ChartView.vue'
import CandleChart from '@/components/CandleChart.vue'
import { useSelectionStore } from '@/stores/selection_store'
import { useSymbolStore } from '@/stores/symbol_store'
import { useTimeframeStore } from '@/stores/timeframe_store'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getTimeframes: vi.fn(),
  getCoverage: vi.fn(),
  getBars: vi.fn(),
}))

/** The free chart: its candles drawn at the tick size of the market on show. */
describe('ChartView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(apiClient.getTimeframes).mockResolvedValue([{ name: 'H1', minutes: 60 }])
    await useTimeframeStore().loadTimeframes()
  })

  /** Without the format the chart library puts two decimals on every label: EURUSD read 1.16. */
  it('hands the chart the price format of its market, once the symbols list is there', async () => {
    vi.mocked(apiClient.getCoverage).mockResolvedValue({
      start: '2024-01-01T00:00:00', end: '2024-12-31T00:00:00', timeframes: ['H1'],
    })
    vi.mocked(apiClient.getBars).mockResolvedValue({
      bars: [{ t: 1704067200, o: 1, h: 1, l: 1, c: 1, v: 1, tc: 1 }], truncated: false, priceBasis: '',
    })
    const selection = useSelectionStore()
    selection.setBroker('mt5')
    selection.setSymbol('EURUSD')
    selection.setTimeframe('H1')
    const wrapper = mount(ChartView, { global: { stubs: { CandleChart: true } } })
    await flushPromises()
    const chart = wrapper.findComponent(CandleChart)
    expect(chart.props('priceFormat')).toBeNull()

    useSymbolStore().symbolsByBroker = { mt5: [{ symbol: 'EURUSD', market_type: 'forex', tick_size: 0.00001 }] }
    await nextTick()
    expect(chart.props('priceFormat')).toEqual({ precision: 5, minMove: 0.00001 })
  })
})
