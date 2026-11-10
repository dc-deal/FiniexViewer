import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AppMenuBar from '@/components/AppMenuBar.vue'
import StatusBar from '@/components/StatusBar.vue'

let mounted: VueWrapper[] = []

function mountBar(component: typeof StatusBar | typeof AppMenuBar): VueWrapper {
  const wrapper = mount(component, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

/**
 * The frame's two bars (operator, 2026-11-10): the menu bar above the dock chooses, the status bar
 * below it states what the window works against — the model of VS Code's and JetBrains' bars.
 */
describe('StatusBar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    mounted.forEach(wrapper => wrapper.unmount())
    mounted = []
  })

  it('states the server, the access and the machine, and the menu bar no longer does', () => {
    const status = mountBar(StatusBar)
    for (const part of ['.server-switch', '.account-status', '.machine-status']) {
      expect(status.find(part).exists()).toBe(true)
    }
    const menu = mountBar(AppMenuBar)
    for (const part of ['.server-switch', '.account-status', '.machine-status', '.contract-status']) {
      expect(menu.find(part).exists()).toBe(false)
    }
  })

  /** The account's name goes first, the contract's words next, the machine's last; the server's only shortens. */
  it('ranks its entries, and the server name is the one that shortens and never goes', () => {
    const status = mountBar(StatusBar)
    const rankOf = (part: string): string | null =>
      status.find(part).element.closest('[data-rank]')?.getAttribute('data-rank') ?? null
    expect([rankOf('.account-status'), rankOf('.machine-status')]).toEqual(['1', '3'])
    expect(rankOf('.server-switch')).toBeNull()
    expect(status.find('.server-name').attributes('data-shortens')).toBeDefined()
  })

  /** A short form trades the word for its icon on screen; the word stays in the page for a screen reader. */
  it('keeps the words of a short entry in the page', () => {
    const status = mountBar(StatusBar)
    const machine = status.find('.machine-status')
    expect(machine.findAll('.bar-word').map(word => word.text())).toEqual(['CPU', 'Memory'])
    expect(machine.findAll('.bar-icon')).toHaveLength(2)
    expect(status.find('.account-status .bar-word').exists()).toBe(true)
  })
})
