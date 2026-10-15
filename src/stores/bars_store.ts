import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useSelectionStore } from '@/stores/selection_store'
import { useTimeframeStore } from '@/stores/timeframe_store'
import { getCoverage, getBars } from '@/api/api_client'
import type { ApiBar, ChartBar } from '@/types/api/bar_types'
import { t } from '@/translate'

// Number of candles to show by default — applies to all timeframes uniformly.
// Window = TARGET_BARS * minutes_per_bar * 60 seconds.
const TARGET_BARS = 300

/** The route's rows as the chart draws them — one shape for every chart that draws candles. */
export function toChartBars(bars: ApiBar[]): ChartBar[] {
  return bars.map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }))
}

function parseUtcDate(iso: string): Date {
  // append Z if no timezone suffix present to ensure UTC parsing
  const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z'
  return new Date(normalized)
}

export const useBarsStore = defineStore('bars', () => {
  const chartData = ref<ChartBar[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /**
   * The chosen timeframe is not in the symbol's coverage. SAID, not acted on: what to do about it
   * is a decision about the selection, which is the chart's to make (`use_chart_binding`) — a data
   * store that reset it wrote into a selection it only reads.
   */
  const timeframeUncovered = ref(false)

  const selectionStore = useSelectionStore()
  const timeframeStore = useTimeframeStore()

  async function fetchBars(): Promise<void> {
    const { broker, symbol, timeframe } = selectionStore
    if (!broker || !symbol || !timeframe) return

    loading.value = true
    error.value = null
    chartData.value = []
    timeframeUncovered.value = false

    try {
      const coverage = await getCoverage(broker, symbol)

      if (!coverage.timeframes.includes(timeframe)) {
        timeframeUncovered.value = true
        return
      }

      const endDate = parseUtcDate(coverage.end)
      const minutes = timeframeStore.minutesFor(timeframe) ?? 60
      const windowMs = TARGET_BARS * minutes * 60 * 1000
      const fromDate = new Date(endDate.getTime() - windowMs)

      // 300 bars, far below the route's cap: `truncated` cannot be set here
      const { bars } = await getBars(broker, symbol, timeframe, fromDate.toISOString(), endDate.toISOString())
      chartData.value = toChartBars(bars)
    } catch (e) {
      error.value = e instanceof Error ? e.message : t('Failed to load bars')
    } finally {
      loading.value = false
    }
  }

  watch(
    [() => selectionStore.broker, () => selectionStore.symbol, () => selectionStore.timeframe],
    () => { if (selectionStore.isReady) fetchBars() },
    { immediate: true }
  )

  return { chartData, loading, error, timeframeUncovered }
})
