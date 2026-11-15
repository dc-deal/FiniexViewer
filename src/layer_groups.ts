import { layerDefinition } from '@/layer_registry'
import { CHART_PANE_IDS, PANE_LAYERS } from '@/types/chart_pane_types'
import type { ChartPaneId } from '@/types/chart_pane_types'
import type { ChartLayerId } from '@/types/chart_drawing_types'

/**
 * The groups of a chart's layers, each with a visibility of its own above its layers' (operator,
 * 2026-11-14: "übergeordnete separate Sichtbarkeitsebene, ähnlich wie der Mute-Schalter in einer
 * DAW"). A group hidden hides every layer in it and changes none of their own switches: shown again,
 * each layer stands as it was set — the way a group's eye works in Figma, Photoshop or QGIS, and a
 * folder track's mute in a DAW. A group is kept hidden by its key:
 *
 * - `pane:<pane>` — a pane and everything drawn in it;
 * - `framework:<pane>` — the layers the viewer draws from the record routes, in that pane;
 * - `workers:<pane>` — the workers' series in that pane;
 * - `worker:<pane>|<instance>` — one worker's series in that pane, where it draws more than one.
 */
export type LayerGroupKey = `pane:${string}` | `framework:${string}` | `workers:${string}` | `worker:${string}`

export function paneGroup(pane: string): LayerGroupKey {
  return `pane:${pane}`
}

export function sourceGroup(pane: string, source: 'framework' | 'workers'): LayerGroupKey {
  return `${source}:${pane}`
}

export function workerGroup(pane: string, instance: string): LayerGroupKey {
  return `worker:${pane}|${instance}`
}

/** Whether a stored key has a group's form — what is read back is checked by it. */
export function isLayerGroupKey(value: unknown): value is LayerGroupKey {
  return typeof value === 'string' && /^(pane|framework|workers|worker):\S{1,200}$/.test(value)
}

/**
 * The pane a layer of ours is drawn in: one that may have a pane of its own — the volume — stands in
 * it while its option says so, every other in the pane of the candles.
 */
export function framePaneOf(id: ChartLayerId, option: boolean | null | undefined): ChartPaneId {
  if (layerDefinition(id).option?.id !== 'own-pane' || option !== true) return 'price'
  return CHART_PANE_IDS.find(pane => PANE_LAYERS[pane] === id) ?? 'price'
}

/** The worker instance a served layer belongs to, by the form their document gives it: `worker:<instance>[:<name>]`. */
export function instanceOf(layer: string): string {
  return layer.split(':')[1] ?? layer
}

/** The groups a layer of ours belongs to: its pane, and the framework's layers in it. */
export function frameworkGroupsOf(pane: string): LayerGroupKey[] {
  return [paneGroup(pane), sourceGroup(pane, 'framework')]
}

/** The groups a worker's series belongs to: its pane, the workers' in it, and its worker's own. */
export function workerGroupsOf(pane: string, layer: string): LayerGroupKey[] {
  return [paneGroup(pane), sourceGroup(pane, 'workers'), workerGroup(pane, instanceOf(layer))]
}

/** Whether a group a layer belongs to hides it. */
export function hiddenByGroup(hidden: ReadonlySet<string>, groups: readonly LayerGroupKey[]): boolean {
  return groups.some(group => hidden.has(group))
}
