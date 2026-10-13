import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChartSelectors from '@/components/ChartSelectors.vue'
import { useSelectionStore } from '@/stores/selection_store'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getBrokers: vi.fn(),
  getSymbols: vi.fn(),
  getTimeframes: vi.fn(),
}))

describe('ChartSelectors', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(apiClient.getBrokers).mockResolvedValue(['mt5', 'kraken_spot'])
    vi.mocked(apiClient.getSymbols).mockResolvedValue([])
    vi.mocked(apiClient.getTimeframes).mockResolvedValue([{ name: 'H1', minutes: 60 }])
  })

  it('loads what the three selectors offer when the chart is first shown', async () => {
    mount(ChartSelectors)
    await flushPromises()
    expect(apiClient.getBrokers).toHaveBeenCalledOnce()
    expect(apiClient.getTimeframes).toHaveBeenCalledOnce()
    expect(apiClient.getSymbols).not.toHaveBeenCalled()
  })

  /** The broker came back with the stored selection, so its symbols are needed at once. */
  it('loads the symbols of a broker the reader left selected', async () => {
    useSelectionStore().setBroker('mt5')
    mount(ChartSelectors)
    await flushPromises()
    expect(apiClient.getSymbols).toHaveBeenCalledWith('mt5')
  })
})
