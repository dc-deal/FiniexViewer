import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent, nextTick } from 'vue'
import type { Router } from 'vue-router'
import { useFacetQuery, parseFacets, formatFacets } from '@/composables/use_facet_query'
import { patchQuery } from '@/composables/query_param_utils'
import type { FacetQuery } from '@/composables/use_facet_query'

function makeRouter(query: Record<string, string> = {}): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  })
  router.push({ path: '/', query })
  return router
}

/** Mounts the composable and hands back its refs, so a test can drive it as a component would. */
async function mountBar(
  router: Router,
  prefix = 'run',
  defaultSort = 'newest'
): Promise<FacetQuery> {
  let api: FacetQuery | null = null
  const Component = defineComponent({
    setup() {
      api = useFacetQuery(prefix, defaultSort)
      return () => null
    },
  })
  await router.isReady()
  mount(Component, { global: { plugins: [router] } })
  await flushPromises()
  return api as unknown as FacetQuery
}

function query(router: Router): Record<string, unknown> {
  return router.currentRoute.value.query
}

describe('facet encoding', () => {
  it('round-trips a selection', () => {
    const selection = { group: ['simulation'], artifacts: ['reports', 'logs only'] }
    expect(parseFacets(formatFacets(selection))).toEqual(selection)
  })

  // sorted by facet id, so the same narrowing always produces the same link — two readers who
  // clicked the same chips in a different order can compare what they sent each other
  it('writes the facets in a stable order whatever order they were picked in', () => {
    expect(formatFacets({ status: ['ok'], activity: ['traded'] }))
      .toBe(formatFacets({ activity: ['traded'], status: ['ok'] }))
  })

  it('leaves an empty facet out rather than writing an empty group', () => {
    expect(formatFacets({ status: [], activity: ['traded'] })).toBe('activity:traded')
  })

  // a hand-edited or truncated link must narrow by what it CAN read, not throw or narrow by junk
  it('ignores a group it cannot read', () => {
    expect(parseFacets('status:ok;nonsense;:orphan;trailing:')).toEqual({ status: ['ok'] })
  })

  it('reads a value containing a space, which real facet values do', () => {
    expect(parseFacets('artifacts:logs only')).toEqual({ artifacts: ['logs only'] })
  })
})

describe('useFacetQuery', () => {
  it('seeds the bar from the URL', async () => {
    const api = await mountBar(makeRouter({
      runf: 'group:simulation;artifacts:reports', runq: 'tunnel', runsort: 'oldest',
    }))
    expect(api.selection.value).toEqual({ group: ['simulation'], artifacts: ['reports'] })
    expect(api.search.value).toBe('tunnel')
    expect(api.sort.value).toBe('oldest')
  })

  it('starts at the default sort where the URL names none', async () => {
    const api = await mountBar(makeRouter())
    expect(api.sort.value).toBe('newest')
    expect(api.selection.value).toEqual({})
  })

  it('writes a narrowing back into the URL', async () => {
    const router = makeRouter()
    const api = await mountBar(router)
    api.selection.value = { group: ['simulation'] }
    await nextTick()
    await flushPromises()
    expect(query(router)['runf']).toBe('group:simulation')
  })

  /**
   * An untouched bar leaves no trace. Three params per bar and two bars is six, and a link that
   * carries all of them for a view nobody narrowed is a link nobody reads.
   */
  it('writes nothing while the bar is untouched, and takes its params back out again', async () => {
    const router = makeRouter()
    const api = await mountBar(router)
    expect(query(router)['runf']).toBeUndefined()
    expect(query(router)['runsort']).toBeUndefined()

    api.selection.value = { group: ['simulation'] }
    api.sort.value = 'oldest'
    await nextTick()
    await flushPromises()
    expect(query(router)['runf']).toBe('group:simulation')

    api.selection.value = {}
    api.sort.value = 'newest'
    await nextTick()
    await flushPromises()
    expect(query(router)['runf']).toBeUndefined()
    expect(query(router)['runsort']).toBeUndefined()
  })

  it('keeps params another view owns', async () => {
    const router = makeRouter({ run: '20260929_080044', unit: 'EURUSD_blocks_01' })
    await router.isReady()
    const api = await mountBar(router)
    api.search.value = 'tunnel'
    await nextTick()
    await flushPromises()
    expect(query(router)['run']).toBe('20260929_080044')
    expect(query(router)['unit']).toBe('EURUSD_blocks_01')
    expect(query(router)['runq']).toBe('tunnel')
  })

  // the prefix is what lets two bars sit in one URL without either seeing the other's params
  it('two bars in one URL do not read or overwrite each other', async () => {
    const router = makeRouter({ runf: 'group:simulation', unitf: 'status:success' })
    const runs = await mountBar(router, 'run', 'newest')
    const units = await mountBar(router, 'unit', 'name')
    expect(runs.selection.value).toEqual({ group: ['simulation'] })
    expect(units.selection.value).toEqual({ status: ['success'] })

    runs.search.value = 'tunnel'
    units.search.value = 'EUR'
    await nextTick()
    await flushPromises()
    expect(query(router)['runq']).toBe('tunnel')
    expect(query(router)['unitq']).toBe('EUR')
    expect(query(router)['runf']).toBe('group:simulation')
    expect(query(router)['unitf']).toBe('status:success')
  })
})

/**
 * The reason the writers were moved onto one patch. `route.query` only updates once a navigation
 * RESOLVES, so two writers firing in the same flush both read the state before either wrote — and
 * the second one's freshly built object, which never contained the first one's key, wins.
 *
 * It is reachable rather than theoretical: choosing a run writes `run`, and the same change clears
 * the roster's facets, which writes `unitf`.
 */
describe('patchQuery', () => {
  it('keeps both writers of one tick', async () => {
    const router = makeRouter()
    await router.isReady()
    patchQuery(router, { run: '20260929_080044' })
    patchQuery(router, { unitf: null, unitq: null })
    await nextTick()
    await flushPromises()
    expect(query(router)['run']).toBe('20260929_080044')
  })

  it('lets a later patch win for the same key', async () => {
    const router = makeRouter()
    await router.isReady()
    patchQuery(router, { run: 'first' })
    patchQuery(router, { run: 'second' })
    await nextTick()
    await flushPromises()
    expect(query(router)['run']).toBe('second')
  })

  it('leaves params nobody patched alone', async () => {
    const router = makeRouter({ broker: 'kraken_spot', symbol: 'ETHUSD' })
    await router.isReady()
    patchQuery(router, { run: '20260929_080044' })
    await nextTick()
    await flushPromises()
    expect(query(router)['broker']).toBe('kraken_spot')
    expect(query(router)['symbol']).toBe('ETHUSD')
  })
})
