import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AppBar from '@/components/panels/AppBar.vue'
import { allPanels } from '@/panel_registry'

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
