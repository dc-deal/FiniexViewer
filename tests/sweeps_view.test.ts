import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import SweepsView from '@/views/SweepsView.vue'
import SweepRanking from '@/components/sweeps/SweepRanking.vue'
import * as apiClient from '@/api/api_client'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import { useContextStore } from '@/stores/context_store'
import { provideTestOpenInContext } from './open_in_context_harness'
import type { TestOpenInContext } from './open_in_context_harness'
import type { SweepCombination, SweepDetail, SweepList, SweepRow } from '@/types/api/sweep_types'

import listFixture from './fixtures/sweeps_list.json'
import detailFixture from './fixtures/sweep_detail.json'

vi.mock('@/api/api_client', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/api_client')>(),
  getSweeps: vi.fn(),
  getSweep: vi.fn(),
}))

const LIST: SweepList = listFixture
const DETAIL: SweepDetail = detailFixture
// read from the capture rather than transcribed, so a re-capture cannot strand it
const SWEEP: SweepRow = LIST.sweeps.find(row => row.sweep_id === DETAIL.sweep_id)!

let mounted: VueWrapper | null = null

/** The panel under a host that records where it sent the reader. */
function mountPanel(): { wrapper: VueWrapper, way: TestOpenInContext } {
  let way!: TestOpenInContext
  const Host = defineComponent({
    setup() {
      way = provideTestOpenInContext()
      return () => h(SweepsView)
    },
  })
  mounted = mount(Host)
  return { wrapper: mounted, way }
}

/** The ranking alone, for the cases the capture does not hold. */
function mountRanking(detail: Partial<SweepDetail>, sweep: Partial<SweepRow> = {}): { wrapper: VueWrapper, way: TestOpenInContext } {
  let way!: TestOpenInContext
  const Host = defineComponent({
    setup() {
      way = provideTestOpenInContext()
      return () => h(SweepRanking, { sweep: { ...SWEEP, ...sweep }, detail: { ...DETAIL, ...detail } })
    },
  })
  mounted = mount(Host)
  return { wrapper: mounted, way }
}

function combination(fields: Partial<SweepCombination>): SweepCombination {
  return { ...DETAIL.combinations[0]!, ...fields }
}

function places(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.ranking-list .place').map(cell => cell.text())
}

