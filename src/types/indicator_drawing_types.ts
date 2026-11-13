import type { IndicatorSeriesEntry } from '@/types/api/indicator_series_types'

/** A worker's layer as the backend names it — `worker:<instance>`, or `worker:<instance>:<name>`. */
export type ServedLayerId = `worker:${string}`

/** A worker's layer as the Layers panel lists it: its series, as the reader set it, and whether the timeframe on show draws it. */
export interface IndicatorLayer {
  entry: IndicatorSeriesEntry
  shown: boolean
  /** In percent, `LAYER_OPACITY_MIN` to 100. */
  opacity: number
  /** Whether the chart's timeframe can draw it: its own or a finer one. */
  drawable: boolean
}

/** One series a chart draws, and how strongly — the reader's opacity of its layer, 0 to 1. */
export interface DrawnSeries {
  entry: IndicatorSeriesEntry
  opacity: number
}

/**
 * The inks a series is drawn in, read from the theme by the chart that draws it: a canvas is
 * painted with values, so the theme reaches it only through the chart.
 */
export interface IndicatorInks {
  /** `positive` · `negative` · `warning` · `annotation` — the roles of our own of the same names. */
  roles: Partial<Record<string, string>>
  /** The inks of `neutral`, one per series of a pane in turn — what tells two workers on one pane apart. */
  neutral: string[]
  /** The quiet ink of a reference line on a series' scale. */
  quiet: string
}
