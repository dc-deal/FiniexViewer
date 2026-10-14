import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RunsQuickBar from '@/components/RunsQuickBar.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { useContextStore } from '@/stores/context_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'
import type { Figure } from '@/types/figure_types'

function narrowTo(units: string[]): void {
  const context = useContextStore()
  context.selectRun('r1')
  context.setUnits(units)
}

/** The rows of the card behind the line, or none where the line says it all. */
function cardRows(wrapper: ReturnType<typeof mount>): Figure[] | null {
  const card = wrapper.findComponent(HoverCard)
  return card.exists() ? card.props('details') as Figure[] : null
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

  /** The one name is the scenario the reader clicked, and the line holds it without a card. */
  it('names a single scenario in the line itself', () => {
    narrowTo(['EURUSD_a'])
    const wrapper = mount(RunsQuickBar)
    expect(wrapper.text()).toContain('Showing only EURUSD_a')
    expect(cardRows(wrapper)).toBeNull()
  })

  /** Names beside a narrow panel's tabs pushed the tabs into their overflow menu. */
  it('counts from two scenarios on, and names them in the card behind the count', () => {
    narrowTo(['EURUSD_a', 'GBPUSD_b'])
    const wrapper = mount(RunsQuickBar)
    expect(wrapper.text()).toContain('Showing only 2 scenarios')
    expect(wrapper.text()).not.toContain('EURUSD_a')
    expect(cardRows(wrapper)).toEqual([{ label: 'Showing only', value: 'EURUSD_a, GBPUSD_b' }])
  })

  /** Claimed only where the roster arrived — its absence says nothing about a name. */
  it('says which narrowed names this run does not have, once the roster has arrived', () => {
    narrowTo(['EURUSD_a', 'gone'])
    expect(mount(RunsQuickBar).text()).not.toContain('not in this run')

    useRunReportsStore().scenarios = { units: [{ name: 'EURUSD_a' }] } as unknown as ScenarioDetailsReport
    const wrapper = mount(RunsQuickBar)
    expect(wrapper.text()).toContain('Showing only 2 scenarios — 1 not in this run')
    expect(cardRows(wrapper)).toContainEqual({ label: 'Not in this run', value: 'gone' })
  })

  /** The one name already stands in the line, so it is only said to be missing. */
  it('says a single name is not in this run without naming it twice', () => {
    narrowTo(['gone'])
    useRunReportsStore().scenarios = { units: [{ name: 'EURUSD_a' }] } as unknown as ScenarioDetailsReport
    expect(mount(RunsQuickBar).text()).toContain('Showing only gone — not in this run')
  })

  it('shows the whole run again', async () => {
    narrowTo(['EURUSD_a'])
    const wrapper = mount(RunsQuickBar)
    await wrapper.find('button').trigger('click')
    expect(useContextStore().main.run.units).toEqual([])
  })
})
