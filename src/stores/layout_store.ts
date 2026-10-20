import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { allPanels } from '@/panel_registry'
import { readTabEntry, removeTabAndShared, writeTabAndShared } from '@/tab_storage'
import type { PanelState, WorkspaceState } from '@/types/panel_types'

const STORAGE_KEY = 'layout.v1'
export const SCHEMA_VERSION = 2
const DEFAULT_LAYOUT = 'report'

function defaultPanelState(id: string, open: boolean): PanelState {
  return { id, open, pinned: false, locked: false, hidden: false }
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
      },
    },
  }
}

/**
 * Brings a stored workspace back in line with the registry: panel ids that no longer exist are
 * dropped, panels added since the layout was stored are appended with their defaults. A renamed
 * or removed panel must never leave the user with a blank workspace.
 *
 * A panel the user switched off is in the list with `hidden` set, so it keeps its place and
 * reconciliation can tell it apart from one that is new since the layout was stored.
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

    const placed = new Set(columns.flatMap(column => column.panels.map(panel => panel.id)))
    for (const panel of allPanels()) {
      if (placed.has(panel.id)) continue
      columns[columns.length - 1]!.panels.push(defaultPanelState(panel.id, panel.defaultOpen))
    }
    layouts[name] = { columns }
  }

  if (!Object.keys(layouts).length) return buildDefaultWorkspace()

  return {
    version: SCHEMA_VERSION,
    active: layouts[stored.active] ? stored.active : Object.keys(layouts)[0]!,
    layouts,
  }
}

/**
 * Where the UNPINNED group starts, or null when there is nothing to separate.
 *
 * The column draws it as a line between the two groups, over what it actually draws. Null where
 * every panel is pinned or none is — a rule with one side is noise, and nothing is printed where
 * there is nothing to say.
 */
export function pinnedBoundary(panels: PanelState[]): number | null {
  const pinned = panels.filter(panel => panel.pinned).length
  return pinned > 0 && pinned < panels.length ? pinned : null
}

/**
 * The stored arrangement, or nothing — and an entry from an older schema is REMOVED rather than
 * converted.
 *
 * The project is alpha and the arrangement is a convenience: code that exists only to read a shape
 * nobody writes any more is an artifact, and it would outlive the one day it was useful. Deleting
 * the key rather than ignoring it is the other half of that — an entry left behind is the artifact.
 */
function readStored(): WorkspaceState | null {
  try {
    const raw = readTabEntry(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkspaceState
    if (parsed?.version !== SCHEMA_VERSION) {
      removeTabAndShared(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    // a corrupt or unreadable entry is the same as none — never a broken workspace
    return null
  }
}

export const useLayoutStore = defineStore('layout', () => {
  const stored = readStored()
  const workspace = ref<WorkspaceState>(stored ? reconcile(stored) : buildDefaultWorkspace())

  const activeLayout = computed(() => workspace.value.layouts[workspace.value.active]!)

  /**
   * THE arrangement — every panel, switched off ones included, in the order the reader made.
   *
   * Pinned panels form the first group and the rest follow, each keeping its own order. The column
   * draws a line between the groups; the Panels menu lists them in the same order.
   */
  const arrangedPanels = computed(() => {
    const panels = activeLayout.value.columns.flatMap(column => column.panels)
    return [...panels.filter(p => p.pinned), ...panels.filter(p => !p.pinned)]
  })

  /** The same arrangement minus what is switched off — which is all the COLUMN draws. */
  const visiblePanels = computed(() => arrangedPanels.value.filter(panel => !panel.hidden))

  /** This tab's own, and the start of the next new one — like the arrangement beside it. */
  function persist(): void {
    writeTabAndShared(STORAGE_KEY, JSON.stringify(workspace.value))
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

  /** Lock exempts a panel from "collapse all". */
  function toggleLock(id: string): void {
    const panel = find(id)
    if (!panel) return
    panel.locked = !panel.locked
    persist()
  }

  /** Switched off, and nothing moves: the panel keeps its place, its pin and its lock. */
  function hide(id: string): void {
    const panel = find(id)
    if (!panel) return
    panel.hidden = true
    persist()
  }

  /** Switched on, and OPENED — a reader who brings a section back wants to see it. */
  function show(id: string): void {
    const panel = find(id)
    if (!panel) return
    panel.hidden = false
    panel.open = true
    persist()
  }

  /**
   * Writes a dropped order back.
   *
   * The column drags only what it draws, which is the arrangement minus the switched-off panels and
   * those open as panels of their own. So the given ids are a SUBSEQUENCE: they are placed
   * into the slots they already occupy, and everything not named keeps its index. Without that, a
   * drag in the column would drop every hidden panel out of the list — the ids simply would not be
   * in the list it was given.
   */
  function reorder(ids: string[]): void {
    const column = activeLayout.value.columns[0]!
    const byId = new Map(column.panels.map(panel => [panel.id, panel]))
    const queue = ids.filter(id => byId.has(id))
    const moving = new Set(queue)
    let next = 0
    column.panels = column.panels.map(panel =>
      moving.has(panel.id) ? byId.get(queue[next++]!)! : panel)
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
      // another version is refused, as a stored one is removed: its fields may mean something else
      if (parsed.version !== SCHEMA_VERSION) return false
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
    arrangedPanels,
    visiblePanels,
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
