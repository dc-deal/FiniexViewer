import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'

/**
 * The free chart's selection in one place for its selectors and its bars: the MARKET of the main
 * link, and the chart's own TIMEFRAME — a timeframe belongs to a chart, not to a link. Neither is
 * held here; both are stored by the arrangement store and restored before the chart mounts.
 */
export const useSelectionStore = defineStore('selection', () => {
  const context = useContextStore()
  const arrangement = useArrangementStore()

  const broker = computed(() => context.main.market.broker)
  const symbol = computed(() => context.main.market.symbol)
  const timeframe = computed(() => arrangement.chart.timeframe)

  const isReady = computed(() =>
    broker.value !== null && symbol.value !== null && timeframe.value !== null
  )

  const selectedLabel = computed(() => {
    if (!isReady.value) return null
    return `${broker.value} / ${symbol.value} / ${timeframe.value}`
  })

  /** A broker has its own symbols; the timeframe is the reader's preference and stays. */
  function setBroker(b: string): void {
    context.setBroker(b)
  }

  function setSymbol(s: string): void {
    context.setSymbol(s)
  }

  function setTimeframe(tf: string): void {
    arrangement.setTimeframe(tf)
  }

  function resetTimeframe(): void {
    arrangement.setTimeframe(null)
  }

  return { broker, symbol, timeframe, isReady, selectedLabel, setBroker, setSymbol, setTimeframe, resetTimeframe }
})
