import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSelectionStore } from '@/stores/selection_store'

describe('useSelectionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('initializes to null when localStorage is empty', () => {
    const store = useSelectionStore()
    expect(store.broker).toBeNull()
    expect(store.symbol).toBeNull()
    expect(store.timeframe).toBeNull()
  })

  it('initializes from localStorage on first access', () => {
    localStorage.setItem('sel.broker', 'kraken_spot')
    localStorage.setItem('sel.symbol', 'BTCUSD')
    localStorage.setItem('sel.timeframe', 'H1')
    const store = useSelectionStore()
    expect(store.broker).toBe('kraken_spot')
    expect(store.symbol).toBe('BTCUSD')
    expect(store.timeframe).toBe('H1')
  })

  it('setBroker sets broker, clears symbol, updates localStorage', () => {
    const store = useSelectionStore()
    store.setSymbol('BTCUSD')
    store.setBroker('kraken_spot')
    expect(store.broker).toBe('kraken_spot')
    expect(store.symbol).toBeNull()
    expect(localStorage.getItem('sel.broker')).toBe('kraken_spot')
    expect(localStorage.getItem('sel.symbol')).toBeNull()
  })

  it('setBroker preserves timeframe across broker changes', () => {
    const store = useSelectionStore()
    store.setTimeframe('H1')
    store.setBroker('kraken_spot')
    expect(store.timeframe).toBe('H1')
    expect(localStorage.getItem('sel.timeframe')).toBe('H1')
  })

  it('setSymbol sets symbol and preserves timeframe', () => {
    const store = useSelectionStore()
    store.setTimeframe('M30')
    store.setSymbol('EURUSD')
    expect(store.symbol).toBe('EURUSD')
    expect(store.timeframe).toBe('M30')
    expect(localStorage.getItem('sel.symbol')).toBe('EURUSD')
  })

  it('setTimeframe persists to localStorage', () => {
    const store = useSelectionStore()
    store.setTimeframe('D1')
    expect(store.timeframe).toBe('D1')
    expect(localStorage.getItem('sel.timeframe')).toBe('D1')
  })

  it('resetTimeframe clears timeframe from state and localStorage', () => {
    const store = useSelectionStore()
    store.setTimeframe('M30')
    store.resetTimeframe()
    expect(store.timeframe).toBeNull()
    expect(localStorage.getItem('sel.timeframe')).toBeNull()
  })

  it('isReady is false until all three values are set', () => {
    const store = useSelectionStore()
    expect(store.isReady).toBe(false)
    store.setBroker('kraken_spot')
    expect(store.isReady).toBe(false)
    store.setSymbol('BTCUSD')
    expect(store.isReady).toBe(false)
    store.setTimeframe('H1')
    expect(store.isReady).toBe(true)
  })

  it('isReady becomes false again after resetTimeframe', () => {
    const store = useSelectionStore()
    store.setBroker('kraken_spot')
    store.setSymbol('BTCUSD')
    store.setTimeframe('H1')
    store.resetTimeframe()
    expect(store.isReady).toBe(false)
  })

  it('selectedLabel returns formatted string when ready', () => {
    const store = useSelectionStore()
    store.setBroker('kraken_spot')
    store.setSymbol('BTCUSD')
    store.setTimeframe('H1')
    expect(store.selectedLabel).toBe('kraken_spot / BTCUSD / H1')
  })

  it('selectedLabel returns null when not ready', () => {
    const store = useSelectionStore()
    expect(store.selectedLabel).toBeNull()
  })
})
