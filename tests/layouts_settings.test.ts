import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LayoutsSettings from '@/components/LayoutsSettings.vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useDockStore } from '@/stores/dock_store'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'

let mounted: VueWrapper | null = null

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

async function settings(): Promise<VueWrapper> {
  mounted = mount(LayoutsSettings, { attachTo: document.body })
  await flushPromises()
  return mounted
}

async function pick(wrapper: VueWrapper, id: string): Promise<void> {
  await wrapper.find(`.layout-row[data-layout="${id}"]`).trigger('click')
  await flushPromises()
}

async function typeName(wrapper: VueWrapper, name: string): Promise<void> {
  await wrapper.find('.layout-name-input').setValue(name)
  await flushPromises()
}

function action(wrapper: VueWrapper, name: string) {
  return wrapper.find(`[data-action="${name}"]`)
}

/** Settings › Layouts: the layouts as a list with a detail, kept where the servers are kept (2026-11-04). */
describe('LayoutsSettings', () => {
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

  it('lists the layouts, the shipped ones said so, the loaded one ticked and picked', async () => {
    layOut()
    useNamedLayoutsStore().load('deploys')
    const wrapper = await settings()
    expect(wrapper.find('[data-layout="backtests"]').text()).toContain('shipped')
    expect(wrapper.find('[data-layout="deploys"] .layout-check').text()).toBe('✓')
    expect(wrapper.find('[data-layout="backtests"] .layout-check').text()).toBe('')
    expect(wrapper.find<HTMLInputElement>('.layout-name-input').element.value).toBe('Deploys')
  })

  /** A shipped layout is reset, never renamed or deleted; a reader's own the other way round. */
  it('offers on each layout only what applies to it', async () => {
    placed()
    useNamedLayoutsStore().saveAs('Mine')
    const wrapper = await settings()

    await pick(wrapper, 'backtests')
    expect(wrapper.find('.layout-name-input').attributes('readonly')).toBeDefined()
    expect(action(wrapper, 'reset-shipped').exists()).toBe(true)
    expect(action(wrapper, 'rename').exists()).toBe(false)
    expect(action(wrapper, 'delete').exists()).toBe(false)

    await pick(wrapper, useNamedLayoutsStore().loaded!.id)
    expect(wrapper.find('.layout-name-input').attributes('readonly')).toBeUndefined()
    expect(action(wrapper, 'reset-shipped').exists()).toBe(false)
    expect(action(wrapper, 'rename').exists()).toBe(true)
    expect(action(wrapper, 'delete').exists()).toBe(true)
  })

  it('renames a layout of the reader once its name has changed, to a free name', async () => {
    placed()
    const store = useNamedLayoutsStore()
    store.saveAs('Mine')
    const wrapper = await settings()
    expect(action(wrapper, 'rename').attributes('disabled')).toBeDefined()

    await typeName(wrapper, 'Backtests')
    expect(wrapper.find('.layout-problem').text()).toContain('A layout of this name exists')
    expect(action(wrapper, 'rename').attributes('disabled')).toBeDefined()

    await typeName(wrapper, 'Evening review')
    expect(action(wrapper, 'rename').attributes('disabled')).toBeUndefined()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.loaded?.name).toBe('Evening review')
  })

  it('asks before it deletes, and deletes on the second click', async () => {
    placed()
    const store = useNamedLayoutsStore()
    store.saveAs('Mine')
    const wrapper = await settings()

    await action(wrapper, 'delete').trigger('click')
    expect(action(wrapper, 'delete').text()).toContain('Really delete Mine')
    expect(store.layouts.map(layout => layout.name)).toContain('Mine')

    await action(wrapper, 'delete').trigger('click')
    await flushPromises()
    expect(store.layouts.map(layout => layout.name)).not.toContain('Mine')
    expect(wrapper.find('.layout-row[data-layout^="own-"]').exists()).toBe(false)
  })

  /** A name that is taken is said so where it is typed, and nothing is saved until it is free. */
  it('saves this window under a free name, loads it, and says why a taken one cannot be', async () => {
    placed()
    const store = useNamedLayoutsStore()
    const wrapper = await settings()
    await action(wrapper, 'new-layout').trigger('click')
    await flushPromises()
    expect(wrapper.find<HTMLInputElement>('.layout-name-input').element.value).toBe('')

    await typeName(wrapper, 'Backtests')
    expect(wrapper.find('.layout-problem').text()).toContain('A layout of this name exists')
    expect(action(wrapper, 'confirm-name').attributes('disabled')).toBeDefined()

    await typeName(wrapper, 'Morning review')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.loaded?.name).toBe('Morning review')
    expect(wrapper.find(`.layout-row[data-layout="${store.loaded!.id}"] .layout-check`).text()).toBe('✓')
  })

  it('resets a shipped layout to how it shipped', async () => {
    const store = useNamedLayoutsStore()
    const reset = vi.spyOn(store, 'resetShipped')
    const wrapper = await settings()
    await pick(wrapper, 'deploys')
    await action(wrapper, 'reset-shipped').trigger('click')
    expect(reset).toHaveBeenCalledWith('deploys')
  })

  it('says how many layouts a file brought, and that a file brought none', async () => {
    placed()
    const store = useNamedLayoutsStore()
    store.saveAs('Mine')
    const file = store.exportAll()
    const wrapper = await settings()
    const input = wrapper.find<HTMLInputElement>('.import-input').element

    for (const [text, said] of [[file, '3 layouts taken'], ['not a layout', 'That file holds no layout']]) {
      Object.defineProperty(input, 'files', { value: [new File([text], 'layouts.json', { type: 'application/json' })], configurable: true })
      input.dispatchEvent(new Event('change'))
      // the file is read through FileReader, which jsdom schedules as a task of its own
      await vi.waitFor(() => {
        expect(wrapper.find('.layout-notice').text()).toBe(said)
      }, { timeout: 2000, interval: 10 })
    }
  })

  /** The suggested order is no named layout: the one loaded before lets go of this window first. */
  it('goes back to the suggested order with no layout loaded', async () => {
    layOut()
    const store = useNamedLayoutsStore()
    store.load('backtests')
    const reset = vi.spyOn(useDockStore(), 'reset').mockImplementation(() => {})
    const wrapper = await settings()
    await action(wrapper, 'reset-dock').trigger('click')
    expect(reset).toHaveBeenCalledTimes(1)
    expect(store.loaded).toBeNull()
  })
})
