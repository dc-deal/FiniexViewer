import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'

const KEY = 'arrangement.v1'
const RUN = '20261012_074826_88026ae2'
const MARK = { scenario: 'EURGBP_partial_close', position: 'pos_eurgbp_1' }

/** What a NEW tab finds: the last arrangement saved, and nothing of its own yet. */
function store(value: unknown): void {
  sessionStorage.removeItem(KEY)
  localStorage.setItem(KEY, JSON.stringify(value))
}

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown>
}

describe('useArrangementStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('restores the stored selection into the context the moment it is created', () => {
    store({
      version: 1,
      links: { A: { run: { id: RUN, units: ['EURGBP_partial_close'], position: MARK }, deployment: { id: null }, market: { broker: 'mt5', symbol: 'EURUSD' } } },
      bars: {},
      chart: { timeframe: 'H1' },
    })
    const arrangement = useArrangementStore()
    const context = useContextStore()
    expect(context.main.run).toEqual({ id: RUN, units: ['EURGBP_partial_close'], position: MARK })
    expect(context.main.market).toEqual({ broker: 'mt5', symbol: 'EURUSD' })
    expect(arrangement.chart.timeframe).toBe('H1')
  })

  it('writes every change of the selection back', async () => {
    useArrangementStore()
    useContextStore().selectRun(RUN)
    await nextTick()
    expect((stored()['links'] as Record<string, { run: { id: string } }>)['A']!.run.id).toBe(RUN)
  })

  /** Never trusted as it is: whatever does not have the right shape is left empty, field by field. */
  it('reconciles a damaged entry instead of trusting it', () => {
    store({
      version: 1,
      links: { A: { run: { id: 42, units: ['ok', 7], position: { scenario: 'only half' } } } },
      bars: { run: { selection: { purpose: ['regular', 3] }, search: 9, sort: 'oldest' } },
    })
    const arrangement = useArrangementStore()
    expect(useContextStore().main.run).toEqual({ id: null, units: ['ok'], position: null })
    expect(arrangement.bars['run']).toEqual({ selection: { purpose: ['regular'] }, search: '', sort: 'oldest', scope: null })
    expect(arrangement.chart).toEqual({ timeframe: null })
  })

  it('removes an entry of another schema rather than converting it', () => {
    store({ version: 0, links: { A: { run: { id: RUN } } } })
    useArrangementStore()
    expect(useContextStore().main.run.id).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('starts empty where the entry cannot be read at all', () => {
    localStorage.setItem(KEY, '{not json')
    useArrangementStore()
    expect(useContextStore().main.run.id).toBeNull()
  })

  /** Where the chart selection was kept before — removed, and never read. */
  it('removes the keys the chart selection used to live under', () => {
    localStorage.setItem('sel.broker', 'mt5')
    localStorage.setItem('sel.symbol', 'EURUSD')
    localStorage.setItem('sel.timeframe', 'H1')
    useArrangementStore()
    expect(['sel.broker', 'sel.symbol', 'sel.timeframe'].map(key => localStorage.getItem(key)))
      .toEqual([null, null, null])
    expect(useContextStore().main.market.broker).toBeNull()
  })

  /** Absent means the default applies; empty means the reader cleared it — the two must survive a reload apart. */
  it('keeps a cleared bar apart from an untouched one across a reload', async () => {
    const arrangement = useArrangementStore()
    arrangement.setFacets('run', { selection: {}, search: '', sort: 'newest' })
    arrangement.setFacets('dep', { search: '', sort: 'newest' })
    await nextTick()

    setActivePinia(createPinia())
    const reloaded = useArrangementStore()
    expect(reloaded.bars['run']!.selection).toEqual({})
    expect('selection' in reloaded.bars['dep']!).toBe(false)
  })

  /** Where a hidden panel stood survives a reload, read field by field like everything else. */
  it('keeps where each panel stood across a reload, and drops a place that names nothing', async () => {
    const arrangement = useArrangementStore()
    arrangement.setPlaces({
      'report-orders': { besides: ['report-trade-history'], direction: 'within', index: 1 },
      chart: { besides: ['runs'], direction: 'right', size: 520 },
    })
    await nextTick()
    const raw = stored()
    raw['places'] = {
      ...(raw['places'] as object),
      nowhere: { besides: [], direction: 'right' },
      sideways: { besides: ['runs'], direction: 'diagonal' },
      'odd-size': { besides: ['runs'], direction: 'left', size: -3 },
    }
    store(raw)

    setActivePinia(createPinia())
    const places = useArrangementStore().places
    expect(places['report-orders']).toEqual({ besides: ['report-trade-history'], direction: 'within', index: 1 })
    expect(places['chart']).toEqual({ besides: ['runs'], direction: 'right', size: 520 })
    expect(places['nowhere']).toBeUndefined()
    expect(places['sideways']).toBeUndefined()
    expect(places['odd-size']).toEqual({ besides: ['runs'], direction: 'left' })
  })
})
