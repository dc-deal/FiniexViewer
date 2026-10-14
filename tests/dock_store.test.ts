import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { DockviewApi } from 'dockview-vue'
import { nextTick } from 'vue'
import { useDockStore } from '@/stores/dock_store'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useLayoutStore } from '@/stores/layout_store'

interface FakeGroup {
  id: string
  panels: FakePanel[]
  api: { width: number, height: number }
}

interface FakePanel {
  id: string
  group: FakeGroup
  api: { setActive: () => void, close: () => void }
}

interface FakeAdd {
  id: string
  position?: { referencePanel: string, direction?: string, index?: number }
  initialWidth?: number
}

/**
 * The part of dockview the store talks to, kept as plain data: which panels are open, in which
 * group, which one is in front. The groups stand in ONE row, left to right, which is all the
 * placement here needs — a split goes beside its reference, a tab joins its group at an index. The
 * real dock needs a browser to lay anything out.
 */
function fakeDock(options: { refuse?: boolean } = {}) {
  const row: FakeGroup[] = []
  let active: string | null = null
  let groupCount = 0
  let changed: (() => void) | null = null
  const restored: unknown[] = []
  const added: FakeAdd[] = []
  // dockview's own announcements: before the layout changes, and of a panel arriving or leaving
  const willMutate: (() => void)[] = []
  const arrived: ((panel: FakePanel) => void)[] = []
  const left: ((panel: FakePanel) => void)[] = []

  const panels = () => row.flatMap(group => group.panels)
  const find = (id: string) => panels().find(panel => panel.id === id)
  const mutate = () => willMutate.forEach(listener => listener())

  function newGroup(at: number): FakeGroup {
    const group: FakeGroup = { id: `g${groupCount++}`, panels: [], api: { width: 400, height: 600 } }
    row.splice(at, 0, group)
    return group
  }

  function addPanel(spec: FakeAdd): void {
    mutate()
    added.push(spec)
    const reference = spec.position ? find(spec.position.referencePanel) : undefined
    const direction = spec.position?.direction ?? 'within'
    let group: FakeGroup
    if (reference && direction === 'within') group = reference.group
    else if (reference) {
      group = newGroup(row.indexOf(reference.group) + (direction === 'left' ? 0 : 1))
      if (spec.initialWidth) group.api.width = spec.initialWidth
    } else group = find(active ?? '')?.group ?? row[0] ?? newGroup(0)
    const panel: FakePanel = {
      id: spec.id,
      group,
      api: { setActive: () => { active = spec.id }, close: () => close(spec.id) },
    }
    const index = reference && direction === 'within' && spec.position?.index !== undefined
      ? Math.min(spec.position.index, group.panels.length)
      : group.panels.length
    group.panels.splice(index, 0, panel)
    arrived.forEach(listener => listener(panel))
  }

  function close(id: string): void {
    const panel = find(id)
    if (!panel) return
    mutate()
    const group = panel.group
    group.panels.splice(group.panels.indexOf(panel), 1)
    if (!group.panels.length) row.splice(row.indexOf(group), 1)
    left.forEach(listener => listener(panel))
    if (active === id) active = panels()[0]?.id ?? null
  }

  const api = {
    get panels() { return panels() },
    get groups() { return row },
    get totalPanels() { return panels().length },
    get activePanel() { return find(active ?? '') },
    getPanel: (id: string) => find(id),
    addPanel,
    adjacentGroupInDirection: (group: FakeGroup, direction: string) => {
      const at = row.indexOf(group)
      if (direction === 'left') return row[at - 1]
      if (direction === 'right') return row[at + 1]
      return undefined
    },
    clear: () => {
      mutate()
      const gone = panels()
      row.length = 0
      active = null
      gone.forEach(panel => left.forEach(listener => listener(panel)))
    },
    fromJSON: (layout: { panels: Record<string, unknown> }) => {
      if (options.refuse) throw new Error('refused')
      restored.push(layout)
      Object.keys(layout.panels).forEach(id => addPanel({ id }))
    },
    toJSON: () => ({
      grid: { root: { type: 'leaf', data: { id: 'g', views: panels().map(p => p.id) } } },
      panels: Object.fromEntries(panels().map(p => [p.id, { id: p.id, params: { kind: p.id } }])),
    }),
    onDidLayoutChange: (listener: () => void) => {
      changed = listener
      return { dispose: () => { changed = null } }
    },
    onWillMutateLayout: (listener: () => void) => {
      willMutate.push(listener)
      return { dispose: () => { willMutate.splice(willMutate.indexOf(listener), 1) } }
    },
    onDidAddPanel: (listener: (panel: FakePanel) => void) => {
      arrived.push(listener)
      return { dispose: () => { arrived.splice(arrived.indexOf(listener), 1) } }
    },
    onDidRemovePanel: (listener: (panel: FakePanel) => void) => {
      left.push(listener)
      return { dispose: () => { left.splice(left.indexOf(listener), 1) } }
    },
  }
  return {
    api: api as unknown as DockviewApi,
    ids: () => panels().map(p => p.id),
    groups: () => panels().map(p => p.group.id),
    /** The groups left to right, each as the ids of its tabs. */
    rows: () => row.map(group => group.panels.map(p => p.id)),
    width: (id: string) => find(id)?.group.api.width,
    /** The reader drags a seam: the panel's group takes this width. */
    resize: (id: string, width: number) => {
      const panel = find(id)
      if (panel) panel.group.api.width = width
    },
    active: () => active,
    restored,
    added,
    close,
    change: () => changed?.(),
  }
}

