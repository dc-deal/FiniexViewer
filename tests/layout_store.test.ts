import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLayoutStore, reconcile, pinnedBoundary, SCHEMA_VERSION } from '@/stores/layout_store'
import { allPanels } from '@/panel_registry'
import type { WorkspaceState } from '@/types/panel_types'

const STORAGE_KEY = 'layout.v1'

function stored(): WorkspaceState {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WorkspaceState
}

function workspaceWith(panelIds: string[]): WorkspaceState {
  return {
    version: SCHEMA_VERSION,
    bundles: {
      run: {
        columns: [{
          width: 1,
          panels: panelIds.map(id => ({
            id, open: true, pinned: false, locked: false, hidden: false,
          })),
        }],
      },
    },
  }
}

describe('reconcile', () => {
  it('drops panel ids the registry no longer knows', () => {
    const result = reconcile(workspaceWith(['executive', 'a-panel-that-was-removed']))
    const ids = result.bundles.run!.columns.flatMap(c => c.panels.map(p => p.id))
    expect(ids).not.toContain('a-panel-that-was-removed')
    expect(ids).toContain('executive')
  })

  it('appends panels added since the layout was stored, with their defaults', () => {
    const result = reconcile(workspaceWith(['executive']))
    const ids = result.bundles.run!.columns.flatMap(c => c.panels.map(p => p.id))
    expect(ids).toEqual(expect.arrayContaining(allPanels().map(panel => panel.id)))
  })

  /** A layout per bundle: one stored without a bundle's column gets that column at its defaults. */
  it('gives every bundle its column, where none was stored for it', () => {
    const result = reconcile({ version: SCHEMA_VERSION, bundles: {} })
    expect(Object.keys(result.bundles)).toEqual(['run', 'deployment'])
    expect(result.bundles.run!.columns[0]!.panels.map(panel => panel.id)).toEqual(allPanels().map(panel => panel.id))
  })
})

/**
 * The pinned group's boundary, which both orientations read and neither computes for itself. Null
 * where there is nothing to separate: a rule with one side says nothing and would be the kind of
 * decoration this project prints nowhere.
 */
describe('pinnedBoundary', () => {
  const state = (id: string, pinned: boolean) => ({ id, open: true, pinned, locked: false, hidden: false })

  it('is where the unpinned group starts', () => {
    expect(pinnedBoundary([state('a', true), state('b', true), state('c', false)])).toBe(2)
  })

  it('is null when nothing is pinned', () => {
    expect(pinnedBoundary([state('a', false), state('b', false)])).toBeNull()
  })

  it('is null when everything is pinned', () => {
    expect(pinnedBoundary([state('a', true), state('b', true)])).toBeNull()
  })

  it('is null for an empty arrangement', () => {
    expect(pinnedBoundary([])).toBeNull()
  })
})

