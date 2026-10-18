import type { Component } from 'vue'
import type { LinkKey } from '@/types/context_types'
import type { IconName } from '@/types/icon_types'

/**
 * How a panel relates to the others — declared as data, so its tab's card can say it in words and
 * a test can hold every kind to it (viewer#42, VS Code's view register as the model). "Who controls
 * whom" is the writer and the reader of a link, never one panel over another.
 */
export interface PanelRelations {
  /** The bundle it is a member of — the kind whose column holds it — or null. */
  memberOf: string | null
  /**
   * The link keys whose change changes what it SHOWS: other figures, other rows, another unit
   * drawn. A key it only marks a row by is not followed — a list that stays whole does not follow
   * the pick it shows.
   */
  follows: LinkKey[]
  /** The link keys a control in its content chooses. */
  chooses: LinkKey[]
}

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
  /**
   * What a scenario narrowing does to this section's ROWS: `filters` draws only the chosen
   * scenarios' rows, `marks` keeps every row and marks the chosen ones, `null` means its rows do not
   * change with it — a section of run-wide figures may still mark them as the whole run's while a
   * scenario is in focus (the Executive Summary, Run Totals). Opened as a panel of its own, a section carries the narrowing's frame only
   * where the narrowing FILTERS (the narrowing itself is said once, in the menu bar) — a frame says *what
   * you see here is a part*, which is untrue of a list that still shows every row.
   */
  narrowing: 'filters' | 'marks' | null
  /** What the section follows and chooses, the same in the bundle and as a panel of its own. */
  follows: LinkKey[]
  chooses: LinkKey[]
}

/**
 * A command a panel offers about itself, on its tab's ⋯ — the Panels menu only shows and hides
 * panels (viewer#42).
 */
export interface PanelAction {
  /** Named on its menu entry (`data-action`). */
  id: 'collapse-all' | 'reset-bundle'
  title: string
  /** Called on the click, so it may reach a store. */
  run: () => void
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
  /**
   * What its tab adds to the title — the run a bundle shows. Called where the tab is drawn, so it
   * follows the store it reads; null where there is nothing to add.
   */
  subtitle?: () => string | null
  /** The area whose submenu lists it in the Panels menu; a kind without one stands at the top. */
  area?: string
  /** Its entry in that submenu, where the tab's short title would repeat the area's name. */
  menuTitle?: string
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
  /** What its tab's ⋯ offers; a kind without any has no ⋯. */
  actions?: PanelAction[]
  /** What it follows and chooses, and the bundle it belongs to. Required: every kind declares it. */
  relations: PanelRelations
}

/** Per-panel arrangement, the part the user controls and the part that is persisted. */
export interface PanelState {
  id: string
  open: boolean
  pinned: boolean
  locked: boolean
  /**
   * Switched off. A FLAG and not a removal, which is the whole reason this field exists: the Panels
   * menu lists the same arrangement, and an entry that moves when you flip it is a control that runs
   * away from the finger. A hidden panel therefore keeps its place in the list; only the column
   * declines to draw it.
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