/**
 * The parameter searches: the list of sweeps, then the chosen one's combinations in the order the
 * route ranked them — nothing re-sorted here — with notices only where the ranking compares unlike.
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

  it('lists every sweep newest first, and folds the list to one line once one is picked', async () => {
    const { wrapper } = mountPanel()
    await flushPromises()
    expect(wrapper.findAll('.sweep-list .sweep-id').map(cell => cell.text())).toEqual(LIST.sweeps.map(row => row.sweep_id))
    expect(wrapper.text()).toContain('Pick a sweep to see its combinations, best first')

    const index = LIST.sweeps.indexOf(SWEEP)
    await wrapper.findAll('.sweep-list button.record-row')[index]!.trigger('click')
    await flushPromises()
    expect(useContextStore().main.sweep.id).toBe(SWEEP.sweep_id)
    expect(wrapper.find('.sweep-list').exists()).toBe(false)
    expect(wrapper.find('.picker-chosen').text()).toContain(SWEEP.sweep_id)
    expect(wrapper.find('.picker-chosen').text()).toContain('Change sweep')
  })

  it('brings back the sweep the link names, its ranking in the order served', async () => {
    useContextStore().selectSweep(SWEEP.sweep_id)
    const { wrapper } = mountPanel()
    await flushPromises()
    expect(wrapper.findAll('.ranking-list .run-id').map(cell => cell.text())).toEqual(DETAIL.combinations.map(row => row.run_id))
    expect(places(wrapper)[0]).toBe('1 ★')
    expect(places(wrapper).slice(1)).toEqual(DETAIL.combinations.slice(1).map((_, index) => String(index + 2)))
  })

  it('says how the ranking was ordered — by the objective the sweep declared — and says nothing more where all is well', async () => {
    useContextStore().selectSweep(SWEEP.sweep_id)
    const { wrapper } = mountPanel()
    await flushPromises()
    expect(wrapper.find('.ranked-by').text()).toContain("the sweep's own objective")
    expect(wrapper.findAll('.sweep-ranking .notice')).toHaveLength(0)
  })

  it('opens the run of a combination it is clicked on', async () => {
    useContextStore().selectSweep(SWEEP.sweep_id)
    const { wrapper, way } = mountPanel()
    await flushPromises()
    await wrapper.findAll('.ranking-list button.record-row')[1]!.trigger('click')
    expect(way.opened).toEqual([{ what: 'run', id: DETAIL.combinations[1]!.run_id }])
  })

  it('says a stored sweep is gone, and a refused surface for what it is', async () => {
    useContextStore().selectSweep('sweep_19990101_000000')
    const gone = mountPanel()
    await flushPromises()
    expect(gone.wrapper.text()).toContain('The sweep you had open is no longer in the ledger')
    gone.wrapper.unmount()

    setActivePinia(createPinia())
    vi.mocked(apiClient.getSweeps).mockRejectedValue(new SurfaceForbiddenError('sweeps'))
    const refused = mountPanel()
    await flushPromises()
    expect(refused.wrapper.text()).toContain('This viewer has no access to sweep data')
  })
})

describe('SweepRanking', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  /** Expectancy is a mean R: the count it rests on stands beside it, and its column is the one marked. */
  it('heads the objective\'s column with the direction, and puts the R count beside an R objective', () => {
    const { wrapper } = mountRanking({ objective: 'expectancy', maximize: true })
    const heads = wrapper.findAll('.record-head > span').map(cell => cell.text())
    expect(heads).toContain('Expectancy ▼')
    expect(heads).toContain('R trades')
    expect(heads).toContain('Net P&L')
  })

  /** Under another objective that column is the objective's own, and the R count explains nothing. */
  it('does not print the objective twice, nor the R count under an objective in money', () => {
    const { wrapper } = mountRanking({ objective: 'net_pnl', maximize: true })
    const heads = wrapper.findAll('.record-head > span').map(cell => cell.text())
    expect(heads.filter(head => head.startsWith('Net P&L'))).toEqual(['Net P&L ▼'])
    expect(heads).not.toContain('R trades')
  })

  it('names each parameter by the last part of its key, the whole key on its title', () => {
    const { wrapper } = mountRanking({ combinations: [combination({ sweep_params: { 'decision_logic_config.sl_mult': 0.8, 'decision_logic_config.tp_mult': 1.5 } })] })
    const cell = wrapper.findAll('.ranking-list .record-row > span')[1]!
    expect(cell.text()).toBe('sl_mult 0.8 · tp_mult 1.5')
    expect(cell.attributes('title')).toContain('decision_logic_config.sl_mult 0.8')
  })

  /** Ranked within each account currency: one ranking each, each starting at its own first. */
  it('ranks each account currency apart, each under its own heading', () => {
    const rows = [
      combination({ run_id: 'run_a', currency: 'USD' }),
      combination({ run_id: 'run_b', currency: 'USD', expectancy: 1 }),
      combination({ run_id: 'run_a', currency: 'EUR' }),
    ]
    const { wrapper } = mountRanking({ combinations: rows })
    expect(wrapper.findAll('.currency-heading').map(head => head.text())).toEqual(['USD', 'EUR'])
    expect(places(wrapper)).toEqual(['1 ★', '2', '1 ★'])
    expect(wrapper.find('.ranked-by').text()).toContain('within each account currency')
  })

  /** A tie has no single winner: every row that ties the first on the objective shares its star. */
  it('shares the star among the rows that tie the first on the objective', () => {
    const rows = [
      combination({ run_id: 'run_a', net_pnl: 0 }),
      combination({ run_id: 'run_b', net_pnl: 0 }),
      combination({ run_id: 'run_c', net_pnl: -5 }),
    ]
    const { wrapper } = mountRanking({ objective: 'net_pnl', maximize: true, combinations: rows })
    expect(places(wrapper)).toEqual(['1 ★', '2 ★', '3'])
  })

  it('says where the sweep declared no objective, and which the backend ranked by instead', () => {
    const { wrapper } = mountRanking({ objective: 'expectancy' }, { objective: '' })
    expect(wrapper.find('.ranked-by').text()).toContain('the sweep declared none, so the backend ranked by this')
  })

  /** Only where something is off — and each says what: a failed combination, unlike code, lost records. */
  it('says what makes the ranking compare unlike things, and only then', () => {
    const rows = [
      combination({ run_id: 'run_a', logic_version: 18 }),
      combination({ run_id: 'run_b', logic_version: 17, records_pruned_at: '2026-10-19T08:00:00+00:00' }),
    ]
    const { wrapper } = mountRanking({ combinations: rows }, { error_count: 2 })
    const notices = wrapper.findAll('.notice').map(notice => notice.text())
    expect(notices.some(text => text.includes('2 combinations') && text.includes('not ranked'))).toBe(true)
    expect(notices.some(text => text.includes('logic version'))).toBe(true)
    expect(notices.some(text => text.includes('1 combination') && text.includes('prune'))).toBe(true)
  })
})
