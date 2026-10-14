import type { Component } from 'vue'
import type { IconName } from '@/types/icon_types'

/**
 * What a panel declares about itself. A panel is presentation only: it receives its model as a
 * prop and knows neither the API nor a store, which is what lets the same component render a run
 * artifact today and a streamed frame later.
 */
export interface PanelDescriptor {
  id: string
  title: string
  icon: IconName
  component: Component
  /** Key into the model record the host supplies — the panel never fetches its own data. */
  source: string
  defaultOpen: boolean
}

/**
 * A tab's one status, shown only where it says something. Its icon never travels alone: the word
 * goes with it, read out with the tab and written in its card.
 */
export interface TabStatus {
  icon: IconName
  /**
   * The word for the state — the backend's own wherever it grades one (`run_outcome`), never a word
   * of ours for its grade. Ours only for a state of our own, such as a section that failed to load.
   */
  word: string
  /** A colour ROLE from the tokens, never a colour. */
  role: 'warning' | 'error'
}

/**
 * What a DOCKED panel is: one entry per kind in `panel_kinds.ts`. Its tab shows the panel's FORM
 * — a list, a sheet, a chart — never its content, which is the title's job.
 */
export interface PanelKind {
  /** Also the panel's id while a kind has one panel only. */
  id: string
  title: string
  /** What the panel is for, in one line — its tab's card says it. */
  description: string
  icon: IconName
  /** Its place in the suggested order — the first arrangement and a reset follow it. */
  order: number
  /** Part of the first arrangement, or opened from the Panels menu only. */
  opensByDefault: boolean
  component: Component
  /** What the quick bar beside the tabs offers while this panel is in front. */
  quickBar?: Component
  /** Its tab's status — called where the tab is drawn, so it may read a store. */
  status?: () => TabStatus | null
  /** Its tab's title dimmed: the panel stands, with nothing of the chosen run to show. */
  muted?: () => boolean
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