describe('useLayoutStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('starts from the registry when nothing is stored', () => {
    const store = useLayoutStore()
    expect(store.visibleOf().map(p => p.id)).toEqual(allPanels().map(p => p.id))
    expect(store.arrangedOf().every(p => !p.hidden)).toBe(true)
  })

  /**
   * An arrangement stored under an older schema is DELETED, not converted. The project is alpha and
   * the arrangement is a convenience; code that reads a shape nobody writes any more would outlive
   * the one day it was useful, and an entry left behind in storage is the same artifact by another
   * name. So the key is removed rather than merely ignored.
   */
  it('deletes an arrangement from an older schema rather than converting it', () => {
    // version 2 held one column under `layouts.report`; a layout per bundle came with 3 (viewer#43)
    const stale = { version: SCHEMA_VERSION - 1, active: 'report', layouts: { report: { columns: [] } } }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stale))

    const store = useLayoutStore()
    expect(store.visibleOf().map(p => p.id)).toEqual(allPanels().map(p => p.id))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('survives a corrupt stored entry instead of breaking the workspace', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const store = useLayoutStore()
    expect(store.visibleOf().length).toBe(allPanels().length)
  })

  it('pin anchors a panel to the top and opens it once', () => {
    const store = useLayoutStore()
    const last = allPanels()[allPanels().length - 1]!.id
    store.setOpen(last, false)
    store.togglePin(last)

    expect(store.visibleOf()[0]!.id).toBe(last)
    expect(store.visibleOf()[0]!.open).toBe(true)

    // afterwards open/closed stays free — pin anchors, it does not lock
    store.setOpen(last, false)
    expect(store.visibleOf()[0]!.open).toBe(false)
    expect(store.visibleOf()[0]!.pinned).toBe(true)
  })

  it('collapse all skips locked panels', () => {
    const store = useLayoutStore()
    const [first, second] = allPanels()
    store.setOpen(first!.id, true)
    store.setOpen(second!.id, true)
    store.toggleLock(second!.id)

    store.collapseAll()
    const byId = new Map(store.visibleOf().map(p => [p.id, p]))
    expect(byId.get(first!.id)!.open).toBe(false)
    expect(byId.get(second!.id)!.open).toBe(true)
  })

  /**
   * The point of `hidden` being a flag: a switched-off panel leaves the COLUMN and keeps its place
   * in the arrangement, so its toggle in the bar does not move under the finger that flipped it.
   */
  it('hide leaves the column and keeps its place in the arrangement', () => {
    const store = useLayoutStore()
    const id = allPanels()[2]!.id
    const before = store.arrangedOf().findIndex(p => p.id === id)

    store.hide(id)
    expect(store.visibleOf().map(p => p.id)).not.toContain(id)
    expect(store.arrangedOf().findIndex(p => p.id === id)).toBe(before)

    store.show(id)
    expect(store.visibleOf().map(p => p.id)).toContain(id)
    expect(store.arrangedOf().findIndex(p => p.id === id)).toBe(before)
  })

  /** Switching one off must not move any OTHER toggle either. */
  it('hide moves no other panel', () => {
    const store = useLayoutStore()
    const before = store.arrangedOf().map(p => p.id)
    store.hide(allPanels()[2]!.id)
    expect(store.arrangedOf().map(p => p.id)).toEqual(before)
  })

  it('reorder writes the dropped order back', () => {
    const store = useLayoutStore()
    const reversed = [...allPanels()].reverse().map(p => p.id)
    store.reorder(reversed)
    expect(store.visibleOf().map(p => p.id)).toEqual(reversed)
  })

  it('persists every change under one versioned key', () => {
    const store = useLayoutStore()
    const id = allPanels()[0]!.id
    store.hide(id)
    expect(stored().version).toBe(SCHEMA_VERSION)
    // the panel is still IN the stored arrangement, carrying the flag — that is what survives a
    // reload and keeps its toggle where the reader left it
    const panels = stored().bundles.run!.columns.flatMap(c => c.panels)
    expect(panels.find(p => p.id === id)?.hidden).toBe(true)
  })

  it('reset returns to the registry default', () => {
    const store = useLayoutStore()
    store.hide(allPanels()[0]!.id)
    store.reset()
    expect(store.visibleOf().map(p => p.id)).toEqual(allPanels().map(p => p.id))
  })

  it('exports and imports a layout round-trip', () => {
    const store = useLayoutStore()
    const id = allPanels()[0]!.id
    store.hide(id)
    const exported = store.exportLayout()

    store.reset()
    expect(store.visibleOf().map(p => p.id)).toContain(id)

    expect(store.importLayout(exported)).toBe(true)
    expect(store.visibleOf().map(p => p.id)).not.toContain(id)
  })

  /** Another version is refused, as a stored one is removed: its fields may mean something else. */
  it('refuses an import of another version', () => {
    const store = useLayoutStore()
    const other = { ...JSON.parse(store.exportLayout()) as object, version: 1 }
    expect(store.importLayout(JSON.stringify(other))).toBe(false)
  })

  it('refuses an import that is not a workspace, without throwing', () => {
    const store = useLayoutStore()
    const before = store.visibleOf().map(p => p.id)
    expect(store.importLayout('not json at all')).toBe(false)
    expect(store.importLayout('{"nope":1}')).toBe(false)
    expect(store.visibleOf().map(p => p.id)).toEqual(before)
  })
})
