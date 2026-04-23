import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useSelectionStore } from '@/stores/selection_store'
import { getCoverage, getBars } from '@/api/api_client'
import type { ChartBar } from '@/types/api/bar_types'

const DEFAULT_WINDOW_SECONDS: Record<string, number> = {
  'M1':  4  * 60 * 60,
  'M5':  24 * 60 * 60,
  'M15': 3  * 24 * 60 * 60,
  'M30': 7  * 24 * 60 * 60,
  'H1':  14 * 24 * 60 * 60,
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

  const selectionStore = useSelectionStore()

  async function fetchBars(): Promise<void> {
    const { broker, symbol, timeframe } = selectionStore
    if (!broker || !symbol || !timeframe) return

    loading.value = true
    error.value = null
    chartData.value = []

    try {
      const coverage = await getCoverage(broker, symbol)

      if (!coverage.timeframes.includes(timeframe)) {
        selectionStore.resetTimeframe()
        return
      }

      const endDate = parseUtcDate(coverage.end)
      const windowMs = (DEFAULT_WINDOW_SECONDS[timeframe] ?? 24 * 60 * 60) * 1000
      const fromDate = new Date(endDate.getTime() - windowMs)

      const bars = await getBars(broker, symbol, timeframe, fromDate.toISOString(), endDate.toISOString())

      chartData.value = bars.map(b => ({
        time: b.t,
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load bars'
    } finally {
      loading.value = false
    }
  }

  watch(
    [() => selectionStore.broker, () => selectionStore.symbol, () => selectionStore.timeframe],
    () => { if (selectionStore.isReady) fetchBars() },
    { immediate: true }
  )

  return { chartData, loading, error }
})
