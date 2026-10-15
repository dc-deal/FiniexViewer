import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { PositionRef } from '@/types/context_types'

/**
 * The way from a trade or an order to its candles: the chart mark on a row, which points the run
 * chart at the position's unit, marks the position and brings the chart to the front.
 *
 * A channel rather than a store call for the reason `use_position_link` gives: a panel stays
 * ignorant of the workspace — of which panels exist and where they stand — so one component
 * renders for a stored run and for any other host.
 */
export interface ChartLink {
  /** Whether the run chart can draw this unit at all. Where not, the row draws no mark. */
  canShow: (scenario: string) => boolean
  /** Point the run chart at the position, mark it, and bring the chart to the front. */
  show: (ref: PositionRef) => void
}

const CHART_LINK: InjectionKey<ChartLink> = Symbol('chart-link')

export function provideChartLink(link: ChartLink): void {
  provide(CHART_LINK, link)
}

const NOWHERE: ChartLink = {
  canShow: () => false,
  show: () => {},
}

/** The link in force, or a dead one where no host supplied it — no mark is drawn then. */
export function useChartLink(): ChartLink {
  return inject(CHART_LINK, NOWHERE)
}