describe('useDockStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lays out the suggested order where nothing is stored, Runs in front, and keeps it', () => {
    const dock = fakeDock()
    useDockStore().attach(dock.api)

    expect(dock.ids()).toEqual(['deployments', 'runs', 'chart'])
    expect(new Set(dock.groups()).size).toBe(1)
    expect(dock.active()).toBe('runs')
    expect(useArrangementStore().dock).not.toBeNull()
  })

  it('brings back a stored layout, reconciled', () => {
    useArrangementStore().setDock({
      grid: { root: { type: 'leaf', data: { id: 'g', views: ['chart', 'retired'], activeView: 'chart' } } },
      panels: { chart: { id: 'chart', params: { kind: 'chart' } }, retired: { id: 'retired', params: { kind: 'retired' } } },
    })
    const dock = fakeDock()
    useDockStore().attach(dock.api)

    expect(dock.ids()).toEqual(['chart'])
    expect(dock.restored).toHaveLength(1)
  })

  /** A layout dockview itself refuses must not leave the reader with an empty screen. */
  it('falls back to the suggested order where the dock refuses what was stored', () => {
    useArrangementStore().setDock({
      grid: { root: { type: 'leaf', data: { id: 'g', views: ['chart'] } } },
      panels: { chart: { id: 'chart', params: { kind: 'chart' } } },
    })
    const dock = fakeDock({ refuse: true })
    useDockStore().attach(dock.api)

    expect(dock.ids()).toEqual(['deployments', 'runs', 'chart'])
  })

  it('brings an open panel to the front, and opens a closed one beside the active one', () => {
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)

    store.open('deployments')
    expect(dock.active()).toBe('deployments')

    dock.close('chart')
    store.open('chart')
    expect(dock.ids()).toContain('chart')
    expect(dock.active()).toBe('chart')
    expect(dock.groups()[dock.ids().indexOf('chart')]).toBe(dock.groups()[0])
  })

  it('goes back to the suggested order on reset, and keeps that', () => {
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)
    dock.close('chart')

    store.reset()
    expect(dock.ids()).toEqual(['deployments', 'runs', 'chart'])
    expect(dock.active()).toBe('runs')
    expect(Object.keys((useArrangementStore().dock as { panels: object }).panels)).toEqual(['deployments', 'runs', 'chart'])
  })

  /** A drag changes the layout every frame — it is written once it holds still, or when the page goes. */
  it('writes a changed layout once it holds still, and at once when flushed', () => {
    vi.useFakeTimers()
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)
    const arrangement = useArrangementStore()

    dock.close('chart')
    dock.change()
    expect(Object.keys((arrangement.dock as { panels: object }).panels)).toContain('chart')
    vi.advanceTimersByTime(300)
    expect(Object.keys((arrangement.dock as { panels: object }).panels)).not.toContain('chart')
  })

  /**
   * A dock with no panel is one being torn down, not an arrangement. Written, it handed the next
   * start an empty layout, which reconciles to nothing and is replaced by the suggested order — so
   * every hot reload during development lost the reader's arrangement (reproduced 2026-10-14).
   */
  it('never writes a dock that holds no panel, and keeps the arrangement it had', () => {
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)
    const arrangement = useArrangementStore()
    const before = Object.keys((arrangement.dock as { panels: object }).panels)
    expect(before.length).toBeGreaterThan(0)

    dock.api.clear()
    dock.change()
    store.flush()
    expect(Object.keys((arrangement.dock as { panels: object }).panels)).toEqual(before)
  })

  /**
   * A section of the run report opened as a panel of its own (viewer#31, 2026-10-14): one place at
   * a time, the first beside the Runs panel, each further one as a tab beside the last.
   */
  describe('a section opened as a panel of its own', () => {
    function attached() {
      const dock = fakeDock()
      const store = useDockStore()
      store.attach(dock.api)
      return { dock, store }
    }

    function groupOf(dock: ReturnType<typeof fakeDock>, id: string): string {
      return dock.groups()[dock.ids().indexOf(id)]!
    }

    it('keeps the open panels as dockview reports them', () => {
      const { dock, store } = attached()
      expect(store.openIds).toEqual(['deployments', 'runs', 'chart'])
      dock.close('chart')
      expect(store.openIds).toEqual(['deployments', 'runs'])
    })

    it('opens the first beside the Runs panel, as a split to its right, and in front', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      expect(groupOf(dock, 'report-trade-history')).not.toBe(groupOf(dock, 'runs'))
      expect(dock.active()).toBe('report-trade-history')
      expect(store.openIds).toContain('report-trade-history')
    })

    /** Not a new split each time: the screen would be cut thinner with every section. */
    it('puts the next one beside the last, as a tab', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      store.openSection('orders')
      expect(groupOf(dock, 'report-orders')).toBe(groupOf(dock, 'report-trade-history'))
    })

    it('brings an open section to the front rather than opening it twice', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      store.open('runs')
      store.openSection('trade-history')
      expect(dock.ids().filter(id => id === 'report-trade-history')).toHaveLength(1)
      expect(dock.active()).toBe('report-trade-history')
    })

    it('gives every section back to the column on reset', () => {
      const { store } = attached()
      store.openSection('trade-history')
      store.reset()
      expect(store.openIds).toEqual(['deployments', 'runs', 'chart'])
      // a rebuild is not the reader closing anything: the section is back, not hidden
      expect(hidden('trade-history')).toBe(false)
    })
  })

  /**
   * Closing a panel HIDES it, alike for every panel (viewer#31, 2026-10-14): the Panels menu shows
   * it again where it stood, beside the panels it stood beside while one of them is still open.
   */
  describe('closing hides, and the menu brings a panel back where it stood', () => {
    function attached() {
      const dock = fakeDock()
      const store = useDockStore()
      store.attach(dock.api)
      return { dock, store }
    }

    it('hides a section whose panel is closed, and keeps where it stood', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      dock.close('report-trade-history')

      expect(hidden('trade-history')).toBe(true)
      const place = useArrangementStore().places['report-trade-history']
      expect(place?.direction).toBe('right')
      expect(place?.besides).toContain('runs')
    })

    it('shows a hidden section again beside what it stood beside, at the size it had', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      dock.resize('report-trade-history', 520)
      dock.close('report-trade-history')

      store.showSection('trade-history')
      expect(dock.rows()).toEqual([['deployments', 'runs', 'chart'], ['report-trade-history']])
      expect(dock.width('report-trade-history')).toBe(520)
      expect(hidden('trade-history')).toBe(false)
      expect(dock.active()).toBe('report-trade-history')
    })

    it('puts a tab back among its tabs, at its index', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      store.openSection('orders')
      store.openSection('booking-periods')
      dock.close('report-orders')

      store.showSection('orders')
      expect(dock.rows()[1]).toEqual(['report-trade-history', 'report-orders', 'report-booking-periods'])
    })

    /** Where nothing it stood beside is left, the column is its place — and its panel comes forward. */
    it('shows a section in the column where nothing it stood beside is open any more', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      dock.close('report-trade-history')
      for (const id of ['deployments', 'runs', 'chart']) dock.close(id)

      store.showSection('trade-history')
      expect(dock.ids()).toEqual(['runs'])
      expect(hidden('trade-history')).toBe(false)
      expect(useArrangementStore().places['report-trade-history']).toBeUndefined()
    })

    it('sends a section back into the column by its own control — shown, its place forgotten', () => {
      const { store } = attached()
      store.openSection('trade-history')
      store.backIntoColumn('trade-history')

      expect(store.openIds).not.toContain('report-trade-history')
      expect(hidden('trade-history')).toBe(false)
      expect(useArrangementStore().places['report-trade-history']).toBeUndefined()
    })

    it('hides a section wherever it stands: through its panel, or in the column', () => {
      const { dock, store } = attached()
      store.openSection('orders')
      store.hideSection('orders')
      expect(dock.ids()).not.toContain('report-orders')
      expect(hidden('orders')).toBe(true)

      store.hideSection('config')
      expect(hidden('config')).toBe(true)
      expect(useArrangementStore().places['report-config']).toBeUndefined()
    })

    /** A main panel the same: closed, it opens again beside what it stood beside. */
    it('brings a closed main panel back where it stood', () => {
      const { dock, store } = attached()
      // the reader dragged the chart into a split of its own, right of the others
      dock.close('chart')
      dock.api.addPanel({ id: 'chart', component: 'host', position: { referencePanel: 'runs', direction: 'right' } })
      dock.close('chart')

      store.open('chart')
      expect(dock.rows()).toEqual([['deployments', 'runs'], ['chart']])
      expect(dock.active()).toBe('chart')
    })

    it('forgets every place on reset, and hides nothing it removes', () => {
      const { dock, store } = attached()
      store.openSection('orders')
      dock.close('chart')
      expect(Object.keys(useArrangementStore().places).length).toBeGreaterThan(0)

      store.reset()
      expect(useArrangementStore().places).toEqual({})
      expect(hidden('orders')).toBe(false)
    })

    it('still knows after a reload where a hidden section stood', async () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      dock.close('report-trade-history')
      store.flush()
      await nextTick()

      setActivePinia(createPinia())
      const again = fakeDock()
      const reloaded = useDockStore()
      reloaded.attach(again.api)
      reloaded.showSection('trade-history')
      expect(again.rows()).toEqual([['deployments', 'runs', 'chart'], ['report-trade-history']])
    })
  })
})

/** Whether the column has the section switched off. */
function hidden(sectionId: string): boolean | undefined {
  return useLayoutStore().arrangedPanels.find(panel => panel.id === sectionId)?.hidden
}
