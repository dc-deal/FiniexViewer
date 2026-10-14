import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { PANEL_KINDS, firstActiveKind, panelKind, reportKindId, sectionOfKind } from '@/panel_kinds'
import { allPanels } from '@/panel_registry'
import { useContextStore } from '@/stores/context_store'

describe('panel_kinds', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('gives every kind its own id and its own place in the suggested order', () => {
    expect(new Set(PANEL_KINDS.map(kind => kind.id)).size).toBe(PANEL_KINDS.length)
    expect(new Set(PANEL_KINDS.map(kind => kind.order)).size).toBe(PANEL_KINDS.length)
  })

  /** From the general to the particular: deployments, the run list, the run a pick opens, its chart. */
  it('opens the first arrangement as deployments, the run list, the run report, the chart', () => {
    const first = PANEL_KINDS.filter(kind => kind.opensByDefault)
      .sort((a, b) => a.order - b.order)
      .map(kind => kind.id)
    expect(first).toEqual(['deployments', 'runs', 'run', 'chart'])
  })

  /** Where the work is: the run report where a run is restored, the run list where none is yet. */
  it('opens on the run list without a run, and on the run report with one', () => {
    expect(firstActiveKind()).toBe('runs')
    useContextStore().selectRun('r1')
    expect(firstActiveKind()).toBe('run')
    expect(panelKind('runs')?.opensByDefault && panelKind('run')?.opensByDefault).toBe(true)
  })

  /** The list and the report share one area in the Panels menu; the report's tab names its run. */
  it('puts the run list and the run report in one area, and names the run on the tab of the report', () => {
    expect(panelKind('runs')?.area).toBe('runs')
    expect(panelKind('run')?.area).toBe('runs')
    expect(panelKind('run')?.subtitle?.()).toBeNull()
    useContextStore().selectRun('r1')
    expect(panelKind('run')?.subtitle?.()).toBe('r1')
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

  /** Listed in the submenu of the panel their column stands in — never at the menu's top level. */
  it('knows a kind for every section of the run report, and keeps them out of the top-level kinds', () => {
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
