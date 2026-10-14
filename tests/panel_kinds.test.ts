import { describe, it, expect } from 'vitest'
import { FIRST_ACTIVE_KIND, PANEL_KINDS, panelKind, reportKindId, sectionOfKind } from '@/panel_kinds'
import { allPanels } from '@/panel_registry'

describe('panel_kinds', () => {
  it('gives every kind its own id and its own place in the suggested order', () => {
    expect(new Set(PANEL_KINDS.map(kind => kind.id)).size).toBe(PANEL_KINDS.length)
    expect(new Set(PANEL_KINDS.map(kind => kind.order)).size).toBe(PANEL_KINDS.length)
  })

  /** From the general to the particular: a deployment holds runs, a run has its chart. */
  it('opens the first arrangement as deployments, runs, chart', () => {
    const first = PANEL_KINDS.filter(kind => kind.opensByDefault)
      .sort((a, b) => a.order - b.order)
      .map(kind => kind.id)
    expect(first).toEqual(['deployments', 'runs', 'chart'])
  })

  it('opens on a tab the first arrangement holds', () => {
    expect(panelKind(FIRST_ACTIVE_KIND)?.opensByDefault).toBe(true)
  })

  /** A tab shows the FORM a panel takes, so two lists read alike and the title tells them apart. */
  it('draws every tab with a form icon', () => {
    expect(PANEL_KINDS.every(kind => kind.icon.startsWith('form-'))).toBe(true)
  })

  /** What is read or set and then closed is a dialog — nobody keeps About open beside the work. */
  it('holds no kind for About or the settings', () => {
    expect(panelKind('about')).toBeNull()
    expect(panelKind('settings')).toBeNull()
  })

  it('knows nothing of a kind this version does not have', () => {
    expect(panelKind('a-retired-kind')).toBeNull()
  })

  /** Opened from its own header in the column — the Panels menu does not list the sections. */
  it('knows a kind for every section of the run report, and keeps them out of the menu', () => {
    for (const section of allPanels()) {
      const kind = panelKind(reportKindId(section.id))
      expect(kind?.title).toBe(section.title)
      expect(kind?.opensByDefault).toBe(false)
      expect(PANEL_KINDS.some(entry => entry.id === kind?.id)).toBe(false)
    }
  })

  it('names the section a kind shows, and none for any other kind', () => {
    expect(sectionOfKind(reportKindId('trade-history'))).toBe('trade-history')
    expect(sectionOfKind('runs')).toBeNull()
  })

  it('draws a list section as a list, and every other section as a sheet', () => {
    expect(panelKind(reportKindId('trade-history'))?.icon).toBe('form-list')
    expect(panelKind(reportKindId('executive'))?.icon).toBe('form-sheet')
  })

  /** A section the narrowing does not change would carry a statement about something else. */
  it('says the narrowing beside a section exactly where the narrowing reaches it', () => {
    for (const section of allPanels()) {
      const kind = panelKind(reportKindId(section.id))
      expect(Boolean(kind?.quickBar), section.id).toBe(section.narrowing !== null)
    }
    expect(panelKind(reportKindId('trade-history'))?.quickBar).toBeDefined()
    expect(panelKind(reportKindId('executive'))?.quickBar).toBeUndefined()
  })
})
