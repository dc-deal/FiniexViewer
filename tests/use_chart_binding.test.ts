import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useChartBinding } from '@/composables/use_chart_binding'
import { useSelectionStore } from '@/stores/selection_store'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getCoverage: vi.fn(),
  getBars: vi.fn(),
}))

function mountBinding(): void {
  mount(defineComponent({
    setup() {
      useChartBinding()
      return () => null
    },
  }))
}

function choose(timeframe: string): void {
  const selection = useSelectionStore()
  selection.setBroker('mt5')
  selection.setSymbol('EURUSD')
  selection.setTimeframe(timeframe)
}

describe('useChartBinding', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(apiClient.getCoverage).mockResolvedValue({
      start: '2025-09-17T00:00:00+00:00',
      end: '2026-10-09T20:56:00+00:00',
      timeframes: ['H1'],
    })
    vi.mocked(apiClient.getBars).mockResolvedValue({ bars: [], truncated: false })
  })

  /** The selector then asks for a timeframe the symbol has, instead of drawing nothing. */
  it('clears a timeframe the symbol has no coverage for', async () => {
    mountBinding()
    choose('D1')
    await flushPromises()
    expect(useSelectionStore().timeframe).toBeNull()
  })

  it('keeps a timeframe the symbol is covered in', async () => {
    mountBinding()
    choose('H1')
    await flushPromises()
    expect(useSelectionStore().timeframe).toBe('H1')
  })
})
