import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LayoutsMenu from '@/components/LayoutsMenu.vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useDockStore } from '@/stores/dock_store'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'

let mounted: VueWrapper | null = null

async function openMenu(): Promise<void> {
  await mounted!.find('.layouts-trigger').trigger('keydown', { key: 'Enter' })
  await flushPromises()
}

function entry(selector: string): HTMLElement {
  return document.querySelector<HTMLElement>(`.layouts-menu ${selector}`)!
}

/** The dock lays a layout out as the real one does: what it holds besides the panels first. */
function layOut() {
  return vi.spyOn(useDockStore(), 'restore').mockImplementation((_layout, prepare) => {
    prepare?.()
    return true
  })
}

describe('LayoutsMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
    document.body.innerHTML = ''
  })

  function mountMenu(): void {
    mounted = mount(LayoutsMenu, { attachTo: document.body })
  }

  /** The shipped layouts say so in words; a tick marks the one this window loaded. */
  it('lists the layouts, the shipped ones said so, the loaded one ticked', async () => {
    layOut()
    useNamedLayoutsStore().load('deploys')
    mountMenu()
    await openMenu()
    expect(entry('[data-layout="backtests"]').textContent).toContain('shipped')
    expect(entry('[data-layout="deploys"]').dataset['loaded']).toBe('true')
    expect(entry('[data-layout="deploys"] .menu-check').textContent).toBe('✓')
    expect(entry('[data-layout="backtests"] .menu-check').textContent).toBe('')
  })

  it('loads a layout on a click', async () => {
    const restore = layOut()
    mountMenu()
    await openMenu()
    entry('[data-layout="backtests"]').click()
    await flushPromises()
    expect(restore).toHaveBeenCalledTimes(1)
    expect(useArrangementStore().layout).toBe('backtests')
  })

  /**
   * The menu chooses and the settings manage (2026-11-04): after the layouts comes one entry, and it
   * opens the settings on their Layouts tab. No action stands beside the choices.
   */
  it('ends with one entry that opens the settings on their Layouts tab', async () => {
    mountMenu()
    await openMenu()
    const actions = [...document.querySelectorAll<HTMLElement>('.layouts-menu [data-action]')].map(item => item.dataset['action'])
    expect(actions).toEqual(['manage-layouts'])

    entry('[data-action="manage-layouts"]').click()
    await flushPromises()
    expect(document.querySelector('.settings-dialog')).not.toBeNull()
    expect(document.querySelector('.tab-trigger[data-state="active"]')?.textContent).toContain('Layouts')
    expect(document.querySelector('.layouts-settings')).not.toBeNull()
  })
})
