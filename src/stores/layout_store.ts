import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { allPanels, panelById } from '@/panel_registry'
import type { PanelState, WorkspaceState } from '@/types/panel_types'

const STORAGE_KEY = 'layout.v1'
const SCHEMA_VERSION = 1
const DEFAULT_LAYOUT = 'report'

function defaultPanelState(id: string, open: boolean): PanelState {
  return { id, open, pinned: false, locked: false }
}

/** The layout every reset returns to, built from what the registry currently declares. */
function buildDefaultWorkspace(): WorkspaceState {
  return {
    version: SCHEMA_VERSION,
    active: DEFAULT_LAYOUT,
    layouts: {
      [DEFAULT_LAYOUT]: {
        columns: [{
          width: 1,
          panels: allPanels().map(panel => defaultPanelState(panel.id, panel.defaultOpen)),
        }],
        hidden: [],
      },
    },
  }
}

/**
 * Brings a stored workspace back in line with the registry: panel ids that no longer exist are
 * dropped, panels added since the layout was stored are appended with their defaults. A renamed
 * or removed panel must never leave the user with a blank workspace.
 *
 * A panel the user hid stays hidden — that is what the explicit `hidden` list is for.
 */
export function reconcile(stored: WorkspaceState): WorkspaceState {
  const known = new Set(allPanels().map(panel => panel.id))
  const layouts: WorkspaceState['layouts'] = {}

  for (const [name, layout] of Object.entries(stored.layouts ?? {})) {
    const columns = (layout.columns ?? []).map(column => ({
      width: column.width,
      panels: (column.panels ?? []).filter(panel => known.has(panel.id)),
    }))
    if (!columns.length) columns.push({ width: 1, panels: [] })

    const hidden = (layout.hidden ?? []).filter(id => known.has(id))
    const placed = new Set(columns.flatMap(column => column.panels.map(panel => panel.id)))
    for (const panel of allPanels()) {
      if (placed.has(panel.id) || hidden.includes(panel.id)) continue
      columns[columns.length - 1]!.panels.push(defaultPanelState(panel.id, panel.defaultOpen))
    }
    layouts[name] = { columns, hidden }
  }

  if (!Object.keys(layouts).length) return buildDefaultWorkspace()

  return {
    version: SCHEMA_VERSION,
    active: layouts[stored.active] ? stored.active : Object.keys(layouts)[0]!,
    layouts,
  }
}

function readStored(): WorkspaceState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as WorkspaceState) : null
  } catch {
    // a corrupt or unreadable entry is the same as none — never a broken workspace
    return null
  }
}

export const useLayoutStore = defineStore('layout', () => {
  const stored = readStored()
  const workspace = ref<WorkspaceState>(stored ? reconcile(stored) : buildDefaultWorkspace())

  const activeLayout = computed(() => workspace.value.layouts[workspace.value.active]!)
  const layoutNames = computed(() => Object.keys(workspace.value.layouts))

  /** Pinned panels rise to the top; everything else keeps the order the user arranged. */
  const visiblePanels = computed(() => {
    const panels = activeLayout.value.columns.flatMap(column => column.panels)
    return [...panels.filter(p => p.pinned), ...panels.filter(p => !p.pinned)]
  })

  const hiddenPanelIds = computed(() => activeLayout.value.hidden)

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace.value))
    } catch {
      // a full or blocked storage must not break the app — the arrangement is a convenience
    }
  }

  function find(id: string): PanelState | undefined {
    for (const column of activeLayout.value.columns) {
      const panel = column.panels.find(entry => entry.id === id)
      if (panel) return panel
    }
    return undefined
  }

  function setOpen(id: string, open: boolean): void {
    const panel = find(id)
    if (!panel) return
    panel.open = open
    persist()
  }

  /** Pin anchors a panel to the top and opens it once — afterwards open/closed stays free. */
  function togglePin(id: string): void {
    const panel = find(id)
    if (!panel) return
    panel.pinned = !panel.pinned
    if (panel.pinned) panel.open = true
    persist()
  }

  /** Lock exempts a panel from "collapse all" and from width-driven auto-collapse. */
  function toggleLock(id: string): void {
    const panel = find(id)
    if (!panel) return
    panel.locked = !panel.locked
    persist()
  }

  function hide(id: string): void {
    if (!find(id)) return
    for (const column of activeLayout.value.columns) {
      column.panels = column.panels.filter(panel => panel.id !== id)
    }
    activeLayout.value.hidden.push(id)
    persist()
  }

  function show(id: string): void {
    const descriptor = panelById(id)
    if (!descriptor || find(id)) return
    activeLayout.value.hidden = activeLayout.value.hidden.filter(entry => entry !== id)
    activeLayout.value.columns[0]!.panels.push(defaultPanelState(descriptor.id, true))
    persist()
  }

  function reorder(ids: string[]): void {
    const column = activeLayout.value.columns[0]!
    const byId = new Map(column.panels.map(panel => [panel.id, panel]))
    column.panels = ids.map(id => byId.get(id)).filter((panel): panel is PanelState => !!panel)
    persist()
  }

  function collapseAll(): void {
    for (const column of activeLayout.value.columns) {
      for (const panel of column.panels) {
        if (!panel.locked) panel.open = false
      }
    }
    persist()
  }

  function reset(): void {
    workspace.value = buildDefaultWorkspace()
    persist()
  }

  function exportLayout(): string {
    return JSON.stringify(workspace.value, null, 2)
  }

  /** Returns false when the text is not a usable workspace — the caller reports, never throws. */
  function importLayout(text: string): boolean {
    try {
      const parsed = JSON.parse(text) as WorkspaceState
      if (!parsed || typeof parsed !== 'object' || !parsed.layouts) return false
      workspace.value = reconcile(parsed)
      persist()
      return true
    } catch {
      return false
    }
  }

  return {
    workspace,
    activeLayout,
    layoutNames,
    visiblePanels,
    hiddenPanelIds,
    setOpen,
    togglePin,
    toggleLock,
    hide,
    show,
    reorder,
    collapseAll,
    reset,
    exportLayout,
    importLayout,
  }
})
