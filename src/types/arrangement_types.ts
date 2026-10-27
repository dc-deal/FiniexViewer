import type { ChartLayerId } from '@/types/chart_drawing_types'
import type { FacetSelection } from '@/types/facet_types'
import type { LinkContext } from '@/types/context_types'
import type { LayerOptionId } from '@/types/layer_types'
import type { PriceForm } from '@/types/run_chart_types'

/**
 * One facet bar's state, as it is stored.
 *
 * `selection` ABSENT means the reader never touched the bar, so its default narrowing applies; an
 * EMPTY selection means they cleared it, and that is kept — a reload shows what they last saw.
 * `scope` names what a narrowing was made for, such as the run a scenario roster belongs to: a
 * narrowing stored for another scope is dropped on the way in, its sort kept.
 */
export interface StoredFacets {
  selection?: FacetSelection
  search: string
  sort: string
  scope?: string | null
}

/** What the free chart keeps for itself rather than sharing through a link. */
export interface StoredChart {
  timeframe: string | null
}

/**
 * What the run chart keeps of the reader's choice: the unit and the timeframe, and the run they
 * were chosen FOR — a choice made for another run is not carried over to this one.
 */
export interface StoredRunChart {
  run: string | null
  unit: string | null
  timeframe: string | null
}

/**
 * Where a panel stood when it was last open — what brings it back to the same place. Anchored on
 * the PANELS beside it rather than on its group, because the dock issues group ids anew.
 */
export interface DockPlace {
  /** The panels it stood beside, in order of preference; the first one still open is used. */
  besides: string[]
  /** `within` their tab group, or as a split on that side of them. */
  direction: 'within' | 'left' | 'right' | 'above' | 'below'
  /** Its place among their tabs, where it shared their group. */
  index?: number
  /** The width or height of its own group, where it was a split. */
  size?: number
}

/**
 * The parts of a panel it can show or hide, and keeps for itself. Ours, so a closed set: a typo
 * fails the type-check, and a stored name is checked against it. A name joins with the component
 * that reads it.
 */
export const VIEW_FOLDS = ['periods-table'] as const
export type ViewFold = typeof VIEW_FOLDS[number]

/**
 * The lists of row keys a panel keeps for ONE run, with how many each keeps — the newest. A list
 * joins with the component that reads it, and holds the key that list itself declares for a row or
 * a group. A cap bounds what is remembered and stands above what a reader reaches by hand.
 */
export const VIEW_ROW_CAPS = {
  /** Trade History: the trades whose fills are shown, by the trade's declared key. */
  'fills-open': 100,
  /** Trade History: scenario groups opened by hand past the threshold. */
  'groups-opened': 100,
  /** Trade History and Orders: scenario groups closed by hand. */
  'groups-closed': 100,
} as const
export type ViewRowList = keyof typeof VIEW_ROW_CAPS

/**
 * How the reader arranged a chart's drawing layers in the Layers panel (viewer#41) — only what
 * differs from the chart's own: an order moved, a layer hidden or drawn fainter, an option switched.
 * Reconciled against the layers the chart draws whenever it is read.
 */
export interface StoredLayers {
  /** Back to front, where the reader moved a layer. */
  order?: ChartLayerId[]
  hidden?: ChartLayerId[]
  /** In percent, only where below 100. */
  opacity?: Partial<Record<ChartLayerId, number>>
  options?: Partial<Record<LayerOptionId, boolean>>
  /** The form a layer is drawn in, only where it is not its own first. */
  forms?: Partial<Record<ChartLayerId, PriceForm>>
}

/** The rows a panel keeps, and the run they were kept for — under any other they count for nothing. */
export interface StoredRows {
  /** The run the keys were kept for, as the panel's own model names it. */
  scope: string
  /** Each list's keys, oldest first. */
  keys: Partial<Record<ViewRowList, string[]>>
}

/**
 * What one panel keeps of HOW it shows its content, under its dock id: a section keeps one entry,
 * in the bundle's column and as a panel of its own alike. Never WHAT is shown — that is the link's,
 * and nothing here repeats it. Only what differs from a default is stored.
 */
export interface StoredPanelView {
  /** Bound to no run: true shown, false hidden, against the fold's default. */
  expanded?: Partial<Record<ViewFold, boolean>>
  /** Bound to the run on show, so never part of a named layout. */
  rows?: StoredRows
  /** A chart's drawing layers, bound to no run — the Layers panel writes them under the chart's id. */
  layers?: StoredLayers
}

/** Everything stored under the one versioned key. */
export interface StoredArrangement {
  version: number
  links: Record<string, LinkContext>
  bars: Record<string, StoredFacets>
  chart: StoredChart
  runChart: StoredRunChart
  /** Where the panels stand, as the dock serialised it — reconciled by `dock_layout.ts`, never here. */
  dock: object | null
  /** Where each panel stood when it was last open, by panel id — a hidden one comes back there. */
  places: Record<string, DockPlace>
  /** Each panel's own view, by dock id — read here by shape, kept against the kinds by the dock store. */
  panelViews: Record<string, StoredPanelView>
}
