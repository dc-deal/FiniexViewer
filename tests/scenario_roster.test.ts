import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ScenarioRosterPanel from '@/components/runs/ScenarioRosterPanel.vue'
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

function mountPanel(model: ScenarioDetailsReport = MIXED) {
  mounted = mount(ScenarioRosterPanel, { props: { model }, attachTo: document.body })
  return mounted
}

function rowNames(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.roster-name').map(node => node.text())
}

/** The facet panels are portalled, so a trigger is opened and the options read off the document. */
async function openFacet(wrapper: VueWrapper, label: string): Promise<HTMLElement[]> {
  const trigger = wrapper.findAll('.facet-trigger').find(node => node.text().includes(label))
  await trigger!.trigger('click')
  await flushPromises()
  return [...document.querySelectorAll<HTMLElement>('.facet-option')]
}

describe('ScenarioRosterPanel', () => {
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
})
