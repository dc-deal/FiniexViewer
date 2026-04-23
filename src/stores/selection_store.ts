import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useSelectionStore = defineStore('selection', () => {
  const broker = ref<string | null>(null)
  const symbol = ref<string | null>(null)
  const timeframe = ref<string | null>(null)

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
    timeframe.value = null
  }

  function setSymbol(s: string): void {
    symbol.value = s
    timeframe.value = null
  }

  function setTimeframe(tf: string): void {
    timeframe.value = tf
  }

  return { broker, symbol, timeframe, isReady, selectedLabel, setBroker, setSymbol, setTimeframe }
})
