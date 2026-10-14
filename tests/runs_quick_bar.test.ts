import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RunsQuickBar from '@/components/RunsQuickBar.vue'
import { useContextStore } from '@/stores/context_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'

function narrowTo(units: string[]): void {
  const context = useContextStore()
  context.selectRun('r1')
  context.setUnits(units)
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

  it('names the scenarios on show while they fit, and counts them past that', () => {
    narrowTo(['EURUSD_a', 'GBPUSD_b'])
    expect(mount(RunsQuickBar).text()).toContain('Showing only EURUSD_a · GBPUSD_b')

    narrowTo(['a', 'b', 'c', 'd'])
    expect(mount(RunsQuickBar).text()).toContain('Showing only 4 scenarios')
  })

  /** Claimed only where the roster arrived — its absence says nothing about a name. */
  it('says which narrowed names this run does not have, once the roster has arrived', () => {
    narrowTo(['EURUSD_a', 'gone'])
    expect(mount(RunsQuickBar).text()).not.toContain('not in this run')

    useRunReportsStore().scenarios = { units: [{ name: 'EURUSD_a' }] } as unknown as ScenarioDetailsReport
    expect(mount(RunsQuickBar).text()).toContain('not in this run: gone')
  })

  it('shows the whole run again', async () => {
    narrowTo(['EURUSD_a'])
    const wrapper = mount(RunsQuickBar)
    await wrapper.find('button').trigger('click')
    expect(useContextStore().main.run.units).toEqual([])
  })
})
