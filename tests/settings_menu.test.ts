import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TopMenu from '@/components/TopMenu.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useSettingsStore } from '@/stores/settings_store'
import { DEFAULT_SETTINGS } from '@/types/settings_types'

// Held so it can be unmounted: both the menu and the dialog portal their content out of the
// component, and wiping the body would tear the component down against nothing.
let mounted: VueWrapper | null = null

function mountMenu() {
  mounted = mount(TopMenu, { attachTo: document.body })
  return mounted
}

function mountDialog() {
  mounted = mount(SettingsDialog, { attachTo: document.body, props: { open: true } })
  return mounted
}

/**
 * A turn of the macrotask queue as well as the microtask queue. Reading a file resolves through
 * FileReader, which jsdom schedules as a task — flushing promises alone never reaches it.
 */
function settle(): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, 0) })
}

/** Portalled, so it is read off the document rather than off the wrapper. */
function panel(selector: string): HTMLElement | null {
  return document.querySelector(selector)
}

function field(id: string): HTMLInputElement | HTMLSelectElement | null {
  return document.querySelector(`#${id}`)
}

async function setField(id: string, value: string, event: 'change' | 'input'): Promise<void> {
  const element = field(id)!
  element.value = value
  element.dispatchEvent(new Event(event, { bubbles: true }))
  await flushPromises()
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('opens outside the component, where no panel can clip it', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const dialog = panel('.settings-dialog')
    expect(dialog).not.toBeNull()
    expect(wrapper.element.contains(dialog)).toBe(false)
  })

  it('shows every setting at the value in force', async () => {
    const store = useSettingsStore()
    store.setTheme('light')
    store.setScenarioThreshold(12)
    store.setTradeRowCap(250)
    mountDialog()
    await flushPromises()
    expect(field('setting-theme')?.value).toBe('light')
    expect(field('setting-threshold')?.value).toBe('12')
    expect(field('setting-row-cap')?.value).toBe('250')
  })

  it('writes a changed theme into the store', async () => {
    const store = useSettingsStore()
    mountDialog()
    await flushPromises()
    await setField('setting-theme', 'light', 'change')
    expect(store.settings.theme).toBe('light')
  })

  it('writes a changed timeline order into the store', async () => {
    const store = useSettingsStore()
    mountDialog()
    await flushPromises()
    await setField('setting-lane-order', 'name', 'change')
    expect(store.settings.laneOrder).toBe('name')
  })

  it('writes a changed threshold into the store', async () => {
    const store = useSettingsStore()
    mountDialog()
    await flushPromises()
    await setField('setting-threshold', '15', 'change')
    expect(store.settings.scenarioThreshold).toBe(15)
  })

  // the field is an input, so anything can be typed into it — the store is the guard, not the UI
  it('leaves the value alone when the typed number is out of range', async () => {
    const store = useSettingsStore()
    mountDialog()
    await flushPromises()
    await setField('setting-threshold', '4000', 'change')
    expect(store.settings.scenarioThreshold).toBe(DEFAULT_SETTINGS.scenarioThreshold)
  })

  it('restores the defaults on request', async () => {
    const store = useSettingsStore()
    store.setScenarioThreshold(20)
    store.setTheme('light')
    mountDialog()
    await flushPromises()
    panel('.settings-button')?.click()
    await flushPromises()
    expect(store.settings).toEqual(DEFAULT_SETTINGS)
  })
})

describe('TopMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('offers one entry point rather than scattering application actions', () => {
    const wrapper = mountMenu()
    expect(wrapper.find('.menu-trigger').exists()).toBe(true)
  })

  it('keeps the settings dialog shut until it is asked for', () => {
    mountMenu()
    expect(panel('.settings-dialog')).toBeNull()
  })

  /**
   * The point of the entry: it states that an account is not available and stands in for nothing.
   * A mocked user is a promise the API cannot keep, and the next change would be written against
   * it — so the test pins that it is present AND unusable.
   */
  it('names an account only to say it is unavailable, and it cannot be chosen', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.menu-trigger').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const entries = [...document.querySelectorAll('.menu-item')]
    const account = entries.find(entry => entry.textContent?.includes('Account'))
    expect(account).toBeDefined()
    expect(account?.getAttribute('data-disabled')).not.toBeNull()
  })

  it('reports a file that is not a layout instead of failing silently', async () => {
    const wrapper = mountMenu()
    const input = wrapper.find('.import-input')
    const file = new File(['this is not a layout'], 'notes.json', { type: 'application/json' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await settle()
    await flushPromises()
    expect(wrapper.find('.menu-notice').text()).toContain('not a layout')
  })

  it('says nothing when a layout imports cleanly', async () => {
    const wrapper = mountMenu()
    const input = wrapper.find('.import-input')
    const layout = JSON.stringify({
      version: 1,
      active: 'report',
      layouts: { report: { columns: [{ width: 1, panels: [] }], hidden: [] } },
    })
    const file = new File([layout], 'layout.json', { type: 'application/json' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await settle()
    await flushPromises()
    expect(wrapper.find('.menu-notice').exists()).toBe(false)
  })
})
