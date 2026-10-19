import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { DockviewApi, GroupNavigationDirection, IDockviewPanel } from 'dockview-vue'
import { reconcileLayout } from '@/components/dock/dock_layout'
import { PANEL_KINDS, RUN_BUNDLE, firstActiveKind, panelKind, reportKindId, sectionOfKind } from '@/panel_kinds'
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
const COLUMN_KIND = RUN_BUNDLE

/** The run list, beside which the bundle a pick opens stands. */
const LIST_KIND = 'runs'

/**
 * Where a kind opens the first time, while nothing it stood beside is known: the run chart as a
 * split to the right of the run report, so a trade in the list and its candle are one glance apart
 * (viewer#31, decided 2026-10-15). Every other kind joins the active panel's tabs.
 */
const OPENS_RIGHT_OF: Record<string, string> = { 'run-chart': COLUMN_KIND }

/** The share of the dock's width a split of its own takes in the first arrangement — the report keeps the larger part. */
const SPLIT_SHARE = 0.4

/** The four edges of the whole dock a dragged panel can be docked along. */
export type DockEdge = 'left' | 'right' | 'top' | 'bottom'

export const DOCK_EDGES: readonly DockEdge[] = ['left', 'right', 'top', 'bottom']

/** dockview's word for each edge: a direction from the root of the layout. */
const EDGE_DIRECTION: Record<DockEdge, 'left' | 'right' | 'above' | 'below'> = {
  left: 'left', right: 'right', top: 'above', bottom: 'below',
}

/** The share of the dock a column or a row docked along an edge starts with; its seam moves it. */
const EDGE_SHARE = 0.25

/**
 * Why a panel is to be shown, which decides whether a CLOSED one may open (operator, 2026-10-16).
 * A `command` is the reader asking for that panel: the Panels menu, a link or a jump they clicked.
 * A `selection` is the reader choosing something the panel shows: a pick in a list. A selection
 * never reopens a panel the reader closed — a pick in the run list did, and moved the layout on a
 * click that was about something else.
 */
export type RevealReason = 'command' | 'selection'

/** What is being dragged in the dock: a panel by its tab, or a whole group by its header. */
type DockDrag = { panel: string } | { group: string }

/**
 * Below this dock width a split would leave the report too narrow for its lists — measured
 * 2026-10-15: at 620 px the run list overflowed its panel by 95 px — so the kind joins the
 * report's tabs instead, right after it.
 */
