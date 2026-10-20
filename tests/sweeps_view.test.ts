import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SweepsView from '@/views/SweepsView.vue'
import * as apiClient from '@/api/api_client'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import type { SweepDetail, SweepList } from '@/types/api/sweep_types'

import listFixture from './fixtures/sweeps_list.json'
import detailFixture from './fixtures/sweep_detail.json'

vi.mock('@/api/api_client', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/api_client')>(),
  getSweeps: vi.fn(),
  getSweep: vi.fn(),
}))

const LIST: SweepList = listFixture
const DETAIL: SweepDetail = detailFixture
const ID = DETAIL.sweep_id

let mounted: VueWrapper | null = null

function mountPanel(): VueWrapper {
  mounted = mount(SweepsView)
  return mounted
}

function heading(wrapper: VueWrapper, sweepId: string) {
  return wrapper.findAll('.sweep-list .record-group').find(group => group.find(`[data-sweep="${sweepId}"]`).exists())!
}

function places(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.sweep-list .place').map(cell => cell.text())
}

/**
 * The parameter searches as ONE list: each sweep a heading that opens to its combinations in the
 * order the route ranked them, and a combination chosen as the run list chooses a run.
 */
describe('SweepsView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(apiClient.getSweeps).mockResolvedValue(LIST)
    vi.mocked(apiClient.getSweep).mockResolvedValue(DETAIL)
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
    vi.resetAllMocks()
  })

  it('lists every sweep newest first, each a closed heading', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.findAll('.sweep-list [data-sweep]').map(head => head.attributes('data-sweep')))
      .toEqual(LIST.sweeps.map(row => row.sweep_id))
    expect(wrapper.find('.sweep-list .place').exists()).toBe(false)
    expect(apiClient.getSweep).not.toHaveBeenCalled()
  })

  it('opens a sweep to its combinations in the order served, the first starred, and makes it the one looked at', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await heading(wrapper, ID).trigger('click')
    await flushPromises()
    expect(useContextStore().main.sweep.id).toBe(ID)
    expect(wrapper.findAll('.sweep-list .run-id').map(cell => cell.text())).toEqual(DETAIL.combinations.map(row => row.run_id))
    expect(places(wrapper)[0]).toBe('1 ★')
  })

  it('brings back the sweep the link names, open', async () => {
    useContextStore().selectSweep(ID)
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.findAll('.sweep-list .run-id')).toHaveLength(DETAIL.combinations.length)
  })

  /** A combination is a run: chosen the way the run list chooses one. */
  it('chooses the run of a combination it is clicked on', async () => {
    useContextStore().selectSweep(ID)
    const selectRun = vi.spyOn(useRunsStore(), 'selectRun').mockResolvedValue()
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.findAll('.sweep-list button.record-row')[1]!.trigger('click')
    expect(selectRun).toHaveBeenCalledWith(DETAIL.combinations[1]!.run_id)
  })

  it('heads a sweep with its objective, and a word only where its ranking compares unlike things', async () => {
    useContextStore().selectSweep(ID)
    const wrapper = mountPanel()
    await flushPromises()
    const head = wrapper.find(`[data-sweep="${ID}"]`)
    expect(head.text()).toContain(`${DETAIL.objective} ${DETAIL.maximize ? '↑' : '↓'}`)
    expect(head.find('.sweep-notice').exists()).toBe(false)
  })

  it('says a linked sweep is gone, and a refused surface for what it is', async () => {
    useContextStore().selectSweep('sweep_19990101_000000')
    const gone = mountPanel()
    await flushPromises()
    expect(gone.text()).toContain('The sweep you had open is no longer in the ledger')
    gone.unmount()
    mounted = null

    setActivePinia(createPinia())
    vi.mocked(apiClient.getSweeps).mockRejectedValue(new SurfaceForbiddenError('sweeps'))
    const refused = mountPanel()
    await flushPromises()
    expect(refused.text()).toContain('This viewer has no access to sweep data')
  })
})
