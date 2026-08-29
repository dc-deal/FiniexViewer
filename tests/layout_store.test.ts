import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLayoutStore, reconcile } from '@/stores/layout_store'
import { allPanels } from '@/panel_registry'
import type { WorkspaceState } from '@/types/panel_types'

const STORAGE_KEY = 'layout.v1'

function stored(): WorkspaceState {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WorkspaceState
}

function workspaceWith(panelIds: string[]): WorkspaceState {
  return {
    version: 1,
    active: 'report',
    layouts: {
      report: {
        columns: [{
          width: 1,
          panels: panelIds.map(id => ({ id, open: true, pinned: false, locked: false })),
        }],
      },
    },
  }
}

describe('reconcile', () => {
  it('drops panel ids the registry no longer knows', () => {
    const result = reconcile(workspaceWith(['executive', 'a-panel-that-was-removed']))
    const ids = result.layouts['report']!.columns.flatMap(c => c.panels.map(p => p.id))
    expect(ids).not.toContain('a-panel-that-was-removed')
    expect(ids).toContain('executive')
  })

  it('appends panels added since the layout was stored, with their defaults', () => {
    const result = reconcile(workspaceWith(['executive']))
    const ids = result.layouts['report']!.columns.flatMap(c => c.panels.map(p => p.id))
    expect(ids).toEqual(expect.arrayContaining(allPanels().map(panel => panel.id)))
  })

  it('falls back to the default workspace when nothing usable survives', () => {
    const result = reconcile({ version: 1, active: 'report', layouts: {} })
    expect(Object.keys(result.layouts)).toEqual(['report'])
  })

  it('repairs an active name that points at a layout which is gone', () => {
    const source = workspaceWith(['executive'])
    source.active = 'a-layout-that-was-deleted'
    expect(reconcile(source).active).toBe('report')
  })
})

describe('useLayoutStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('starts from the registry when nothing is stored', () => {
    const store = useLayoutStore()
    expect(store.visiblePanels.map(p => p.id)).toEqual(allPanels().map(p => p.id))
    expect(store.hiddenPanelIds).toEqual([])
  })

  it('survives a corrupt stored entry instead of breaking the workspace', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const store = useLayoutStore()
    expect(store.visiblePanels.length).toBe(allPanels().length)
  })

  it('pin anchors a panel to the top and opens it once', () => {
    const store = useLayoutStore()
    const last = allPanels()[allPanels().length - 1]!.id
    store.setOpen(last, false)
    store.togglePin(last)

    expect(store.visiblePanels[0]!.id).toBe(last)
    expect(store.visiblePanels[0]!.open).toBe(true)

    // afterwards open/closed stays free — pin anchors, it does not lock
    store.setOpen(last, false)
    expect(store.visiblePanels[0]!.open).toBe(false)
    expect(store.visiblePanels[0]!.pinned).toBe(true)
  })

  it('collapse all skips locked panels', () => {
    const store = useLayoutStore()
    const [first, second] = allPanels()
    store.setOpen(first!.id, true)
    store.setOpen(second!.id, true)
    store.toggleLock(second!.id)

    store.collapseAll()
    const byId = new Map(store.visiblePanels.map(p => [p.id, p]))
    expect(byId.get(first!.id)!.open).toBe(false)
    expect(byId.get(second!.id)!.open).toBe(true)
  })

  it('hide removes a panel from the column and the app bar can bring it back', () => {
    const store = useLayoutStore()
    const id = allPanels()[0]!.id
    store.hide(id)
    expect(store.visiblePanels.map(p => p.id)).not.toContain(id)
    expect(store.hiddenPanelIds).toContain(id)

    store.show(id)
    expect(store.visiblePanels.map(p => p.id)).toContain(id)
  })

  it('reorder writes the dropped order back', () => {
    const store = useLayoutStore()
    const reversed = [...allPanels()].reverse().map(p => p.id)
    store.reorder(reversed)
    expect(store.visiblePanels.map(p => p.id)).toEqual(reversed)
  })

  it('persists every change under one versioned key', () => {
    const store = useLayoutStore()
    store.hide(allPanels()[0]!.id)
    expect(stored().version).toBe(1)
    const ids = stored().layouts['report']!.columns.flatMap(c => c.panels.map(p => p.id))
    expect(ids).not.toContain(allPanels()[0]!.id)
  })

  it('reset returns to the registry default', () => {
    const store = useLayoutStore()
    store.hide(allPanels()[0]!.id)
    store.reset()
    expect(store.visiblePanels.map(p => p.id)).toEqual(allPanels().map(p => p.id))
  })

  it('exports and imports a layout round-trip', () => {
    const store = useLayoutStore()
    const id = allPanels()[0]!.id
    store.hide(id)
    const exported = store.exportLayout()

    store.reset()
    expect(store.visiblePanels.map(p => p.id)).toContain(id)

    expect(store.importLayout(exported)).toBe(true)
    expect(store.visiblePanels.map(p => p.id)).not.toContain(id)
  })

  it('refuses an import that is not a workspace, without throwing', () => {
    const store = useLayoutStore()
    const before = store.visiblePanels.map(p => p.id)
    expect(store.importLayout('not json at all')).toBe(false)
    expect(store.importLayout('{"nope":1}')).toBe(false)
    expect(store.visiblePanels.map(p => p.id)).toEqual(before)
  })
})
