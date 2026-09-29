import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ScenarioRosterPanel from '@/components/runs/ScenarioRosterPanel.vue'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Router } from 'vue-router'
import { provideTestSelection } from './scenario_selection_harness'
import type {
  ScenarioDetailsReport, ScenarioRosterView, ScenarioRow,
} from '@/types/api/scenario_types'
import type {
  PortfolioReport, PortfolioUnitRow, WarningsErrorsReport,
} from '@/types/api/report_types'

import portfolioFixture from './fixtures/portfolio.json'

let mounted: VueWrapper | null = null

const BASE: ScenarioRow = {
  name: 'ETHUSD_blocks_03',
  symbol: 'ETHUSD',
  data_broker_type: 'kraken_spot',
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
    data_brokers: [{
      data_broker_type: 'kraken_spot',
      market_type: 'crypto',
      scenario_count: units.length,
      symbols: ['ETHUSD'],
      price_bases: 'order_driven',
    }],
    keys: { units: ['name'], data_brokers: ['data_broker_type'] },
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

/**
 * The composed model the host hands the panel: the roster plus what each unit earned and what went
 * wrong with it. Portfolio and warnings default to absent, which is the honest default — a run
 * carries them separately and either may be missing.
 */
function view(
  scenarios: ScenarioDetailsReport = MIXED,
  portfolio: PortfolioReport | null = null,
  warningsErrors: WarningsErrorsReport | null = null
): ScenarioRosterView {
  return { scenarios, portfolio, warningsErrors }
}

/* the hint line reads the store that remembers what a reader dismissed, so a mount needs one */
function asView(model: ScenarioDetailsReport | ScenarioRosterView): ScenarioRosterView {
  return 'scenarios' in model ? model : view(model)
}


/**
 * A router, because the bar's narrowing rides in the URL (viewer#116) — `useFacetQuery` reads the
 * query on mount and writes it back. Without one the mounted hook throws, which Vue reports as a
 * warning beside a green test rather than as a failure.
 *
 * MEMORY history, not hash: every hash router in jsdom shares one `window.location`, so each test
 * would inherit whatever narrowing the previous one wrote — four tests failed exactly that way.
 */
function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  })
}

function mountPanel(model: ScenarioDetailsReport | ScenarioRosterView = MIXED) {
  mounted = mount(ScenarioRosterPanel, {
    props: { model: asView(model) },
    attachTo: document.body,
    global: { plugins: [createPinia(), testRouter()] },
  })
  return mounted
}

/**
 * A portfolio row for one unit, spread from the real capture so the test never has to keep a
 * hand-written mirror of a model with forty fields in step with the backend.
 */
function earning(name: string, overrides: Partial<PortfolioUnitRow> = {}): PortfolioUnitRow {
  return {
    ...(portfolioFixture.units[0] as PortfolioUnitRow),
    name,
    total_trades: 0,
    net_profit: 0,
    profit_factor: null,
    ...overrides,
  }
}

function portfolio(units: PortfolioUnitRow[]): PortfolioReport {
  return { run_id: 'r', units, aggregates: [] }
}

function rowNames(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.roster-name').map(node => node.text())
}

