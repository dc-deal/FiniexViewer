import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { LayerGroupKey } from '@/layer_groups'
import { arrangeLayers, keptLayers, layerDefinition } from '@/layer_registry'
import { useArrangementStore } from '@/stores/arrangement_store'
import type { StoredServedLayers } from '@/types/arrangement_types'
import type { ChartLayerId } from '@/types/chart_drawing_types'
import type { ServedLayerId } from '@/types/indicator_drawing_types'
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
  /** The movable layers in a new order, front first — as a drag leaves them. */
  reorder: (frontFirst: ChartLayerId[]) => void
  /** A worker's layer as the reader set it (contract 55): shown and at full strength where never set. */
  servedState: (id: ServedLayerId) => { shown: boolean, opacity: number }
  showServed: (id: ServedLayerId, shown: boolean) => void
  /** In percent, held to `LAYER_OPACITY_MIN`–100. */
  setServedOpacity: (id: ServedLayerId, opacity: number) => void
  /** The groups hidden above their layers' own switches, by key (`layer_groups.ts`). */
  groupsHidden: ComputedRef<ReadonlySet<string>>
  /** A group shown or hidden; its layers' own switches stay as they are. */
  showGroup: (key: LayerGroupKey, shown: boolean) => void
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

  /**
   * The chart's own layers as kept, beside what is kept of the workers' and of the groups — the one
   * never drops the others.
   */
  function store(
    kept: ReturnType<typeof keptLayers>,
    served: StoredServedLayers | undefined,
    groups: string[] | undefined = arrangement.panelViews[chartId() ?? '']?.layers?.groupsHidden,
  ): void {
    const id = chartId()
    if (!id) return
    const layers = { ...kept, ...(served ? { served } : {}), ...(groups?.length ? { groupsHidden: groups } : {}) }
    arrangement.setPanelView(id, { ...arrangement.panelViews[id], layers: Object.keys(layers).length ? layers : undefined })
  }

  const groupsHidden = computed<ReadonlySet<string>>(() => {
    const id = chartId()
    return new Set(id ? arrangement.panelViews[id]?.layers?.groupsHidden ?? [] : [])
  })

  function showGroup(key: LayerGroupKey, shown: boolean): void {
    const id = chartId()
    if (!id) return
    const others = [...groupsHidden.value].filter(group => group !== key)
    const rest = { ...arrangement.panelViews[id]?.layers }
    const served = rest.served
    delete rest.served
    delete rest.groupsHidden
    store(Object.keys(rest).length ? rest : undefined, served, shown ? others : [...others, key])
  }

  function write(next: LayerState[]): void {
    const id = chartId()
    if (!id) return
    store(keptLayers(id, next), arrangement.panelViews[id]?.layers?.served)
  }

  const served = computed(() => {
    const id = chartId()
    return (id ? arrangement.panelViews[id]?.layers?.served : undefined) ?? {}
  })

  /** A worker's layers changed: only what differs from shown and whole is kept. */
  function writeServed(next: StoredServedLayers): void {
    const id = chartId()
    if (!id) return
    const kept: StoredServedLayers = {}
    if (next.hidden?.length) kept.hidden = next.hidden
    if (next.opacity && Object.keys(next.opacity).length) kept.opacity = next.opacity
    const rest = { ...arrangement.panelViews[id]?.layers }
    delete rest.served
    delete rest.groupsHidden
    store(Object.keys(rest).length ? rest : undefined, Object.keys(kept).length ? kept : undefined)
  }

  function change(id: ChartLayerId, edit: (state: LayerState) => LayerState): void {
    write(states.value.map(state => state.id === id ? edit(state) : state))
  }

  /**
   * The movable layers in the order a drag left them, front first. The fixed ones keep their places
   * at the back; a list that does not hold every movable layer once changes nothing.
   */
  function reorder(frontFirst: ChartLayerId[]): void {
    const movable = states.value.filter(state => !layerDefinition(state.id).fixed)
    const placed = [...new Set(frontFirst)].reverse().flatMap(id => movable.filter(state => state.id === id))
    if (placed.length !== movable.length) return
    write([...states.value.filter(state => layerDefinition(state.id).fixed), ...placed])
  }

  return {
    rows: computed(() => [...states.value].reverse()),
    show: (id, shown) => change(id, state => ({ ...state, shown })),
    setOpacity: (id, opacity) => change(id, state => ({
      ...state, opacity: Math.min(100, Math.max(LAYER_OPACITY_MIN, Math.round(opacity))),
    })),
    setOption: (id, on) => change(id, state => ({ ...state, option: on })),
    setForm: (id, form) => change(id, state => ({ ...state, form })),
    reorder,
    servedState: id => ({
      shown: !served.value.hidden?.includes(id),
      opacity: served.value.opacity?.[id] ?? 100,
    }),
    showServed: (id, shown) => {
      const hidden = (served.value.hidden ?? []).filter(entry => entry !== id)
      writeServed({ ...served.value, hidden: shown ? hidden : [...hidden, id] })
    },
    setServedOpacity: (id, opacity) => {
      const share = Math.min(100, Math.max(LAYER_OPACITY_MIN, Math.round(opacity)))
      const others = { ...served.value.opacity }
      delete others[id]
      writeServed({ ...served.value, opacity: share < 100 ? { ...others, [id]: share } : others })
    },
    groupsHidden,
    showGroup,
  }
}
