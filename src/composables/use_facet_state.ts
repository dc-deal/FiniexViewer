import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import type { FacetSelection } from '@/types/facet_types'

/**
 * A facet bar's state, kept with the arrangement so a reload shows the list the reader left.
 *
 * `FacetBar` holds no state and neither does this: the three refs belong to the component, and the
 * composable only seeds them from what was stored and writes them back. That keeps the bar
 * reusable and puts the stored shape in exactly one place.
 *
 * **All three are kept, not only the facets.** A search REMOVES rows, so it narrows like a facet.
 * A sort does not change the set, but the sorts here are analytical — *worst result first*,
 * *longest tick timespan first* — and that is part of what the reader was looking at.
 */
export interface FacetState {
  selection: Ref<FacetSelection>
  search: Ref<string>
  sort: Ref<string>
}

export interface FacetStateOptions {
  /**
   * Applied where the reader never touched the bar, and from then on an ordinary selection: a chip
   * shows it, the count says what it leaves out, `clear` removes it — and a CLEARED bar stays
   * cleared after a reload rather than getting the default back.
   *
   * That shape is not invented here. GitHub opens its issue list with `is:issue state:open` spelled
   * out in the search box, Jira names the saved filter above the board, Kibana shows the view's
   * query — every product with noisy rows applies a default, and every one of them expresses it in
   * the SAME visible, removable mechanism as the reader's own narrowing. What none of them does is
   * filter invisibly.
   */
  defaultSelection?: FacetSelection
  /**
   * What a narrowing is made FOR, such as the run a scenario roster belongs to. A narrowing stored
   * for another scope is dropped on the way in, and one in force is dropped when the scope moves —
   * the sort is kept in both cases, because it says how the reader likes to read, not what.
   */
  scope?: () => string | null
}

/**
 * @param bar Names the bar's entry in the arrangement — one per bar, never shared.
 * @param defaultSort The sort of a bar nobody has sorted.
 */
export function useFacetState(bar: string, defaultSort: string, options: FacetStateOptions = {}): FacetState {
  const arrangement = useArrangementStore()
  const scope = options.scope ?? (() => null)
  const defaults = (): FacetSelection => ({ ...(options.defaultSelection ?? {}) })

  const stored = arrangement.bars[bar]
  const current = stored && (stored.scope ?? null) === scope() ? stored : null

  const selection = ref<FacetSelection>(current?.selection ? { ...current.selection } : defaults())
  const search = ref(current?.search ?? '')
  const sort = ref(stored?.sort || defaultSort)

  watch(scope, () => {
    selection.value = defaults()
    search.value = ''
  })

  watch([selection, search, sort], () => {
    arrangement.setFacets(bar, {
      selection: { ...selection.value },
      search: search.value,
      sort: sort.value,
      scope: scope(),
    })
  }, { deep: true })

  return { selection, search, sort }
}