/** The panel under a host that carries the narrowing, the way RunsView does. */
function mountWithSelection(
  model: ScenarioDetailsReport | ScenarioRosterView = MIXED,
  initial: string[] = []
) {
  let unit!: ReturnType<typeof provideTestSelection>
  const Host = defineComponent({
    setup() {
      unit = provideTestSelection(initial)
      return () => h(ScenarioRosterPanel, { model: asView(model) })
    },
  })
  mounted = mount(Host, {
    attachTo: document.body,
    global: { plugins: [createPinia(), testRouter()] },
  })
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
    /**
     * The chips come from `AppButton`, they are not a second button style that looks like one.
     * Sixty lines of CSS restated its four states here until the popover triggers could be wrapped
     * with `as-child`, and a second copy of a button contract drifts the moment the first changes.
     *
     * The trigger is a DISCLOSURE, so it carries the chosen look through `marked` and never
     * `aria-pressed`; the sort buttons are a real toggle group and do carry it.
     */
    it('builds its chips from AppButton rather than restating one', () => {
      const wrapper = mountPanel()
      for (const selector of ['.facet-trigger', '.facet-sort']) {
        const chips = wrapper.findAll(selector)
        expect(chips.length, selector).toBeGreaterThan(0)
        for (const chip of chips) expect(chip.classes(), selector).toContain('app-button')
      }
    })

    it('never announces a facet trigger as a toggle — it is a disclosure', async () => {
      const wrapper = mountPanel()
      const trigger = wrapper.findAll('.facet-trigger')[0]!
      expect(trigger.attributes('aria-pressed')).toBeUndefined()
      expect(trigger.attributes('aria-expanded')).toBeDefined()
    })

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
      // the symbols DIFFER so that facet can still narrow — otherwise it would be dropped too,
      // by the rule below, and this test would stop proving what it is about
      const wrapper = mountPanel(report([
        row({ name: 'old_a', symbol: 'ETHUSD', market_type: '' }),
        row({ name: 'old_b', symbol: 'BTCUSD', market_type: '' }),
      ]))
      const labels = wrapper.findAll('.facet-trigger').map(node => node.text())
      expect(labels.some(label => label.includes('Symbol'))).toBe(true)
      expect(labels.some(label => label.includes('Market'))).toBe(false)
    })

    /**
     * A control that does nothing is worse than one that is missing, because it looks like it
     * works. Measured over the 40 runs on this machine: `reporting` reads `expected` on all forty
     * and `app_version` reads `1.4.0` on all forty — two dropdowns that could never narrow.
     */
    it('drops a facet whose single value every row already carries', () => {
      const wrapper = mountPanel(report([
        row({ name: 'a', account_currency: 'USD' }),
        row({ name: 'b', account_currency: 'USD' }),
      ]))
      const labels = wrapper.findAll('.facet-trigger').map(node => node.text())
      expect(labels.some(label => label.includes('Currency'))).toBe(false)
    })

    // One value that only SOME rows carry still narrows — to exactly those rows.
    it('keeps a single value that not every row carries', () => {
      const wrapper = mountPanel(report([
        row({ name: 'a', market_type: 'crypto' }),
        row({ name: 'b', market_type: '' }),
      ]))
      const labels = wrapper.findAll('.facet-trigger').map(node => node.text())
      expect(labels.some(label => label.includes('Market'))).toBe(true)
    })

    it('forgets a narrowing when a different run is shown', async () => {
      const wrapper = mountPanel()
      await wrapper.find('.facet-search').setValue('broken')
      await flushPromises()
      expect(rowNames(wrapper)).toHaveLength(1)

      await wrapper.setProps({ model: view(report([row({ name: 'fresh_one' })])) })
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
      // CHOSEN, not "showing only": the roster still lists all four, and the facet count beside
      // it already means "how many rows are listed".
      expect(state.text()).toContain('1 scenario chosen')
      expect(state.text()).not.toContain('of 4')

      await state.find('.app-button').trigger('click')
      expect(unit.value).toEqual([])
    })
  })

  /**
   * The roster says what was DECLARED; what a scenario EARNED lives in the portfolio, a shorter
   * list. Joining them on the unit name is a documented foreign key, not an invention — and a
   * scenario the portfolio has no row for shows no figures rather than zeros, because "produced
   * nothing" and "earned nothing" are different statements.
   */
  describe('what each scenario produced', () => {
    const ROSTER = report([row({ name: 'winner' }), row({ name: 'loser' }), row({ name: 'absent' })])
    const EARNED = portfolio([
      earning('winner', { total_trades: 3, net_profit: 12.5, profit_factor: 2.4 }),
      earning('loser', { total_trades: 1, net_profit: -4.25, profit_factor: 0 }),
    ])

    function figuresFor(wrapper: VueWrapper, name: string): string {
      const rowEl = wrapper.findAll('.roster-row').find(node => node.text().includes(name))!
      return rowEl.find('.roster-figures').text()
    }

    it('shows what a unit earned beside what it was', () => {
      const wrapper = mountPanel(view(ROSTER, EARNED))
      expect(figuresFor(wrapper, 'winner')).toContain('3 trades')
      expect(figuresFor(wrapper, 'winner')).toContain('12.50 USD')
    })

    // the defect the operator saw on screen: a count of one wearing the plural
    it('agrees the noun with the count', () => {
      const wrapper = mountPanel(view(ROSTER, EARNED))
      expect(figuresFor(wrapper, 'loser')).toContain('1 trade ')
      expect(figuresFor(wrapper, 'loser')).not.toContain('1 trades')
    })

    it('shows NO figures for a unit the portfolio has no row for', () => {
      const wrapper = mountPanel(view(ROSTER, EARNED))
      const text = figuresFor(wrapper, 'absent')
      expect(text).not.toContain('trades')
      expect(text).not.toContain('USD')
    })

    it('shows no figures at all where the run carries no portfolio', () => {
      const wrapper = mountPanel(view(ROSTER, null))
      expect(figuresFor(wrapper, 'winner')).not.toContain('trades')
    })

    // The response declares `keys.errors: ["name"]` — ONE row per unit — so a count could only
    // ever be 0 or 1. A per-unit WARNING can repeat, and is counted; a run-wide one is not shown
    // here at all, or one notice would appear against forty scenarios.
    it('marks a unit-scoped warning and ignores a run-wide one', () => {
      const warnings: WarningsErrorsReport = {
        run_id: 'r',
        keys: { errors: ['name'], warnings: [] },
        errors: [],
        warnings: [
          { tier: 'major', scope: 'run', message: 'STRESS TEST ACTIVE' },
          { tier: 'minor', scope: 'winner', message: 'thin warmup' },
          { tier: 'minor', scope: 'winner', message: 'and again' },
        ],
        outcome: {
          run_outcome: 'success', failed_count: 0, total_units: 3, failed_unit_names: [],
          first_failure_name: '', first_failure_error: '', emergency_reason: '',
          shutdown_mode: '', operator_interrupted: false,
          error_count: null, warning_count: null, log_warning_count: null,
        },
      }
      const wrapper = mountPanel(view(ROSTER, EARNED, warnings))
      const marks = wrapper.findAll('.roster-mark.warned')
      expect(marks).toHaveLength(1)
      expect(marks[0]?.text()).toContain('2')
    })

    it('sorts by net P&L, putting a unit with no row last rather than at zero', () => {
      const wrapper = mountPanel(view(ROSTER, EARNED))
      const sortButton = wrapper.findAll('.facet-sort').find(n => n.text().includes('net P&L'))!
      sortButton.trigger('click')
      return wrapper.vm.$nextTick().then(() => {
        expect(rowNames(wrapper)).toEqual(['winner', 'loser', 'absent'])
      })
    })

    /**
     * The TICK TIMESPAN — the market time a scenario processed — is what says how BIG it was, the
     * operator's own reason for wanting it. Both the figure and the word are the backend's.
     */
    it('sorts by the tick timespan', async () => {
      const wrapper = mountPanel(view(report([
        row({ name: 'short', tick_timespan_seconds: 600 }),
        row({ name: 'long', tick_timespan_seconds: 200_000 }),
        row({ name: 'middle', tick_timespan_seconds: 21_600 }),
      ])))
      const sortButton = wrapper.findAll('.facet-sort')
        .find(n => n.text().includes('tick timespan'))!
      await sortButton.trigger('click')
      expect(rowNames(wrapper)).toEqual(['long', 'middle', 'short'])
    })

    it('shows the tick timespan in units a reader takes in', () => {
      const wrapper = mountPanel(view(report([row({ name: 'a', tick_timespan_seconds: 21_600 })])))
      expect(figuresFor(wrapper, 'a')).toContain('6.0 h')
    })

    /**
     * Execution time is the MACHINE's figure and was withheld until contract 13, where the field
     * stopped carrying seconds under a millisecond name. It is shown beside the tick timespan and
     * must never be confused with it — the two answer different questions about the same scenario.
     */
    it('sorts by the execution time', async () => {
      const wrapper = mountPanel(view(report([
        row({ name: 'quick', execution_time_ms: 120 }),
        row({ name: 'slow', execution_time_ms: 2600 }),
        row({ name: 'middling', execution_time_ms: 700 }),
      ])))
      const sortButton = wrapper.findAll('.facet-sort')
        .find(n => n.text().includes('execution time'))!
      await sortButton.trigger('click')
      expect(rowNames(wrapper)).toEqual(['slow', 'middling', 'quick'])
    })

    it('reads the execution time in milliseconds below a second and in seconds above', () => {
      const wrapper = mountPanel(view(report([
        row({ name: 'a', execution_time_ms: 513.36 }),
        row({ name: 'b', execution_time_ms: 2601.07 }),
      ])))
      expect(figuresFor(wrapper, 'a')).toContain('513 ms')
      expect(figuresFor(wrapper, 'b')).toContain('2.6 s')
    })

    /**
     * Neither facet infers a category: "traded" is whether a stated count is zero, and the result
     * is the SIGN of a stated figure — the polarity this project already renders as a colour.
     */
    it('offers activity and result as facets, claiming no row that states neither', () => {
      const wrapper = mountPanel(view(ROSTER, EARNED))
      const labels = wrapper.findAll('.facet-trigger').map(node => node.text())
      expect(labels.some(l => l.includes('Activity'))).toBe(true)
      expect(labels.some(l => l.includes('Result'))).toBe(true)
    })

    it('drops the result facet where no unit traded', () => {
      const idle = portfolio([earning('winner'), earning('loser')])
      const wrapper = mountPanel(view(ROSTER, idle))
      const labels = wrapper.findAll('.facet-trigger').map(node => node.text())
      expect(labels.some(l => l.includes('Result'))).toBe(false)
    })
  })
})
