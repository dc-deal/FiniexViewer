import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChartQuickBar from '@/components/ChartQuickBar.vue'
import { useSelectionStore } from '@/stores/selection_store'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getBrokers: vi.fn(),
  getSymbols: vi.fn(),
  getTimeframes: vi.fn(),
}))

describe('ChartQuickBar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(apiClient.getBrokers).mockResolvedValue(['mt5', 'kraken_spot'])
    vi.mocked(apiClient.getSymbols).mockResolvedValue([])
    vi.mocked(apiClient.getTimeframes).mockResolvedValue([{ name: 'H1', minutes: 60 }])
  })

  it('loads what the three selectors offer when the chart comes to the front', async () => {
    mount(ChartQuickBar)
    await flushPromises()
    expect(apiClient.getBrokers).toHaveBeenCalledOnce()
    expect(apiClient.getTimeframes).toHaveBeenCalledOnce()
    expect(apiClient.getSymbols).not.toHaveBeenCalled()
  })

  /** The broker came back with the stored selection, so its symbols are needed at once. */
  it('loads the symbols of a broker the reader left selected', async () => {
    useSelectionStore().setBroker('mt5')
    mount(ChartQuickBar)
    await flushPromises()
    expect(apiClient.getSymbols).toHaveBeenCalledWith('mt5')
  })

  /** No visible label stands beside a compact select, so each one carries its name for a reader. */
  it('names its three selects, shows the names while nothing is chosen, and the values after', async () => {
    const wrapper = mount(ChartQuickBar)
    await flushPromises()
    const selects = wrapper.findAll('select')
    expect(selects.map(node => node.attributes('aria-label'))).toEqual(['Broker', 'Symbol', 'Timeframe'])
    expect(selects.every(node => node.classes('compact'))).toBe(true)
    expect(selects[0]!.find('option:checked').text()).toBe('Broker')

    await selects[0]!.setValue('mt5')
    expect(useSelectionStore().broker).toBe('mt5')
    expect(apiClient.getSymbols).toHaveBeenCalledWith('mt5')
  })
})
