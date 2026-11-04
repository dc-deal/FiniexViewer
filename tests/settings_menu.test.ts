import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TopMenu from '@/components/TopMenu.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useDockStore } from '@/stores/dock_store'
import { useHintsStore } from '@/stores/hints_store'
import { useSettingsStore } from '@/stores/settings_store'
import { hintIds } from '@/hint_registry'
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

    // Named rather than taken by position: the tab holds a second button now, and "the first
    // .settings-button" quietly became the wrong one.
    it('restores the defaults on request', async () => {
      const store = useSettingsStore()
      store.setScenarioThreshold(20)
      store.setTheme('light')
      mountDialog()
      await flushPromises()
      panel('.app-button:not(.hints-reset)')?.click()
      await flushPromises()
      expect(store.settings).toEqual(DEFAULT_SETTINGS)
    })

    /**
     * A banned hint has no other way back — the control that banned it disappeared with it, so
     * without this the reader's only route is clearing site data.
     */
    it('brings back a hint that was banned for good', async () => {
      const hints = useHintsStore()
      const id = hintIds()[0] as string
      hints.ban(id)
      expect(hints.isVisible(id)).toBe(false)

      mountDialog()
      await flushPromises()
      panel('.hints-reset')?.click()
      await flushPromises()
      expect(hints.isVisible(id)).toBe(true)
    })
  })

  describe('the layouts tab', () => {
    /** The menu chooses and the settings manage (2026-11-04): the layouts are kept on this tab. */
    it('keeps the named layouts, and carries them to another machine', async () => {
      mountDialog()
      await flushPromises()
      await openTab('Layouts')
      expect(activePanel()?.querySelector('.layouts-settings .layout-row[data-layout="backtests"]')).not.toBeNull()
      expect(activePanel()?.querySelector('.import-input')).not.toBeNull()
    })

    /**
     * The one way back to the suggested order — beside everything else about arrangement. It is no
     * named layout, so a layout loaded before does not take it in as its own placement.
     */
    it('takes the docked panels back to the suggested order, and the loaded layout off', async () => {
      const dock = useDockStore()
      let resets = 0
      dock.reset = () => { resets += 1 }
      useArrangementStore().setLayout('backtests')
      mountDialog()
      await flushPromises()
      await openTab('Layouts')
      panel('[data-action="reset-dock"]')!.click()
      expect(resets).toBe(1)
      expect(useArrangementStore().layout).toBeNull()
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

  /** About is read and closed, so it is a dialog — no panel and no tab for it. */
  it('opens About as a dialog from the application menu', async () => {
    const wrapper = mountMenu()
    expect(panel('.about-dialog')).toBeNull()
    await wrapper.find('.menu-trigger').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    document.querySelector<HTMLElement>('.menu-item[data-action="about"]')!.click()
    await flushPromises()
    expect(panel('.about-dialog')?.textContent).toContain('About FiniexViewer')
  })
})
