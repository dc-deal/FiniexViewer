import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { DockviewApi } from 'dockview-vue'
import { reconcileLayout } from '@/components/dock/dock_layout'
import { FIRST_ACTIVE_KIND, PANEL_KINDS, panelKind } from '@/panel_kinds'
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
  let timer: ReturnType<typeof setTimeout> | null = null
  let subscription: { dispose(): void } | null = null

  /** One kind's panel, beside `reference` where one is given. A kind has one panel today. */
  function add(dock: DockviewApi, kindId: string, reference?: string): void {
    const kind = panelKind(kindId)
    if (!kind) return
    dock.addPanel({
      id: kind.id,
      component: HOST_COMPONENT,
      title: kind.title,
      params: { kind: kind.id },
      // kept in the page while hidden, so a panel returned to finds its scroll where it left it
      renderer: 'always',
      ...(reference ? { position: { referencePanel: reference, direction: 'within' as const } } : {}),
    })
  }

  /** The suggested order, all in one group, on the tab where the work is. */
  function arrangeDefault(dock: DockviewApi): void {
    dock.clear()
    const kinds = PANEL_KINDS.filter(kind => kind.opensByDefault).sort((a, b) => a.order - b.order)
    kinds.forEach((kind, index) => add(dock, kind.id, index ? kinds[0]!.id : undefined))
    dock.getPanel(FIRST_ACTIVE_KIND)?.api.setActive()
  }

  /** Writes the layout now — on the timer, or at once where the page is about to go. */
  function flush(): void {
    if (timer) clearTimeout(timer)
    timer = null
    if (api.value) arrangement.setDock(api.value.toJSON())
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
    subscription = dock.onDidLayoutChange(scheduleSave)
  }

  function detach(): void {
    flush()
    subscription?.dispose()
    subscription = null
    api.value = null
  }

  /** Brings a kind's panel to the front, opening it beside the active one where it is closed. */
  function open(kindId: string): void {
    const dock = api.value
    if (!dock) return
    if (!dock.getPanel(kindId)) add(dock, kindId, dock.activePanel?.id)
    dock.getPanel(kindId)?.api.setActive()
  }

  /** Back to the suggested order — every panel the first arrangement holds, and no other. */
  function reset(): void {
    const dock = api.value
    if (!dock) return
    arrangeDefault(dock)
    flush()
  }

  return { api, attach, detach, open, reset, flush }
})
