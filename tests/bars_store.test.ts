import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useBarsStore } from '@/stores/bars_store'
import { useSelectionStore } from '@/stores/selection_store'
import { useTimeframeStore } from '@/stores/timeframe_store'
import type { TimeframeInfo } from '@/types/api/timeframe_types'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getTimeframes: vi.fn(),
  getCoverage: vi.fn(),
  getBars: vi.fn(),
}))

const TF_INFOS: TimeframeInfo[] = [
  { name: 'M1',  minutes: 1    },
  { name: 'M5',  minutes: 5    },
  { name: 'M15', minutes: 15   },
  { name: 'M30', minutes: 30   },
  { name: 'H1',  minutes: 60   },
  { name: 'H4',  minutes: 240  },
  { name: 'D1',  minutes: 1440 },
]

// Coverage fixture with a broad set of timeframes
const COVERAGE = {
  start: '2024-01-01T00:00:00',
  end: '2024-12-31T00:00:00',
  timeframes: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'],
}

const TARGET_BARS = 300

function selectAll(timeframe = 'H1'): void {
  const s = useSelectionStore()
  s.setBroker('kraken_spot')
  s.setSymbol('BTCUSD')
  s.setTimeframe(timeframe)
}

describe('useBarsStore', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(apiClient.getTimeframes).mockResolvedValue(TF_INFOS)
    await useTimeframeStore().loadTimeframes()
  })

  it('does not call getCoverage when selection is incomplete', async () => {
    useBarsStore()
    useSelectionStore().setBroker('kraken_spot')
    await flushPromises()
    expect(apiClient.getCoverage).not.toHaveBeenCalled()
  })

  it('resets timeframe and skips getBars when timeframe not in coverage', async () => {
    vi.mocked(apiClient.getCoverage).mockResolvedValue({
      start: '2024-01-01T00:00:00',
      end: '2024-12-31T00:00:00',
      timeframes: ['H1'],
    })
    const store = useBarsStore()
    const selection = useSelectionStore()
    selectAll('D1')
    await flushPromises()
    expect(selection.timeframe).toBeNull()
    expect(apiClient.getBars).not.toHaveBeenCalled()
    expect(store.chartData).toEqual([])
  })

  it('computes M30 window as TARGET_BARS * 30 minutes', async () => {
    vi.mocked(apiClient.getCoverage).mockResolvedValue(COVERAGE)
    vi.mocked(apiClient.getBars).mockResolvedValue([])
    useBarsStore()
    selectAll('M30')
    await flushPromises()
    const [, , , fromStr, toStr] = vi.mocked(apiClient.getBars).mock.calls[0]
    const diffSeconds = (new Date(toStr as string).getTime() - new Date(fromStr as string).getTime()) / 1000
    expect(diffSeconds).toBe(TARGET_BARS * 30 * 60)
  })

  it('computes H1 window as TARGET_BARS * 60 minutes', async () => {
    vi.mocked(apiClient.getCoverage).mockResolvedValue(COVERAGE)
    vi.mocked(apiClient.getBars).mockResolvedValue([])
    useBarsStore()
    selectAll('H1')
    await flushPromises()
    const [, , , fromStr, toStr] = vi.mocked(apiClient.getBars).mock.calls[0]
    const diffSeconds = (new Date(toStr as string).getTime() - new Date(fromStr as string).getTime()) / 1000
    expect(diffSeconds).toBe(TARGET_BARS * 60 * 60)
  })

  it('computes D1 window as TARGET_BARS * 1440 minutes', async () => {
    vi.mocked(apiClient.getCoverage).mockResolvedValue(COVERAGE)
    vi.mocked(apiClient.getBars).mockResolvedValue([])
    useBarsStore()
    selectAll('D1')
    await flushPromises()
    const [, , , fromStr, toStr] = vi.mocked(apiClient.getBars).mock.calls[0]
    const diffSeconds = (new Date(toStr as string).getTime() - new Date(fromStr as string).getTime()) / 1000
    expect(diffSeconds).toBe(TARGET_BARS * 1440 * 60)
  })

  it('maps API bar fields to Lightweight Charts format', async () => {
    vi.mocked(apiClient.getCoverage).mockResolvedValue(COVERAGE)
    vi.mocked(apiClient.getBars).mockResolvedValue([
      { t: 1704067200, o: 42000, h: 43000, l: 41000, c: 42500, v: 100 },
    ])
    const store = useBarsStore()
    selectAll('H1')
    await flushPromises()
    expect(store.chartData).toEqual([
      { time: 1704067200, open: 42000, high: 43000, low: 41000, close: 42500 },
    ])
  })

  it('sets error message on API failure and clears chartData', async () => {
    vi.mocked(apiClient.getCoverage).mockRejectedValue(new Error('Network error'))
    const store = useBarsStore()
    selectAll('H1')
    await flushPromises()
    expect(store.error).toBe('Network error')
    expect(store.chartData).toEqual([])
  })

  it('clears error on subsequent successful fetch', async () => {
    vi.mocked(apiClient.getCoverage).mockRejectedValue(new Error('Timeout'))
    const store = useBarsStore()
    const selection = useSelectionStore()
    selectAll('H1')
    await flushPromises()
    expect(store.error).toBe('Timeout')

    vi.mocked(apiClient.getCoverage).mockResolvedValue(COVERAGE)
    vi.mocked(apiClient.getBars).mockResolvedValue([])
    selection.setTimeframe('M30')
    await flushPromises()
    expect(store.error).toBeNull()
  })
})
