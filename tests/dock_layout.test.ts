import { describe, it, expect } from 'vitest'
import { reconcileLayout } from '@/components/dock/dock_layout'

const KNOWN = new Set(['deployments', 'runs', 'chart'])
const known = (kind: string): boolean => KNOWN.has(kind)

function panel(id: string, kind = id): object {
  return { id, contentComponent: 'host', title: id, params: { kind } }
}

function leaf(id: string, views: string[], activeView = views[0]): object {
  return { type: 'leaf', size: 500, data: { id, views, activeView } }
}

/** Two groups side by side, the way a reader leaves them after one split. */
function stored(left: string[], right: string[], panels: object, extra: object = {}): object {
  return {
    grid: {
      root: { type: 'branch', size: 700, data: [leaf('g1', left), leaf('g2', right)] },
      height: 700, width: 1000, orientation: 'HORIZONTAL',
    },
    panels,
    activeGroup: 'g2',
    ...extra,
  }
}

describe('reconcileLayout', () => {
  it('keeps a layout whose every panel is a known kind', () => {
    const layout = reconcileLayout(stored(['deployments', 'runs'], ['chart'], {
      deployments: panel('deployments'), runs: panel('runs'), chart: panel('chart'),
    }), known)
    expect(layout).not.toBeNull()
    expect(Object.keys(layout!.panels)).toEqual(['deployments', 'runs', 'chart'])
    expect(layout!.activeGroup).toBe('g2')
  })

  it('drops a panel of an unknown kind from its group, and moves the group to a tab still there', () => {
    const layout = reconcileLayout(stored(['retired', 'runs'], ['chart'], {
      retired: panel('retired'), runs: panel('runs'), chart: panel('chart'),
    }), known)
    const left = (layout!.grid.root.data as { data: { views: string[], activeView: string } }[])[0]!
    expect(left.data.views).toEqual(['runs'])
    expect(left.data.activeView).toBe('runs')
    expect(layout!.panels).not.toHaveProperty('retired')
  })

  /** A group with nothing left in it would be an empty frame on the reader's screen. */
  it('drops a group left empty, and the active group with it', () => {
    const layout = reconcileLayout(stored(['runs'], ['retired'], {
      runs: panel('runs'), retired: panel('retired'),
    }), known)
    expect(layout!.grid.root.data).toHaveLength(1)
    expect(layout!.activeGroup).toBeUndefined()
  })

  it('drops what this app switches off, and the tab groups it does not draw', () => {
    const layout = reconcileLayout(stored(['runs'], ['chart'], { runs: panel('runs'), chart: panel('chart') }, {
      floatingGroups: [{ data: {}, position: {} }],
      popoutGroups: [{ data: {} }],
    }), known)
    expect(layout).not.toHaveProperty('floatingGroups')
    expect(layout).not.toHaveProperty('popoutGroups')

    const withTabGroups = stored(['runs'], ['chart'], { runs: panel('runs'), chart: panel('chart') }) as {
      grid: { root: { data: { data: object }[] } }
    }
    withTabGroups.grid.root.data[0]!.data = { id: 'g1', views: ['runs'], activeView: 'runs', tabGroups: [{ id: 'x' }] }
    const cleaned = reconcileLayout(withTabGroups, known)
    expect((cleaned!.grid.root.data as { data: object }[])[0]!.data).not.toHaveProperty('tabGroups')
  })

  it('gives up where nothing usable is left, so the caller lays out the suggested order', () => {
    expect(reconcileLayout(stored(['retired'], ['gone'], { retired: panel('retired'), gone: panel('gone') }), known))
      .toBeNull()
    expect(reconcileLayout(null, known)).toBeNull()
    expect(reconcileLayout('a string', known)).toBeNull()
    expect(reconcileLayout({ grid: {}, panels: {} }, known)).toBeNull()
  })
})
