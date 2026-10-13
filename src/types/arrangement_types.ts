import type { FacetSelection } from '@/types/facet_types'
import type { LinkContext } from '@/types/context_types'

/**
 * One facet bar's state, as it is stored.
 *
 * `selection` ABSENT means the reader never touched the bar, so its default narrowing applies; an
 * EMPTY selection means they cleared it, and that is kept — a reload shows what they last saw.
 * `scope` names what a narrowing was made for, such as the run a scenario roster belongs to: a
 * narrowing stored for another scope is dropped on the way in, its sort kept.
 */
export interface StoredFacets {
  selection?: FacetSelection
  search: string
  sort: string
  scope?: string | null
}

/** What the free chart keeps for itself rather than sharing through a link. */
export interface StoredChart {
  timeframe: string | null
}

/** Everything stored under the one versioned key. */
export interface StoredArrangement {
  version: number
  links: Record<string, LinkContext>
  bars: Record<string, StoredFacets>
  chart: StoredChart
  /** Where the panels stand, as the dock serialised it — reconciled by `dock_layout.ts`, never here. */
  dock: object | null
}
