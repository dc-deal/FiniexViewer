import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TopMenu from '@/components/TopMenu.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useCallerStore } from '@/stores/caller_store'
import { useSettingsStore } from '@/stores/settings_store'
import { DEFAULT_SETTINGS } from '@/types/settings_types'
import type { SettingsTab } from '@/types/settings_types'
import type { CallerIdentity } from '@/types/api/caller_types'

// Held so it can be unmounted: both the menu and the dialog portal their content out of the
// component, and wiping the body would tear the component down against nothing.
let mounted: VueWrapper | null = null

const IDENTITY: CallerIdentity = {
  enforced: true,
  client: 'viewer',
  account: 'viewer-op',
  account_kind: 'person',
  display_name: 'Viewer-Operator',
  grants: ['brokers:*', 'reports:*'],
  note: 'dev proxy holds it',
}

function mountMenu() {
  mounted = mount(TopMenu, { attachTo: document.body })
  return mounted
}

function mountDialog(tab?: SettingsTab) {
  mounted = mount(SettingsDialog, { attachTo: document.body, props: { open: true, tab } })
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

async function setField(id: string, value: string): Promise<void> {
  const element = field(id)!
  element.value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

/**
 * The panel on show. The inactive tabs keep their wrapper element and lose their content, so the
 * first `.tab-panel` in the document is usually an empty shell rather than the one being read.
 */
function activePanel(): HTMLElement | null {
  return document.querySelector('.tab-panel[data-state="active"]')
}

/** Tab triggers are portalled with the dialog; they are picked by their visible word. */
async function openTab(word: string): Promise<void> {
  const trigger = [...document.querySelectorAll<HTMLElement>('.tab-trigger')]
    .find(entry => entry.textContent?.includes(word))
  // the primitive switches on pointer-down, not on the click that follows it
  trigger!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  trigger!.click()
  await flushPromises()
}

async function pickFile(text: string, name = 'layout.json'): Promise<void> {
  const input = panel('.import-input') as HTMLInputElement
  const file = new File([text], name, { type: 'application/json' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
  await flushPromises()
}

const A_LAYOUT = JSON.stringify({
  version: 1,
  active: 'report',
  layouts: { report: { columns: [{ width: 1, panels: [] }], hidden: [] } },
})

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

  it('opens on the tab it was asked for', async () => {
    mountDialog('account')
    await flushPromises()
    expect(field('setting-theme')).toBeNull()
    expect(activePanel()?.textContent).not.toContain('Timeline order')
  })

  describe('the display tab', () => {
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
      await setField('setting-theme', 'light')
      expect(store.settings.theme).toBe('light')
    })

    it('writes a changed timeline order into the store', async () => {
      const store = useSettingsStore()
      mountDialog()
      await flushPromises()
      await setField('setting-lane-order', 'name')
      expect(store.settings.laneOrder).toBe('name')
    })

    it('writes a changed threshold into the store', async () => {
      const store = useSettingsStore()
      mountDialog()
      await flushPromises()
      await setField('setting-threshold', '15')
      expect(store.settings.scenarioThreshold).toBe(15)
    })

    // the field is an input, so anything can be typed into it — the store is the guard, not the UI
    it('leaves the value alone when the typed number is out of range', async () => {
      const store = useSettingsStore()
      mountDialog()
      await flushPromises()
      await setField('setting-threshold', '4000')
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

  describe('the layout tab', () => {
    it('carries the export and import the layout has no other home for', async () => {
      mountDialog()
      await flushPromises()
      await openTab('Layout')
      expect(activePanel()?.textContent).toContain('Export layout')
      expect(activePanel()?.textContent).toContain('Import layout')
    })

    it('reports a file that is not a layout instead of failing silently', async () => {
      mountDialog('layout')
      await flushPromises()
      await pickFile('this is not a layout', 'notes.json')
      expect(activePanel()?.textContent).toContain('not a layout')
    })

    it('confirms a layout that imported cleanly', async () => {
      mountDialog('layout')
      await flushPromises()
      await pickFile(A_LAYOUT)
      expect(activePanel()?.textContent).toContain('Layout replaced')
    })
  })

  describe('the account tab', () => {
    it('names the account, the client and the grants the server reported', async () => {
      const store = useCallerStore()
      store.identity = IDENTITY
      store.state = 'ready'
      store.readAt = new Date()
      mountDialog('account')
      await flushPromises()
      const text = activePanel()?.textContent ?? ''
      expect(text).toContain('Viewer-Operator')
      expect(text).toContain('viewer-op')
      expect(text).toContain('brokers:*')
      expect(text).toContain('as of')
    })

    /**
     * The failure a 200 disguises: with gating off the server verifies no token, so an answer
     * arrives for a credential nobody checked. It must never read as a signed-in identity.
     */
    it('says plainly when the server verifies no token at all', async () => {
      const store = useCallerStore()
      store.state = 'unenforced'
      mountDialog('account')
      await flushPromises()
      const notice = panel('.account-notice')
      expect(notice?.textContent).toContain('verifies no token')
      expect(notice?.className).toContain('warn')
    })

    // a refused credential and an unreachable server are different problems, shown differently
    it('separates a refused token from a server that did not answer', async () => {
      const store = useCallerStore()
      store.state = 'unauthenticated'
      mountDialog('account')
      await flushPromises()
      expect(panel('.account-notice')?.className).toContain('warn')
      mounted?.unmount()

      store.state = 'failed'
      mountDialog('account')
      await flushPromises()
      expect(panel('.account-notice')?.className).toContain('bad')
    })
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

  // the entry names where it goes, so the symbol and the word cannot disagree
  it('names the theme it would switch TO', async () => {
    const settings = useSettingsStore()
    const wrapper = mountMenu()
    await wrapper.find('.menu-trigger').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.querySelector('.menu-content')?.textContent).toContain('Light theme')

    settings.setTheme('light')
    await flushPromises()
    expect(document.querySelector('.menu-content')?.textContent).toContain('Dark theme')
  })

  /** The cheap half of identity: the menu says which access this viewer works under. */
  it('shows the account name once the server has reported one', async () => {
    const caller = useCallerStore()
    caller.identity = IDENTITY
    caller.state = 'ready'
    const wrapper = mountMenu()
    await wrapper.find('.menu-trigger').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.querySelector('.menu-content')?.textContent).toContain('Viewer-Operator')
  })

  it('stays with the plain word while there is no identity to show', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.menu-trigger').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const text = document.querySelector('.menu-content')?.textContent ?? ''
    expect(text).toContain('Account')
    expect(text).not.toContain('Viewer-Operator')
  })

  it('opens the dialog on the account tab from the account entry', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.menu-trigger').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const account = [...document.querySelectorAll<HTMLElement>('.menu-item')]
      .find(entry => entry.textContent?.includes('Account'))
    account!.click()
    await flushPromises()
    expect(panel('.settings-dialog')).not.toBeNull()
    expect(field('setting-theme')).toBeNull()
  })
})
