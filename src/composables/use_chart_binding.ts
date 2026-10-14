import { watch } from 'vue'
import { useBarsStore } from '@/stores/bars_store'
import { useSelectionStore } from '@/stores/selection_store'

/**
 * The chart's own decisions about its selection. A timeframe the symbol has no coverage for is
 * cleared, so the selector asks for one it has — the bars store only says so, because what a data
 * store does with a selection it reads is the defect this replaces.
 */
export function useChartBinding(): void {
  const bars = useBarsStore()
  const selection = useSelectionStore()

  watch(() => bars.timeframeUncovered, uncovered => {
    if (uncovered) selection.resetTimeframe()
  })
}
