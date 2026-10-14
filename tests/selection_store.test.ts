import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useSelectionStore } from '@/stores/selection_store'

/** What the arrangement store keeps under its one key, read back the way a reload reads it. */
function stored(): { links: { A: { market: unknown } }, chart: unknown } {
  return JSON.parse(localStorage.getItem('arrangement.v1') ?? 'null')
}

describe('useSelectionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('starts empty when nothing is stored', () => {
    const store = useSelectionStore()
    expect(store.broker).toBeNull()
    expect(store.symbol).toBeNull()
    expect(store.timeframe).toBeNull()
  })

  /** The market is the main link's and the timeframe the chart's — both come back after a reload. */
  it('brings back the stored market and timeframe', () => {
    localStorage.setItem('arrangement.v1', JSON.stringify({
      version: 1,
      links: { A: { market: { broker: 'kraken_spot', symbol: 'BTCUSD' } } },
      bars: {},
      chart: { timeframe: 'H1' },
    }))
    const store = useSelectionStore()
    expect(store.broker).toBe('kraken_spot')
    expect(store.symbol).toBe('BTCUSD')
    expect(store.timeframe).toBe('H1')
  })

  it('setBroker sets the broker and clears the symbol of the last one', async () => {
    const store = useSelectionStore()
    store.setBroker('mt5')
    store.setSymbol('EURUSD')
    store.setBroker('kraken_spot')
    expect(store.broker).toBe('kraken_spot')
    expect(store.symbol).toBeNull()
    await nextTick()
    expect(stored().links.A.market).toEqual({ broker: 'kraken_spot', symbol: null })
  })

  it('setBroker keeps the timeframe across broker changes', () => {
    const store = useSelectionStore()
    store.setTimeframe('H1')
    store.setBroker('mt5')
    expect(store.timeframe).toBe('H1')
  })

  it('setSymbol sets the symbol and keeps the timeframe', () => {
    const store = useSelectionStore()
    store.setTimeframe('H4')
    store.setBroker('mt5')
    store.setSymbol('EURUSD')
    expect(store.symbol).toBe('EURUSD')
    expect(store.timeframe).toBe('H4')
  })

  it('setTimeframe is stored as the chart\'s own', async () => {
    const store = useSelectionStore()
    store.setTimeframe('D1')
    await nextTick()
    expect(stored().chart).toEqual({ timeframe: 'D1' })
  })

  it('resetTimeframe clears the timeframe', () => {
    const store = useSelectionStore()
    store.setTimeframe('H1')
    store.resetTimeframe()
    expect(store.timeframe).toBeNull()
  })

  it('isReady is false until all three values are set', () => {
    const store = useSelectionStore()
    expect(store.isReady).toBe(false)
    store.setBroker('mt5')
    expect(store.isReady).toBe(false)
    store.setSymbol('EURUSD')
    expect(store.isReady).toBe(false)
    store.setTimeframe('H1')
    expect(store.isReady).toBe(true)
  })

  it('isReady becomes false again after resetTimeframe', () => {
    const store = useSelectionStore()
    store.setBroker('mt5')
    store.setSymbol('EURUSD')
    store.setTimeframe('H1')
    store.resetTimeframe()
    expect(store.isReady).toBe(false)
  })

  it('selectedLabel names all three when ready, and nothing before', () => {
    const store = useSelectionStore()
    expect(store.selectedLabel).toBeNull()
    store.setBroker('mt5')
    store.setSymbol('EURUSD')
    store.setTimeframe('H1')
    expect(store.selectedLabel).toBe('mt5 / EURUSD / H1')
  })
})
