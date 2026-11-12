/**
 * The panes a chart stacks, top to bottom — ours, so a closed set. The price pane holds the candles
 * and everything drawn on them; the volume may stand in a pane of its own below them, the way
 * TradingView and Kraken Pro draw it. A worker's own pane joins by name once testingide#379 serves
 * one (*pane* is that issue's word, never our docked *panel*).
 */
export const CHART_PANE_IDS = ['price', 'volume'] as const
export type ChartPaneId = typeof CHART_PANE_IDS[number]

/**
 * How tall each pane stands against the others: the weight the chart library keeps for it (its
 * stretch factor), never pixels — a window of another height keeps the proportion. Only what the
 * reader dragged is kept; a pane not named takes its default.
 */
export type PaneWeights = Partial<Record<ChartPaneId, number>>
