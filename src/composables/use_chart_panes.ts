import { onMounted, onUnmounted, shallowRef } from 'vue'
import type { Ref } from 'vue'
import type { IChartApi } from 'lightweight-charts'
import type { ChartPaneId, PaneBox, PaneWeights } from '@/types/chart_pane_types'

/**
 * The weight a pane stands at where the reader never dragged it. The price pane takes the library's
 * own weight for its first pane, 2; a pane below it 0.5, so a fifth of the height — where Kraken Pro
 * stands its volume. A worker's pane, named by the backend, stands like the volume's.
 */
export const DEFAULT_PANE_WEIGHTS: Record<ChartPaneId, number> = { price: 2, volume: 0.5 }

/** The weight of a pane by its name, where the reader never dragged it. */
export function defaultWeight(pane: string): number {
  // a worker's pane is named by the backend: a name like `constructor` is no key of ours
  return Object.prototype.hasOwnProperty.call(DEFAULT_PANE_WEIGHTS, pane) ? DEFAULT_PANE_WEIGHTS[pane as ChartPaneId] : DEFAULT_PANE_WEIGHTS.volume
}

/** Two weights this close are one: the library keeps them as floats, and a drag that moved nothing is no change. */
const SAME_WEIGHT = 1e-6


interface ChartPanesOptions {
  chart: () => IChartApi | null
  /** Which pane stands at each index, top to bottom, by its name. */
  ids: () => readonly string[]
  /** The weights the reader kept, or none. */
  weights: () => PaneWeights | null | undefined
  /** Told the weights of every pane once a drag of a separator changed one. */
  onWeights: (weights: PaneWeights) => void
  /** The element the panes are placed in — what a pane's box is measured from. */
  frame: () => HTMLElement | null
  /** The pane given the whole height, or none. */
  maximized: () => string | null
}

interface ChartPanes {
  /**
   * Lays the panes out at their kept weights, a pane never dragged at its default — or one pane at the
   * whole height and the others folded, where one is given it.
   */
  applyWeights: () => void
  /** Where each pane stands in the frame, top to bottom — measured again whenever one changes size. */
  boxes: Readonly<Ref<PaneBox[]>>
  /** Follows the panes the chart stacks now: called once they were built or their number changed. */
  track: () => void
}

/**
 * A chart's panes as tall as the reader keeps them (viewer#57). The library holds a pane's height
 * as a weight against the others' and drags a separator by changing the two weights beside it, but
 * says nothing when it does — so the weights are read once a pointer is released, and told only
 * where one moved. Read on the window, as the release comes down to its target: a drag ends wherever
 * the pointer is let go, and nothing on the page can keep the release from the chart.
 */
export function useChartPanes(options: ChartPanesOptions): ChartPanes {
  /**
   * The weights last laid out, pane by pane — what a release is compared with. Worked out again
   * instead, a pane folded beside a whole-height one would differ after the window changed size, and
   * a click would read as a drag.
   */
  let applied: number[] = []

  function applyWeights(): void {
    const panes = options.chart()?.panes() ?? []
    const ids = options.ids()
    const maximized = options.maximized()
    // a pane at the whole height: the others fold to nothing — the library keeps 2 px of each, too
    // little to draw in; at 22 px the candles, the lane and the legend stood on each other (operator,
    // on screen 2026-11-12). Their legends stand as lines in the pane at the whole height
    const whole = maximized !== null && ids.includes(maximized) && panes.length > 1
    applied = panes.map((pane, index) => {
      const id = ids[index]
      if (!id) return pane.getStretchFactor()
      const kept = options.weights()
      const weight = whole ? (id === maximized ? 1 : 0) : (kept && Object.prototype.hasOwnProperty.call(kept, id) ? kept[id] : undefined) ?? defaultWeight(id)
      pane.setStretchFactor(weight)
      return weight
    })
  }

  function onRelease(): void {
    const panes = options.chart()?.panes() ?? []
    if (panes.length < 2 || panes.length !== applied.length) return
    const ids = options.ids()
    const read: PaneWeights = {}
    let moved = false
    panes.forEach((pane, index) => {
      const id = ids[index]
      if (!id) return
      const weight = pane.getStretchFactor()
      read[id] = weight
      if (Math.abs(weight - applied[index]!) > SAME_WEIGHT) moved = true
    })
    if (!moved) return
    // the drag is what stands now: told once, not again at the next click
    applied = panes.map(pane => pane.getStretchFactor())
    options.onWeights(read)
  }

  const boxes = shallowRef<PaneBox[]>([])
  let observer: ResizeObserver | null = null

  function measure(): void {
    const frame = options.frame()
    if (!frame) return
    const origin = frame.getBoundingClientRect().top
    const ids = options.ids()
    const next: PaneBox[] = []
    options.chart()?.panes().forEach((pane, index) => {
      const id = ids[index]
      const element = pane.getHTMLElement()
      if (!id || !element) return
      const box = element.getBoundingClientRect()
      next.push({ id, top: box.top - origin, height: box.height })
    })
    if (JSON.stringify(next) !== JSON.stringify(boxes.value)) boxes.value = next
  }

  /**
   * The library says nothing when a pane changes size either — a seam dragged, the window resized —
   * so each pane's element is watched: the legends follow the pane they belong to.
   */
  function track(): void {
    observer?.disconnect()
    observer = new ResizeObserver(measure)
    for (const pane of options.chart()?.panes() ?? []) {
      const element = pane.getHTMLElement()
      if (element) observer.observe(element)
    }
    measure()
  }

  onMounted(() => window.addEventListener('pointerup', onRelease, { capture: true }))
  onUnmounted(() => {
    window.removeEventListener('pointerup', onRelease, { capture: true })
    observer?.disconnect()
  })

  return { applyWeights, boxes, track }
}
