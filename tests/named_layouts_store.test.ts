import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import presets from '@/layout_presets.json'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'
import type { DockPlace } from '@/types/arrangement_types'
import type { StoredLayouts } from '@/types/named_layout_types'

const KEY = 'layouts.v1'
const A_DOCK = { grid: { root: { type: 'leaf', data: { id: 'g', views: ['runs'] } } }, panels: { runs: { id: 'runs' } } }
const A_PLACE: DockPlace = { besides: ['runs'], direction: 'within', index: 1 }

function stored(): StoredLayouts {
  return JSON.parse(localStorage.getItem(KEY) ?? 'null') as StoredLayouts
}

/** The dock lays a layout out as the real one does: the layout's places and the rest first, then the panels. */
function layOut(done = true) {
  return vi.spyOn(useDockStore(), 'restore').mockImplementation((_layout, prepare) => {
    if (done) prepare?.()
    return done
  })
}

/** This tab's placement as a dock that has been laid out leaves it. */
function placed(): void {
  const arrangement = useArrangementStore()
  arrangement.setDock(A_DOCK)
  arrangement.setPlaces({ run: A_PLACE })
  arrangement.setPanelView('report-booking-periods', { expanded: { 'periods-table': true } })
}

describe('useNamedLayoutsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the shipped layouts first, both there before anything was stored', () => {
    const store = useNamedLayoutsStore()
    expect(store.layouts.map(layout => [layout.id, layout.name, layout.shipped])).toEqual([
      ['backtests', 'Backtests', 'backtests'],
      ['deploys', 'Deploys', 'deploys'],
    ])
    expect(store.loaded).toBeNull()
  })

  /** A layout says WHERE: the dock, the places, the views no run is bound to, and the columns. */
  it('saves this placement under a name, without the rows kept for a run, and loads it from then on', () => {
    placed()
    useArrangementStore().setPanelView('report-trade-history', { rows: { scope: 'run-1', keys: { 'fills-open': ['t1'] } } })
    const store = useNamedLayoutsStore()
    expect(store.saveAs('  Morning review ')).toBe(true)

    const own = stored().layouts.find(layout => layout.name === 'Morning review')!
    expect(own.shipped).toBeNull()
    expect(own.placement.dock).toEqual(A_DOCK)
    expect(own.placement.places).toEqual({ run: A_PLACE })
    expect(own.placement.views).toEqual({ 'report-booking-periods': { expanded: { 'periods-table': true } } })
    expect(own.placement.bundles.run?.columns.length).toBeGreaterThan(0)
    expect(store.loaded?.id).toBe(own.id)
    expect(useArrangementStore().layout).toBe(own.id)
  })

  /**
   * A chart's panes as tall as the reader dragged them are part of its placement, as its layers are
   * (viewer#57): saved with the layout, laid out by it — and gone with another layout that holds none.
   */
  it('keeps the heights of a chart\'s panes in the layout, and lays them out with it', () => {
    placed()
    const arrangement = useArrangementStore()
    arrangement.setPanelView('run-chart', { layers: { hidden: ['levels'] }, panes: { price: 1.4, volume: 1.1 } })
    const store = useNamedLayoutsStore()
    expect(store.saveAs('Wide volume')).toBe(true)
    const own = stored().layouts.find(layout => layout.name === 'Wide volume')!
    expect(own.placement.views['run-chart']).toEqual({ layers: { hidden: ['levels'] }, panes: { price: 1.4, volume: 1.1 } })

    layOut()
    expect(store.load('backtests')).toBe(true)
    expect(arrangement.panelViews['run-chart']?.panes).toBeUndefined()
    expect(store.load(own.id)).toBe(true)
    expect(arrangement.panelViews['run-chart']?.panes).toEqual({ price: 1.4, volume: 1.1 })
  })

  it('refuses a name that is empty or taken, whatever its case', () => {
    placed()
    const store = useNamedLayoutsStore()
    expect(store.nameProblem('   ')).toBe('A layout needs a name')
    expect(store.nameProblem('backtests')).toBe('A layout of this name exists')
    expect(store.saveAs('BACKTESTS')).toBe(false)
    expect(store.layouts).toHaveLength(2)
  })

  /** Loading moves the panels and leaves what they show alone: the run and the narrowing stay. */
  it('lays a layout out and leaves the selection as it was', () => {
    const context = useContextStore()
    context.selectRun('run-1')
    useArrangementStore().setPanelView('report-trade-history', { rows: { scope: 'run-1', keys: { 'fills-open': ['t1'] } } })
    const restore = layOut()
    const store = useNamedLayoutsStore()

    expect(store.load('backtests')).toBe(true)
    expect(restore).toHaveBeenCalledWith(presets.backtests.full.dock, expect.any(Function))
    expect(useArrangementStore().places).toEqual(presets.backtests.full.places)
    expect(useArrangementStore().panelViews['report-booking-periods']?.expanded).toEqual(
      presets.backtests.full.views['report-booking-periods'].expanded)
    // the rows this tab keeps for its run are no part of a layout
    expect(useArrangementStore().panelViews['report-trade-history']?.rows?.keys['fills-open']).toEqual(['t1'])
    expect(context.main.run.id).toBe('run-1')
    expect(store.loaded?.id).toBe('backtests')
  })

  it('changes nothing where the dock cannot lay the layout out', () => {
    useArrangementStore().setPlaces({ run: A_PLACE })
    layOut(false)
    const store = useNamedLayoutsStore()
    expect(store.load('deploys')).toBe(false)
    expect(useArrangementStore().places).toEqual({ run: A_PLACE })
    expect(store.loaded).toBeNull()
  })

  /** The loaded layout follows the reader: a change is written into it once it has rested. */
  it('writes a changed placement into the loaded layout, and none where no layout is loaded', async () => {
    vi.useFakeTimers()
    placed()
    const store = useNamedLayoutsStore()
    const arrangement = useArrangementStore()
    arrangement.setPlaces({ runs: A_PLACE })
    await nextTick()
    vi.advanceTimersByTime(1000)
    expect(localStorage.getItem(KEY)).toBeNull()

    store.saveAs('Mine')
    const moved: DockPlace = { besides: ['run'], direction: 'right', size: 300 }
    arrangement.setPlaces({ runs: moved })
    await nextTick()
    vi.advanceTimersByTime(100)
    expect(stored().layouts.find(layout => layout.name === 'Mine')!.placement.places).toEqual({ runs: A_PLACE })
    vi.advanceTimersByTime(1000)
    expect(stored().layouts.find(layout => layout.name === 'Mine')!.placement.places).toEqual({ runs: moved })
  })

  it('renames and deletes only the layouts a reader made, and a deleted loaded one is loaded no more', () => {
    placed()
    const store = useNamedLayoutsStore()
    store.saveAs('Mine')
    const id = store.loaded!.id
    expect(store.rename('backtests', 'Other')).toBe(false)
    expect(store.rename(id, 'Evening')).toBe(true)
    expect(store.layouts.find(layout => layout.id === id)?.name).toBe('Evening')

    store.remove('deploys')
    expect(store.layouts.map(layout => layout.id)).toContain('deploys')
    store.remove(id)
    expect(store.layouts.map(layout => layout.id)).toEqual(['backtests', 'deploys'])
    expect(useArrangementStore().layout).toBeNull()
  })

  it('brings a changed shipped layout back as shipped, laid out again where it is loaded', async () => {
    vi.useFakeTimers()
    placed()
    const restore = layOut()
    const store = useNamedLayoutsStore()
    store.load('deploys')
    useArrangementStore().setPlaces({ runs: A_PLACE })
    await nextTick()
    vi.advanceTimersByTime(1000)
    expect(stored().layouts.find(layout => layout.id === 'deploys')!.placement.places).toEqual({ runs: A_PLACE })

    store.resetShipped('deploys')
    expect(stored().layouts.find(layout => layout.id === 'deploys')!.placement.places).toEqual(presets.deploys.full.places)
    expect(restore).toHaveBeenCalledTimes(2)
  })

  /** Two windows: a layout saved in the other is never lost here, and its write reaches this one. */
  it('keeps a layout another window saved, and hears that window write', () => {
    placed()
    const store = useNamedLayoutsStore()
    const theirs = { id: 'own-theirs', name: 'Theirs', shipped: null, placement: { dock: A_DOCK, places: {}, views: {}, bundles: {} } }
    localStorage.setItem(KEY, JSON.stringify({ version: 1, layouts: [theirs] }))

    // no event yet: a write here reads the stored list again and keeps theirs
    store.saveAs('Mine')
    expect(stored().layouts.map(layout => layout.name)).toEqual(['Backtests', 'Deploys', 'Theirs', 'Mine'])

    localStorage.setItem(KEY, JSON.stringify({ version: 1, layouts: [theirs] }))
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(store.layouts.map(layout => layout.name)).toEqual(['Backtests', 'Deploys', 'Theirs'])
    // the layout this tab had loaded is gone with that write
    expect(useArrangementStore().layout).toBeNull()
  })

  it('reads stored layouts by shape, and removes an entry of another version', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, layouts: [{ id: 'own-x', name: 'X' }, 'nonsense', { id: 'own-y', name: 'Y', placement: { dock: A_DOCK } }] }))
    expect(useNamedLayoutsStore().layouts.map(layout => layout.id)).toEqual(['backtests', 'deploys', 'own-y'])

    setActivePinia(createPinia())
    localStorage.setItem(KEY, JSON.stringify({ version: 0, layouts: [] }))
    expect(useNamedLayoutsStore().layouts).toHaveLength(2)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  /** One file carries every layout to another machine; taking it in replaces by id and adds the rest. */
  it('exports every layout as one file, and takes a file in beside its own', () => {
    placed()
    const store = useNamedLayoutsStore()
    store.saveAs('Mine')
    const file = store.exportAll()

    setActivePinia(createPinia())
    localStorage.clear()
    placed()
    const other = useNamedLayoutsStore()
    other.saveAs('Here')
    expect(other.importAll(file)).toBe(3)
    expect(other.layouts.map(layout => layout.name)).toEqual(['Backtests', 'Deploys', 'Here', 'Mine'])
    expect(other.importAll('not json')).toBeNull()
    expect(other.importAll(JSON.stringify({ version: 0, layouts: [] }))).toBeNull()
    expect(other.importAll(JSON.stringify({ version: 1, layouts: [] }))).toBeNull()
  })

  it('takes this tab off its layout, so a placement made after goes into none', () => {
    placed()
    const store = useNamedLayoutsStore()
    store.saveAs('Mine')
    store.unload()
    expect(store.loaded).toBeNull()
    expect(useArrangementStore().layout).toBeNull()
  })

  /** Each size is a layout of its own (2026-11-04): a size laid out is that size's placement, and it is kept. */
  it('lays a layout out in a size, and the next load without a size takes the same', () => {
    const restore = layOut()
    const store = useNamedLayoutsStore()
    expect(store.load('deploys', 'mobile')).toBe(true)
    expect(restore).toHaveBeenLastCalledWith(presets.deploys.mobile.dock, expect.any(Function))
    expect(useArrangementStore().places).toEqual(presets.deploys.mobile.places)
    expect(store.loadedSize).toBe('mobile')

    store.load('backtests')
    expect(restore).toHaveBeenLastCalledWith(presets.backtests.mobile.dock, expect.any(Function))
    expect(useArrangementStore().layoutSize).toBe('mobile')
  })

  it('writes a change into the size it was made in, and leaves the other sizes as they were', async () => {
    vi.useFakeTimers()
    placed()
    layOut()
    const store = useNamedLayoutsStore()
    store.load('backtests', 'medium')
    useArrangementStore().setPlaces({ runs: A_PLACE })
    await nextTick()
    vi.advanceTimersByTime(1000)

    const backtests = stored().layouts.find(layout => layout.id === 'backtests')!
    expect(backtests.sizes.medium?.places).toEqual({ runs: A_PLACE })
    expect(backtests.sizes.mobile?.places).toEqual(presets.backtests.mobile.places)
    expect(backtests.placement.places).toEqual(presets.backtests.full.places)
  })

  /** Every size starts from a placement made for it: the one saved from, never a copy of this one. */
  it('saves this window as the size it stands in, the other sizes taken from the layout it came from', () => {
    layOut()
    const store = useNamedLayoutsStore()
    store.load('deploys', 'medium')
    placed()
    store.saveAs('Mine')

    const own = stored().layouts.find(layout => layout.name === 'Mine')!
    expect(own.sizes.medium?.dock).toEqual(A_DOCK)
    expect(own.placement.dock).toEqual(presets.deploys.full.dock)
    expect(own.sizes.mobile?.dock).toEqual(presets.deploys.mobile.dock)
    expect(store.loadedSize).toBe('medium')
  })

  it('brings every size of a shipped layout back as shipped', async () => {
    vi.useFakeTimers()
    placed()
    layOut()
    const store = useNamedLayoutsStore()
    store.load('backtests', 'mobile')
    useArrangementStore().setPlaces({ runs: A_PLACE })
    await nextTick()
    vi.advanceTimersByTime(1000)
    expect(stored().layouts.find(layout => layout.id === 'backtests')!.sizes.mobile?.places).toEqual({ runs: A_PLACE })

    store.resetShipped('backtests')
    expect(stored().layouts.find(layout => layout.id === 'backtests')!.sizes.mobile?.places).toEqual(presets.backtests.mobile.places)
  })

  /** A layout stored before sizes existed holds Full alone: a narrow size starts from a shipped one, never from Full. */
  it('lays a size a stored layout does not hold out from the shipped one', () => {
    const restore = layOut()
    const old = { id: 'own-old', name: 'Old', shipped: null, placement: { dock: A_DOCK, places: {}, views: {}, bundles: {} } }
    localStorage.setItem(KEY, JSON.stringify({ version: 1, layouts: [old] }))
    const store = useNamedLayoutsStore()
    expect(store.load('own-old', 'mobile')).toBe(true)
    expect(restore).toHaveBeenLastCalledWith(presets.backtests.mobile.dock, expect.any(Function))
    store.load('own-old', 'full')
    expect(restore).toHaveBeenLastCalledWith(A_DOCK, expect.any(Function))
  })

  it('carries the columns into the layout, and lays them out again on load', () => {
    placed()
    const layoutStore = useLayoutStore()
    const section = layoutStore.arrangedOf()[0]!.id
    layoutStore.hide(section)
    const store = useNamedLayoutsStore()
    store.saveAs('Without')
    layoutStore.reset()
    expect(layoutStore.visibleOf().map(panel => panel.id)).toContain(section)

    layOut()
    store.load(store.loaded!.id)
    expect(layoutStore.visibleOf().map(panel => panel.id)).not.toContain(section)
  })
})
