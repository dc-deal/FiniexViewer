import type { SerializedDockview, SerializedGridObject } from 'dockview-vue'

/** The part of a stored group this file reads; everything else in it is carried through untouched. */
interface StoredGroup {
  id: string
  views: string[]
  activeView?: string
  tabGroups?: unknown
}

type GridNode = SerializedGridObject<StoredGroup>

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

/** The kind a stored panel says it is, or null where it says nothing readable. */
function kindOf(panel: unknown): string | null {
  const kind = record(record(panel)?.['params'])?.['kind']
  return typeof kind === 'string' ? kind : null
}

/** One grid node with every unknown panel taken out, or null where nothing of it is left. */
function prune(node: GridNode, kept: Set<string>, groups: Set<string>): GridNode | null {
  if (node.type === 'leaf') {
    const group = node.data as StoredGroup
    const views = (group.views ?? []).filter((id: string) => kept.has(id))
    if (!views.length) return null
    groups.add(group.id)
    const activeView = group.activeView && views.includes(group.activeView) ? group.activeView : views[0]
    const data: StoredGroup = { ...group, views, activeView }
    // a tab group names panels that may be gone, and this app draws none — dropped, not repaired
    delete data.tabGroups
    return { ...node, data }
  }
  const children = (node.data as GridNode[])
    .map(child => prune(child, kept, groups))
    .filter((child): child is GridNode => child !== null)
  return children.length ? { ...node, data: children } : null
}

/**
 * A stored dock layout, reconciled — never trusted. A panel of a kind this version does not know is
 * dropped from its group, a group left empty is dropped from the grid, and floating and popout
 * groups go, because this app switches both off. Null where nothing usable is left: the caller then
 * lays out the suggested order instead, so a retired kind can never leave the reader with an empty
 * screen.
 */
export function reconcileLayout(stored: unknown, known: (kind: string) => boolean): SerializedDockview | null {
  const layout = record(stored)
  const grid = record(layout?.['grid'])
  const panels = record(layout?.['panels'])
  if (!layout || !grid || !panels || !record(grid['root'])) return null

  const keptPanels: SerializedDockview['panels'] = {}
  for (const [id, panel] of Object.entries(panels)) {
    const kind = kindOf(panel)
    if (kind && known(kind)) keptPanels[id] = panel as SerializedDockview['panels'][string]
  }
  const groups = new Set<string>()
  const root = prune(grid['root'] as GridNode, new Set(Object.keys(keptPanels)), groups)
  if (!root) return null

  const activeGroup = typeof layout['activeGroup'] === 'string' && groups.has(layout['activeGroup'])
    ? layout['activeGroup']
    : undefined
  return {
    grid: { ...(grid as SerializedDockview['grid']), root: root as SerializedDockview['grid']['root'] },
    panels: keptPanels,
    ...(activeGroup ? { activeGroup } : {}),
  }
}
