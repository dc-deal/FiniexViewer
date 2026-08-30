import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { defineComponent } from 'vue'
import { useRunQuerySync } from '@/composables/use_run_query_sync'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'

const RUNS: RunInfo[] = [
  { run_id: '20260615_130000', group: 'autotrader',  name: 'my_profile', has_reports: true },
  { run_id: '20260615_120000', group: 'single_runs', name: 'my_set',     has_reports: true },
]

vi.mock('@/api/api_client', () => ({
  getRuns: vi.fn(),
  getRunSummary: vi.fn(),
}))

import * as apiClient from '@/api/api_client'

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

describe('useRunQuerySync', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(apiClient.getRuns).mockReset().mockResolvedValue(RUNS)
    vi.mocked(apiClient.getRunSummary).mockReset().mockResolvedValue(null)
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
    const router = makeRouter({ group: 'autotrader', name: 'my_profile', run: '20260615_130000' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const store = useRunsStore()
    expect(store.selectedGroup).toBe('autotrader')
    expect(store.selectedName).toBe('my_profile')
    expect(store.selectedRunId).toBe('20260615_130000')
    expect(apiClient.getRunSummary).toHaveBeenCalledWith('20260615_130000')
  })

  it('applies a partial cascade without inventing the levels below', async () => {
    const router = makeRouter({ group: 'single_runs' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const store = useRunsStore()
    expect(store.selectedGroup).toBe('single_runs')
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
    useRunsStore().setGroup('autotrader')
    await flushPromises()

    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query['group']).toBe('autotrader')
  })

  it('merges instead of replacing — params owned by the chart view survive', async () => {
    const router = makeRouter({ broker: 'mt5', symbol: 'EURUSD', timeframe: 'H1' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    useRunsStore().setGroup('autotrader')
    await flushPromises()

    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query).toEqual({
      broker: 'mt5',
      symbol: 'EURUSD',
      timeframe: 'H1',
      group: 'autotrader',
    })
  })

  it('drops a param again when its level is cleared', async () => {
    const router = makeRouter({ group: 'autotrader', name: 'my_profile' })
    await router.isReady()
    mount(TestComponent, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    // switching the group clears the name below it — the param must go with it
    useRunsStore().setGroup('single_runs')
    await flushPromises()

    const lastCall = replaceSpy.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(lastCall.query['group']).toBe('single_runs')
    expect(lastCall.query['name']).toBeUndefined()
  })
})
