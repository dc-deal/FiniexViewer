import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { defineComponent } from 'vue'
import { useRunQuerySync } from '@/composables/use_run_query_sync'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'

function header(overrides: Partial<RunInfo> & Pick<RunInfo, 'run_id' | 'group' | 'name'>): RunInfo {
  return {
    artifacts: ['run_summary.json'],
    stream_files: [],
    has_reports: true,
    // contract 15 — what the run DID. null is the ledger holding nothing, distinct from []
    results: null,
    run_outcome: null,
    error_count: null,
    warning_count: null,
    log_warning_count: null,
    tick_timespan_seconds: null,
    start_time: '2026-06-15T12:00:00+00:00',
    parent_id: null,
    parent_kind: null,
    config_id: '',
    reporting: 'expected',
    size_bytes: 0,
    app_version: '1.4.0',
    git_commit: 'abc1234',
    // null on every run recorded before contract 12 — unknown, never guessed
    ticks_from: null,
    orders_to: null,
    data_windows: null,
    config_snapshot: 'config.json',
    ...overrides,
  }
}

const RUNS: RunInfo[] = [
  header({ run_id: '20260615_130000', group: 'live',       name: 'my_profile' }),
  header({ run_id: '20260615_120000', group: 'simulation', name: 'my_set' }),
]

vi.mock('@/api/api_client', () => ({
  getRuns: vi.fn(),
  getRunSummary: vi.fn(),
}))

import * as apiClient from '@/api/api_client'
import type { SectionAbsence } from '@/types/api/absence_types'

// Minimal component that activates the composable
const TestComponent = defineComponent({
  setup() { useRunQuerySync() },
  template: '<div/>',
})

function makeRouter(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  })
  router.push({ path: '/', query })
  return router
}


/**
 * What the client now answers where a section is not there: the cause and the backend's own
 * sentence, instead of the bare `null` that made four different situations look identical.
 */
const ABSENT: SectionAbsence = {
  absent: true,
  cause: 'artifact_not_produced',
  detail: 'This run does not write that section',
}

describe('useRunQuerySync', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(apiClient.getRuns).mockReset().mockResolvedValue(RUNS)
    vi.mocked(apiClient.getRunSummary).mockReset().mockResolvedValue(ABSENT)
  })

  it('loads the run index before applying params', async () => {
    const router = makeRouter()
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(apiClient.getRuns).toHaveBeenCalledTimes(1)
    expect(useRunsStore().runs).toEqual(RUNS)
  })

  it('restores the run from the URL', async () => {
    const router = makeRouter({ run: '20260615_130000' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(useRunsStore().selectedRunId).toBe('20260615_130000')
    expect(apiClient.getRunSummary).toHaveBeenCalledWith('20260615_130000')
  })

  /**
   * `group` and `name` were levels of a cascade the picker no longer has. A link saved while they
   * existed must still open the right run — and must not leave two params behind that look like
   * they still mean something.
   */
  it('opens a link saved under the old cascade, and cleans its dead params away', async () => {
    const router = makeRouter({ group: 'autotrader', name: 'stale_name', run: '20260615_130000' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const store = useRunsStore()
    expect(store.selectedRunId).toBe('20260615_130000')

    const replaceSpy = vi.spyOn(router, 'replace')
    store.toggleUnit('some_unit')
    await flushPromises()

    const query = (replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }).query
    expect(query['run']).toBe('20260615_130000')
    expect(query['group']).toBeUndefined()
    expect(query['name']).toBeUndefined()
  })

  // The scenario is one step BELOW the run in the same cascade, and selecting a run clears it.
  // Applied in the wrong order the param is silently dropped and a shared link loses its narrowing.
  it('restores the scenario narrowing, after the run that clears it', async () => {
    const router = makeRouter({ run: '20260615_120000', unit: 'ETHUSD_blocks_03' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const store = useRunsStore()
    expect(store.selectedRunId).toBe('20260615_120000')
    expect(store.selectedUnits).toEqual(['ETHUSD_blocks_03'])
  })

  // Several scenarios ride in one param, comma separated. Measured over 58 real names: every one
  // matches [A-Za-z0-9_-], so nothing in a name collides with the separator.
  it('restores a narrowing that names several scenarios', async () => {
    const router = makeRouter({
      run: '20260615_120000',
      unit: 'ETHUSD_blocks_03,ETHUSD_blocks_07',
    })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(useRunsStore().selectedUnits).toEqual(['ETHUSD_blocks_03', 'ETHUSD_blocks_07'])
  })

  // A hand-edited link is the normal case for a param like this one.
  it('survives a narrowing param with blanks and empty entries', async () => {
    const router = makeRouter({ run: '20260615_120000', unit: ' a , ,b, ' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(useRunsStore().selectedUnits).toEqual(['a', 'b'])
  })

  // A unit narrows a run's sections; with no run there is nothing for it to narrow.
  it('ignores a scenario param that names no run', async () => {
    const router = makeRouter({ unit: 'ETHUSD_blocks_03' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(useRunsStore().selectedUnits).toEqual([])
  })

  it('writes the scenario narrowing into the URL, and removes it again', async () => {
    const router = makeRouter({ run: '20260615_120000' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    const store = useRunsStore()

    store.toggleUnit('ETHUSD_blocks_03')
    store.toggleUnit('ETHUSD_blocks_07')
    await flushPromises()
    let query = (replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }).query
    expect(query['unit']).toBe('ETHUSD_blocks_03,ETHUSD_blocks_07')

    store.clearUnits()
    await flushPromises()
    query = (replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }).query
    expect(query['unit']).toBeUndefined()
  })

  it('selects nothing where the URL names no run', async () => {
    const router = makeRouter({ group: 'simulation' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const store = useRunsStore()
    expect(store.selectedRunId).toBeNull()
    expect(apiClient.getRunSummary).not.toHaveBeenCalled()
  })

  it('writes the selection into the URL after init', async () => {
    const router = makeRouter()
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    await useRunsStore().selectRun('20260615_130000')
    await flushPromises()

    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query['run']).toBe('20260615_130000')
  })

  it('merges instead of replacing — params owned by the chart view survive', async () => {
    const router = makeRouter({ broker: 'mt5', symbol: 'EURUSD', timeframe: 'H1' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    await useRunsStore().selectRun('20260615_130000')
    await flushPromises()

    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query).toEqual({
      broker: 'mt5',
      symbol: 'EURUSD',
      timeframe: 'H1',
      run: '20260615_130000',
    })
  })

  it('drops the run param again when the run is cleared', async () => {
    const router = makeRouter({ run: '20260615_130000' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    // an unknown id clears the selection — the param must go with it
    await useRunsStore().selectRun('does_not_exist')
    await flushPromises()

    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query['run']).toBeUndefined()
  })
})
