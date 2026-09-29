import { nextTick } from 'vue'
import type { LocationQuery, Router } from 'vue-router'

/**
 * Current query as plain strings. Array-valued and null params are dropped — no view uses them,
 * and carrying them through a merge would change their type on the way back out.
 */
export function readQuery(query: LocationQuery): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') result[key] = value
  }
  return result
}

/**
 * Writes one param into a query object, removing it when the value is null. Mutates in place —
 * callers start from readQuery so params owned by other views survive the write.
 */
export function writeParam(query: Record<string, string>, key: string, value: string | null): void {
  if (value === null) {
    delete query[key]
    return
  }
  query[key] = value
}

/**
 * The ONE writer to the URL, coalescing everything a tick produces into a single navigation.
 *
 * Four independent things now own params in one query — the chart selection, the run and its
 * scenarios, and a facet bar on each of the two lists. Each read the query, changed its own key and
 * called `router.replace`, which is correct alone and wrong together: `route.query` only updates
 * once a navigation RESOLVES, so two writers firing in the same flush both read the state before
 * either wrote, and the second one's object — built without the first one's key — wins.
 *
 * That is reachable, not theoretical: choosing a run writes `run`, and the same change clears the
 * roster's facets, which writes `unitf`. Whichever lost would have dropped the other's param.
 *
 * So writers state a PATCH and this applies them together, against the live query, once per tick.
 * A later patch for the same key wins, which is what a caller means by writing twice.
 */
let _pending: Record<string, string | null> = {}
let _scheduled = false

export function patchQuery(router: Router, patch: Record<string, string | null>): void {
  Object.assign(_pending, patch)
  if (_scheduled) return
  _scheduled = true
  void nextTick(() => {
    const applied = _pending
    _pending = {}
    _scheduled = false
    const query = readQuery(router.currentRoute.value.query)
    for (const [key, value] of Object.entries(applied)) writeParam(query, key, value)
    void router.replace({ query })
  })
}
