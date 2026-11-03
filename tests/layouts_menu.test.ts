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

/** A dock that has been laid out, so there is a placement to save. */
function placed(): void {
  useArrangementStore().setDock({ grid: { root: { type: 'leaf', data: { id: 'g', views: ['runs'] } } }, panels: { runs: { id: 'runs' } } })
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

  /** A shipped layout is reset, never renamed or deleted; a reader's own the other way round. */
  it('offers each action on the loaded layout only where it applies', async () => {
    layOut()
    placed()
    const store = useNamedLayoutsStore()
    store.load('backtests')
    mountMenu()
    await openMenu()
    expect(entry('[data-action="rename"]').hasAttribute('data-disabled')).toBe(true)
    expect(entry('[data-action="delete"]').hasAttribute('data-disabled')).toBe(true)
    expect(entry('[data-action="reset-shipped"]').hasAttribute('data-disabled')).toBe(false)

    store.saveAs('Mine')
    await flushPromises()
    expect(entry('[data-action="rename"]').hasAttribute('data-disabled')).toBe(false)
    expect(entry('[data-action="delete"]').hasAttribute('data-disabled')).toBe(false)
    expect(entry('[data-action="reset-shipped"]').hasAttribute('data-disabled')).toBe(true)
  })

  it('asks before it deletes, and deletes on the second click', async () => {
    placed()
    const store = useNamedLayoutsStore()
    store.saveAs('Mine')
    mountMenu()
    await openMenu()
    entry('[data-action="delete"]').click()
    await flushPromises()
    expect(entry('[data-action="delete"]').textContent).toContain('Really delete Mine')
    expect(store.layouts.map(layout => layout.name)).toContain('Mine')

    entry('[data-action="delete"]').click()
    await flushPromises()
    expect(store.layouts.map(layout => layout.name)).not.toContain('Mine')
  })

  /** A name that is taken is said so where it is typed, and nothing is saved until it is free. */
  it('saves this placement under a free name, and says why a taken one cannot be', async () => {
    placed()
    mountMenu()
    await openMenu()
    entry('[data-action="save-as"]').click()
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('.layout-name-input')!
    input.value = 'Backtests'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(document.querySelector('.layout-name-problem')?.textContent).toContain('A layout of this name exists')
    expect(document.querySelector<HTMLButtonElement>('[data-action="confirm-name"]')!.disabled).toBe(true)

    input.value = 'Morning review'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-name"]')!.click()
    await flushPromises()
    expect(useNamedLayoutsStore().loaded?.name).toBe('Morning review')
    expect(document.querySelector('.layout-name-input')).toBeNull()
  })

  it('says how many layouts a file brought, and that a file brought none', async () => {
    placed()
    const store = useNamedLayoutsStore()
    store.saveAs('Mine')
    const file = store.exportAll()
    mountMenu()
    const input = mounted!.find<HTMLInputElement>('.import-input').element

    for (const [text, said] of [[file, '3 layouts taken'], ['not a layout', 'That file holds no layout']]) {
      Object.defineProperty(input, 'files', { value: [new File([text], 'layouts.json', { type: 'application/json' })], configurable: true })
      input.dispatchEvent(new Event('change'))
      // the file is read through FileReader, which jsdom schedules as a task of its own
      await vi.waitFor(() => {
        expect(document.querySelector('.layout-notice')?.textContent).toBe(said)
      }, { timeout: 2000, interval: 10 })
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flushPromises()
    }
  })
})
