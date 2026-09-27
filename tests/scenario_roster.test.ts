import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ScenarioRosterPanel from '@/components/runs/ScenarioRosterPanel.vue'
import { setActivePinia, createPinia } from 'pinia'
import { provideTestSelection } from './scenario_selection_harness'
import type { ScenarioDetailsReport, ScenarioRow } from '@/types/api/scenario_types'

let mounted: VueWrapper | null = null

const BASE: ScenarioRow = {
  name: 'ETHUSD_blocks_03',
  symbol: 'ETHUSD',
  data_source: 'kraken_spot',
  market_type: 'crypto',
  account_currency: 'USD',
  account_currency_explicit: false,
  status: 'success',
  origin_classes: 'production',
  origin_evidence_grades: 'attested',
  price_bases: 'order_driven',
  data_format_versions: '1.0.5',
  execution_time_ms: 120,
  ticks_processed: 4200,
  first_tick_time: '',
  last_tick_time: '',
  tick_timespan_seconds: 0,
  buy_signals: 1,
  sell_signals: 0,
  flat_signals: 0,
  trades_requested: 2,
  worker_count: 3,
  error_type: '',
  error_message: '',
}

function row(overrides: Partial<ScenarioRow> = {}): ScenarioRow {
  return { ...BASE, ...overrides }
}

function report(units: ScenarioRow[]): ScenarioDetailsReport {
  return {
    run_id: '20260927_092959_cd1d9b1e',
    units,
    data_sources: [{
      broker_type: 'kraken_spot',
      market_type: 'crypto',
      scenario_count: units.length,
      symbols: ['ETHUSD'],
      price_bases: 'order_driven',
    }],
    keys: { units: ['name'], data_sources: ['broker_type'] },
  }
}

const MIXED = report([
  row({ name: 'eth_a', symbol: 'ETHUSD', market_type: 'crypto', ticks_processed: 10 }),
  row({ name: 'eth_b', symbol: 'ETHUSD', market_type: 'crypto', ticks_processed: 30 }),
  row({ name: 'gbp_a', symbol: 'GBPUSD', market_type: 'forex', account_currency: 'EUR',
    ticks_processed: 20 }),
  row({
    name: 'eth_broken',
    status: 'failed',
    error_type: 'ValidationError',
    error_message: 'Warmup for M30 has 1/20 bars (5%) — insufficient for stabilization.',
    ticks_processed: 0,
  }),
])

/* the hint line reads the store that remembers what a reader dismissed, so a mount needs one */
function mountPanel(model: ScenarioDetailsReport = MIXED) {
  mounted = mount(ScenarioRosterPanel, {
    props: { model },
    attachTo: document.body,
    global: { plugins: [createPinia()] },
  })
  return mounted
}

function rowNames(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.roster-name').map(node => node.text())
}

/** The panel under a host that carries the narrowing, the way RunsView does. */
function mountWithSelection(model: ScenarioDetailsReport = MIXED, initial: string[] = []) {
  let unit!: ReturnType<typeof provideTestSelection>
  const Host = defineComponent({
    setup() {
      unit = provideTestSelection(initial)
      return () => h(ScenarioRosterPanel, { model })
    },
  })
  mounted = mount(Host, { attachTo: document.body, global: { plugins: [createPinia()] } })
  return { wrapper: mounted, unit }
}

function headOf(wrapper: VueWrapper, name: string) {
  return wrapper.findAll('.roster-head').find(node => node.text().startsWith(name))!
}

/** The facet panels are portalled, so a trigger is opened and the options read off the document. */
async function openFacet(wrapper: VueWrapper, label: string): Promise<HTMLElement[]> {
  const trigger = wrapper.findAll('.facet-trigger').find(node => node.text().includes(label))
  await trigger!.trigger('click')
  await flushPromises()
  return [...document.querySelectorAll<HTMLElement>('.facet-option')]
}

