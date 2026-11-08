import type { FigureCard, Polarity } from '@/types/figure_types'
import type { ChartMark } from '@/types/run_chart_types'

/**
 * What a chart draws for itself beside its candles (viewer#41), in testingide#379's vocabulary: a
 * `segment` is a price held from one time to another, a `line` joins two points, and a marker is a
 * mark on a bar — the run chart's `ChartMark`; a `time` is ours, a moment marked over the whole height,
 * until #379 names one. Every drawing carries the id the chart reports under
 * the pointer and the card it shows there. A time is the OPEN of a bar drawn, in UTC seconds.
 */

/**
 * A set of drawings switched as one — a *drawing layer* in FiniexTestingIDE's glossary (contract
 * 35): the trades' marks, the levels of the position in focus, the line from its entry to its exit,
 * and in the time lane along the bottom the booking periods and the orders refused or expired.
 * Ours, so a closed set — a name read back from storage is checked against it; `layer_registry.ts`
 * describes each and says which chart draws which.
 */
export const CHART_LAYER_IDS = [
  'levels', 'entry-exit', 'trades', 'state-frame', 'periods', 'refusals', 'volume', 'candles',
] as const
export type ChartLayerId = typeof CHART_LAYER_IDS[number]

/**
 * The layers the chart's own drawing host paints. The candles and the volume are layers to the
 * reader — shown, hidden, fainter — but the chart library draws them, as series of their own.
 */
export type DrawingLayerId = Exclude<ChartLayerId, 'volume' | 'candles'>

/**
 * What a drawing's colour says — a role, never a colour; the shape and the word say it first. `warning`
 * is an order refused: something to weigh before trusting what is beside it.
 */
export type DrawingRole = Polarity | 'mixed' | 'entry' | 'annotation' | 'warning'

/**
 * A price held from one bar to another — a stop loss, a target. `to` null: to the window's edge.
 * `from` equal to `to`: known at that bar alone, drawn as a short stroke ending there — nothing is
 * claimed for the time before it.
 */
export interface SegmentDrawing {
  kind: 'segment'
  id: string
  from: number
  to: number | null
  price: number
  /** The word the segment carries where it starts — `SL`, `TP`. */
  label: string
  role: DrawingRole
  /** Of the position looked at — only its levels put their price on the axis. */
  focused: boolean
  card: FigureCard
}

/** Two points joined — where a trade entered and where it left. */
export interface LineDrawing {
  kind: 'line'
  id: string
  from: { time: number, price: number }
  to: { time: number, price: number }
  role: DrawingRole
  card: FigureCard
}

/** A moment over the whole height of the chart, dashed — the state frame on show. */
export interface TimeDrawing {
  kind: 'time'
  id: string
  time: number
  role: DrawingRole
  card: FigureCard
}

/**
 * A stretch of time in the TIME LANE along the bottom of the pane, where no price is claimed — a
 * booking period, from the bar it opened in to the bar it closed in. Ours, until testingide#379 names
 * one. Its `label` is its sign, drawn where it fits; hovered, its two bounds run dashed through the
 * candles.
 */
export interface SpanDrawing {
  kind: 'span'
  id: string
  /** The open of the bar it starts in. */
  from: number
  /** The open of the bar it ends in. */
  to: number
  /** Whether it ends at that bar's open rather than inside the bar — where the next one starts. */
  endsAtOpen: boolean
  label: string
  role: DrawingRole
  card: FigureCard
}

/**
 * A moment in the time lane — an order refused or expired, which has no price to stand at, so it is
 * never drawn at an invented one (viewer#41). Gathered like the trades' marks where they would cover
 * each other, its count beside it.
 */
export interface LaneMarkDrawing {
  kind: 'lane-mark'
  id: string
  /** The open of the bar the order ended in. */
  time: number
  /** The instant it ended, in UTC seconds — of the first one, for a gathered mark. */
  at: number
  /** `cross` an order refused, `ring` one that ran out without filling. */
  shape: 'cross' | 'ring'
  /** Its count where it stands for several — `×3` — or empty. */
  text: string
  role: DrawingRole
  card: FigureCard
}

export type ChartDrawing = ChartMark | SegmentDrawing | LineDrawing | TimeDrawing | SpanDrawing | LaneMarkDrawing

/** One layer: its drawings, drawn in list order — a later layer stands in front of an earlier one. */
export interface ChartLayer {
  id: DrawingLayerId
  drawings: ChartDrawing[]
  /** Drawn at this share of its strength (0–1), so the layers in front read first — set in the Layers panel. */
  opacity?: number
  /**
   * Switched off in the Layers panel: neither painted nor found under the pointer, but its marks
   * keep their room above and below the candles — so switching a layer never rescales the chart.
   */
  hidden?: boolean
}
