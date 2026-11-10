export type ThemeName = 'dark' | 'light'

/** Which section of the settings dialog is on show. */
export type SettingsTab = 'display' | 'layouts' | 'servers'

/**
 * How the lanes of a booking-period timeline are ordered — and the same order the table beneath it
 * follows. Lives here rather than beside the sorting function because it is a stored preference:
 * the user picks it once and every run opens that way.
 */
export type LaneOrder = 'time' | 'name'

/**
 * The presentation preferences a PANEL may read.
 *
 * Panels receive this as a prop from their host, exactly as they receive their model — a panel that
 * reached into a store would stop being renderable from a different source, which is the one
 * property the panel contract exists to protect. Every field has a default, so a panel rendered
 * without it behaves as it did before settings existed.
 */
export interface DisplaySettings {
  /**
   * Above this many units, a panel makes the summary primary and the individual unit secondary.
   * A thirteen-scenario run is already hard to read and a forty-scenario run is unreadable; the
   * threshold is what lets the presentation know how many units it is dealing with.
   */
  scenarioThreshold: number
  /** Which order a fresh booking-period view opens in. */
  laneOrder: LaneOrder
  /** How many trade rows are drawn before the list is capped — the cap is always stated, never silent. */
  tradeRowCap: number
}

/**
 * Whether picking a run chooses the layout (viewer#37): not at all, by offering the one it maps to
 * beside the Layouts menu, or by loading it. Ours, a closed set.
 */
export type LayoutByRun = 'off' | 'offer' | 'switch'

/** Everything the settings store keeps. `theme` is applied to the document, not passed to panels. */
export interface Settings extends DisplaySettings {
  theme: ThemeName
  /**
   * Whether the window's width chooses the size of the loaded layout (viewer#37) — on by default
   * since 2026-11-10, so a narrow window takes Mobile by itself (operator); switched off, the size
   * is the one chosen in its submenu, for a reader who would rather not be steered.
   */
  sizeByWindow: boolean
  /** From this window width on, in CSS pixels, a layout takes Medium; below it, Mobile. */
  mediumFrom: number
  /** From this window width on, a layout takes Full. */
  fullFrom: number
  /** What picking a run does to the layout — offered by default, and switchable off. */
  layoutByRun: LayoutByRun
  /** The layout a backtest maps to, by id; one that no longer exists maps to nothing. */
  layoutForBacktest: string
  /** The layout an AutoTrader session and a deployment map to, by id. */
  layoutForSession: string
}

/**
 * The values every reset returns to, and the fallback a panel uses when no settings are supplied.
 *
 * Deliberately beside the shape rather than in the store: a default that drifts from its type is
 * the defect this placement prevents, and importing it costs a consumer nothing — it instantiates
 * no store.
 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  scenarioThreshold: 6,
  laneOrder: 'time',
  tradeRowCap: 500,
  sizeByWindow: true,
  mediumFrom: 900,
  fullFrom: 1500,
  layoutByRun: 'offer',
  layoutForBacktest: 'backtests',
  layoutForSession: 'deploys',
}
