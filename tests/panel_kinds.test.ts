import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { memberKindId, memberOfKind } from '@/bundle_members'
import {
  DEPLOYMENT_BUNDLE, PANEL_KINDS, RUN_BUNDLE, allPanelKinds, firstActiveKind, panelKind, reportKindId, sectionOfKind,
} from '@/panel_kinds'
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

  /**
   * From the general to the particular: the deployment list and its bundle, the run list, the run a
   * pick opens, its chart. The run chart beside the report from the start; the free chart is opened
   * from the menu.
   */
  it('opens the first arrangement as the deployments, the run list, the run report, the run chart', () => {
    const first = PANEL_KINDS.filter(kind => kind.opensByDefault)
      .sort((a, b) => a.order - b.order)
      .map(kind => kind.id)
    expect(first).toEqual(['deployments', 'deployment', 'runs', 'run', 'run-chart'])
    expect(panelKind('chart')!.opensByDefault).toBe(false)
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

  /**
   * The narrowing is said ONCE, in the menu bar (viewer#42): beside every group holding a narrowed
   * panel it stood four times on one screen for one focus. A quick bar holds a panel's own options.
   */
  it('leaves the narrowing to the menu bar, with no quick bar on the bundle or a section', () => {
    expect(panelKind(RUN_BUNDLE)?.quickBar).toBeUndefined()
    for (const section of allPanels()) {
      expect(panelKind(reportKindId(section.id))?.quickBar, section.id).toBeUndefined()
    }
    expect(panelKind('run-chart')?.quickBar).toBeDefined()
  })

  /**
   * The relations are DATA (viewer#42): what a panel follows and chooses, and the bundle it is
   * part of. A tab's card says them in words, so a wrong declaration is a wrong sentence on screen.
   */
  describe('the relations every kind declares', () => {
    it('makes every member a member of its own bundle, and no other kind a member of anything', () => {
      for (const kind of allPanelKinds()) {
        expect(kind.relations.memberOf, kind.id).toBe(memberOfKind(kind.id)?.bundle ?? null)
      }
      expect(panelKind(RUN_BUNDLE)).not.toBeNull()
      expect(panelKind(DEPLOYMENT_BUNDLE)).not.toBeNull()
      expect(sectionOfKind(memberKindId(DEPLOYMENT_BUNDLE, 'sessions'))).toBeNull()
    })

    it('lists a key once at most', () => {
      for (const kind of allPanelKinds()) {
        expect(new Set(kind.relations.follows).size, kind.id).toBe(kind.relations.follows.length)
        expect(new Set(kind.relations.chooses).size, kind.id).toBe(kind.relations.chooses.length)
      }
    })

    /** A section whose rows the narrowing filters shows another scenario's rows when it moves. */
    it('has a section the narrowing filters follow the scenario in focus, and one that only marks it not', () => {
      for (const section of allPanels()) {
        const follows = panelKind(reportKindId(section.id))?.relations.follows ?? []
        if (section.narrowing === 'filters') expect(follows, section.id).toContain('units')
        if (section.narrowing === 'marks') expect(follows, section.id).not.toContain('units')
      }
    })

    it('follows nothing that no panel chooses', () => {
      const chosen = new Set(allPanelKinds().flatMap(kind => kind.relations.chooses))
      for (const kind of allPanelKinds()) {
        for (const key of kind.relations.follows) expect(chosen.has(key), `${kind.id} follows ${key}`).toBe(true)
      }
    })

    // the issue's own anchors, so a change to them is a decision and not a slip
    it('has the run list choose the run, and the run chart follow the run, the scenario it chooses and the position', () => {
      expect(panelKind('runs')?.relations).toEqual({ memberOf: null, follows: [], chooses: ['run'] })
      expect(panelKind('run-chart')?.relations)
        .toEqual({ memberOf: null, follows: ['run', 'units', 'position'], chooses: ['units'] })
    })
  })
})
