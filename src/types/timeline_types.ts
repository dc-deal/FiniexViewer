import type { RouteLocationRaw } from 'vue-router'

/**
 * One drawn span. `from` and `to` are positions on the CALLER's scale — the chart does not know
 * whether they are instants, tick indices or anything else, which is what keeps one component
 * usable for a run's ledger and for a deployment's whole life.
 */
export interface TimelineSpan {
  id: string
  from: number
  to: number
  label: string
  /**
   * What to write on a span too narrow for `label`. A bar can be a sliver of the plot, and a label
   * clipped mid-word reads as a rendering fault rather than as a small bar. Nothing is lost by
   * dropping it: the hover card carries every figure either way.
   */
  shortLabel?: string
  /** Polarity, never rank: 'positive' | 'negative' | 'flat'. */
  tone: string
  /** One line naming the span, shown as the tooltip's heading. */
  title: string
  /**
   * The span's figures, for the hover layer. Label and value are already rendered by the caller —
   * the chart formats nothing, because it does not know what any of these mean. `tone` colours the
   * value ('positive' | 'negative'), and is left empty where a figure has no polarity.
   */
  details?: { label: string, value: string, tone?: string }[]
}

/** One horizontal lane. What a lane MEANS is the caller's decision, never the chart's. */
export interface TimelineLane {
  id: string
  label: string
  /** Where the lane's label leads, when the thing it names can be opened. Plain text otherwise. */
  to?: RouteLocationRaw
  spans: TimelineSpan[]
}
