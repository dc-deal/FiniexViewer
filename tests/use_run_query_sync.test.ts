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
    has_reports: true,
    start_time: '2026-06-15T12:00:00+00:00',
    parent_id: null,
    parent_kind: null,
    config_id: '',
    reporting: 'expected',
    size_bytes: 0,
    app_version: '1.4.0',
    git_commit: 'abc1234',
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

  it('restores the whole cascade from the URL', async () => {
    const router = makeRouter({ group: 'live', name: 'my_profile', run: '20260615_130000' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const store = useRunsStore()
    expect(store.selectedGroup).toBe('live')
    expect(store.selectedName).toBe('my_profile')
    expect(store.selectedRunId).toBe('20260615_130000')
    expect(apiClient.getRunSummary).toHaveBeenCalledWith('20260615_130000')
  })

  it('takes the cascade from the run, not from the link — a stale group heals itself', async () => {
    // 'autotrader' was a group value the backend has since renamed. A saved link still carries it,
    // and the run it names is the authority for where that run belongs.
    const router = makeRouter({ group: 'autotrader', name: 'stale_name', run: '20260615_130000' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const store = useRunsStore()
    expect(store.selectedGroup).toBe('live')
    expect(store.selectedName).toBe('my_profile')
    expect(store.selectedRunId).toBe('20260615_130000')
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
    expect(store.selectedUnit).toBe('ETHUSD_blocks_03')
  })

  // A unit narrows a run's sections; with no run there is nothing for it to narrow.
  it('ignores a scenario param that names no run', async () => {
    const router = makeRouter({ unit: 'ETHUSD_blocks_03' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(useRunsStore().selectedUnit).toBeNull()
  })

  it('writes the scenario narrowing into the URL, and removes it again', async () => {
    const router = makeRouter({ run: '20260615_120000' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    const store = useRunsStore()

    store.setUnit('ETHUSD_blocks_03')
    await flushPromises()
    let query = (replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }).query
    expect(query['unit']).toBe('ETHUSD_blocks_03')

    store.setUnit(null)
    await flushPromises()
    query = (replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }).query
    expect(query['unit']).toBeUndefined()
  })

  it('applies a partial cascade without inventing the levels below', async () => {
    const router = makeRouter({ group: 'simulation' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const store = useRunsStore()
    expect(store.selectedGroup).toBe('simulation')
    expect(store.selectedName).toBeNull()
    expect(store.selectedRunId).toBeNull()
    expect(apiClient.getRunSummary).not.toHaveBeenCalled()
  })

  it('writes the selection into the URL after init', async () => {
    const router = makeRouter()
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    useRunsStore().setGroup('live')
    await flushPromises()

    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query['group']).toBe('live')
  })

  it('merges instead of replacing — params owned by the chart view survive', async () => {
    const router = makeRouter({ broker: 'mt5', symbol: 'EURUSD', timeframe: 'H1' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    useRunsStore().setGroup('live')
    await flushPromises()

    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query).toEqual({
      broker: 'mt5',
      symbol: 'EURUSD',
      timeframe: 'H1',
      group: 'live',
    })
  })

  it('drops a param again when its level is cleared', async () => {
    const router = makeRouter({ group: 'live', name: 'my_profile' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    // switching the group clears the name below it — the param must go with it
    useRunsStore().setGroup('simulation')
    await flushPromises()

    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query['group']).toBe('simulation')
    expect(lastCall.query['name']).toBeUndefined()
  })
})
