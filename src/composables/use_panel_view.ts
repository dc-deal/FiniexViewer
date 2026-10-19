import { computed, inject, provide, ref } from 'vue'
import type { InjectionKey, WritableComputedRef } from 'vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import type { StoredPanelView, ViewFold } from '@/types/arrangement_types'

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

function ownView(): PanelViewChannel {
  const own = ref<StoredPanelView>({})
  return { read: () => own.value, write: view => { own.value = view } }
}
