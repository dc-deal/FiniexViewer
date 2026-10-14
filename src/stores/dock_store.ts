import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { DockviewApi, GroupNavigationDirection, IDockviewPanel } from 'dockview-vue'
import { reconcileLayout } from '@/components/dock/dock_layout'
import { PANEL_KINDS, firstActiveKind, panelKind, reportKindId, sectionOfKind } from '@/panel_kinds'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'
import { useLayoutStore } from '@/stores/layout_store'
import type { DockPlace } from '@/types/arrangement_types'

/** How long the layout must hold still before it is written — a drag changes it every frame. */
const SAVE_DELAY_MS = 300

/**
 * The one dockview component every panel is drawn with — `PanelDock`'s `#panel-host` slot, so the
 * two names move together. What a panel shows is its `kind`.
 */
const HOST_COMPONENT = 'host'

/** The panel the run report's column stands in — the bundle, where a section goes back to. */
const COLUMN_KIND = 'run'

/** The run list, beside which the bundle a pick opens stands. */
const LIST_KIND = 'runs'

/**
 * Where to look for the group a split stood beside, and on which side of it the split stood: a
 * group to the LEFT means the panel stood to its right. The size kept is the one that side splits.
 */
const SIDES: [GroupNavigationDirection, DockPlace['direction'], 'width' | 'height'][] = [
  ['left', 'right', 'width'],
  ['right', 'left', 'width'],
  ['up', 'below', 'height'],
  ['down', 'above', 'height'],
]

/** Where a panel is added: as a tab beside `referencePanel`, or as a split on one side of it. */
interface Placement {
  referencePanel: string
  direction: DockPlace['direction']
  index?: number
}

/**
 * Where the panels stand: the dock's own API, the first arrangement, and the layout kept in the
 * arrangement. The dock knows PLACEMENT only — what a panel shows is its kind's, and what it is
 * about is its link's.
 *
 * **Closing a panel hides it, alike for every panel** (viewer#31, 2026-10-14): the Panels menu
 * shows it again where it stood — beside the panels it stood beside while one of them is still
 * open — and a section of the run report goes back into the column only by ⇲, or where nothing it
 * stood beside is left.
 */
