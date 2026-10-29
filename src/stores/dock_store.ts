import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { DockviewApi, GroupNavigationDirection, IDockviewPanel } from 'dockview-vue'
import { reconcileLayout } from '@/components/dock/dock_layout'
import { chartLayers } from '@/layer_registry'
import { memberKindId, memberOfKind } from '@/bundle_members'
import { DEPLOYMENT_BUNDLE, PANEL_KINDS, RUN_BUNDLE, firstActiveKind, panelKind } from '@/panel_kinds'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'
import { useLayoutStore } from '@/stores/layout_store'
import type { DockPlace } from '@/types/arrangement_types'
import type { BundleId } from '@/types/panel_types'

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
 * Where a kind opens the first time, while nothing it stood beside is known: the run report as a
 * split to the right of the run list, so a pick shows the run without covering the list it was made
 * in (operator, 2026-10-20), and the run chart to the right of the report, so a trade in the list
 * and its candle are one glance apart (viewer#31, decided 2026-10-15). Every other kind joins the
 * active panel's tabs.
 */
const OPENS_RIGHT_OF: Record<string, string> = { [COLUMN_KIND]: LIST_KIND, 'run-chart': COLUMN_KIND }

/**
 * Where the deployment bundle opens while nothing it stood beside is known: as a tab behind the run
 * bundle, in the report's group — beside the deployment list it would make the first arrangement
 * four columns wide, and as a tab beside the list a pick there would leave it behind, since a pick
 * never covers its list (decided 2026-10-27, viewer#43). Without the run bundle, behind the list.
 */
function deploymentBundlePlace(dock: DockviewApi): Placement | undefined {
  const anchor = dock.getPanel(COLUMN_KIND) ?? dock.getPanel('deployments')
  return anchor
    ? { referencePanel: anchor.id, direction: 'within', index: anchor.group.panels.indexOf(anchor) + 1 }
    : undefined
}

/**
 * The first arrangement's columns, each with a floor, the width beyond them shared 28 · 38 · 34
 * (operator, 2026-10-20). The REPORT's floor comes first: its trade history and its orders keep the
 * position column — the mark that opens a trade on the chart — only from 48rem of list, and at a
 * report of 682 px both lost it. The lists' floor next: in a column of 392 px the run list needed
 * 420 for its rows and scrolled sideways. The chart takes what is left, and only where that is
 * room for candles; otherwise it is a tab behind the report.
 */
const LIST_FLOOR = 470
const REPORT_FLOOR = 860
const CHART_FLOOR = 450
const LIST_SHARE = 0.28
const CHART_SHARE = 0.34

/** The dock width from which the report stands beside the lists, and from which the chart beside the report. */
const TWO_COLUMNS = LIST_FLOOR + REPORT_FLOOR
const THREE_COLUMNS = TWO_COLUMNS + CHART_FLOOR

/** The panel that arranges the drawing layers of the chart last in front (viewer#41). */
const LAYERS_KIND = 'layers'

/** The width the Layers panel opens at — a list of a few rows, beside the chart that keeps the room. */
const LAYERS_WIDTH = 240

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
 * A `link` is a command made in a panel and aimed at a bundle: where members of that bundle stand
 * open as panels of their own, it goes to them instead (operator, 2026-10-28) — see `revealMembers`.
 * Aimed at any other kind, it is a command.
 */
export type RevealReason = 'command' | 'link' | 'selection'

/** What is being dragged in the dock: a panel by its tab, or a whole group by its header. */
type DockDrag = { panel: string } | { group: string }

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
  /**
   * The chart last in front — a panel whose kind draws layers of its own — or null where none is
   * open: what the Layers panel arranges. FOCUS, not a selection, so no link carries it; another
   * panel coming to the front, the Layers panel itself among them, leaves it as it was.
   */
  const lastChart = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let subscriptions: { dispose(): void }[] = []
  /** The member panel of each bundle opened last: where its next one goes, as a tab beside it. */
  const lastSection = new Map<BundleId, string>()
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

  /** An open chart that draws layers of its own, the first in the dock — or null. */
  function anyChart(dock: DockviewApi): string | null {
    return dock.panels.find(panel => chartLayers(panel.id).length)?.id ?? null
  }

  function noteActive(panel: IDockviewPanel | undefined): void {
    if (panel && chartLayers(panel.id).length) lastChart.value = panel.id
  }

  /** A panel's host saying whether its panel is on show — dockview's own per-panel event, exact. */
  function noteShown(kindId: string, shown: boolean): void {
    const listed = shownIds.value.includes(kindId)
    if (shown && !listed) shownIds.value = [...shownIds.value, kindId]
    if (!shown && listed) shownIds.value = shownIds.value.filter(id => id !== kindId)
  }

  /**
   * The width a kind's split takes where it first opens: the report everything right of the lists —
   * the chart's part included, which the chart's split then takes from it — and the chart its part.
   */
  function splitWidth(width: number, kindId: string): number {
    if (kindId !== COLUMN_KIND) return Math.round(CHART_FLOOR + CHART_SHARE * (width - THREE_COLUMNS))
    const floor = width >= THREE_COLUMNS ? THREE_COLUMNS : TWO_COLUMNS
    return Math.round(width - LIST_FLOOR - LIST_SHARE * (width - floor))
  }

  /**
   * Where a kind that opens beside another goes: a split to its right where the dock holds every
   * column's floor, at its share of the width; a tab right after it otherwise — below that a split
   * would leave the report too narrow for its lists (measured 2026-10-15: at 620 px the run list
   * overflowed its panel by 95 px).
   */
  function besideAnchor(dock: DockviewApi, kindId: string): { placement: Placement, size?: number } {
    const anchor = OPENS_RIGHT_OF[kindId]!
    if (dock.width >= (kindId === COLUMN_KIND ? TWO_COLUMNS : THREE_COLUMNS)) {
      return { placement: { referencePanel: anchor, direction: 'right' }, size: splitWidth(dock.width, kindId) }
    }
    const panel = dock.getPanel(anchor)!
    return { placement: { referencePanel: anchor, direction: 'within', index: panel.group.panels.indexOf(panel) + 1 } }
  }

  /**
   * The suggested order: the lists as tabs of one group, on the tab where the work is — and a kind
   * that opens beside another, the report and the run chart, as a split to its right.
   */
  function arrangeDefault(dock: DockviewApi): void {
    dock.clear()
    const kinds = PANEL_KINDS.filter(kind => kind.opensByDefault).sort((a, b) => a.order - b.order)
    const tabs = kinds.filter(kind => !OPENS_RIGHT_OF[kind.id] && kind.id !== DEPLOYMENT_BUNDLE)
    tabs.forEach((kind, index) =>
      add(dock, kind.id, index ? { referencePanel: tabs[0]!.id, direction: 'within' } : undefined))
    for (const kind of kinds.filter(entry => OPENS_RIGHT_OF[entry.id])) {
      const anchor = OPENS_RIGHT_OF[kind.id]!
      if (!dock.getPanel(anchor)) {
        add(dock, kind.id)
        continue
      }
      const { placement, size } = besideAnchor(dock, kind.id)
      add(dock, kind.id, placement, size)
    }
    if (kinds.some(kind => kind.id === DEPLOYMENT_BUNDLE)) add(dock, DEPLOYMENT_BUNDLE, deploymentBundlePlace(dock))
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
   * A stored layout without the deployment bundle — written before it existed (viewer#43) — gains it
   * behind the run bundle, and whether a deployment is chosen or not: gained only with one chosen, a
   * pick in the list would show nothing until a reload, since a selection never opens a closed panel.
   * Never one the reader HID, which has a place to come back to.
   */
  function addMissingDeploymentBundle(dock: DockviewApi): void {
    if (dock.getPanel(DEPLOYMENT_BUNDLE) || arrangement.places[DEPLOYMENT_BUNDLE]) return
    const before = dock.activePanel
    add(dock, DEPLOYMENT_BUNDLE, deploymentBundlePlace(dock))
    // a tab behind another, never in front of the panel the reader had in front
    before?.api.setActive()
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
    const { placement, size } = besideAnchor(dock, kindId)
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
    if (panel.id === lastChart.value) lastChart.value = api.value ? anyChart(api.value) : null
    if (restoring) return
    const member = memberOfKind(panel.id)
    if (!member) return
    if (intoColumn.delete(panel.id)) {
      forgetPlace(panel.id)
      return
    }
    layoutStore.hide(member.member, member.bundle)
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
        addMissingDeploymentBundle(dock)
      } else arrangeDefault(dock)
    } catch {
      arrangeDefault(dock)
    }
    // a place or a view kept for a kind this build no longer has goes with it; a hidden panel's stay
    arrangement.keepPlaces(kind => panelKind(kind) !== null)
    arrangement.keepPanelViews(kind => panelKind(kind) !== null)
    flush()
    syncOpen()
    lastChart.value = anyChart(dock)
    noteActive(dock.activePanel)
    subscriptions = [
      dock.onDidLayoutChange(scheduleSave),
      dock.onWillMutateLayout(recordPlaces),
      dock.onDidAddPanel(syncOpen),
      dock.onDidRemovePanel(onRemoved),
      dock.onDidActivePanelChange(event => noteActive(event.panel)),
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
    lastChart.value = null
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
   * its kind first opens, and beside the active one. The Layers panel opens as a narrow split to the
   * right of the chart it arranges, at any width of the dock — as a tab it would hide that chart.
   */
  function openClosed(dock: DockviewApi, kindId: string): void {
    if (placeAgain(dock, kindId)) return
    const chart = lastChart.value
    if (kindId === LAYERS_KIND && chart && dock.getPanel(chart)) {
      add(dock, kindId, { referencePanel: chart, direction: 'right' }, LAYERS_WIDTH)
      return
    }
    if (kindId === DEPLOYMENT_BUNDLE) {
      add(dock, kindId, deploymentBundlePlace(dock))
      return
    }
    const anchor = OPENS_RIGHT_OF[kindId]
    const active = dock.activePanel?.id
    if (anchor && dock.getPanel(anchor)) {
      const { placement, size } = besideAnchor(dock, kindId)
      add(dock, kindId, placement, size)
    } else add(dock, kindId, active ? { referencePanel: active, direction: 'within' } : undefined)
  }

  /**
   * Shows a kind's panel — THE way every jump, link and pick shows one, so its rule lives in one
   * place (VS Code's `openView` as the model, operator 2026-10-16). The panel comes to the front
   * wherever it stands, in its own group. A closed one opens for a `command` only, never for a
   * `selection` (see `RevealReason`). Says whether the panel is open now.
   *
   * @param from The panel a `selection` was made in. A pick never covers it: where the target stands
   *   as a tab in the same group, it stays behind — the pick still chose, and every panel following
   *   it switched. Picking through a sweep's ranking with the run bundle as a tab beside it hid the
   *   ranking at every click (operator, 2026-10-20). A `command` still comes to the front.
   */
  function reveal(kindId: string, reason: RevealReason, from?: string): boolean {
    const dock = api.value
    if (!dock) return false
    if (reason === 'link' && revealMembers(dock, kindId)) return true
    if (!dock.getPanel(kindId)) {
      if (reason === 'selection') return false
      openClosed(dock, kindId)
    }
    const panel = dock.getPanel(kindId)
    const source = reason === 'selection' && from ? dock.getPanel(from) : undefined
    if (panel && source && source.group === panel.group) return true
    panel?.api.setActive()
    return panel !== undefined
  }

  /**
   * A link aimed at a bundle whose members stand open as panels of their own: they show what was
   * chosen, and each comes to the front in its group — where a member is in front already, that one
   * stays, and the group the click was made in is never covered. The bundle stays as it is, closed or
   * behind: who took its members out chose to read them apart (operator, 2026-10-28). Says whether a
   * member was open; with none, the link opens the bundle, or the click would show nothing.
   */
  function revealMembers(dock: DockviewApi, bundle: string): boolean {
    const members = dock.panels.filter(panel => memberOfKind(panel.id)?.bundle === bundle)
    if (!members.length) return false
    // dockview makes a group active as its content takes the focus, so the click's panel is in front
    const source = dock.activePanel
    for (const group of new Set(members.map(panel => panel.group))) {
      const inFront = group.activePanel
      if (group === source?.group || (inFront && members.includes(inFront))) continue
      members.find(panel => panel.group === group)?.api.setActive()
    }
    // a member brought forward takes the active group with it; the reader stays where they clicked
    source?.api.setActive()
    return true
  }

  /** Closes a panel, which hides it — the Panels menu shows it again where it stood. */
  function close(kindId: string): void {
    api.value?.getPanel(kindId)?.api.close()
  }

  /**
   * Opens a member of a bundle — a section of the run report, unless another bundle is named — as a
   * panel of its own, or brings it to the front where it is open already: a member is in one place
   * at a time. The first stands beside its bundle, as a split to its right; each further one joins
   * the last of that bundle's as a tab, so the screen is not cut thinner with every member.
   */
  function openSection(sectionId: string, bundle: BundleId = RUN_BUNDLE): void {
    const dock = api.value
    if (!dock) return
    const kindId = memberKindId(bundle, sectionId)
    if (!dock.getPanel(kindId)) {
      const last = lastSection.get(bundle)
      const beside = last && dock.getPanel(last)
        ? last
        : dock.panels.map(panel => panel.id).find(id => memberOfKind(id)?.bundle === bundle)
      if (beside) add(dock, kindId, { referencePanel: beside, direction: 'within' })
      else if (dock.getPanel(bundle)) add(dock, kindId, { referencePanel: bundle, direction: 'right' })
      else add(dock, kindId)
    }
    lastSection.set(bundle, kindId)
    dock.getPanel(kindId)?.api.setActive()
  }

  /** Puts a member opened as a panel back into its bundle's column — the ⇲ on its tab. */
  function backIntoColumn(sectionId: string, bundle: BundleId = RUN_BUNDLE): void {
    const kindId = memberKindId(bundle, sectionId)
    const panel = api.value?.getPanel(kindId)
    if (!panel) return
    intoColumn.add(kindId)
    panel.api.close()
    // dockview reports the removal while closing; a flag still standing here was never used
    intoColumn.delete(kindId)
  }

  /**
   * Is a bundle read apart — closed, while members of it stand open as panels of their own? A
   * member to be shown then joins them as a panel rather than reopening the bundle (operator,
   * 2026-10-28).
   */
  function standsApart(bundle: BundleId): boolean {
    const dock = api.value
    return dock !== null && !dock.getPanel(bundle)
      && dock.panels.some(panel => memberOfKind(panel.id)?.bundle === bundle)
  }

  /**
   * Shows a hidden section where it last stood: as a panel beside the panels it stood beside, while
   * one of them is still open, and otherwise in the column, whose panel comes to the front — or, where
   * the bundle is read apart, as a panel beside its other members.
   */
  function showSection(sectionId: string, bundle: BundleId = RUN_BUNDLE): void {
    const dock = api.value
    if (!dock) return
    const kindId = memberKindId(bundle, sectionId)
    layoutStore.show(sectionId, bundle)
    if (dock.getPanel(kindId) || placeAgain(dock, kindId)) {
      lastSection.set(bundle, kindId)
      dock.getPanel(kindId)?.api.setActive()
      return
    }
    forgetPlace(kindId)
    if (standsApart(bundle)) openSection(sectionId, bundle)
    else reveal(bundle, 'command')
  }

  /** Hides a member wherever it stands — its panel's close, or switched off in the column. */
  function hideSection(sectionId: string, bundle: BundleId = RUN_BUNDLE): void {
    const kindId = memberKindId(bundle, sectionId)
    if (api.value?.getPanel(kindId)) {
      close(kindId)
      return
    }
    forgetPlace(kindId)
    layoutStore.hide(sectionId, bundle)
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
    // the rebuild removed every chart on the way; the one it put back is the chart to arrange
    lastChart.value = anyChart(dock)
    noteActive(dock.activePanel)
    arrangement.setPlaces({})
    flush()
    syncOpen()
  }

  return {
    api, openIds, shownIds, dragging, lastChart,
    attach, detach, reveal, close, openSection, backIntoColumn, standsApart, showSection, hideSection, reset, flush,
    dockToEdge, endDrag, noteShown,
  }
})