const SPLIT_MIN_WIDTH = 1400

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

  /** What is being dragged, while it is — the dock's edges offer a place only then. */
  const dragging = shallowRef<DockDrag | null>(null)
  /**
   * Which panels are open, by id. Kept from dockview's own events, because its API object is not
   * reactive — and the column reads it: a section open as a panel of its own is left out there.
   */
  const openIds = ref<string[]>([])
  /**
   * The panels ON SHOW: each the front tab of a visible group, as dockview reports it to the panel's
   * own host. Open is not on show — a panel behind another tab is open and unseen.
   */
  const shownIds = ref<string[]>([])
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

  /** A panel's host saying whether its panel is on show — dockview's own per-panel event, exact. */
  function noteShown(kindId: string, shown: boolean): void {
    const listed = shownIds.value.includes(kindId)
    if (shown && !listed) shownIds.value = [...shownIds.value, kindId]
    if (!shown && listed) shownIds.value = shownIds.value.filter(id => id !== kindId)
  }

  /**
   * Where a kind that opens beside another goes: a split to its right where the dock is wide enough
   * to share, at its share of the width; a tab right after it otherwise.
   */
  function besideAnchor(dock: DockviewApi, anchor: string): { placement: Placement, size?: number } {
    if (dock.width >= SPLIT_MIN_WIDTH) {
      return { placement: { referencePanel: anchor, direction: 'right' }, size: Math.round(dock.width * SPLIT_SHARE) }
    }
    const panel = dock.getPanel(anchor)!
    return { placement: { referencePanel: anchor, direction: 'within', index: panel.group.panels.indexOf(panel) + 1 } }
  }

  /**
   * The suggested order: the lists and the report as tabs of one group, on the tab where the work
   * is — and a kind that opens beside another, the run chart, as a split to its right.
   */
  function arrangeDefault(dock: DockviewApi): void {
    dock.clear()
    const kinds = PANEL_KINDS.filter(kind => kind.opensByDefault).sort((a, b) => a.order - b.order)
    const tabs = kinds.filter(kind => !OPENS_RIGHT_OF[kind.id])
    tabs.forEach((kind, index) =>
      add(dock, kind.id, index ? { referencePanel: tabs[0]!.id, direction: 'within' } : undefined))
    for (const kind of kinds.filter(entry => OPENS_RIGHT_OF[entry.id])) {
      const anchor = OPENS_RIGHT_OF[kind.id]!
      if (!dock.getPanel(anchor)) {
        add(dock, kind.id)
        continue
      }
      const { placement, size } = besideAnchor(dock, anchor)
      add(dock, kind.id, placement, size)
    }
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
   * A stored layout that has never held the run chart — written before it opened by default — gets
   * it beside the run report, the way a first arrangement has it: a new panel is appended with its
   * default, never one the reader HID, which has a place to come back to.
   */
  function addMissingRunChart(dock: DockviewApi): void {
    const kindId = 'run-chart'
    const anchor = OPENS_RIGHT_OF[kindId]!
    if (dock.getPanel(kindId) || arrangement.places[kindId] || !dock.getPanel(anchor)) return
    const before = dock.activePanel
    const { placement, size } = besideAnchor(dock, anchor)
    add(dock, kindId, placement, size)
    // beside the report, not in front of the panel the reader had in front
    before?.api.setActive()
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
   * Gives every restored panel its kind's title. dockview stores the title with the layout and
   * restores it as stored, so a panel renamed since kept its old one — not in the tab, which draws
   * the kind's own, but in the tab's accessible name and in what the dock announces on opening and
   * closing it: a run bundle went on being read out as "Run".
   */
  function retitle(dock: DockviewApi): void {
    for (const panel of dock.panels) {
      const title = panelKind(panel.id)?.title
      if (title && panel.title !== title) panel.api.setTitle(title)
    }
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
        retitle(dock)
        addMissingBundle(dock)
        addMissingRunChart(dock)
      } else arrangeDefault(dock)
    } catch {
      arrangeDefault(dock)
    }
    // a view kept for a kind this build no longer has goes with it; a hidden panel's view stays
    arrangement.keepPanelViews(kind => panelKind(kind) !== null)
    flush()
    syncOpen()
    subscriptions = [
      dock.onDidLayoutChange(scheduleSave),
      dock.onWillMutateLayout(recordPlaces),
      dock.onDidAddPanel(syncOpen),
      dock.onDidRemovePanel(onRemoved),
      dock.onWillDragPanel(event => { dragging.value = { panel: event.panel.id } }),
      dock.onWillDragGroup(event => { dragging.value = { group: event.group.id } }),
      dock.onDidDrop(endDrag),
    ]
  }

  function endDrag(): void {
    dragging.value = null
  }

  /**
   * Docks what is being dragged along a whole edge of the dock: a column over its full height, a
   * row over its full width (operator, 2026-10-16). dockview has edge targets of its own, and they
   * see no drag over a panel kept in the page: `renderer: 'always'` puts its content in an overlay
   * outside their element, so only the tab bars reached them (traced 2026-10-16). The dock draws
   * its own edges instead (`DockEdges.vue`) and docks through the public API.
   */
  function dockToEdge(side: DockEdge): void {
    const dock = api.value
    const drag = dragging.value
    dragging.value = null
    if (!dock || !drag) return
    const across = side === 'left' || side === 'right'
    const size = Math.round((across ? dock.width : dock.height) * EDGE_SHARE)
    const group = dock.addGroup({
      direction: EDGE_DIRECTION[side],
      ...(across ? { initialWidth: size } : { initialHeight: size }),
    })
    if ('panel' in drag) dock.getPanel(drag.panel)?.api.moveTo({ group })
    else dock.getGroup(drag.group)?.api.moveTo({ group })
  }

  function detach(): void {
    flush()
    subscriptions.forEach(subscription => subscription.dispose())
    subscriptions = []
    api.value = null
    openIds.value = []
    shownIds.value = []
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
   * Opens a closed kind: where it last stood while a panel it stood beside is still open; else where
   * its kind first opens, and beside the active one.
   */
  function openClosed(dock: DockviewApi, kindId: string): void {
    if (placeAgain(dock, kindId)) return
    const anchor = OPENS_RIGHT_OF[kindId]
    const active = dock.activePanel?.id
    if (anchor && dock.getPanel(anchor)) {
      const { placement, size } = besideAnchor(dock, anchor)
      add(dock, kindId, placement, size)
    } else add(dock, kindId, active ? { referencePanel: active, direction: 'within' } : undefined)
  }

  /**
   * Shows a kind's panel — THE way every jump, link and pick shows one, so its rule lives in one
   * place (VS Code's `openView` as the model, operator 2026-10-16). The panel comes to the front
   * wherever it stands, in its own group. A closed one opens for a `command` only, never for a
   * `selection` (see `RevealReason`). Says whether the panel is on show now.
   */
  function reveal(kindId: string, reason: RevealReason): boolean {
    const dock = api.value
    if (!dock) return false
    if (!dock.getPanel(kindId)) {
      if (reason === 'selection') return false
      openClosed(dock, kindId)
    }
    const panel = dock.getPanel(kindId)
    panel?.api.setActive()
    return panel !== undefined
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
    reveal(COLUMN_KIND, 'command')
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
    api, openIds, shownIds, dragging,
    attach, detach, reveal, close, openSection, backIntoColumn, showSection, hideSection, reset, flush,
    dockToEdge, endDrag, noteShown,
  }
})
