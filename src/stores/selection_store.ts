import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const KEY_BROKER    = 'sel.broker'
const KEY_SYMBOL    = 'sel.symbol'
const KEY_TIMEFRAME = 'sel.timeframe'

export const useSelectionStore = defineStore('selection', () => {
  const broker    = ref<string | null>(localStorage.getItem(KEY_BROKER))
  const symbol    = ref<string | null>(localStorage.getItem(KEY_SYMBOL))
  const timeframe = ref<string | null>(localStorage.getItem(KEY_TIMEFRAME))

  const isReady = computed(() =>
    broker.value !== null && symbol.value !== null && timeframe.value !== null
  )

  const selectedLabel = computed(() => {
    if (!isReady.value) return null
    return `${broker.value} / ${symbol.value} / ${timeframe.value}`
  })

  function setBroker(b: string): void {
    broker.value = b
    symbol.value = null
    localStorage.setItem(KEY_BROKER, b)
    localStorage.removeItem(KEY_SYMBOL)
    // timeframe intentionally kept — user preference persists across broker/symbol changes
  }

  function setSymbol(s: string): void {
    symbol.value = s
    localStorage.setItem(KEY_SYMBOL, s)
    // timeframe intentionally kept
  }

  function setTimeframe(tf: string): void {
    timeframe.value = tf
    localStorage.setItem(KEY_TIMEFRAME, tf)
  }

  function resetTimeframe(): void {
    timeframe.value = null
    localStorage.removeItem(KEY_TIMEFRAME)
  }

  return { broker, symbol, timeframe, isReady, selectedLabel, setBroker, setSymbol, setTimeframe, resetTimeframe }
})
