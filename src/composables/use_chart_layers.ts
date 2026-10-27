import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { arrangeLayers, keptLayers, layerDefinition } from '@/layer_registry'
import { useArrangementStore } from '@/stores/arrangement_store'
import type { ChartLayerId } from '@/types/chart_drawing_types'
import { LAYER_OPACITY_MIN } from '@/types/layer_types'
import type { LayerState } from '@/types/layer_types'
import type { PriceForm } from '@/types/run_chart_types'

interface ChartLayers {
  /** The chart's drawing layers as arranged, FRONT first — the order a list of layers reads in. */
  rows: ComputedRef<LayerState[]>
  show: (id: ChartLayerId, shown: boolean) => void
  /** In percent, held to `LAYER_OPACITY_MIN`–100. */
  setOpacity: (id: ChartLayerId, opacity: number) => void
  setOption: (id: ChartLayerId, on: boolean) => void
  setForm: (id: ChartLayerId, form: PriceForm) => void
  /** One place toward the front (`1`) or the back (`-1`); nothing past either end, nor past a fixed layer. */
  move: (id: ChartLayerId, step: 1 | -1) => void
}

/**
 * The drawing layers of one chart, read and arranged — addressed by the chart's dock id, so the
 * Layers panel works on the chart last in front (viewer#41). Kept with that chart's own view, only
 * where it differs from the chart's own arrangement.
 *
 * @param chartId The chart's dock id, or null where there is no chart to arrange.
 */
export function useChartLayers(chartId: () => string | null): ChartLayers {
  const arrangement = useArrangementStore()

  /** Back to front, as the chart draws them. */
  const states = computed(() => {
    const id = chartId()
    return id ? arrangeLayers(id, arrangement.panelViews[id]?.layers) : []
  })

  function write(next: LayerState[]): void {
    const id = chartId()
    if (!id) return
    arrangement.setPanelView(id, { ...arrangement.panelViews[id], layers: keptLayers(id, next) })
  }

  function change(id: ChartLayerId, edit: (state: LayerState) => LayerState): void {
    write(states.value.map(state => state.id === id ? edit(state) : state))
  }

  function move(id: ChartLayerId, step: 1 | -1): void {
    const order = [...states.value]
    const from = order.findIndex(state => state.id === id)
    const to = from + step
    if (from < 0 || to < 0 || to >= order.length) return
    // a fixed layer keeps its place, and no other passes it
    if (layerDefinition(id).fixed || layerDefinition(order[to]!.id).fixed) return
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved!)
    write(order)
  }

  return {
    rows: computed(() => [...states.value].reverse()),
    show: (id, shown) => change(id, state => ({ ...state, shown })),
    setOpacity: (id, opacity) => change(id, state => ({
      ...state, opacity: Math.min(100, Math.max(LAYER_OPACITY_MIN, Math.round(opacity))),
    })),
    setOption: (id, on) => change(id, state => ({ ...state, option: on })),
    setForm: (id, form) => change(id, state => ({ ...state, form })),
    move,
  }
}
