import type { ChartLayerId } from '@/types/chart_drawing_types'

/**
 * The panes a chart stacks of its own, top to bottom — ours, so a closed set. The price pane holds
 * the candles and everything drawn on them; the volume may stand in a pane of its own below them,
 * the way TradingView and Kraken Pro draw it. A worker's series names a pane of its own by a name
 * the backend chooses (contract 55), so a pane in general is a `string`: its own below these, in the
 * order served (*pane* is testingide#379's word, never our docked *panel*).
 */
export const CHART_PANE_IDS = ['price', 'volume'] as const
export type ChartPaneId = typeof CHART_PANE_IDS[number]

/** The layer each pane draws first — the one its lever on the chart shows and hides. */
export const PANE_LAYERS: Record<ChartPaneId, ChartLayerId> = { price: 'candles', volume: 'volume' }

/**
 * How tall each pane stands against the others, by its name: the weight the chart library keeps for
 * it (its stretch factor), never pixels — a window of another height keeps the proportion. Only what
 * the reader dragged is kept; a pane not named takes its default.
 */
export type PaneWeights = Partial<Record<string, number>>

/** Where a pane stands inside the chart's frame, in pixels — what its legend is placed by. */
export interface PaneBox {
  id: string
  top: number
  height: number
}

/** One figure of a legend: its label, and its value as printed — none where nothing is drawn. */
export interface PaneLegendEntry {
  label: string
  value: string | null
}

/** A worker's series in its pane's legend: its name, then each plot's value (contract 55). */
export interface SeriesLegendLine {
  layer: string
  /** `RSI 14 · M5` — its title, its inputs, and the timeframe its values belong to. */
  title: string
  entries: PaneLegendEntry[]
}

/**
 * The lines at a pane's top left: the figures of the bar under the pointer, the last bar's
 * otherwise — the candles' or the volume's first, where the pane has them, then a line per series.
 */
export interface PaneLegend {
  pane: string
  entries: PaneLegendEntry[]
  series: SeriesLegendLine[]
}
