import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import QuickBar from '@/components/dock/QuickBar.vue'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getBrokers: vi.fn(),
  getSymbols: vi.fn(),
  getTimeframes: vi.fn(),
}))

describe('QuickBar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(apiClient.getBrokers).mockResolvedValue([])
    vi.mocked(apiClient.getTimeframes).mockResolvedValue([])
  })

  /** The options of the panel in FRONT of the group — the chart's selection while the chart is. */
  it('offers the chart selection while the chart is the panel in front', async () => {
    const wrapper = mount(QuickBar, { props: { kindId: 'chart' } })
    // the chart's bar is loaded on demand, like the panel itself — wait for the import, then the render
    await vi.dynamicImportSettled()
    await flushPromises()
    expect(wrapper.find('[data-quick-bar="chart"]').exists()).toBe(true)
    expect(wrapper.find('select[aria-label="Broker"]').exists()).toBe(true)
  })

  it('offers nothing for a panel that has no options, or where the group shows none', async () => {
    expect(mount(QuickBar, { props: { kindId: 'runs' } }).html()).not.toContain('quick-bar')
    expect(mount(QuickBar, { props: { kindId: null } }).html()).not.toContain('quick-bar')
    expect(mount(QuickBar, { props: { kindId: 'retired' } }).html()).not.toContain('quick-bar')
  })
})
