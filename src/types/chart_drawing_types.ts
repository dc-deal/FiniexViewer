import type { FigureCard, Polarity } from '@/types/figure_types'
import type { ChartMark } from '@/types/run_chart_types'

/**
 * What a chart draws for itself beside its candles (viewer#41), in testingide#379's vocabulary: a
 * `segment` is a price held from one time to another, a `line` joins two points, and a marker is a
 * mark on a bar — the run chart's `ChartMark`. Every drawing carries the id the chart reports under
 * the pointer and the card it shows there. A time is the OPEN of a bar drawn, in UTC seconds.
 */

/**
 * A set of drawings switched as one — a *drawing layer* in FiniexTestingIDE's glossary (contract
 * 35): the trades' marks, the levels of the position in focus, and the line from its entry to its exit.
 * Ours, so a closed set — a name read back from storage is checked against it; `layer_registry.ts`
 * describes each and says which chart draws which.
 */
export const CHART_LAYER_IDS = ['levels', 'entry-exit', 'trades'] as const
export type ChartLayerId = typeof CHART_LAYER_IDS[number]

/** What a drawing's colour says — a role, never a colour; the shape and the word say it first. */
export type DrawingRole = Polarity | 'mixed' | 'entry'

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

export type ChartDrawing = ChartMark | SegmentDrawing | LineDrawing

/** One layer: its drawings, drawn in list order — a later layer stands in front of an earlier one. */
export interface ChartLayer {
  id: ChartLayerId
  drawings: ChartDrawing[]
  /** Drawn at this share of its strength (0–1), so the layers in front read first — set in the Layers panel. */
  opacity?: number
}
