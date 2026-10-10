import { ref, watch, onMounted } from 'vue'
import type { Ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { patchQuery, readQuery } from '@/composables/query_param_utils'
import type { FacetSelection } from '@/types/facet_types'

/**
 * A facet bar's state in the URL, so a narrowed list is a link somebody can send.
 *
 * `FacetBar` holds no state and neither does this: the three refs belong to the component, and the
 * composable only seeds them from the query and writes them back. That keeps the bar reusable and
 * puts the URL format in exactly one place.
 *
 * **Three params per bar, named after the thing the bar narrows** — `run…` for the run index,
 * `unit…` for the scenario roster, matching the `run=` and `unit=` params those two already use:
 *
 *   /runs?run=20260929_080044_c7cc7f14
 *        &runf=group:simulation;artifacts:reports&runsort=oldest&runq=tunnel
 *        &unitf=status:success;result:profit&unitsort=pnl&unitq=EUR
 *
 * A param is absent while its part of the bar is untouched, so an ordinary link stays short.
 *
 * **Why these three and not only the facets.** A search REMOVES rows, so it is a filter and belongs
 * in the URL by the same rule (§23). A sort does not change the set, but the sorts here are
 * analytical — *worst result first*, *longest tick timespan first* — and that IS what a sender
 * means to show. Panel order, collapsed sections and pinned panels stay in `localStorage`, because
 * those are how one reader arranged their screen and not what they are looking at.
 *
 * **Separators.** `facet:value,value;facet:value`. Measured 2026-09-29 over 52 distinct facet
 * values from the live run index and three scenario rosters: every one matches `[A-Za-z0-9_. ]`, so
 * none collides. A value that ever carried `,` `;` or `:` would not survive the round trip — the
 * answer then is repeated params, not an escape scheme, the same conclusion the `unit` param
 * reached.
 */
const FACET_SEPARATOR = ';'
const VALUE_SEPARATOR = ','
const PAIR_SEPARATOR = ':'

export interface FacetQuery {
  selection: Ref<FacetSelection>
  search: Ref<string>
  sort: Ref<string>
}

/** `group:simulation;artifacts:reports` → `{ group: ['simulation'], artifacts: ['reports'] }`. */
export function parseFacets(value: string): FacetSelection {
  const selection: FacetSelection = {}
  for (const group of value.split(FACET_SEPARATOR)) {
    const at = group.indexOf(PAIR_SEPARATOR)
    if (at <= 0) continue
    const id = group.slice(0, at).trim()
    const values = group.slice(at + 1).split(VALUE_SEPARATOR).map(one => one.trim()).filter(Boolean)
    if (id && values.length) selection[id] = values
  }
  return selection
}

/** The inverse. Sorted by facet id, so the same narrowing always produces the same link. */
export function formatFacets(selection: FacetSelection): string {
  return Object.keys(selection)
    .sort()
    .filter(id => (selection[id] ?? []).length)
    .map(id => `${id}${PAIR_SEPARATOR}${(selection[id] ?? []).join(VALUE_SEPARATOR)}`)
    .join(FACET_SEPARATOR)
}

/**
 * @param prefix Names the bar's three params: `<prefix>f`, `<prefix>q`, `<prefix>sort`.
 * @param defaultSort Written only when the reader has chosen something else.
 */
/**
 * `defaultSelection` is applied ONLY where the url names no facet of this bar, and it is written
 * straight back into the url — from that moment it is an ordinary selection: a chip shows it, the
 * count says what it leaves out, `clear` removes it, and a shared link means the same to everyone.
 *
 * That shape is not invented here. GitHub opens its issue list with `is:issue state:open` spelled
 * out in the search box, Jira names the saved filter above the board, Kibana shows the view's
 * query — every product with noisy rows applies a default, and every one of them expresses it in
 * the SAME visible, removable mechanism as the reader's own narrowing. What none of them does is
 * filter invisibly, which is what our own rule about selection living in the url already forbids.
 */
export function useFacetQuery(
  prefix: string,
  defaultSort: string,
  defaultSelection: FacetSelection = {}
): FacetQuery {
  const router = useRouter()
  const route = useRoute()

  const selection = ref<FacetSelection>({})
  const search = ref('')
  const sort = ref(defaultSort)

  let _ready = false

  onMounted(async () => {
    await router.isReady()
    const params = readQuery(route.query)
    const named = Boolean(params[`${prefix}f`])
    if (named) selection.value = parseFacets(params[`${prefix}f`]!)
    if (params[`${prefix}q`]) search.value = params[`${prefix}q`]!
    if (params[`${prefix}sort`]) sort.value = params[`${prefix}sort`]!
    // No write on arrival for a link that names a facet: it is not WRONG about one, so there is
    // nothing to repair — unlike `run`, whose old cascade params had to be cleaned away.
    _ready = true
    // ...but a default IS written, and the order matters: assigning after `_ready` is what lets
    // the watcher below put it in the url. Seeded silently it would be the invisible filter this
    // whole arrangement exists to avoid.
    if (!named && Object.keys(defaultSelection).length) {
      selection.value = { ...defaultSelection }
    }
  })

  watch([selection, search, sort], () => {
    if (!_ready) return
    const facets = formatFacets(selection.value)
    patchQuery(router, {
      [`${prefix}f`]: facets || null,
      [`${prefix}q`]: search.value.trim() || null,
      [`${prefix}sort`]: sort.value === defaultSort ? null : sort.value,
    })
  }, { deep: true })

  return { selection, search, sort }
}