export const useDockStore = defineStore('dock', () => {
  const arrangement = useArrangementStore()
  const context = useContextStore()
  const layoutStore = useLayoutStore()

  // the API object is dockview's own and large — held, never made reactive
  const api = shallowRef<DockviewApi | null>(null)
  /**
   * Which panels are open, by id. Kept from dockview's own events, because its API object is not
   * reactive — and the column reads it: a section open as a panel of its own is left out there.
   */
  const openIds = ref<string[]>([])
  let timer: ReturnType<typeof setTimeout> | null = null
  let subscriptions: { dispose(): void }[] = []
  /** The section panel opened last: where the next one goes, as a tab beside it. */
  let lastSection: string | null = null
  /**
   * Set while the dock is laid out anew — back to the suggested order. Every panel removed on the
   * way is a rebuild, never the reader closing something, so nothing is hidden and no place moves.
   */
  let restoring = false
  /** Section panels on their way back into the column: their removal is not a hide. */
  const intoColumn = new Set<string>()

  /** One kind's panel, placed where it is told — at the size it had, where that was kept. */
  function add(dock: DockviewApi, kindId: string, placement?: Placement, size?: number): void {
    const kind = panelKind(kindId)
    if (!kind) return
    const across = placement?.direction === 'left' || placement?.direction === 'right'
    const along = placement?.direction === 'above' || placement?.direction === 'below'
    dock.addPanel({
      id: kind.id,
      component: HOST_COMPONENT,
      title: kind.title,
      params: { kind: kind.id },
      // kept in the page while hidden, so a panel returned to finds its scroll where it left it
      renderer: 'always',
      ...(placement ? { position: placement } : {}),
      ...(size !== undefined && across ? { initialWidth: size } : {}),
      ...(size !== undefined && along ? { initialHeight: size } : {}),
    })
  }

  function syncOpen(): void {
    openIds.value = api.value ? api.value.panels.map(panel => panel.id) : []
  }

  /** The suggested order, all in one group, on the tab where the work is. */
  function arrangeDefault(dock: DockviewApi): void {
    dock.clear()
    const kinds = PANEL_KINDS.filter(kind => kind.opensByDefault).sort((a, b) => a.order - b.order)
    kinds.forEach((kind, index) =>
      add(dock, kind.id, index ? { referencePanel: kinds[0]!.id, direction: 'within' } : undefined))
    dock.getPanel(firstActiveKind())?.api.setActive()
  }

  /**
   * A stored layout that has never held the run report — written before the report was a panel of
   * its own — gets it beside the run list where a run is chosen, in front where the list was. Never
   * one the reader HID: that has a place to come back to, and comes back from the Panels menu.
   */
  function addMissingBundle(dock: DockviewApi): void {
    if (context.main.run.id === null || dock.getPanel(COLUMN_KIND) || arrangement.places[COLUMN_KIND]) return
    const before = dock.activePanel
    const list = dock.getPanel(LIST_KIND)
    // right after the list, so the two read as one: the runs, then the run picked from them
    add(dock, COLUMN_KIND, list
      ? { referencePanel: LIST_KIND, direction: 'within', index: list.group.panels.indexOf(list) + 1 }
      : undefined)
    // a panel added comes to the front; it stays there only where the list it joins was in front
    if (before && before.id !== LIST_KIND) before.api.setActive()
  }

  /**
   * Writes the layout now — on the timer, or at once where the page is about to go. A dock holding
   * no panel is never written: it is a dock being torn down, not an arrangement, and storing it
   * would hand the next start an empty layout to replace with the suggested one.
   */
  function flush(): void {
    if (timer) clearTimeout(timer)
    timer = null
    if (!api.value || api.value.totalPanels === 0) return
    arrangement.setDock(api.value.toJSON())
  }

  function scheduleSave(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DELAY_MS)
  }

  /** Where an open panel stands: among the tabs of its group, or beside a neighbouring group. */
  function placeOf(dock: DockviewApi, panel: IDockviewPanel): DockPlace | null {
    const group = panel.group
    const tabs = group.panels.map(entry => entry.id)
    const others = tabs.filter(id => id !== panel.id)
    if (others.length) return { besides: others, direction: 'within', index: tabs.indexOf(panel.id) }
    for (const [toward, side, measure] of SIDES) {
      const neighbour = dock.adjacentGroupInDirection(group, toward)
      if (neighbour?.panels.length) {
        return { besides: neighbour.panels.map(entry => entry.id), direction: side, size: group.api[measure] }
      }
    }
    return null
  }

  /**
   * Notes where every open panel stands, just BEFORE the layout changes: a panel about to be
   * closed is still in its place then, and that place is what brings it back. A panel that is not
   * open keeps the place it had.
   */
  function recordPlaces(): void {
    const dock = api.value
    if (!dock || restoring) return
    const places = { ...arrangement.places }
    for (const panel of dock.panels) {
      const place = placeOf(dock, panel)
      if (place) places[panel.id] = place
      else delete places[panel.id]
    }
    if (JSON.stringify(places) !== JSON.stringify(arrangement.places)) arrangement.setPlaces(places)
  }

  function forgetPlace(kindId: string): void {
    if (!(kindId in arrangement.places)) return
    const places = { ...arrangement.places }
    delete places[kindId]
    arrangement.setPlaces(places)
  }

  /**
   * A panel left the dock. For a section of the run report that HIDES it, however it was closed —
   * its tab's ✕, Delete or Backspace on a focused tab, the Panels menu — unless it was sent back
   * into the column, which forgets where it stood.
   */
  function onRemoved(panel: IDockviewPanel): void {
    syncOpen()
    if (restoring) return
    const section = sectionOfKind(panel.id)
    if (!section) return
    if (intoColumn.delete(panel.id)) {
      forgetPlace(panel.id)
      return
    }
    layoutStore.hide(section)
  }

  /**
   * Takes over a ready dock: lays out what was stored — reconciled, never trusted — or the
   * suggested order where nothing usable was. A layout dockview itself refuses counts as none, so
   * a damaged entry can never leave the reader with an empty screen.
   */
  function attach(dock: DockviewApi): void {
    api.value = dock
    const layout = reconcileLayout(arrangement.dock, kind => panelKind(kind) !== null)
    try {
      if (layout) {
        dock.fromJSON(layout)
        addMissingBundle(dock)
      } else arrangeDefault(dock)
    } catch {
      arrangeDefault(dock)
    }
    flush()
    syncOpen()
    subscriptions = [
      dock.onDidLayoutChange(scheduleSave),
      dock.onWillMutateLayout(recordPlaces),
      dock.onDidAddPanel(syncOpen),
      dock.onDidRemovePanel(onRemoved),
    ]
  }

  function detach(): void {
    flush()
    subscriptions.forEach(subscription => subscription.dispose())
    subscriptions = []
    api.value = null
    openIds.value = []
  }

  /** Adds a closed panel where it last stood, while a panel it stood beside is still open. */
  function placeAgain(dock: DockviewApi, kindId: string): boolean {
    const place = arrangement.places[kindId]
    const beside = place?.besides.find(id => dock.getPanel(id))
    if (!place || !beside) return false
    const placement: Placement = { referencePanel: beside, direction: place.direction }
    if (place.index !== undefined) placement.index = place.index
    add(dock, kindId, placement, place.size)
    return true
  }

  /**
   * Brings a kind's panel to the front. A closed one opens where it last stood while a panel it
   * stood beside is still open, and beside the active one otherwise.
   */
  function open(kindId: string): void {
    const dock = api.value
    if (!dock) return
    if (!dock.getPanel(kindId) && !placeAgain(dock, kindId)) {
      const active = dock.activePanel?.id
      add(dock, kindId, active ? { referencePanel: active, direction: 'within' } : undefined)
    }
    dock.getPanel(kindId)?.api.setActive()
  }

  /** Closes a panel, which hides it — the Panels menu shows it again where it stood. */
  function close(kindId: string): void {
    api.value?.getPanel(kindId)?.api.close()
  }

  /**
   * Opens a section of the run report as a panel of its own, or brings it to the front where it is
   * open already — a section is in one place at a time. The first stands beside the run report, as
   * a split to its right; each further one joins the last as a tab, so the screen is not cut
   * thinner with every section.
   */
  function openSection(sectionId: string): void {
    const dock = api.value
    if (!dock) return
    const kindId = reportKindId(sectionId)
    if (!dock.getPanel(kindId)) {
      const beside = lastSection && dock.getPanel(lastSection)
        ? lastSection
        : dock.panels.map(panel => panel.id).find(id => sectionOfKind(id) !== null)
      if (beside) add(dock, kindId, { referencePanel: beside, direction: 'within' })
      else if (dock.getPanel(COLUMN_KIND)) add(dock, kindId, { referencePanel: COLUMN_KIND, direction: 'right' })
      else add(dock, kindId)
    }
    lastSection = kindId
    dock.getPanel(kindId)?.api.setActive()
  }

  /** Puts a section opened as a panel back into the run report's column — the ⇲ on its tab. */
  function backIntoColumn(sectionId: string): void {
    const kindId = reportKindId(sectionId)
    const panel = api.value?.getPanel(kindId)
    if (!panel) return
    intoColumn.add(kindId)
    panel.api.close()
    // dockview reports the removal while closing; a flag still standing here was never used
    intoColumn.delete(kindId)
  }

  /**
   * Shows a hidden section where it last stood: as a panel beside the panels it stood beside, while
   * one of them is still open, and otherwise in the column, whose panel comes to the front.
   */
  function showSection(sectionId: string): void {
    const dock = api.value
    if (!dock) return
    const kindId = reportKindId(sectionId)
    layoutStore.show(sectionId)
    if (dock.getPanel(kindId) || placeAgain(dock, kindId)) {
      lastSection = kindId
      dock.getPanel(kindId)?.api.setActive()
      return
    }
    forgetPlace(kindId)
    open(COLUMN_KIND)
  }

  /** Hides a section wherever it stands — its panel's close, or switched off in the column. */
  function hideSection(sectionId: string): void {
    const kindId = reportKindId(sectionId)
    if (api.value?.getPanel(kindId)) {
      close(kindId)
      return
    }
    forgetPlace(kindId)
    layoutStore.hide(sectionId)
  }

  /** Back to the suggested order — every panel the first arrangement holds, and no other. */
  function reset(): void {
    const dock = api.value
    if (!dock) return
    restoring = true
    try {
      arrangeDefault(dock)
    } finally {
      restoring = false
    }
    arrangement.setPlaces({})
    flush()
    syncOpen()
  }

  return {
    api, openIds,
    attach, detach, open, close, openSection, backIntoColumn, showSection, hideSection, reset, flush,
  }
})
