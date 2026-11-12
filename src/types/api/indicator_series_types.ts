/**
 * What a worker draws on a run's chart (contract 55): one value per closed bar of its own timeframe,
 * on the candles or in a pane of its own. Mirrors `GET /api/v1/drawing-types`, the JSON Schema of one
 * served entry, and its document `indicator-series`. Every field is served: one left unset is null,
 * a list or an object empty. The vocabularies are the backend's, so they are typed `string` with
 * their known values named beside them; the line codes are Lightweight Charts' own numbers.
 */

/** A drawing's style: a ROLE the theme colours, never a colour of its own. */
export interface DrawingStyle {
  /** `negative` · `positive` · `warning` · `annotation` · `neutral` */
  role: string
  /** Tells several drawings of one role apart — 0, 1, 2 — and means nothing beyond that. */
  series: number | null
  /** `strong` · `normal` · `quiet`, in place of a width or an opacity; null leaves it to the viewer. */
  emphasis: string | null
  /** An explicit colour; it leaves the theme and its colour-blindness check, so it may be ignored. */
  color: string | null
}

/** A plot's options in the chart library's own codes; each null where the library's default holds. */
export interface IndicatorPlotOptions {
  line_type: number | null
  line_style: number | null
  /** False draws the points without a line. */
  line_visible: boolean | null
  point_markers_visible: boolean | null
  /** A histogram's zero, which its bars grow from. */
  base: number | null
  /** The value a baseline series is split at. */
  base_value: number | null
}

/** One worker output, drawn as one series of the chart. */
export interface IndicatorPlot {
  /** The worker's output name — the key into `data`, into `filled_areas` and into the legend. */
  id: string
  /** `line` · `histogram` · `area` · `baseline` */
  kind: string
  options: IndicatorPlotOptions
  style: DrawingStyle
}

/** A horizontal reference line on the series' own scale. */
export interface IndicatorPriceLine {
  price: number
  line_style: number
  title: string | null
}

/** An area between two edges: `plot:<id>` twice or `price_line:<price>` twice, never one of each. */
export interface IndicatorFilledArea {
  /** A price edge is its shortest exact decimal — `70`, `70.5` — never in exponent form, never `70.0`. */
  between: [string, string]
  style: DrawingStyle
}

/** The scale's labels; `type` is `price` · `percent` · `volume`. */
export interface IndicatorPriceFormat {
  type: string
  precision: number
  min_move: number | null
}

/** A fixed scale, such as an RSI's 0 to 100. */
export interface IndicatorRange {
  min_value: number
  max_value: number
}

/** One series of one drawing worker, as the recorded window serves it. */
export interface IndicatorSeriesEntry {
  /**
   * Its row in a Layers panel: `worker:<instance>`, or `worker:<instance>:<name>` for a further
   * series of the same worker; its plots switch together. Unique within a unit — the window's key.
   */
  layer: string
  /** `price` draws on the candles; any other value names a pane of its own, shared by every series naming it. */
  pane: string
  /** The legend: the title, then the values of `inputs` — `RSI 14`. */
  title: string
  /** The worker's period on its timeframe as `period`, then its plain parameters in the order it declares them. */
  inputs: Record<string, boolean | number | string>
  /** The series' own timeframe, which need not be the chart's; a worker on two timeframes serves an entry for each. */
  timeframe: string
  /** Null means the symbol's own price format. */
  price_format: IndicatorPriceFormat | null
  /** Only a series in a pane of its own has one; null lets the scale follow the values. */
  range: IndicatorRange | null
  /** At least one; the first is drawn behind the others. */
  plots: IndicatorPlot[]
  price_lines: IndicatorPriceLine[]
  filled_areas: IndicatorFilledArea[]
  /** Each bar's opening instant in UTC — the instant the bars route serves for that bar. */
  times: string[]
  /**
   * Per plot id, one value per entry of `times`, belonging to the bar's close. Null where the worker
   * had no value for that bar — a gap to draw, never filled and never left out.
   */
  data: Record<string, (number | null)[]>
}
