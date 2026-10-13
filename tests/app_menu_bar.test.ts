import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AppMenuBar from '@/components/AppMenuBar.vue'
import { useDockStore } from '@/stores/dock_store'

let mounted: VueWrapper | null = null

async function openMenu(word: string): Promise<HTMLElement[]> {
  const trigger = mounted!.findAll('.menu-bar-trigger').find(node => node.text().includes(word))!
  await trigger.trigger('keydown', { key: 'Enter' })
  await flushPromises()
  return [...document.querySelectorAll<HTMLElement>('.menu-item')]
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

  /** The menu reads the way the first arrangement does; About is reached from the application menu. */
  it('offers the panels worked in, in the suggested order, each with the form it takes', async () => {
    const items = await openMenu('Panels')
    expect(items.map(item => item.dataset['kind'])).toEqual(['deployments', 'runs', 'chart'])
    expect(items[2]!.querySelector('[data-icon="form-chart"]')).not.toBeNull()
  })

  it('brings the chosen panel to the dock', async () => {
    const dock = useDockStore()
    const opened: string[] = []
    dock.open = (kind: string) => { opened.push(kind) }

    const items = await openMenu('Panels')
    items.find(item => item.dataset['kind'] === 'chart')!.click()
    await flushPromises()
    expect(opened).toEqual(['chart'])
  })

  /** One way back to the suggested order, and it lives in the settings — not a menu of one entry. */
  it('offers no Layout menu of its own', () => {
    expect(mounted!.findAll('.menu-bar-trigger').map(node => node.text())).toEqual(['Panels ▾'])
  })
})
