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

  /** Each layout's submenu offers its three sizes, the loaded one ticked; a pick loads the layout in it. */
  it('loads a layout in the size picked from its submenu, the loaded size ticked', async () => {
    const restore = layOut()
    useNamedLayoutsStore().load('deploys', 'medium')
    mountMenu()
    await openMenu()
    await mounted!.vm.$nextTick()
    entry('[data-layout="deploys"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()
    const sizes = () => document.querySelector<HTMLElement>('[data-sizes-of="deploys"]')!
    expect([...sizes().querySelectorAll<HTMLElement>('[data-size]')].map(item => item.dataset['size'])).toEqual(['full', 'medium', 'mobile'])
    expect(sizes().querySelector<HTMLElement>('[data-size="medium"]')!.dataset['loaded']).toBe('true')

    sizes().querySelector<HTMLElement>('[data-size="mobile"]')!.click()
    await flushPromises()
    expect(restore).toHaveBeenCalledTimes(2)
    expect(useArrangementStore().layoutSize).toBe('mobile')
  })

  /** The layout the chosen run maps to stands beside the menu, and a click loads it. */
  it('shows the offered layout beside the menu, and loads it on a click', async () => {
    const restore = layOut()
    const store = useNamedLayoutsStore()
    store.load('backtests', 'medium')
    mountMenu()
    expect(mounted!.find('[data-action="layout-offer"]').exists()).toBe(false)

    store.offer('deploys')
    await flushPromises()
    const offer = mounted!.find('[data-action="layout-offer"]')
    expect(offer.text()).toBe('⇄ Deploys')
    await offer.trigger('click')
    expect(restore).toHaveBeenCalledTimes(2)
    expect(store.loaded?.id).toBe('deploys')
    expect(store.loadedSize).toBe('medium')
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
