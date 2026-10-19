import type { FigureCard, Polarity } from '@/types/figure_types'

/**
 * Why a unit of a run cannot be drawn on the run chart. A code, not a sentence: the words are the
 * view's (`t()` reaches them there).
 *
 * `no-ticks`   the unit processed no tick — a scenario that failed before its first one
 * `no-market`  nothing names the broker and symbol the unit traded
 */
export type ChartUnitBlock = 'no-ticks' | 'no-market'

/** One unit of a run as the run chart can draw it — or says why it cannot. */
export interface ChartUnit {
  name: string
  broker: string | null
  symbol: string | null
  /** ISO-8601, the start of the span the unit's ticks covered. */
  from: string | null
  /** ISO-8601, or null where the window is OPEN — a session runs on to the end of the coverage. */
  to: string | null
  /** The unit's rows in the trade history. */
  trades: number
  block: ChartUnitBlock | null
}

/**
 * Where a trade opened or closed, on its candle. The ROLE is what the chart colours by — the shape
 * and the text carry the meaning on their own, so the colour only reinforces it.
 */
export interface ChartMark {
  /** UTC seconds: the OPEN of the bar the event fell in, which is how the bars are stamped. */
  time: number
  position: 'aboveBar' | 'belowBar'
  shape: 'arrowUp' | 'arrowDown' | 'circle'
  role: 'entry' | Polarity
  text: string
  /** A mark of the position the reader is looking at — drawn larger. */
  focused: boolean
  /** What the chart library reports while the pointer rests on the mark — the key of its card. */
  id: string
  /** What the mark is, said at the pointer: which position, and how it opened or ended. */
  card: FigureCard
}
