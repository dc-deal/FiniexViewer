import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { DockviewApi } from 'dockview-vue'
import { reconcileLayout } from '@/components/dock/dock_layout'
import { FIRST_ACTIVE_KIND, PANEL_KINDS, panelKind, reportKindId, sectionOfKind } from '@/panel_kinds'
import { useArrangementStore } from '@/stores/arrangement_store'

/** How long the layout must hold still before it is written — a drag changes it every frame. */
const SAVE_DELAY_MS = 300

/**
 * The one dockview component every panel is drawn with — `PanelDock`'s `#panel-host` slot, so the
 * two names move together. What a panel shows is its `kind`.
 */
const HOST_COMPONENT = 'host'

/**
 * Where the panels stand: the dock's own API, the first arrangement, and the layout kept in the
 * arrangement. The dock knows PLACEMENT only — what a panel shows is its kind's, and what it is
 * about is its link's.
 */
export const useDockStore = defineStore('dock', () => {
  const arrangement = useArrangementStore()

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

  /** Where a panel is added: as a tab beside `referencePanel`, or as a split to its right. */
  interface Placement {
    referencePanel: string
    direction: 'within' | 'right'
  }

  /** One kind's panel, placed where it is told, or where dockview puts a panel by default. */
  function add(dock: DockviewApi, kindId: string, placement?: Placement): void {
    const kind = panelKind(kindId)
    if (!kind) return
    dock.addPanel({
      id: kind.id,
      component: HOST_COMPONENT,
      title: kind.title,
      params: { kind: kind.id },
      // kept in the page while hidden, so a panel returned to finds its scroll where it left it
      renderer: 'always',
      ...(placement ? { position: placement } : {}),
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
    dock.getPanel(FIRST_ACTIVE_KIND)?.api.setActive()
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

  /**
   * Takes over a ready dock: lays out what was stored — reconciled, never trusted — or the
   * suggested order where nothing usable was. A layout dockview itself refuses counts as none, so
   * a damaged entry can never leave the reader with an empty screen.
   */
  function attach(dock: DockviewApi): void {
    api.value = dock
    const layout = reconcileLayout(arrangement.dock, kind => panelKind(kind) !== null)
    try {
      if (layout) dock.fromJSON(layout)
      else arrangeDefault(dock)
    } catch {
      arrangeDefault(dock)
    }
    flush()
    syncOpen()
    subscriptions = [
      dock.onDidLayoutChange(scheduleSave),
      dock.onDidAddPanel(syncOpen),
      dock.onDidRemovePanel(syncOpen),
    ]
  }

  function detach(): void {
    flush()
    subscriptions.forEach(subscription => subscription.dispose())
    subscriptions = []
    api.value = null
    openIds.value = []
  }

  /** Brings a kind's panel to the front, opening it beside the active one where it is closed. */
  function open(kindId: string): void {
    const dock = api.value
    if (!dock) return
    const active = dock.activePanel?.id
    if (!dock.getPanel(kindId)) add(dock, kindId, active ? { referencePanel: active, direction: 'within' } : undefined)
    dock.getPanel(kindId)?.api.setActive()
  }

  /**
   * Opens a section of the run report as a panel of its own, or brings it to the front where it is
   * open already — a section is in one place at a time. The first stands beside the Runs panel, as
   * a split to its right; each further one joins the last as a tab, so the screen is not cut
   * thinner with every section. Closing it is dockview's own close, and the column takes it back.
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
      else if (dock.getPanel('runs')) add(dock, kindId, { referencePanel: 'runs', direction: 'right' })
      else add(dock, kindId)
    }
    lastSection = kindId
    dock.getPanel(kindId)?.api.setActive()
  }

  /** Back to the suggested order — every panel the first arrangement holds, and no other. */
  function reset(): void {
    const dock = api.value
    if (!dock) return
    arrangeDefault(dock)
    flush()
    syncOpen()
  }

  return { api, openIds, attach, detach, open, openSection, reset, flush }
})
