import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useSelectionStore } from '@/stores/selection_store'
import { useTimeframeStore } from '@/stores/timeframe_store'
import { getCoverage } from '@/api/api_client'
import { useBarLoader } from '@/composables/use_bar_loader'
import type { BarEdge } from '@/composables/use_bar_loader'
import type { ApiBar, ChartBar } from '@/types/api/bar_types'
import { t } from '@/translate'

// Number of candles to show by default — applies to all timeframes uniformly.
// Window = TARGET_BARS * minutes_per_bar * 60 seconds. Earlier ones load as the reader pans left.
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
  /** The symbol's bars, loaded as the view moves (viewer#9): the last ones first, earlier ones on the way left. */
  const loader = useBarLoader()
  const chartData = computed<ChartBar[]>(() => toChartBars(loader.served.value))
  /** The coverage on its way — before the bars are asked for. */
  const asking = ref(false)
  const coverageError = ref<string | null>(null)
  const loading = computed(() => asking.value || loader.loading.value)
  const error = computed(() => coverageError.value ?? loader.error.value)
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

    asking.value = true
    coverageError.value = null
    loader.clear()
    timeframeUncovered.value = false

    try {
      const coverage = await getCoverage(broker, symbol)

      if (!coverage.timeframes.includes(timeframe)) {
        timeframeUncovered.value = true
        return
      }

      const endDate = parseUtcDate(coverage.end)
      const minutes = timeframeStore.minutesFor(timeframe) ?? 60
      const period = minutes * 60 * 1000
      asking.value = false
      await loader.open({
        broker, symbol, timeframe, period,
        from: parseUtcDate(coverage.start).getTime(),
        to: endDate.getTime(),
        start: endDate.getTime() - TARGET_BARS * period,
      })
    } catch (e) {
      coverageError.value = e instanceof Error ? e.message : t('Failed to load bars')
    } finally {
      asking.value = false
    }
  }

  /** Earlier bars, as the reader pans toward them — the last ones are loaded from the start. */
  function extend(edge: BarEdge): void {
    void loader.extend(edge)
  }

  watch(
    [() => selectionStore.broker, () => selectionStore.symbol, () => selectionStore.timeframe],
    () => { if (selectionStore.isReady) fetchBars() },
    { immediate: true }
  )

  return {
    chartData, loading, error, timeframeUncovered, loadingEdges: loader.loadingEdges, edgeError: loader.edgeError, extend,
  }
})
