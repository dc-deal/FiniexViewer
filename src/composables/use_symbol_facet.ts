import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { applyFacets } from '@/components/base/facet_filter'
import { useFacetState } from '@/composables/use_facet_state'
import type { FacetDefinition, FacetSelection, SortDefinition } from '@/types/facet_types'
import { t } from '@/translate'

/** A report row that says which unit it belongs to and which instrument it traded. */
interface SymbolRow {
  scenario_name: string
  symbol: string
}

export interface SymbolFacet<T> {
  facets: FacetDefinition<T>[]
  /** One: the rows stay in the order they were served, so the bar offers no sort. */
  sorts: SortDefinition<T>[]
  selection: Ref<FacetSelection>
  sort: Ref<string>
  /** Whether the bar is offered: the rows carry two symbols or more, or a narrowing stands. */
  offered: ComputedRef<boolean>
  /** Whether symbols are picked. */
  narrowing: ComputedRef<boolean>
  /** The rows of the symbols picked, in the order served — all of them where none is picked. */
  kept: ComputedRef<T[]>
  /**
   * The units the narrowing took rows of: their served totals are the whole unit's, not those of the
   * rows on show, and the heading says so rather than adding the rows up.
   */
  cut: ComputedRef<ReadonlySet<string>>
}

function perUnit(rows: SymbolRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.scenario_name, (counts.get(row.scenario_name) ?? 0) + 1)
  return counts
}

/**
 * The symbol filter of a report table (viewer#36): a facet bar over its rows by the instrument they
 * traded, kept with the arrangement for the run on show — a narrowing made for another run is dropped,
 * as the scenario roster's is. Where every row trades one symbol there is nothing to choose, and no
 * bar is offered. It narrows the rows the scenario selection left: the two stack.
 *
 * @param bar The bar's own entry in the arrangement, one per table.
 * @param rows The rows to narrow, as the table holds them after the scenario selection.
 * @param run The run the rows belong to — what a stored narrowing is made for.
 */
export function useSymbolFacet<T extends SymbolRow>(bar: string, rows: () => T[], run: () => string | null): SymbolFacet<T> {
  const facets: FacetDefinition<T>[] = [{ id: 'symbol', label: t('Symbol'), valuesOf: row => [row.symbol] }]
  const sorts: SortDefinition<T>[] = [{ id: 'served', label: t('As served'), compare: () => 0 }]
  const { selection, sort } = useFacetState(bar, 'served', { scope: run })

  const narrowing = computed(() => (selection.value['symbol'] ?? []).length > 0)
  const offered = computed(() => narrowing.value || new Set(rows().map(row => row.symbol)).size > 1)
  const kept = computed(() => applyFacets({ rows: rows(), definitions: facets, selection: selection.value }))
  const cut = computed<ReadonlySet<string>>(() => {
    if (!narrowing.value) return new Set()
    const left = perUnit(kept.value)
    return new Set([...perUnit(rows())].filter(([unit, count]) => (left.get(unit) ?? 0) < count).map(([unit]) => unit))
  })

  return { facets, sorts, selection, sort, offered, narrowing, kept, cut }
}
