import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { DockviewApi } from 'dockview-vue'
import { nextTick } from 'vue'
import { useDockStore } from '@/stores/dock_store'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'
import { useLayoutStore } from '@/stores/layout_store'

interface FakeGroup {
  id: string
  panels: FakePanel[]
  api: { width: number, height: number, moveTo: (options: { group: FakeGroup }) => void }
}

interface FakePanel {
  id: string
  group: FakeGroup
  /** dockview's own copy of the title, stored with the layout and restored as stored */
  title: string
  api: {
    setActive: () => void
    close: () => void
    moveTo: (options: { group: FakeGroup }) => void
    setTitle: (title: string) => void
  }
}

/** A group added along an edge of the whole dock: where, and how large it starts. */
interface FakeEdgeGroup {
  direction: string
  initialWidth?: number
  initialHeight?: number
}

interface FakeAdd {
  id: string
  title?: string
  position?: { referencePanel: string, direction?: string, index?: number }
  initialWidth?: number
}

/**
 * The part of dockview the store talks to, kept as plain data: which panels are open, in which
 * group, which one is in front. The groups stand in ONE row, left to right, which is all the
 * placement here needs — a split goes beside its reference, a tab joins its group at an index. The
 * real dock needs a browser to lay anything out.
 */
function fakeDock(options: { refuse?: boolean, width?: number } = {}) {
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
  // a drag begins on a tab or on a group's header, and ends in a drop
  const panelDrags: ((event: { panel: FakePanel }) => void)[] = []
  const groupDrags: ((event: { group: FakeGroup }) => void)[] = []
  const drops: (() => void)[] = []
  const edgeGroups: FakeEdgeGroup[] = []
  // dockview announces the panel in front whenever another one comes there
  const fronted: ((event: { panel: FakePanel | undefined }) => void)[] = []

  const panels = () => row.flatMap(group => group.panels)
  const find = (id: string) => panels().find(panel => panel.id === id)
  const mutate = () => willMutate.forEach(listener => listener())

  function front(id: string | null): void {
    if (id === active) return
    active = id
    fronted.forEach(listener => listener({ panel: find(id ?? '') }))
  }

  function newGroup(at: number): FakeGroup {
    const group: FakeGroup = {
      id: `g${groupCount++}`,
      panels: [],
      api: {
        width: 400,
        height: 600,
        moveTo: ({ group: target }) => [...group.panels].forEach(panel => movePanel(panel, target)),
      },
    }
    row.splice(at, 0, group)
    return group
  }

  /** A panel moved into another group; a group left empty goes, as in dockview. */
  function movePanel(panel: FakePanel, target: FakeGroup): void {
    mutate()
    const from = panel.group
    from.panels.splice(from.panels.indexOf(panel), 1)
    if (!from.panels.length) row.splice(row.indexOf(from), 1)
    panel.group = target
    target.panels.push(panel)
    front(panel.id)
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
      title: spec.title ?? spec.id,
      api: {
        setActive: () => front(spec.id),
        close: () => close(spec.id),
        moveTo: ({ group: target }) => movePanel(panel, target),
        setTitle: (title: string) => { panel.title = title },
      },
    }
    const index = reference && direction === 'within' && spec.position?.index !== undefined
      ? Math.min(spec.position.index, group.panels.length)
      : group.panels.length
    group.panels.splice(index, 0, panel)
    // dockview brings a panel it adds to the front, unless told otherwise
    front(spec.id)
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
    if (active === id) front(panels()[0]?.id ?? null)
  }

  const api = {
    // wide enough to share by default, as on the screens the viewer is built for
    width: options.width ?? 1800,
    height: 900,
    get panels() { return panels() },
    get groups() { return row },
    get totalPanels() { return panels().length },
    get activePanel() { return find(active ?? '') },
    getPanel: (id: string) => find(id),
    getGroup: (id: string) => row.find(group => group.id === id),
    addPanel,
    // along an edge of the whole dock: the row holds it at its start or its end
    addGroup: (spec: FakeEdgeGroup) => {
      mutate()
      edgeGroups.push(spec)
      const group = newGroup(spec.direction === 'left' || spec.direction === 'above' ? 0 : row.length)
      if (spec.initialWidth) group.api.width = spec.initialWidth
      if (spec.initialHeight) group.api.height = spec.initialHeight
      return group
    },
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
    fromJSON: (layout: { grid?: { root?: { data?: { activeView?: string } } }, panels: Record<string, { title?: string }> }) => {
      if (options.refuse) throw new Error('refused')
      restored.push(layout)
      Object.entries(layout.panels).forEach(([id, stored]) => addPanel({ id, title: stored?.title }))
      const front = layout.grid?.root?.data?.activeView
      if (front && find(front)) active = front
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
    onWillDragPanel: (listener: (event: { panel: FakePanel }) => void) => {
      panelDrags.push(listener)
      return { dispose: () => { panelDrags.splice(panelDrags.indexOf(listener), 1) } }
    },
    onWillDragGroup: (listener: (event: { group: FakeGroup }) => void) => {
      groupDrags.push(listener)
      return { dispose: () => { groupDrags.splice(groupDrags.indexOf(listener), 1) } }
    },
    onDidDrop: (listener: () => void) => {
      drops.push(listener)
      return { dispose: () => { drops.splice(drops.indexOf(listener), 1) } }
    },
    onDidActivePanelChange: (listener: (event: { panel: FakePanel | undefined }) => void) => {
      fronted.push(listener)
      return { dispose: () => { fronted.splice(fronted.indexOf(listener), 1) } }
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
    edgeGroups,
    /** The reader starts dragging a panel by its tab, or a group by its header. */
    dragPanel: (id: string) => { const panel = find(id); if (panel) panelDrags.forEach(listener => listener({ panel })) },
    dragGroupOf: (id: string) => { const panel = find(id); if (panel) groupDrags.forEach(listener => listener({ group: panel.group })) },
    /** A drop on one of dockview's own targets. */
    drop: () => drops.forEach(listener => listener()),
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

    // the lists as tabs; the report beside them and the run chart beside it, each a split of its own
    expect(dock.rows()).toEqual([['deployments', 'runs'], ['run', 'deployment'], ['run-chart']])
    expect(dock.active()).toBe('runs')
    expect(useArrangementStore().dock).not.toBeNull()
  })

  /**
   * Where the dock holds the lists and the report but no room for candles beside them, the chart
   * is a tab behind the report — the report keeps the width its lists need.
   */
  it('puts the run chart behind the report as a tab where the dock holds two columns', () => {
    const dock = fakeDock({ width: 1600 })
    useDockStore().attach(dock.api)
    expect(dock.rows()).toEqual([['deployments', 'runs'], ['run', 'deployment', 'run-chart']])
    expect(dock.width('run')).toBe(1054)
  })

  /** Below the width a split needs, the run chart joins the report's tabs, right after it. */
  it('puts the run chart after the report as a tab where the dock is too narrow to share', () => {
    const dock = fakeDock({ width: 1000 })
    useDockStore().attach(dock.api)
    expect(dock.rows()).toEqual([['deployments', 'runs', 'run', 'deployment', 'run-chart']])
    expect(dock.active()).toBe('runs')
  })

  /** Where the work is: a run restored opens on its report, none on the run list. */
  it('opens the first arrangement on the run report where a run is restored', () => {
    useContextStore().selectRun('r1')
    const dock = fakeDock()
    useDockStore().attach(dock.api)
    expect(dock.active()).toBe('run')
  })

  /**
   * A stored layout written before the run report was a panel of its own has none: where a run is
   * chosen it joins the run list as a tab, in front where the list was — and never where the reader
   * hid it, which has a place to come back to.
   */
  describe('a stored layout that never held the run report', () => {
    function storeLayout(front: string): void {
      useArrangementStore().setDock({
        grid: { root: { type: 'leaf', data: { id: 'g', views: ['deployments', 'runs', 'chart'], activeView: front } } },
        panels: Object.fromEntries(['deployments', 'runs', 'chart'].map(id => [id, { id, params: { kind: id } }])),
      })
    }

    it('gains it beside the run list, in front where the list was', () => {
      storeLayout('runs')
      useContextStore().selectRun('r1')
      const dock = fakeDock()
      useDockStore().attach(dock.api)
      expect(dock.rows()).toEqual([['deployments', 'runs', 'run', 'deployment', 'chart'], ['run-chart']])
      expect(dock.active()).toBe('run')
    })

    it('leaves another panel in front where the list was not', () => {
      storeLayout('chart')
      useContextStore().selectRun('r1')
      const dock = fakeDock()
      useDockStore().attach(dock.api)
      expect(dock.ids()).toContain('run')
      expect(dock.active()).toBe('chart')
    })

    it('gains nothing where no run is chosen, or where the reader hid it', () => {
      storeLayout('runs')
      const without = fakeDock()
      useDockStore().attach(without.api)
      expect(without.ids()).not.toContain('run')

      setActivePinia(createPinia())
      storeLayout('runs')
      useArrangementStore().setPlaces({ run: { besides: ['runs'], direction: 'within', index: 2 } })
      useContextStore().selectRun('r1')
      const hidden = fakeDock()
      useDockStore().attach(hidden.api)
      expect(hidden.ids()).not.toContain('run')
    })
  })

  it('brings back a stored layout, reconciled', () => {
    useArrangementStore().setDock({
      grid: { root: { type: 'leaf', data: { id: 'g', views: ['chart', 'retired'], activeView: 'chart' } } },
      panels: { chart: { id: 'chart', params: { kind: 'chart' } }, retired: { id: 'retired', params: { kind: 'retired' } } },
    })
    const dock = fakeDock()
    useDockStore().attach(dock.api)

    expect(dock.ids()).toEqual(['chart', 'deployment'])
    expect(dock.restored).toHaveLength(1)
  })

  /**
   * A kind this build no longer has takes its place with it, and leaves the neighbour lists. A place
   * whose every neighbour is gone stays as it was: it is also the record that the reader HID the
   * panel, and dropped, a hidden run chart came back on the next start.
   */
  it('drops the place of a retired kind when it attaches, and keeps a hidden panel\'s', () => {
    const arrangement = useArrangementStore()
    arrangement.setPlaces({
      retired: { besides: ['runs'], direction: 'right' },
      chart: { besides: ['retired', 'runs'], direction: 'within', index: 1 },
      'run-chart': { besides: ['retired'], direction: 'right', size: 500 },
    })
    useDockStore().attach(fakeDock().api)
    expect(arrangement.places).toEqual({
      chart: { besides: ['runs'], direction: 'within', index: 1 },
      'run-chart': { besides: ['retired'], direction: 'right', size: 500 },
    })
  })

  /** A kind this build no longer has takes its kept view with it; a panel merely hidden keeps its own. */
  it('drops the view kept for a retired kind when it attaches, and keeps the rest', () => {
    const arrangement = useArrangementStore()
    arrangement.setPanelView('retired', { expanded: { 'periods-table': true } })
    arrangement.setPanelView('deployments', { expanded: { 'periods-table': true } })
    useDockStore().attach(fakeDock().api)
    expect(Object.keys(arrangement.panelViews)).toEqual(['deployments'])
  })

  /** On show is not open: the hosts say which panels are seen, and a dock taken down sees none. */
  it('keeps which panels are on show as their hosts report it, and forgets it with the dock', () => {
    const store = useDockStore()
    store.attach(fakeDock().api)
    store.noteShown('runs', true)
    store.noteShown('run', true)
    store.noteShown('runs', true)
    expect(store.shownIds).toEqual(['runs', 'run'])
    store.noteShown('runs', false)
    expect(store.shownIds).toEqual(['run'])

    store.detach()
    expect(store.shownIds).toEqual([])
  })

  /**
   * dockview stores a panel's title with the layout and restores it as stored. The tab draws the
   * kind's own title, but the tab's accessible name and the dock's announcements kept the old one
   * after a rename — the run bundle went on being read out as "Run".
   */
  it('gives a restored panel the title its kind has now', () => {
    useArrangementStore().setDock({
      grid: { root: { type: 'leaf', data: { id: 'g', views: ['run', 'chart'], activeView: 'run' } } },
      panels: {
        run: { id: 'run', title: 'Run', params: { kind: 'run' } },
        chart: { id: 'chart', title: 'Chart', params: { kind: 'chart' } },
      },
    })
    const dock = fakeDock()
    useDockStore().attach(dock.api)

    const titles = Object.fromEntries((dock.api.panels as unknown as FakePanel[]).map(panel => [panel.id, panel.title]))
    expect(titles['run']).toBe('Run bundle')
    expect(titles['chart']).toBe('Free chart')
  })

  /** A layout dockview itself refuses must not leave the reader with an empty screen. */
  it('falls back to the suggested order where the dock refuses what was stored', () => {
    useArrangementStore().setDock({
      grid: { root: { type: 'leaf', data: { id: 'g', views: ['chart'] } } },
      panels: { chart: { id: 'chart', params: { kind: 'chart' } } },
    })
    const dock = fakeDock({ refuse: true })
    useDockStore().attach(dock.api)

    expect(dock.ids()).toEqual(['deployments', 'runs', 'run', 'deployment', 'run-chart'])
  })

  /**
   * A SELECTION never reopens a panel the reader closed (operator, 2026-10-16): a pick in the run
   * list reopened the run report they had closed, its sections all standing as panels already. A
   * command — the menu, a link, a jump — still opens it where it stood.
   */
  it('brings an open panel forward for a pick, and leaves a closed one closed', () => {
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)

    store.reveal('runs', 'command')
    expect(store.reveal('run', 'selection')).toBe(true)
    expect(dock.active()).toBe('run')

    dock.close('run')
    store.reveal('runs', 'command')
    expect(store.reveal('run', 'selection')).toBe(false)
    expect(dock.ids()).not.toContain('run')
    expect(dock.active()).toBe('runs')

    expect(store.reveal('run', 'command')).toBe(true)
    expect(dock.ids()).toContain('run')
  })

  /**
   * A pick never covers the panel it was made in (operator, 2026-10-20): with the run bundle as a tab
   * beside the list, every click in the list hid the list. In another group it still comes forward.
   */
  it('leaves a picked target behind where it shares the picking panel\'s group, and brings it forward elsewhere', () => {
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)
    const runs = dock.api.getPanel('runs')!
    const run = dock.api.getPanel('run')!

    // the first arrangement: the bundle a split of its own beside the list — the pick brings it forward
    expect(run.group).not.toBe(runs.group)
    store.reveal('runs', 'command')
    expect(store.reveal('run', 'selection', 'runs')).toBe(true)
    expect(dock.active()).toBe('run')

    // the bundle dragged in as a tab beside the list: the pick leaves it behind
    run.api.moveTo({ group: runs.group })
    store.reveal('runs', 'command')
    expect(store.reveal('run', 'selection', 'runs')).toBe(true)
    expect(dock.active()).toBe('runs')
    // a command still comes to the front, whatever stands beside it
    store.reveal('run', 'command')
    expect(dock.active()).toBe('run')
  })

  it('brings an open panel to the front, and opens a closed one beside the active one', () => {
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)

    store.reveal('deployments', 'command')
    expect(dock.active()).toBe('deployments')

    // the free chart is not in the first arrangement, and has no place yet
    store.reveal('chart', 'command')
    expect(dock.ids()).toContain('chart')
    expect(dock.active()).toBe('chart')
    expect(dock.groups()[dock.ids().indexOf('chart')]).toBe(dock.groups()[0])
  })

  /**
   * The trades in the report and their candles one glance apart: where nothing it stood beside is
   * open any more, the run chart opens as a split to the report's right.
   */
  it('opens the run chart beside the run report where nothing it stood beside is open', () => {
    useArrangementStore().setDock({
      grid: { root: { type: 'leaf', data: { id: 'g', views: ['deployments', 'runs', 'run'], activeView: 'runs' } } },
      panels: Object.fromEntries(['deployments', 'runs', 'run'].map(id => [id, { id, params: { kind: id } }])),
    })
    // hidden by the reader beside a panel that is gone
    useArrangementStore().setPlaces({ 'run-chart': { besides: ['report-orders'], direction: 'right' } })
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)
    expect(dock.ids()).not.toContain('run-chart')

    store.reveal('run-chart', 'command')
    expect(dock.rows()).toEqual([['deployments', 'runs', 'run', 'deployment'], ['run-chart']])
    expect(dock.active()).toBe('run-chart')
  })

  describe('the Layers panel and the chart last in front', () => {
    /** Focus, not a selection: another panel coming to the front leaves the chart to arrange as it was. */
    it('follows the chart last in front, keeps it while another panel comes forward, and lets it go with it', () => {
      const dock = fakeDock()
      const store = useDockStore()
      store.attach(dock.api)
      expect(store.lastChart).toBe('run-chart')
      store.reveal('runs', 'command')
      expect(store.lastChart).toBe('run-chart')
      dock.close('run-chart')
      expect(store.lastChart).toBeNull()
      store.reveal('run-chart', 'command')
      expect(store.lastChart).toBe('run-chart')
    })

    /** As a tab it would hide the chart it arranges — so a narrow split beside it, at any width of the dock. */
    it('opens as a narrow split to the right of the chart it arranges, where the dock is narrow too', () => {
      const dock = fakeDock({ width: 1000 })
      const store = useDockStore()
      store.attach(dock.api)
      store.reveal('run-chart', 'command')
      store.reveal('layers', 'command')
      expect(dock.rows()).toEqual([['deployments', 'runs', 'run', 'deployment', 'run-chart'], ['layers']])
      expect(dock.width('layers')).toBe(240)
      expect(dock.active()).toBe('layers')
      expect(store.lastChart).toBe('run-chart')
    })

    it('finds the chart again after the dock is laid out anew', () => {
      const dock = fakeDock()
      const store = useDockStore()
      store.attach(dock.api)
      store.reset()
      expect(store.lastChart).toBe('run-chart')
    })
  })

  /**
   * A layout stored before the deployment bundle existed gains it behind the run bundle, whether a
   * deployment is chosen or not — never one the reader hid, which comes back from the menu, behind
   * the run bundle again (viewer#43).
   */
  it('gives a stored layout the deployment bundle behind the run bundle, and none the reader hid', () => {
    const layout = {
      grid: { root: { type: 'leaf', data: { id: 'g', views: ['deployments', 'runs', 'run'], activeView: 'runs' } } },
      panels: Object.fromEntries(['deployments', 'runs', 'run'].map(id => [id, { id, params: { kind: id } }])),
    }
    useArrangementStore().setDock(layout)
    const gains = fakeDock({ width: 1000 })
    useDockStore().attach(gains.api)
    expect(gains.ids().slice(0, 4)).toEqual(['deployments', 'runs', 'run', 'deployment'])
    expect(gains.active()).toBe('runs')

    setActivePinia(createPinia())
    useArrangementStore().setDock(layout)
    useArrangementStore().setPlaces({ deployment: { besides: ['run'], direction: 'within', index: 3 } })
    const hid = fakeDock({ width: 1000 })
    const store = useDockStore()
    store.attach(hid.api)
    expect(hid.ids()).not.toContain('deployment')
    // the menu brings it back where it stood
    store.reveal('deployment', 'command')
    expect(hid.ids()).toContain('deployment')
  })

  /** A new panel is appended with its default: a layout stored before the run chart opened by default. */
  it('gives a stored layout the run chart it never held, beside the report, and none the reader hid', () => {
    const layout = {
      grid: { root: { type: 'leaf', data: { id: 'g', views: ['deployments', 'runs', 'run'], activeView: 'run' } } },
      panels: Object.fromEntries(['deployments', 'runs', 'run'].map(id => [id, { id, params: { kind: id } }])),
    }
    useArrangementStore().setDock(layout)
    const gains = fakeDock()
    useDockStore().attach(gains.api)
    expect(gains.rows()).toEqual([['deployments', 'runs', 'run', 'deployment'], ['run-chart']])
    // the panel in front stays in front
    expect(gains.active()).toBe('run')

    setActivePinia(createPinia())
    useArrangementStore().setDock(layout)
    useArrangementStore().setPlaces({ 'run-chart': { besides: ['run'], direction: 'right' } })
    const hid = fakeDock()
    useDockStore().attach(hid.api)
    expect(hid.ids()).not.toContain('run-chart')
  })

  it('goes back to the suggested order on reset, and keeps that', () => {
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)
    dock.close('run-chart')

    store.reset()
    expect(dock.ids()).toEqual(['deployments', 'runs', 'run', 'deployment', 'run-chart'])
    expect(dock.active()).toBe('runs')
    expect(Object.keys((useArrangementStore().dock as { panels: object }).panels)).toEqual(['deployments', 'runs', 'run', 'deployment', 'run-chart'])
  })

  /** A drag changes the layout every frame — it is written once it holds still, or when the page goes. */
  it('writes a changed layout once it holds still, and at once when flushed', () => {
    vi.useFakeTimers()
    const dock = fakeDock()
    const store = useDockStore()
    store.attach(dock.api)
    const arrangement = useArrangementStore()

    dock.close('run-chart')
    dock.change()
    expect(Object.keys((arrangement.dock as { panels: object }).panels)).toContain('run-chart')
    vi.advanceTimersByTime(300)
    expect(Object.keys((arrangement.dock as { panels: object }).panels)).not.toContain('run-chart')
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
      expect(store.openIds).toEqual(['deployments', 'runs', 'run', 'deployment', 'run-chart'])
      dock.close('run-chart')
      expect(store.openIds).toEqual(['deployments', 'runs', 'run', 'deployment'])
    })

    it('opens the first beside the run report, as a split to its right, and in front', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      expect(dock.rows()).toEqual([['deployments', 'runs'], ['run', 'deployment'], ['report-trade-history'], ['run-chart']])
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
      store.reveal('runs', 'command')
      store.openSection('trade-history')
      expect(dock.ids().filter(id => id === 'report-trade-history')).toHaveLength(1)
      expect(dock.active()).toBe('report-trade-history')
    })

    it('gives every section back to the column on reset', () => {
      const { store } = attached()
      store.openSection('trade-history')
      store.reset()
      expect(store.openIds).toEqual(['deployments', 'runs', 'run', 'deployment', 'run-chart'])
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
      expect(place?.besides).toContain('run')
    })

    it('shows a hidden section again beside what it stood beside, at the size it had', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      dock.resize('report-trade-history', 520)
      dock.close('report-trade-history')

      store.showSection('trade-history')
      expect(dock.rows()).toEqual([['deployments', 'runs'], ['run', 'deployment'], ['report-trade-history'], ['run-chart']])
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
      expect(dock.rows()[2]).toEqual(['report-trade-history', 'report-orders', 'report-booking-periods'])
    })

    /** Where nothing it stood beside is left, the column is its place — and its panel comes forward. */
    it('shows a section in the column where nothing it stood beside is open any more', () => {
      const { dock, store } = attached()
      store.openSection('trade-history')
      dock.close('report-trade-history')
      for (const id of ['deployments', 'runs', 'run', 'deployment', 'run-chart']) dock.close(id)

      store.showSection('trade-history')
      expect(dock.ids()).toEqual(['run'])
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
      // the reader opened the free chart in a split of its own, right of the lists
      dock.api.addPanel({ id: 'chart', component: 'host', position: { referencePanel: 'runs', direction: 'right' } })
      dock.close('chart')

      store.reveal('chart', 'command')
      expect(dock.rows()).toEqual([['deployments', 'runs'], ['chart'], ['run', 'deployment'], ['run-chart']])
      expect(dock.active()).toBe('chart')
    })

    it('forgets every place on reset, and hides nothing it removes', () => {
      const { dock, store } = attached()
      store.openSection('orders')
      dock.close('run-chart')
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
      // the stand-in dock restores a stored layout into one group
      expect(again.rows()).toEqual([['deployments', 'runs', 'run', 'deployment', 'run-chart'], ['report-trade-history']])
    })
  })

  /**
   * A panel dragged to the very edge of the dock docks along the WHOLE edge (operator, 2026-10-16):
   * a column over the full height, a row over the full width — through dockview's public API,
   * because its own edge targets never saw a drag over a panel kept in the page.
   */
  describe('the edges of the dock', () => {
    function attached() {
      const dock = fakeDock()
      const store = useDockStore()
      store.attach(dock.api)
      return { dock, store }
    }

    it('knows what is being dragged, and forgets it once the drag ends anywhere', () => {
      const { dock, store } = attached()
      dock.dragPanel('runs')
      expect(store.dragging).toEqual({ panel: 'runs' })
      dock.drop()
      expect(store.dragging).toBeNull()

      dock.dragPanel('runs')
      store.endDrag()
      expect(store.dragging).toBeNull()
    })

    it('docks a dragged panel along the whole edge, a quarter of the dock wide', () => {
      const { dock, store } = attached()
      dock.dragPanel('runs')
      store.dockToEdge('left')
      expect(dock.edgeGroups).toEqual([{ direction: 'left', initialWidth: 450 }])
      expect(dock.rows()[0]).toEqual(['runs'])
      expect(store.dragging).toBeNull()
    })

    it('docks a row along the bottom, a quarter of the dock high', () => {
      const { dock, store } = attached()
      dock.dragPanel('runs')
      store.dockToEdge('bottom')
      expect(dock.edgeGroups).toEqual([{ direction: 'below', initialHeight: 225 }])
      expect(dock.rows().at(-1)).toEqual(['runs'])
    })

    it('moves a whole group dragged by its header, its tabs together', () => {
      const { dock, store } = attached()
      dock.dragGroupOf('runs')
      store.dockToEdge('right')
      expect(dock.rows().at(-1)).toEqual(['deployments', 'runs'])
    })

    it('adds nothing where nothing is being dragged', () => {
      const { dock, store } = attached()
      store.dockToEdge('left')
      expect(dock.edgeGroups).toEqual([])
    })
  })
})

/** Whether the column has the section switched off. */
function hidden(sectionId: string): boolean | undefined {
  return useLayoutStore().arrangedOf().find(panel => panel.id === sectionId)?.hidden
}
