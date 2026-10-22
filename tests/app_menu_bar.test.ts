import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AppMenuBar from '@/components/AppMenuBar.vue'
import { reportKindId } from '@/panel_kinds'
import { allPanels } from '@/panel_registry'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'

let mounted: VueWrapper | null = null

async function openMenu(word: string): Promise<HTMLElement[]> {
  const trigger = mounted!.findAll('.menu-bar-trigger').find(node => node.text().includes(word))!
  await trigger.trigger('keydown', { key: 'Enter' })
  await flushPromises()
  return [...document.querySelectorAll<HTMLElement>('.menu-item')]
}

/** Opens the submenu of the panel the run report's column stands in. */
async function openRunsSubmenu(): Promise<void> {
  await openMenu('Panels')
  const trigger = document.querySelector<HTMLElement>('.menu-sub-trigger[data-area="runs"]')!
  trigger.focus()
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await flushPromises()
}

function sectionEntry(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`.menu-toggle[data-section="${id}"]`)!
}

function kindEntry(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`.menu-toggle[data-kind="${id}"]`)!
}

describe('AppMenuBar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mounted = mount(AppMenuBar, { attachTo: document.body })
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  /** The menu reads the way the first arrangement does; the run report's column has a submenu. */
  it('offers the panels worked in, in the suggested order, each with the form it takes', async () => {
    const items = await openMenu('Panels')
    expect(items.map(item => item.dataset['kind'] ?? item.dataset['area'])).toEqual(['deployments', 'sweeps', 'runs', 'chart', 'layers', 'activities'])
    expect(kindEntry('chart').querySelector('[data-icon="form-chart"]')).not.toBeNull()
  })

  /** A tick is a panel on show; a click hides it, or shows it again where it stood. */
  it('ticks the open panels, hides an open one and brings a closed one back', async () => {
    const dock = useDockStore()
    dock.openIds = ['deployments', 'runs']
    const opened: string[] = []
    const closed: string[] = []
    dock.reveal = (kind: string, reason: string) => { opened.push(`${kind} ${reason}`); return true }
    dock.close = (kind: string) => { closed.push(kind) }

    await openMenu('Panels')
    expect(kindEntry('deployments').dataset['state']).toBe('checked')
    expect(kindEntry('chart').dataset['state']).toBe('unchecked')

    kindEntry('chart').click()
    kindEntry('deployments').click()
    await flushPromises()
    expect(opened).toEqual(['chart command'])
    expect(closed).toEqual(['deployments'])
  })

  /** In the reader's order — the column's — with where each one is, so a switched one does not move. */
  it('lists every section of the run report in the column\'s order, beside the panel it stands in', async () => {
    useLayoutStore().reorder(['broker', 'executive'])
    await openRunsSubmenu()
    // the area holds the run list and the run report, each by the name it has there
    expect(kindEntry('runs').textContent).toContain('Run list')
    expect(kindEntry('run').textContent).toContain('Run bundle')
    const sections = [...document.querySelectorAll<HTMLElement>('.menu-toggle[data-section]')].map(node => node.dataset['section'])
    expect(sections).toEqual(useLayoutStore().arrangedPanels.map(panel => panel.id))
    expect(sections.length).toBe(allPanels().length)
    expect(sections.indexOf('broker')).toBeLessThan(sections.indexOf('executive'))
  })

  it('says where each section is: in the column, open as a panel, or hidden', async () => {
    useLayoutStore().hide('config')
    useDockStore().openIds = ['runs', reportKindId('orders')]
    await openRunsSubmenu()

    expect(sectionEntry('executive').dataset['place']).toBe('column')
    expect(sectionEntry('executive').dataset['state']).toBe('checked')
    expect(sectionEntry('orders').dataset['place']).toBe('panel')
    expect(sectionEntry('orders').querySelector('[data-icon="action-open-panel"]')).not.toBeNull()
    expect(sectionEntry('config').dataset['place']).toBe('hidden')
    expect(sectionEntry('config').dataset['state']).toBe('unchecked')
  })

  it('hides a shown section and shows a hidden one again', async () => {
    useLayoutStore().hide('config')
    const dock = useDockStore()
    const shown: string[] = []
    const hidden: string[] = []
    dock.showSection = (id: string) => { shown.push(id) }
    dock.hideSection = (id: string) => { hidden.push(id) }
    await openRunsSubmenu()

    sectionEntry('config').click()
    sectionEntry('executive').click()
    await flushPromises()
    expect(shown).toEqual(['config'])
    expect(hidden).toEqual(['executive'])
  })

  /** An inventory that silently shortens is not one: a section the run lacks stays listed, struck. */
  it('strikes a section the chosen run does not carry, and does not switch it', async () => {
    useRunsStore().runs = [{ run_id: 'r1', has_reports: true } as RunInfo]
    useContextStore().selectRun('r1')
    const dock = useDockStore()
    const hidden = vi.fn()
    dock.hideSection = hidden
    await openRunsSubmenu()

    const entry = sectionEntry('feed-health')
    expect(entry.classList.contains('absent')).toBe(true)
    expect(entry.hasAttribute('data-disabled')).toBe(true)
    entry.click()
    await flushPromises()
    expect(hidden).not.toHaveBeenCalled()
  })

  /** With no run chosen there is no run to lack anything. */
  it('strikes nothing while no run is chosen', async () => {
    await openRunsSubmenu()
    expect(document.querySelectorAll('.menu-toggle.absent')).toHaveLength(0)
  })

  /** The bundle's own commands are on its tab, behind ⋯ (viewer#42): this menu shows and hides. */
  it('offers nothing in the submenu but showing and hiding', async () => {
    await openRunsSubmenu()
    // the submenu is the content that lists the sections; the menu above it holds its trigger
    const submenu = sectionEntry('executive').closest('.menu-content')!
    const entries = [...submenu.querySelectorAll('[role^="menuitem"]')]
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every(entry => entry.getAttribute('role') === 'menuitemcheckbox')).toBe(true)
  })

  /** Whose access the viewer works under is part of the frame, beside the application menu. */
  it('carries the account status in the frame', () => {
    expect(mounted!.find('.account-status').exists()).toBe(true)
  })

  /** One way back to the suggested order, and it lives in the settings — not a menu of one entry. */
  it('offers no Layout menu of its own', () => {
    expect(mounted!.findAll('.menu-bar-trigger').map(node => node.text())).toEqual(['Panels ▾'])
  })

  /**
   * The scenario in focus belongs to the link, not to a panel, so the frame says it ONCE for every
   * panel it narrows (viewer#42), with the way back to the whole run beside it.
   */
  it('says the scenario in focus once, with the way back to the whole run', async () => {
    expect(mounted!.find('.narrowed-head').exists()).toBe(false)
    useContextStore().selectRun('r1')
    useContextStore().toggleUnit('EURUSD_a')
    await flushPromises()
    expect(mounted!.findAll('.narrowed-head')).toHaveLength(1)
    expect(mounted!.find('.narrowed-head').text()).toContain('Only EURUSD_a')

    await mounted!.find('.narrowed-head button').trigger('click')
    expect(useRunsStore().selectedUnits).toEqual([])
  })
})
