import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'
import { VIEW_ROW_CAPS } from '@/types/arrangement_types'

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
      runChart: { run: RUN, unit: 'EURGBP_partial_close', timeframe: 'M5' },
    })
    const arrangement = useArrangementStore()
    const context = useContextStore()
    expect(context.main.run).toEqual({ id: RUN, units: ['EURGBP_partial_close'], position: MARK })
    expect(context.main.market).toEqual({ broker: 'mt5', symbol: 'EURUSD' })
    expect(arrangement.chart.timeframe).toBe('H1')
    expect(arrangement.runChart).toEqual({ run: RUN, unit: 'EURGBP_partial_close', timeframe: 'M5' })
  })

  /** A link stored before sweeps had a key reads as none chosen: a field added needs no new version. */
  it('restores the chosen sweep, and reads a link stored without one as none chosen', () => {
    store({ version: 1, links: { A: { run: { id: RUN, units: [], position: null }, sweep: { id: 'sweep_20261012_210055' } } } })
    useArrangementStore()
    expect(useContextStore().main.sweep).toEqual({ id: 'sweep_20261012_210055' })

    localStorage.clear()
    setActivePinia(createPinia())
    store({ version: 1, links: { A: { run: { id: RUN, units: [], position: null } } } })
    useArrangementStore()
    expect(useContextStore().main.sweep).toEqual({ id: null })
  })

  it('writes every change of the selection back', async () => {
    useArrangementStore()
    useContextStore().selectRun(RUN)
    await nextTick()
    expect((stored()['links'] as Record<string, { run: { id: string } }>)['A']!.run.id).toBe(RUN)
  })

  /** The run chart's unit and timeframe are a choice of what is shown, and come back with the run. */
  it('writes the choice made on the run chart back, with the run it was made for', async () => {
    useArrangementStore().setRunChart({ run: RUN, unit: 'EURGBP_refusals_01', timeframe: 'M1' })
    await nextTick()
    expect(stored()['runChart']).toEqual({ run: RUN, unit: 'EURGBP_refusals_01', timeframe: 'M1' })
  })

  /** One scenario in focus at most: a stored list of several is reconciled to its first, not trusted. */
  it('keeps one scenario in focus from a stored narrowing of several', () => {
    store({ version: 1, links: { A: { run: { id: RUN, units: ['EURGBP_refusals_01', 'EURGBP_partial_close'], position: null } } } })
    useArrangementStore()
    expect(useContextStore().main.run.units).toEqual(['EURGBP_refusals_01'])
  })

  /** Never trusted as it is: whatever does not have the right shape is left empty, field by field. */
  it('reconciles a damaged entry instead of trusting it', () => {
    store({
      version: 1,
      links: { A: { run: { id: 42, units: ['ok', 7], position: { scenario: 'only half' } } } },
      bars: { run: { selection: { purpose: ['regular', 3] }, search: 9, sort: 'oldest' } },
      runChart: { run: 7, unit: 'EURGBP_refusals_01', timeframe: [] },
    })
    const arrangement = useArrangementStore()
    expect(useContextStore().main.run).toEqual({ id: null, units: ['ok'], position: null })
    expect(arrangement.bars['run']).toEqual({ selection: { purpose: ['regular'] }, search: '', sort: 'oldest', scope: null })
    expect(arrangement.chart).toEqual({ timeframe: null })
    expect(arrangement.runChart).toEqual({ run: null, unit: 'EURGBP_refusals_01', timeframe: null })
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

  /** The named layout this tab loaded and its size (viewer#37), kept across a reload; an unknown size reads as Full. */
  it('keeps the loaded layout and its size across a reload, and reads an unknown size as Full', async () => {
    useArrangementStore().setLayout('deploys', 'mobile')
    await nextTick()
    setActivePinia(createPinia())
    expect(useArrangementStore().layout).toBe('deploys')
    expect(useArrangementStore().layoutSize).toBe('mobile')

    store({ ...stored(), layoutSize: 'huge' })
    setActivePinia(createPinia())
    expect(useArrangementStore().layoutSize).toBe('full')
  })

  describe('each panel\'s own view', () => {
    /**
     * Added under version 1: an entry from before the field reads as no view kept, not as a broken
     * one — the rest of it is restored beside the empty views, which a dropped entry would not be.
     */
    it('reads an entry written before panel views as none kept, and keeps the rest of it', () => {
      store({ version: 1, links: {}, bars: {}, chart: { timeframe: 'H1' }, runChart: {} })
      const arrangement = useArrangementStore()
      expect(arrangement.panelViews).toEqual({})
      expect(arrangement.chart.timeframe).toBe('H1')
    })

    it('keeps a panel\'s view across a reload, and drops what is not one', async () => {
      const arrangement = useArrangementStore()
      arrangement.setPanelView('report-booking-periods', { expanded: { 'periods-table': true } })
      await nextTick()
      const raw = stored()
      raw['panelViews'] = {
        ...(raw['panelViews'] as object),
        deployments: { expanded: { 'periods-table': 'yes', 'no-such-fold': true } },
        'run-chart': 'open',
      }
      store(raw)

      setActivePinia(createPinia())
      expect(useArrangementStore().panelViews).toEqual({
        'report-booking-periods': { expanded: { 'periods-table': true } },
      })
    })

    /** Only what differs from a default is kept, so a view set back to it leaves no entry behind. */
    it('removes an entry left with nothing in it', async () => {
      const arrangement = useArrangementStore()
      arrangement.setPanelView('deployments', { expanded: { 'periods-table': true } })
      arrangement.setPanelView('deployments', { expanded: {} })
      await nextTick()
      expect(arrangement.panelViews).toEqual({})
      expect(stored()['panelViews']).toEqual({})
    })

    /** A `<details>` reports a toggle also when a kept value opens it: the same view writes nothing. */
    it('writes nothing for the same view again', async () => {
      const arrangement = useArrangementStore()
      arrangement.setPanelView('deployments', { expanded: { 'periods-table': true } })
      await nextTick()
      const before = arrangement.panelViews
      arrangement.setPanelView('deployments', { expanded: { 'periods-table': true } })
      expect(arrangement.panelViews).toBe(before)
    })

    it('keeps only the views of the panels the caller still knows', () => {
      const arrangement = useArrangementStore()
      arrangement.setPanelView('deployments', { expanded: { 'periods-table': true } })
      arrangement.setPanelView('retired-kind', { expanded: { 'periods-table': true } })
      arrangement.keepPanelViews(panel => panel !== 'retired-kind')
      expect(Object.keys(arrangement.panelViews)).toEqual(['deployments'])
    })

    /** Rows of ONE run: kept with the run they were opened for, each list deduplicated, newest last. */
    it('keeps the rows a panel opened for one run, and drops what cannot be one', () => {
      store({
        version: 1, links: {}, bars: {}, chart: {}, runChart: {},
        panelViews: {
          'report-trade-history': {
            rows: {
              scope: RUN,
              keys: { 'fills-open': ['t1', 't2', 't1'], 'groups-closed': ['unit_a', 7], 'no-such-list': ['x'] },
            },
          },
          // rows with no run to bind them to are no rows
          'report-orders': { rows: { keys: { 'groups-closed': ['unit_a'] } } },
        },
      })
      expect(useArrangementStore().panelViews).toEqual({
        'report-trade-history': { rows: { scope: RUN, keys: { 'fills-open': ['t2', 't1'], 'groups-closed': ['unit_a'] } } },
      })
    })

    it('keeps no more of a list than its cap, the newest', () => {
      const keys = Array.from({ length: VIEW_ROW_CAPS['fills-open'] + 30 }, (_, index) => `t${index}`)
      store({
        version: 1, links: {}, bars: {}, chart: {}, runChart: {},
        panelViews: { 'report-trade-history': { rows: { scope: RUN, keys: { 'fills-open': keys } } } },
      })
      const kept = useArrangementStore().panelViews['report-trade-history']?.rows?.keys['fills-open'] ?? []
      expect(kept).toHaveLength(VIEW_ROW_CAPS['fills-open'])
      expect(kept.at(-1)).toBe(keys.at(-1))
    })

    /** A chart's drawing layers, field by field: a layer or an option this build does not know is not copied. */
    it('keeps how a chart\'s layers were arranged, and drops what no layer of this build is', async () => {
      store({
        version: 1, links: {}, bars: {}, chart: {}, runChart: {},
        panelViews: {
          'run-chart': {
            layers: {
              order: ['trades', 'no-such-layer', 'levels', 'trades'],
              hidden: ['levels', 7],
              // the whole is no opacity to keep, nor a share below the least one, nor a layer unknown
              opacity: { trades: 40, levels: 100, 'entry-exit': 5, 'no-such-layer': 50 },
              options: { 'every-position': true, 'trade-signs': 'no', 'no-such-option': true },
              // a form of the set is kept, one outside it is not
              forms: { candles: 'area', volume: 'heikin-ashi' },
            },
          },
          // nothing left of it is no entry
          'chart': { layers: { hidden: ['no-such-layer'] } },
        },
      })
      const arrangement = useArrangementStore()
      expect(arrangement.panelViews).toEqual({
        'run-chart': {
          layers: {
            order: ['trades', 'levels'], hidden: ['levels'], opacity: { trades: 40 }, options: { 'every-position': true },
            forms: { candles: 'area' },
          },
        },
      })
      arrangement.setPanelView('run-chart', { layers: { opacity: { levels: 50 } } })
      await nextTick()
      expect(stored()['panelViews']).toEqual({ 'run-chart': { layers: { opacity: { levels: 50 } } } })
    })

    /**
     * A chart's panes as tall as the reader dragged them (viewer#57): a weight, kept beside the layers
     * — a worker's pane by the name the backend gave it (contract 55), so any short name is a pane.
     */
    it('keeps the weights of a chart\'s panes, and drops what is no pane or no weight', async () => {
      store({
        version: 1, links: {}, bars: {}, chart: {}, runChart: {},
        panelViews: {
          'run-chart': { panes: { price: 1.6, volume: 0.8, rsi_fast: 0.7, 'no pane': 1 } },
          // a weight of nothing, below it or not a number is none — the pane stands at its default
          'chart': { panes: { price: 0, volume: -1 } },
          'run-chart-2': { panes: { price: 'tall', volume: Number.POSITIVE_INFINITY } },
        },
      })
      const arrangement = useArrangementStore()
      expect(arrangement.panelViews).toEqual({ 'run-chart': { panes: { price: 1.6, volume: 0.8, rsi_fast: 0.7 } } })

      arrangement.setPanelView('run-chart', { panes: { price: 1.6, volume: 0.8 }, layers: { hidden: ['levels'] } })
      await nextTick()
      expect(stored()['panelViews']).toEqual({
        'run-chart': { layers: { hidden: ['levels'] }, panes: { price: 1.6, volume: 0.8 } },
      })
    })

    /** The pane given the whole height is kept like the heights — a worker's by its name, and no other value. */
    it('keeps the pane given the whole height, and drops one that is no pane', async () => {
      store({
        version: 1, links: {}, bars: {}, chart: {}, runChart: {},
        panelViews: { 'run-chart': { maximized: 'volume' }, 'chart': { maximized: 'rsi_fast' }, 'other': { maximized: 42 } },
      })
      const arrangement = useArrangementStore()
      expect(arrangement.panelViews).toEqual({ 'run-chart': { maximized: 'volume' }, 'chart': { maximized: 'rsi_fast' } })
      arrangement.setPanelView('run-chart', { maximized: 'price', panes: { volume: 1 } })
      await nextTick()
      expect(stored()['panelViews']).toEqual({
        'run-chart': { panes: { volume: 1 }, maximized: 'price' }, 'chart': { maximized: 'rsi_fast' },
      })
    })

    /** A pane set apart by a frame or a background, by its name: only what is on, of a pane's form, is kept. */
    it('keeps the looks of a chart\u2019s panes, and drops what is not on or no pane', () => {
      store({
        version: 1, links: {}, bars: {}, chart: {}, runChart: {},
        panelViews: {
          'run-chart': { looks: { price: { frame: true, background: false }, rsi_fast: { background: true }, volume: { frame: 'yes' }, 'no pane': { frame: true } } },
        },
      })
      expect(useArrangementStore().panelViews).toEqual({ 'run-chart': { looks: { price: { frame: true }, rsi_fast: { background: true } } } })
    })

    /**
     * A worker's layers by the backend's ids (contract 55), bound to no run: hidden, and fainter. An id
     * of another form, an opacity out of range, and what is whole are none.
     */
    it('keeps the workers\' layers the reader hid or faded, and drops what is no worker\'s layer', () => {
      store({
        version: 1, links: {}, bars: {}, chart: {}, runChart: {},
        panelViews: {
          'run-chart': {
            layers: {
              hidden: ['levels'],
              served: {
                hidden: ['worker:rsi_fast', 'worker:rsi_fast', 'levels', 'algo:x'],
                opacity: { 'worker:macd_main': 40, 'worker:obv_volume': 100, 'worker:tide_wave': 3, 'trades': 50 },
              },
            },
          },
        },
      })
      const arrangement = useArrangementStore()
      expect(arrangement.panelViews['run-chart']!.layers).toEqual({
        hidden: ['levels'],
        served: { hidden: ['worker:rsi_fast'], opacity: { 'worker:macd_main': 40 } },
      })
    })

    /** The groups hidden above their layers' switches, by key: a key of another form is none, each kept once. */
    it('keeps the groups the reader hid, and drops what is no key of a group', () => {
      store({
        version: 1, links: {}, bars: {}, chart: {}, runChart: {},
        panelViews: {
          'run-chart': { layers: { groupsHidden: ['pane:volume', 'pane:volume', 'workers:price', 'levels', 7] } },
        },
      })
      expect(useArrangementStore().panelViews['run-chart']!.layers).toEqual({ groupsHidden: ['pane:volume', 'workers:price'] })
    })
  })
})
