import type { Component } from 'vue'

/**
 * What a panel declares about itself. A panel is presentation only: it receives its model as a
 * prop and knows neither the API nor a store, which is what lets the same component render a run
 * artifact today and a streamed frame later.
 */
export interface PanelDescriptor {
  id: string
  title: string
  icon: string
  component: Component
  /** Key into the model record the host supplies — the panel never fetches its own data. */
  source: string
  defaultOpen: boolean
}

/** Per-panel arrangement, the part the user controls and the part that is persisted. */
export interface PanelState {
  id: string
  open: boolean
  pinned: boolean
  locked: boolean
  /**
   * Switched off. A FLAG and not a removal, which is the whole reason this field exists: the app
   * bar is the same arrangement drawn horizontally, and a toggle that moves when you flip it is a
   * control that runs away from the finger. A hidden panel therefore keeps its place in the list;
   * only the column declines to draw it.
   *
   * It also tells reconciliation apart what it could not tell apart before: a panel the user
   * switched off is here with the flag set, and a panel that is NEW since the layout was stored is
   * not here at all.
   */
  hidden: boolean
}

export interface ColumnState {
  width: number
  panels: PanelState[]
}

export interface LayoutState {
  columns: ColumnState[]
}

/** The whole persisted arrangement: named layouts plus which one is active. */
export interface WorkspaceState {
  version: number
  active: string
  layouts: Record<string, LayoutState>
}
