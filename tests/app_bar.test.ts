import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AppBar from '@/components/panels/AppBar.vue'
import { useLayoutStore } from '@/stores/layout_store'
import { allPanels } from '@/panel_registry'
import { stubOverflowWidths } from './overflow_harness'

/** Every section present — the baseline the absent cases are measured against. */
function allSources(): Record<string, unknown> {
  return Object.fromEntries(allPanels().map(panel => [panel.source, {}]))
}

function mountBar(sources: Record<string, unknown>) {
  return mount(AppBar, { props: { sources }, global: { plugins: [createPinia()] } })
}

function toggleFor(wrapper: ReturnType<typeof mountBar>, title: string) {
  return wrapper.findAll('.bar-toggle').find(node => node.text().includes(title))!
}

describe('AppBar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('renders a toggle for every registered panel', () => {
    expect(mountBar(allSources()).findAll('.bar-toggle')).toHaveLength(allPanels().length)
  })

  /** The registry says what a panel kind looks like; the bar is one of the two places that draw it. */
  it('draws every panel\'s icon on its toggle', () => {
    const wrapper = mountBar(allSources())
    const missing = allPanels().filter(panel =>
      !toggleFor(wrapper, panel.title).find(`[data-icon="kind-${panel.id}"]`).exists())
    expect(missing.map(panel => panel.id)).toEqual([])
  })

  /**
   * Pinning lifts a panel into a second CATEGORY rather than letting its toggle wander. The line
   * is what makes the move legible: the bubble did not run away, it crossed a boundary that is
   * drawn. Without it, pinning reorders the bar and nothing on screen says why.
   */
  it('draws the pinned boundary on the first toggle after the group', () => {
    const store = useLayoutStore()
    expect(mountBar(allSources()).findAll('.bar-toggle.group-start')).toHaveLength(0)

    store.togglePin(allPanels()[3]!.id)
    const toggles = mountBar(allSources()).findAll('.bar-toggle')
    const marked = toggles.filter(node => node.classes('group-start'))
    expect(marked).toHaveLength(1)
    // the pinned one leads, so the line sits on the second toggle
    expect(toggles[0]!.text()).toContain(allPanels()[3]!.title)
    expect(marked[0]!.text()).toBe(toggles[1]!.text())
  })

  /** Nothing to separate, nothing drawn — the same rule that keeps a passing check silent. */
  it('draws no boundary when every panel is pinned', () => {
    const store = useLayoutStore()
    for (const panel of allPanels()) store.togglePin(panel.id)
    expect(mountBar(allSources()).findAll('.bar-toggle.group-start')).toHaveLength(0)
  })

  /**
   * The bar and the column must agree about ORDER. A reader who drags a panel to the top and then
   * finds its toggle still sixth in the bar has two arrangements to hold in their head — and the
   * bar is the thing they navigate by, so the arrangement decides and the registry does not.
   */
  it('follows the order the reader arranged, not the registry', () => {
    const ids = allPanels().map(panel => panel.id)
    const moved = [ids[ids.length - 1]!, ...ids.slice(0, -1)]
    useLayoutStore().reorder(moved)

    const titles = mountBar(allSources()).findAll('.bar-toggle').map(node => node.text())
    const lastPanel = allPanels()[ids.length - 1]!
    expect(titles[0]).toContain(lastPanel.title)
  })

  /**
   * A switched-off panel keeps its PLACE. The bar is where a reader goes to bring something back,
   * and a toggle that moves when you flip it is a control that runs away from the finger. This is
   * the behaviour `hidden` became a flag for: it was appended at the end before, so switching one
   * panel off reordered the whole bar under the hand that did it.
   */
  it('keeps a hidden panel listed, in its own place', () => {
    const subject = allPanels()[2]!
    const before = mountBar(allSources()).findAll('.bar-toggle').map(node => node.text())
    useLayoutStore().hide(subject.id)

    const after = mountBar(allSources()).findAll('.bar-toggle').map(node => node.text())
    expect(after).toHaveLength(allPanels().length)
    expect(after).toEqual(before)
  })

  /**
   * An absent section stays LISTED and is disabled rather than hidden. Hiding it raises the
   * question where it went — the same argument the scenario roster makes for the scenarios that
   * produced nothing. The bar is an inventory, and one that silently shortens is not one.
   */
  it('disables the toggle of a section this run does not carry, and says why', () => {
    const sources = allSources()
    const scenarios = allPanels().find(panel => panel.source === 'scenarioRoster')!
    delete sources['scenarioRoster']

    const toggle = toggleFor(mountBar(sources), scenarios.title)
    expect(toggle.attributes('disabled')).toBeDefined()
    expect(toggle.classes()).toContain('absent')
    expect(toggle.attributes('title')).toContain('carries no such section')
  })

  /** A section on its way for a new run is not absent — it would flicker struck-through on every change. */
  it('keeps the toggle of a section that is still on its way usable', () => {
    const sources = allSources()
    const scenarios = allPanels().find(panel => panel.source === 'scenarioRoster')!
    delete sources['scenarioRoster']

    const wrapper = mount(AppBar, {
      props: { sources, pending: { scenarioRoster: true } },
      global: { plugins: [createPinia()] },
    })
    const toggle = toggleFor(wrapper, scenarios.title)
    expect(toggle.attributes('disabled')).toBeUndefined()
    expect(toggle.classes()).not.toContain('absent')
  })

  it('leaves the toggles of the sections that ARE there usable', () => {
    const sources = allSources()
    delete sources['scenarioRoster']

    const present = allPanels().find(panel => panel.source === 'bookingPeriods')!
    const toggle = toggleFor(mountBar(sources), present.title)
    expect(toggle.attributes('disabled')).toBeUndefined()
    expect(toggle.classes()).not.toContain('absent')
  })

  /**
   * Two different greys would be one grey. A section the reader PUT AWAY and a section the run does
   * not HAVE are different states, and the second is the one that owns the disabled vocabulary —
   * which is why the toggles stopped wearing muted ink at rest.
   */
  it('tells a section put away apart from one that does not exist', async () => {
    const sources = allSources()
    delete sources['scenarioRoster']
    const wrapper = mountBar(sources)

    const present = allPanels().find(panel => panel.source === 'bookingPeriods')!
    const hidden = toggleFor(wrapper, present.title)
    await hidden.trigger('click')

    expect(hidden.classes()).not.toContain('shown')
    expect(hidden.classes()).not.toContain('absent')
    expect(hidden.attributes('disabled')).toBeUndefined()
  })

  describe('in a panel too narrow for every toggle', () => {
    let attached: VueWrapper | null = null

    /** Room for three: the control takes 40, then 100 per item — 140, 240, 340 of 350. */
    async function mountNarrow(sources: Record<string, unknown>): Promise<VueWrapper> {
      stubOverflowWidths(350, 100, 40)
      attached = mount(AppBar, { props: { sources }, global: { plugins: [createPinia()] }, attachTo: document.body })
      await flushPromises()
      return attached
    }

    async function openMenu(wrapper: VueWrapper): Promise<void> {
      await wrapper.find('.overflow-more').trigger('keydown', { key: 'Enter' })
      await flushPromises()
    }

    afterEach(() => {
      attached?.unmount()
      attached = null
      vi.restoreAllMocks()
    })

    /** ONE row, whatever the width: the rest waits behind `+N`, the two actions first. */
    it('keeps the bar to one row, with the rest behind the control and the actions last', async () => {
      const wrapper = await mountNarrow(allSources())
      expect(wrapper.findAll('.overflow-cell:not(.overflow-gone)')).toHaveLength(3)

      await openMenu(wrapper)
      expect(document.querySelectorAll('.bar-menu-toggle')).toHaveLength(allPanels().length - 3)
      const actions = [...document.querySelectorAll('.menu-item:not(.bar-menu-toggle)')]
        .map(node => node.textContent?.trim())
      expect(actions).toEqual(['Collapse all', 'Reset layout'])
    })

    /** The menu is the same inventory as the bar: a section the run does not carry is listed and struck. */
    it('lists a section the run does not carry, disabled, the way the bar does', async () => {
      const subject = allPanels()[5]!
      const sources = allSources()
      delete sources[subject.source]
      await openMenu(await mountNarrow(sources))

      const entry = document.querySelector(`.bar-menu-toggle[data-section="${subject.id}"]`)!
      expect(entry.classList).toContain('absent')
      expect(entry.hasAttribute('data-disabled')).toBe(true)
      // switched on or not, a section that does not exist is not ticked — the bar does not mark it shown either
      expect(entry.getAttribute('data-state')).toBe('unchecked')
    })

    it('switches a section from the menu and stays open for the next one', async () => {
      const subject = allPanels()[5]!
      await openMenu(await mountNarrow(allSources()))
      const entry = () => document.querySelector<HTMLElement>(`.bar-menu-toggle[data-section="${subject.id}"]`)
      expect(entry()!.getAttribute('data-state')).toBe('checked')

      entry()!.click()
      await flushPromises()
      expect(entry()!.getAttribute('data-state')).toBe('unchecked')
    })

    /** The hint explains the control, so it speaks only while the control is there. */
    it('explains the control only while something waits behind it', async () => {
      expect(mountBar(allSources()).find('.hint-line').exists()).toBe(false)
      const narrow = await mountNarrow(allSources())
      expect(narrow.find('.hint-line').text()).toContain('waits behind the +')
    })
  })

  // A disabled control must not act, not merely look inert.
  it('does not toggle a section that is not there', async () => {
    const sources = allSources()
    delete sources['scenarioRoster']
    const wrapper = mountBar(sources)
    const scenarios = allPanels().find(panel => panel.source === 'scenarioRoster')!

    const before = toggleFor(wrapper, scenarios.title).classes().includes('shown')
    await toggleFor(wrapper, scenarios.title).trigger('click')
    expect(toggleFor(wrapper, scenarios.title).classes().includes('shown')).toBe(before)
  })
})
