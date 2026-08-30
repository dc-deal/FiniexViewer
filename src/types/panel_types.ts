import type { Component } from 'vue'

/** Which run categories a panel can render for. 'all' = unified across the three the index lists. */
export type PanelGroupScope = 'all' | 'single_runs' | 'autotrader' | 'sweeps'

/**
 * What a panel declares about itself. A panel is presentation only: it receives its model as a
 * prop and knows neither the API nor a store, which is what lets the same component render a run
 * artifact today and a live frame later.
 */
export interface PanelDescriptor {
  id: string
  title: string
  icon: string
  component: Component
  /** Key into the model record the host supplies — the panel never fetches its own data. */
  source: string
  groups: PanelGroupScope
  defaultOpen: boolean
}

/** Per-panel arrangement, the part the user controls and the part that is persisted. */
export interface PanelState {
  id: string
  open: boolean
  pinned: boolean
  locked: boolean
}

export interface ColumnState {
  width: number
  panels: PanelState[]
}

export interface LayoutState {
  columns: ColumnState[]
  /**
   * Panels the user removed from the column. Recorded explicitly, because reconciliation cannot
   * otherwise tell a panel the user hid from one that is new since the layout was stored — and
   * it would keep resurrecting the hidden one on every load.
   */
  hidden: string[]
}

/** The whole persisted arrangement: named layouts plus which one is active. */
export interface WorkspaceState {
  version: number
  active: string
  layouts: Record<string, LayoutState>
}
