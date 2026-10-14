import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { DockviewApi } from 'dockview-vue'
import { useDockStore } from '@/stores/dock_store'
import { useArrangementStore } from '@/stores/arrangement_store'

interface FakePanel {
  id: string
  group: string
  api: { setActive: () => void }
}

/**
 * The part of dockview the store talks to, kept as plain data: which panels are open, in which
 * group, which one is in front. The real dock needs a browser to lay anything out.
 */
function fakeDock(options: { refuse?: boolean } = {}) {
  const panels: FakePanel[] = []
  let active: string | null = null
  let changed: (() => void) | null = null
  const restored: unknown[] = []

  function addPanel(spec: { id: string, position?: { referencePanel: string } }): void {
    const group = spec.position ? panels.find(p => p.id === spec.position!.referencePanel)!.group : `g${panels.length}`
    panels.push({ id: spec.id, group, api: { setActive: () => { active = spec.id } } })
  }

  function close(id: string): void {
    panels.splice(panels.findIndex(p => p.id === id), 1)
    if (active === id) active = panels[0]?.id ?? null
  }

  const api = {
    get panels() { return panels },
    get totalPanels() { return panels.length },
    get activePanel() { return panels.find(p => p.id === active) },
    getPanel: (id: string) => panels.find(p => p.id === id),
    addPanel,
    clear: () => { panels.length = 0; active = null },
    fromJSON: (layout: { panels: Record<string, unknown> }) => {
      if (options.refuse) throw new Error('refused')
      restored.push(layout)
      Object.keys(layout.panels).forEach(id => addPanel({ id }))
    },
    toJSON: () => ({
      grid: { root: { type: 'leaf', data: { id: 'g', views: panels.map(p => p.id) } } },
      panels: Object.fromEntries(panels.map(p => [p.id, { id: p.id, params: { kind: p.id } }])),
    }),
    onDidLayoutChange: (listener: () => void) => {
      changed = listener
      return { dispose: () => { changed = null } }
    },
  }
  return {
    api: api as unknown as DockviewApi,
    ids: () => panels.map(p => p.id),
    groups: () => panels.map(p => p.group),
    active: () => active,
    restored,
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
})