describe('ScenarioRosterPanel', () => {
  // each test gets its own hint store, so a dismissal in one cannot hide the line in the next
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('lists every scenario the run declared, the ones that produced nothing included', () => {
    const wrapper = mountPanel()
    expect(rowNames(wrapper)).toHaveLength(4)
    expect(rowNames(wrapper)).toContain('eth_broken')
  })

  /**
   * The reason this section exists at all: a scenario that produced nothing appears in no other
   * per-unit response, so a reader comparing only those would never learn it was declared.
   */
  it('says up front how many produced nothing, above the filter', () => {
    const notice = mountPanel().find('.roster-notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('1')
    expect(notice.text()).toContain('4')
  })

  it('stays silent where every scenario ran', () => {
    const wrapper = mountPanel(report([row(), row({ name: 'other' })]))
    expect(wrapper.find('.roster-notice').exists()).toBe(false)
  })

  it('puts the reason on the row that failed, and figures on the rows that did not', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('.roster-reason').text()).toContain('Warmup for M30')
    expect(wrapper.findAll('.roster-figures')).toHaveLength(3)
  })

  describe('the facet bar over it', () => {
    it('narrows the list to a picked value', async () => {
      const wrapper = mountPanel()
      const options = await openFacet(wrapper, 'Symbol')
      options.find(node => node.textContent?.includes('GBPUSD'))!.click()
      await flushPromises()
      expect(rowNames(wrapper)).toEqual(['gbp_a'])
    })

    it('searches the scenario name', async () => {
      const wrapper = mountPanel()
      await wrapper.find('.facet-search').setValue('broken')
      await flushPromises()
      expect(rowNames(wrapper)).toEqual(['eth_broken'])
    })

    /**
     * The count is read against the WHOLE roster, not against what is left — a filter that counts
     * only its own result can never tell a reader what it is hiding.
     */
    it('says how many of how many are shown', async () => {
      const wrapper = mountPanel()
      await wrapper.find('.facet-search').setValue('eth')
      await flushPromises()
      expect(wrapper.find('.facet-count-label').text()).toContain('3')
      expect(wrapper.find('.facet-count-label').text()).toContain('4')
    })

    it('reorders without removing anything', async () => {
      const wrapper = mountPanel()
      const ticks = wrapper.findAll('.facet-sort').find(node => node.text() === 'ticks')
      await ticks!.trigger('click')
      await flushPromises()
      expect(rowNames(wrapper)).toEqual(['eth_b', 'gbp_a', 'eth_a', 'eth_broken'])
    })

    it('says so plainly where a narrowing leaves nothing', async () => {
      const wrapper = mountPanel()
      await wrapper.find('.facet-search').setValue('nothing matches this')
      await flushPromises()
      expect(wrapper.find('.hint').text()).toContain('No scenario matches')
      expect(rowNames(wrapper)).toHaveLength(0)
    })

    /**
     * `market_type` is empty on every run recorded before the backend added it. An empty string in
     * a dropdown reads as a category of its own, so the facet is dropped rather than offering one.
     */
    it('drops a facet no row states a value for', async () => {
      const wrapper = mountPanel(report([
        row({ name: 'old_a', market_type: '' }),
        row({ name: 'old_b', market_type: '' }),
      ]))
      const labels = wrapper.findAll('.facet-trigger').map(node => node.text())
      expect(labels.some(label => label.includes('Symbol'))).toBe(true)
      expect(labels.some(label => label.includes('Market'))).toBe(false)
    })

    it('forgets a narrowing when a different run is shown', async () => {
      const wrapper = mountPanel()
      await wrapper.find('.facet-search').setValue('broken')
      await flushPromises()
      expect(rowNames(wrapper)).toHaveLength(1)

      await wrapper.setProps({ model: report([row({ name: 'fresh_one' })]) })
      await flushPromises()
      expect(rowNames(wrapper)).toEqual(['fresh_one'])
    })
  })

  /**
   * The roster is where a scenario is CHOSEN, because it is the only complete list — the one place
   * every scenario can be reached from, the ones that produced nothing included.
   */
  describe('choosing a scenario', () => {
    it('narrows to the scenario whose row was clicked', async () => {
      const { wrapper, unit } = mountWithSelection()
      await headOf(wrapper, 'eth_b').trigger('click')
      expect(unit.value).toEqual(['eth_b'])
    })

    it('clears the narrowing when the chosen row is clicked again', async () => {
      const { wrapper, unit } = mountWithSelection(MIXED, ['eth_b'])
      await headOf(wrapper, 'eth_b').trigger('click')
      expect(unit.value).toEqual([])
    })

    // A scenario that produced nothing is exactly the one a reader most wants to narrow to.
    it('lets a failed scenario be chosen like any other', async () => {
      const { wrapper, unit } = mountWithSelection()
      await headOf(wrapper, 'eth_broken').trigger('click')
      expect(unit.value).toEqual(['eth_broken'])
    })

    // Marked by a rule AND by aria-pressed — never by colour alone.
    it('marks the chosen row, and only that one', () => {
      const { wrapper } = mountWithSelection(MIXED, ['eth_b'])
      const picked = wrapper.findAll('.roster-row.picked')
      expect(picked).toHaveLength(1)
      expect(picked[0]?.text()).toContain('eth_b')
      expect(headOf(wrapper, 'eth_b').attributes('aria-pressed')).toBe('true')
      expect(headOf(wrapper, 'eth_a').attributes('aria-pressed')).toBe('false')
    })

    // A panel mounted with no host behaves as it did before a selection existed.
    it('stays inert where no host supplied a selection', async () => {
      const wrapper = mountPanel()
      await headOf(wrapper, 'eth_b').trigger('click')
      expect(wrapper.findAll('.roster-row.picked')).toHaveLength(0)
    })

    // Several at once is what turns the roster from a jump into a comparison.
    it('collects several scenarios, and lets one go without losing the rest', async () => {
      const { wrapper, unit } = mountWithSelection()
      await headOf(wrapper, 'eth_a').trigger('click')
      await headOf(wrapper, 'eth_b').trigger('click')
      expect(unit.value).toEqual(['eth_a', 'eth_b'])
      expect(wrapper.findAll('.roster-row.picked')).toHaveLength(2)

      await headOf(wrapper, 'eth_a').trigger('click')
      expect(unit.value).toEqual(['eth_b'])
    })

    /**
     * A control nobody recognises as a control does not exist — this row was built to look like
     * running text and the first reader to see it could not tell that clicking did anything.
     */
    it('says what a click does, while nothing is picked', () => {
      const { wrapper } = mountWithSelection()
      expect(wrapper.find('.hint-line').text()).toContain('Click a scenario')
    })

    it('replaces that with the state once something is picked, and offers the way out', async () => {
      const { wrapper, unit } = mountWithSelection(MIXED, ['eth_a'])
      expect(wrapper.find('.hint-line').exists()).toBe(false)
      const state = wrapper.find('.roster-picked')
      expect(state.text()).toContain('Showing only 1 of 4')

      await state.find('.clear-picked').trigger('click')
      expect(unit.value).toEqual([])
    })
  })
})
