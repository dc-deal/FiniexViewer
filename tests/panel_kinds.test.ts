import { describe, it, expect } from 'vitest'
import { FIRST_ACTIVE_KIND, PANEL_KINDS, panelKind } from '@/panel_kinds'

describe('panel_kinds', () => {
  it('gives every kind its own id and its own place in the suggested order', () => {
    expect(new Set(PANEL_KINDS.map(kind => kind.id)).size).toBe(PANEL_KINDS.length)
    expect(new Set(PANEL_KINDS.map(kind => kind.order)).size).toBe(PANEL_KINDS.length)
  })

  /** From the general to the particular: a deployment holds runs, a run has its chart. */
  it('opens the first arrangement as deployments, runs, chart — About from the menu only', () => {
    const first = PANEL_KINDS.filter(kind => kind.opensByDefault)
      .sort((a, b) => a.order - b.order)
      .map(kind => kind.id)
    expect(first).toEqual(['deployments', 'runs', 'chart'])
    expect(panelKind('about')?.opensByDefault).toBe(false)
  })

  it('opens on a tab the first arrangement holds', () => {
    expect(panelKind(FIRST_ACTIVE_KIND)?.opensByDefault).toBe(true)
  })

  /** A tab shows the FORM a panel takes, so two lists read alike and the title tells them apart. */
  it('draws every tab with a form icon', () => {
    expect(PANEL_KINDS.every(kind => kind.icon.startsWith('form-'))).toBe(true)
  })

  /** About is ABOUT the application — reached beside the settings, not among the panels worked in. */
  it('reaches About from the application menu and every other kind from the Panels menu', () => {
    expect(PANEL_KINDS.filter(kind => kind.entry === 'application').map(kind => kind.id)).toEqual(['about'])
  })

  it('knows nothing of a kind this version does not have', () => {
    expect(panelKind('a-retired-kind')).toBeNull()
  })
})
