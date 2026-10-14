import { inject, onMounted, onUnmounted, provide, watch } from 'vue'
import type { InjectionKey, Ref } from 'vue'

const PANEL_VISIBLE: InjectionKey<Ref<boolean>> = Symbol('panel-visible')

/** The panel host says whether its panel is on screen — its tab in front, its group not hidden. */
export function providePanelVisibility(visible: Ref<boolean>): void {
  provide(PANEL_VISIBLE, visible)
}

/**
 * Calls `refresh` whenever the panel this runs in is shown AGAIN: its tab picked after another,
 * or the browser tab returned to while the panel is in front. Not on the first showing — the
 * panel's own mount does the first load.
 *
 * It exists because a docked panel stays mounted. While each view was a route, entering it loaded
 * the run index afresh; a panel that is merely brought forward would otherwise show the list it
 * loaded an hour ago, and new runs appear while the app is open. Outside a panel host it does
 * nothing, so a component mounted on its own behaves as it did.
 */
export function onPanelShownAgain(refresh: () => void): void {
  const visible = inject(PANEL_VISIBLE, null)
  if (!visible) return

  watch(visible, (now, before) => {
    if (now && !before) refresh()
  })

  function onReturn(): void {
    if (document.visibilityState === 'visible' && visible!.value) refresh()
  }
  onMounted(() => document.addEventListener('visibilitychange', onReturn))
  onUnmounted(() => document.removeEventListener('visibilitychange', onReturn))
}
