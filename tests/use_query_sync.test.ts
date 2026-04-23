import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { defineComponent } from 'vue'
import { useQuerySync } from '@/composables/use_query_sync'
import { useSelectionStore } from '@/stores/selection_store'

// symbolStore.loadSymbols calls getSymbols — mock to avoid real HTTP
vi.mock('@/api/api_client', () => ({
  getTimeframes: vi.fn().mockResolvedValue([]),
  getBrokers:    vi.fn().mockResolvedValue([]),
  getSymbols:    vi.fn().mockResolvedValue([]),
  getCoverage:   vi.fn().mockResolvedValue({ start: '', end: '', timeframes: [] }),
  getBars:       vi.fn().mockResolvedValue([]),
}))

// Minimal component that activates the composable
const TestComponent = defineComponent({
  setup() { useQuerySync() },
  template: '<div/>',
})

function makeRouter(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  })
  // always push so the initial navigation completes and router.isReady() resolves
  router.push({ path: '/', query })
  return router
}

describe('useQuerySync', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
  })

  it('applies broker / symbol / timeframe from URL query to the store', async () => {
    const router = makeRouter({ broker: 'kraken_spot', symbol: 'BTCUSD', timeframe: 'H1' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()
    const selection = useSelectionStore()
    expect(selection.broker).toBe('kraken_spot')
    expect(selection.symbol).toBe('BTCUSD')
    expect(selection.timeframe).toBe('H1')
  })

  it('URL params override localStorage values', async () => {
    localStorage.setItem('sel.broker', 'mt5')
    localStorage.setItem('sel.symbol', 'EURUSD')
    const router = makeRouter({ broker: 'kraken_spot', symbol: 'BTCUSD', timeframe: 'M30' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()
    const selection = useSelectionStore()
    expect(selection.broker).toBe('kraken_spot')
    expect(selection.symbol).toBe('BTCUSD')
  })

  it('only applies URL params that are present — absent params leave localStorage value intact', async () => {
    localStorage.setItem('sel.timeframe', 'D1')
    // URL has broker but no timeframe — localStorage timeframe must survive
    const router = makeRouter({ broker: 'kraken_spot' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()
    const selection = useSelectionStore()
    expect(selection.broker).toBe('kraken_spot')
    expect(selection.timeframe).toBe('D1')
  })

  it('does not call router.replace when there is nothing to sync', async () => {
    // no localStorage, no URL params → store stays empty → watcher never fires
    const router = makeRouter()
    const replaceSpy = vi.spyOn(router, 'replace')
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('calls router.replace when selection changes after ready', async () => {
    const router = makeRouter()
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises() // onMounted completes → _ready = true

    const replaceSpy = vi.spyOn(router, 'replace')
    const selection = useSelectionStore()
    selection.setBroker('kraken_spot')
    selection.setSymbol('BTCUSD')
    selection.setTimeframe('H1')
    await flushPromises()

    expect(replaceSpy).toHaveBeenCalled()
    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query['broker']).toBe('kraken_spot')
  })
})
