import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'

const FILLS_PANEL: InjectionKey<boolean> = Symbol('fills-panel')

/** The host of a section shown as a panel of its own says so: the section has the panel's height. */
export function provideFillsPanel(): void {
  provide(FILLS_PANEL, true)
}

/**
 * Whether the section this runs in is the whole of a panel. False in the bundle's column, where the
 * sections stack and each takes the height of what it shows — a list there keeps its own cap.
 */
export function useFillsPanel(): boolean {
  return inject(FILLS_PANEL, false)
}
