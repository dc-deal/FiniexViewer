import { computed, inject, provide, ref } from 'vue'
import type { InjectionKey, WritableComputedRef } from 'vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import { VIEW_ROW_CAPS } from '@/types/arrangement_types'
import type { StoredPanelView, ViewFold, ViewRowList } from '@/types/arrangement_types'

/** How a panel's own view is read and kept — the host decides where, the panel only asks. */
interface PanelViewChannel {
  read: () => StoredPanelView
  write: (view: StoredPanelView) => void
}

const PANEL_VIEW: InjectionKey<PanelViewChannel> = Symbol('panel-view')

/**
 * The host names the panel it draws, and everything inside keeps its view under that id: the
 * dock's panel host by the kind, the bundle's column by the section's dock id — so a section keeps
 * ONE view, in the column and as a panel of its own.
 *
 * @param panelId The panel's dock id.
 */
export function providePanelView(panelId: string): void {
  const arrangement = useArrangementStore()
  provide(PANEL_VIEW, {
    read: () => arrangement.panelViews[panelId] ?? {},
    write: view => arrangement.setPanelView(panelId, view),
  })
}

/**
 * Whether a fold of the panel this runs in is shown. A value equal to `fallback` is not stored, so
 * an absent fold always means its default. Outside a host it lives for this mount only, the way it
 * did before anything was kept: a component mounted on its own behaves as it always did.
 *
 * @param fold Which part of the panel.
 * @param fallback What it shows where nothing was kept.
 */
export function useViewExpanded(fold: ViewFold, fallback = false): WritableComputedRef<boolean> {
  const channel = inject(PANEL_VIEW, null) ?? ownView()
  return computed({
    get: () => channel.read().expanded?.[fold] ?? fallback,
    set: shown => {
      const expanded = { ...channel.read().expanded }
      if (shown === fallback) delete expanded[fold]
      else expanded[fold] = shown
      channel.write({ ...channel.read(), expanded })
    },
  })
}

/** A panel's keys of one list, for the run it shows. */
interface ViewRows {
  has: (key: string) => boolean
  set: (key: string, on: boolean) => void
  toggle: (key: string) => void
}

/**
 * The keys of one list a panel keeps for the run it shows — the scope read at USE, from the panel's
 * own model, never from a link and never watched. Under any other run they count for nothing, and the
 * first change there replaces them whole, so a panel keeps one run's rows. Capped, the newest kept.
 *
 * @param list Which list.
 * @param scope The run the panel shows, `() => props.model.run_id`; where it names none, nothing is kept.
 */
export function useViewRows(list: ViewRowList, scope: () => string | null): ViewRows {
  const channel = inject(PANEL_VIEW, null) ?? ownView()

  function current(): string[] {
    const rows = channel.read().rows
    return rows && rows.scope === scope() ? rows.keys[list] ?? [] : []
  }

  function set(key: string, on: boolean): void {
    const run = scope()
    if (run === null) return
    const view = channel.read()
    const keys = view.rows?.scope === run ? { ...view.rows.keys } : {}
    const others = (keys[list] ?? []).filter(kept => kept !== key)
    const next = on ? [...others, key].slice(-VIEW_ROW_CAPS[list]) : others
    if (next.length) keys[list] = next
    else delete keys[list]
    channel.write({ ...view, rows: Object.keys(keys).length ? { scope: run, keys } : undefined })
  }

  return {
    has: key => current().includes(key),
    set,
    toggle: key => set(key, !current().includes(key)),
  }
}

function ownView(): PanelViewChannel {
  const own = ref<StoredPanelView>({})
  return { read: () => own.value, write: view => { own.value = view } }
}
