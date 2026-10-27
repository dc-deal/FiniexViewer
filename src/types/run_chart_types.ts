import type { OrderHistoryRow } from '@/types/api/report_types'
import type { Figure, FigureCard, Polarity } from '@/types/figure_types'

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
  /** The positions the unit opened — its executed openings in the order history. */
  openings: number
  block: ChartUnitBlock | null
}

/**
 * An executed opening of the order history that names its position, its instant, its direction,
 * its price and its lots — every one measured does (2026-10-19, 1,448 of them over 110 runs). The
 * nullable fields are null on the rows that did not execute.
 */
export interface Opening extends OrderHistoryRow {
  position_id: string
  event_time: string
  direction: string
  executed_price: number
  executed_lots: number
}

/**
 * Where a position opened or a trade closed, on its candle — or, GATHERED, several of one kind that
 * stand closer than a mark is wide. The ROLE is what the chart colours by — the shape and the text
 * carry the meaning on their own, so the colour only reinforces it. `mixed` is a gathered mark of
 * exits whose results point different ways.
 */
export interface ChartMark {
  /** What it is among a chart's drawings — beside a `segment` and a `line`. */
  kind: 'marker'
  /** UTC seconds: the OPEN of the bar the event fell in, which is how the bars are stamped. */
  time: number
  /** UTC seconds: the instant of the event itself — of the first one, for a gathered mark. */
  at: number
  position: 'aboveBar' | 'belowBar'
  shape: 'arrowUp' | 'arrowDown' | 'circle'
  role: 'entry' | Polarity | 'mixed'
  text: string
  /** A mark of the position the reader is looking at — drawn larger, and never gathered. */
  focused: boolean
  /** What the chart library reports while the pointer rests on the mark — the key of its card. */
  id: string
  /** What the mark is, said at the pointer: which position, and how it opened or ended. */
  card: FigureCard
  /** The mark in one line — its row in the card of a gathered mark. */
  line: Figure
  /** How many marks a gathered mark stands for. Absent on a single one. */
  count?: number
}

/**
 * A finer timeframe that draws apart the marks some candles hold together — offered only where it
 * does, and only within what the route serves at once. `at` is the first of those candles, in UTC
 * seconds, where the chart centres when the offer is taken.
 */
export interface TimeframeOffer {
  timeframe: string
  /** The candles that hold several marks of one kind at the timeframe drawn. */
  candles: number
  /** How many of them the offered timeframe draws apart. */
  apart: number
  at: number
}

/**
 * What the volume layer counts: the traded volume where the venue prints trades, its ticks per bar
 * where it does not. Ours, chosen from the bars' `X-Bar-Price-Basis`.
 */
export type VolumeBasis = 'traded' | 'ticks'

/** The volume layer as the chart draws it — one value a bar, coloured by the candle's direction. */
export interface ChartVolume {
  basis: VolumeBasis
  shown: boolean
  /** The share of its strength it is drawn at, 0–1 — set in the Layers panel. */
  opacity: number
  bars: { time: number, value: number, rising: boolean }[]
}
