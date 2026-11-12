import { onMounted, onUnmounted } from 'vue'
import type { IChartApi } from 'lightweight-charts'
import type { ChartPaneId, PaneWeights } from '@/types/chart_pane_types'

/**
 * The weight a pane stands at where the reader never dragged it. The price pane takes the library's
 * own weight for its first pane, 2; a pane below it 0.5, so a fifth of the height — where Kraken Pro
 * stands its volume.
 */
export const DEFAULT_PANE_WEIGHTS: Record<ChartPaneId, number> = { price: 2, volume: 0.5 }

/** Two weights this close are one: the library keeps them as floats, and a drag that moved nothing is no change. */
const SAME_WEIGHT = 1e-6

interface ChartPanesOptions {
  chart: () => IChartApi | null
  /** Which pane stands at each index, top to bottom. */
  ids: () => readonly ChartPaneId[]
  /** The weights the reader kept, or none. */
  weights: () => PaneWeights | null | undefined
  /** Told the weights of every pane once a drag of a separator changed one. */
  onWeights: (weights: PaneWeights) => void
}

interface ChartPanes {
  /** Lays the panes out at their kept weights, a pane never dragged at its default. */
  applyWeights: () => void
}

/**
 * A chart's panes as tall as the reader keeps them (viewer#57). The library holds a pane's height
 * as a weight against the others' and drags a separator by changing the two weights beside it, but
 * says nothing when it does — so the weights are read once a pointer is released, and told only
 * where one moved. Read on the window, as the release comes down to its target: a drag ends wherever
 * the pointer is let go, and nothing on the page can keep the release from the chart.
 */
export function useChartPanes(options: ChartPanesOptions): ChartPanes {
  /** The weight a pane should stand at: the kept one, else its default. */
  function wanted(id: ChartPaneId): number {
    return options.weights()?.[id] ?? DEFAULT_PANE_WEIGHTS[id]
  }

  function applyWeights(): void {
    const panes = options.chart()?.panes() ?? []
    const ids = options.ids()
    panes.forEach((pane, index) => {
      const id = ids[index]
      if (id) pane.setStretchFactor(wanted(id))
    })
  }

  function onRelease(): void {
    const panes = options.chart()?.panes() ?? []
    if (panes.length < 2) return
    const ids = options.ids()
    const read: PaneWeights = {}
    let moved = false
    panes.forEach((pane, index) => {
      const id = ids[index]
      if (!id) return
      read[id] = pane.getStretchFactor()
      if (Math.abs(read[id] - wanted(id)) > SAME_WEIGHT) moved = true
    })
    if (moved) options.onWeights(read)
  }

  onMounted(() => window.addEventListener('pointerup', onRelease, { capture: true }))
  onUnmounted(() => window.removeEventListener('pointerup', onRelease, { capture: true }))

  return { applyWeights }
}
