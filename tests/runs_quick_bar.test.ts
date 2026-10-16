import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RunsQuickBar from '@/components/RunsQuickBar.vue'
import { useContextStore } from '@/stores/context_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'

function focusOn(unit: string): void {
  const context = useContextStore()
  context.selectRun('r1')
  context.toggleUnit(unit)
}

describe('RunsQuickBar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /** Where nothing is narrowed, the bar says nothing. */
  it('is empty while the whole run is shown', () => {
    expect(mount(RunsQuickBar).find('.narrowed-head').exists()).toBe(false)
  })

  /** The scenario in focus, named in the line — and in its title, for a panel too narrow to show it. */
  it('names the scenario in focus', () => {
    focusOn('EURUSD_a')
    const wrapper = mount(RunsQuickBar)
    expect(wrapper.text()).toContain('Only EURUSD_a')
    expect(wrapper.find('.narrowed-text').attributes('title')).toBe('Only EURUSD_a')
  })

  /** Claimed only where the roster arrived — its absence says nothing about a name. */
  it('says the name is not in this run, once the roster has arrived', () => {
    focusOn('gone')
    expect(mount(RunsQuickBar).text()).not.toContain('not in this run')

    useRunReportsStore().scenarios = { units: [{ name: 'EURUSD_a' }] } as unknown as ScenarioDetailsReport
    expect(mount(RunsQuickBar).text()).toContain('Only gone — not in this run')
  })

  it('shows the whole run again', async () => {
    focusOn('EURUSD_a')
    const wrapper = mount(RunsQuickBar)
    await wrapper.find('button').trigger('click')
    expect(useContextStore().main.run.units).toEqual([])
  })
})
