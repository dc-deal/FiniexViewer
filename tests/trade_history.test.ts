import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import TradeHistoryPanel from '@/components/runs/TradeHistoryPanel.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { provideDisplaySettings } from '@/composables/use_display_settings'
import { provideScenarioSelection } from '@/composables/use_scenario_selection'
import { DEFAULT_SETTINGS } from '@/types/settings_types'
import type { DisplaySettings } from '@/types/settings_types'
import type { RunSummary, TradeHistoryReport, TradeRow, TradeView } from '@/types/api/report_types'

import fixture from './fixtures/trade_history.json'
import summaryFixture from './fixtures/run_summary.json'

const BASE: TradeHistoryReport = fixture
const SUMMARY: RunSummary = summaryFixture

function report(overrides: Partial<TradeHistoryReport> = {}): TradeHistoryReport {
  return { ...BASE, ...overrides }
}

function trade(overrides: Partial<TradeRow> = {}): TradeRow {
  return { ...(BASE.trades[0] as TradeRow), ...overrides }
}

function mountPanel(history: TradeHistoryReport, summary: RunSummary | null = null) {
  const model: TradeView = { history, summary }
  return mount(TradeHistoryPanel, { props: { model } })
}

/** The panel under a host that supplies presentation preferences, the way PanelColumn does. */
function mountWithDisplay(
  history: TradeHistoryReport,
  overrides: Partial<DisplaySettings> = {}
) {
  const model: TradeView = { history, summary: null }
  const display = ref<DisplaySettings>({
    scenarioThreshold: DEFAULT_SETTINGS.scenarioThreshold,
    laneOrder: DEFAULT_SETTINGS.laneOrder,
    tradeRowCap: DEFAULT_SETTINGS.tradeRowCap,
    ...overrides,
  })
  const Host = defineComponent({
    setup() {
      provideDisplaySettings(display)
      return () => h(TradeHistoryPanel, { model })
    },
  })
  return mount(Host)
}

/** The panel narrowed to one scenario, the way RunsView narrows it. */
function mountNarrowed(
  history: TradeHistoryReport,
  unit: string | null,
  summary: RunSummary | null = null,
  overrides: Partial<DisplaySettings> = {}
) {
  const model: TradeView = { history, summary }
  const selected = ref<string | null>(unit)
  const display = ref<DisplaySettings>({
    scenarioThreshold: DEFAULT_SETTINGS.scenarioThreshold,
    laneOrder: DEFAULT_SETTINGS.laneOrder,
    tradeRowCap: DEFAULT_SETTINGS.tradeRowCap,
    ...overrides,
  })
  const Host = defineComponent({
    setup() {
      provideDisplaySettings(display)
      provideScenarioSelection({ unit: selected, select: value => { selected.value = value } })
      return () => h(TradeHistoryPanel, { model })
    },
  })
  return mount(Host)
}

/** Trade rows only — the group rows share the tbody and are not trades. */
function tradeRows(wrapper: VueWrapper) {
  return wrapper.findAll('tbody tr').filter(row => !row.classes().includes('group'))
}

/** The figures a card carries, as label -> value. */
function cardRows(wrapper: VueWrapper, index = 0) {
  const details = wrapper.findAllComponents(HoverCard)[index]?.props('details') ?? []
  return Object.fromEntries(details.map(row => [row.label, row.value]))
}

describe('TradeHistoryPanel', () => {
  it('lists every closed position with the unit that produced it', () => {
    const wrapper = mountPanel(report())
    expect(tradeRows(wrapper)).toHaveLength(BASE.trades.length)
    expect(wrapper.text()).toContain(BASE.trades[0]?.scenario_name)
  })

  /**
   * A flat list put six units' rows one after another with nothing saying where one ended, and the
   * totals sat in a footer that read as more trades. The group row answers both: it marks the
   * boundary AND puts the figures beside the rows they are about.
   */
  describe('grouped under the unit that produced them', () => {
    function twoUnits() {
      return report({
        trades: [
          trade({ position_id: 'a1', scenario_name: 'unit_a' }),
          trade({ position_id: 'a2', scenario_name: 'unit_a' }),
          trade({ position_id: 'b1', scenario_name: 'unit_b' }),
        ],
        scenario_totals: [
          { ...BASE.scenario_totals[0]!, scenario_name: 'unit_a', trade_count: 2, net_pnl: 5 },
          { ...BASE.scenario_totals[0]!, scenario_name: 'unit_b', trade_count: 1, net_pnl: -2 },
        ],
      })
    }

    it('opens one group per unit, in the order the trades arrived', () => {
      const wrapper = mountPanel(twoUnits())
      const groups = wrapper.findAll('tbody tr.group')
      expect(groups).toHaveLength(2)
      expect(groups[0]?.text()).toContain('unit_a')
      expect(groups[1]?.text()).toContain('unit_b')
    })

    it('puts the unit totals in its group row rather than in a detached footer', () => {
      const wrapper = mountPanel(twoUnits())
      expect(wrapper.find('tfoot').exists()).toBe(false)
      const first = wrapper.findAll('tbody tr.group')[0]
      expect(first?.text()).toContain('2')
      expect(first?.text()).toContain('5.00')
    })

    it('counts the rows itself where a unit reports no total', () => {
      const wrapper = mountPanel(report({
        trades: [trade({ scenario_name: 'orphan' })],
        scenario_totals: [],
      }))
      const group = wrapper.find('tbody tr.group')
      expect(group.text()).toContain('orphan')
      expect(group.text()).toContain('1')
    })
  })

  /**
   * MAE arrives signed on a trade and as a MAGNITUDE in the analytics block — measured, the same
   * number twice: mae_pnl −18,399.05 against largest_mae +18,399.05. The direction is in the name,
   * so the sign says nothing and the render drops it. Rendering both as they arrive would put one
   * quantity on screen twice with opposite signs.
   */
  it('renders an adverse excursion as a magnitude, whichever sign arrived', () => {
    const negative = mountPanel(report({ trades: [trade({ mae_pnl: -104.5 })] })).text()
    const positive = mountPanel(report({ trades: [trade({ mae_pnl: 104.5 })] })).text()
    expect(negative).toContain('104.50')
    expect(negative).not.toContain('-104.50')
    expect(negative).toBe(positive)
  })

  // expectancy is denominated in R; without a trade that carried a stop there is no R at all
  it('withholds an expectancy nobody could measure', () => {
    const withoutR = mountPanel(report({
      analytics: [{ ...BASE.analytics[0]!, expectancy: 0, r_trade_count: 0 }],
    }))
    expect(withoutR.text()).toContain('n/a')
  })

  it('states the expectancy where trades carried a stop', () => {
    const withR = mountPanel(report({
      analytics: [{ ...BASE.analytics[0]!, expectancy: 0.42, r_trade_count: 7 }],
    }))
    expect(withR.text()).toContain('0.42')
  })

  /**
   * A cap that is not announced reads as "that was all", which for a trade list is the single most
   * misleading thing it could say. So the cap names both numbers.
   */
  /*
   * Longer budget than the default, and it is the harness that needs it rather than the assertion:
   * drawing 500 rows costs ~4.8 s in jsdom, measured, because every row is wrapped in its own
   * floating-layer instance. The assertion below can still fail; only the clock moved. The cost
   * itself is a finding, not a fact of life — see the note in docs/testing_architecture.md.
   */
  it('says how many trades it is not drawing, and out of how many', { timeout: 20_000 }, () => {
    const many = Array.from({ length: 640 }, (_, index) =>
      trade({ position_id: `pos_${index}` }))
    const wrapper = mountPanel(report({ trades: many, count: 640 }))
    expect(tradeRows(wrapper)).toHaveLength(500)
    const notice = wrapper.find('.notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('500')
    expect(notice.text()).toContain('640')
  })

  it('stays silent about a cap it did not reach', () => {
    expect(mountPanel(report()).find('.notice').exists()).toBe(false)
  })

  it('says so plainly where a run closed no position', () => {
    const wrapper = mountPanel(report({ trades: [], count: 0 }))
    expect(wrapper.text()).toContain('closed no positions')
    expect(wrapper.find('tbody').exists()).toBe(false)
  })

  describe('the card behind a row', () => {
    it('carries what the row has no width for', () => {
      const rows = cardRows(mountPanel(report()))
      expect(rows).toHaveProperty('Fees')
      expect(rows).toHaveProperty('Slippage')
      expect(rows).toHaveProperty('Ticks')
      expect(rows).toHaveProperty('Best in favour')
    })

    // the excursion is given three ways by the backend and the question decides which one answers
    it('gives an excursion as P&L, as a price and as a distance in its own unit', () => {
      const rows = cardRows(mountPanel(report({
        trades: [trade({ mae_pnl: -104.5, mae_price: 149.7, mae_distance: 10.4, price_unit: 'pip' })],
      })))
      expect(rows['Worst against']).toContain('104.50')
      expect(rows['Worst against']).toContain('149.7')
      expect(rows['Worst against']).toContain('10.40 pip')
    })

    // '' means the close was not attributed — an absence, never rendered as a state
    it('names the closing reason only where one was recorded', () => {
      expect(cardRows(mountPanel(report({ trades: [trade({ close_reason: '' })] }))))
        .not.toHaveProperty('Closed by')
      expect(cardRows(mountPanel(report({ trades: [trade({ close_reason: 'stop_loss' })] }))))
        .toHaveProperty('Closed by', 'stop_loss')
    })

    it('omits a stop that was never set rather than showing it as none', () => {
      expect(cardRows(mountPanel(report({ trades: [trade({ stop_loss: null })] }))))
        .not.toHaveProperty('Stop loss')
      expect(cardRows(mountPanel(report({ trades: [trade({ stop_loss: 149.5 })] }))))
        .toHaveProperty('Stop loss', '149.5')
    })

    it('withholds an R multiple where the trade carried no stop', () => {
      expect(cardRows(mountPanel(report({ trades: [trade({ r_multiple: null })] })))['R multiple'])
        .toBe('n/a')
    })
  })

  it('shows a group even for a single unit, because it carries that unit total', () => {
    const wrapper = mountPanel(report({
      trades: [trade({ scenario_name: 'only_one', position_id: 'p1' })],
      count: 1,
    }))
    expect(wrapper.findAll('tbody tr.group')).toHaveLength(1)
  })

  /**
   * The funnel moved here from a panel of its own, because this view is about EXECUTION and what
   * was attempted is the other half of what was closed. Measured on a real run: 566 sent, 22
   * executed, 544 rejected — the list below shows eleven positions and says nothing about the 96 %
   * that never became one.
   */
  describe('the order funnel', () => {
    it('states how many of the sent orders were executed', () => {
      const wrapper = mountPanel(BASE, {
        ...SUMMARY, orders_sent: 566, orders_executed: 22, orders_rejected: 544,
      })
      const funnel = wrapper.find('.funnel')
      expect(funnel.text()).toContain('22/566')
      expect(funnel.text()).toContain('3.9%')
    })

    // a rejection is a fact about the run, not an error of ours — and it must not be overlooked
    it('marks the rejected orders as something to weigh', () => {
      const wrapper = mountPanel(BASE, { ...SUMMARY, orders_sent: 10, orders_rejected: 7 })
      expect(wrapper.find('.funnel-rejected').text()).toContain('7')
    })

    it('stays silent about rejections where there were none', () => {
      const wrapper = mountPanel(BASE, { ...SUMMARY, orders_sent: 5, orders_rejected: 0 })
      expect(wrapper.find('.funnel-rejected').exists()).toBe(false)
    })

    it('shows no funnel at all where the run carries no summary', () => {
      expect(mountPanel(BASE, null).find('.funnel').exists()).toBe(false)
    })

    // nothing sent means no rate to state, rather than a rate of zero
    it('withholds a rate where nothing was sent', () => {
      const wrapper = mountPanel(BASE, { ...SUMMARY, orders_sent: 0, orders_executed: 0 })
      expect(wrapper.find('.funnel').text()).not.toContain('%')
    })
  })

  /**
   * What makes a trade unique. Measured on this machine before the fix: `position_id` alone repeats
   * in 3 of 11 runs — a partial close books several records of ONE position, and two scenarios of
   * the same symbol both count from `pos_<symbol>_1`. A duplicated `v-for` key is the failure Vue
   * reports as a warning and pays for by patching the wrong row.
   */
  describe('row identity', () => {
    // the declaration is READ, not known: a response that names a different tuple is obeyed
    it('keys on the tuple the response declares', () => {
      const shared = [
        trade({ position_id: 'p', scenario_name: 'a', exit_tick_index: 1 }),
        trade({ position_id: 'p', scenario_name: 'a', exit_tick_index: 2 }),
      ]
      const wrapper = mountPanel(report({
        trades: shared,
        count: 2,
        keys: {
          trades: ['exit_tick_index'],
          analytics: ['currency'],
          scenario_totals: ['scenario_name', 'currency'],
        },
      }))
      expect(tradeRows(wrapper)).toHaveLength(2)
    })

    it('draws every record where two share a position id', () => {
      const wrapper = mountPanel(report({
        trades: [
          trade({ position_id: 'pos_ethusd_1', scenario_name: 'unit_a', exit_tick_index: 10 }),
          trade({ position_id: 'pos_ethusd_1', scenario_name: 'unit_a', exit_tick_index: 44 }),
          trade({ position_id: 'pos_ethusd_1', scenario_name: 'unit_b', exit_tick_index: 10 }),
        ],
        count: 3,
      }))
      expect(tradeRows(wrapper)).toHaveLength(3)
    })
  })

  /**
   * Totals are unique by (scenario_name, currency). A scenario that traded in two currencies has
   * two of them, and handing the group header an arbitrary one would state a figure that covers
   * half its rows. It gets none instead, and falls back to the count.
   */
  it('withholds a unit total where the unit has one per currency', () => {
    const wrapper = mountPanel(report({
      trades: [trade({ scenario_name: 'two_ccy', position_id: 'p1' })],
      scenario_totals: [
        { ...BASE.scenario_totals[0]!, scenario_name: 'two_ccy', currency: 'USD', net_pnl: 5 },
        { ...BASE.scenario_totals[0]!, scenario_name: 'two_ccy', currency: 'EUR', net_pnl: 9 },
      ],
    }))
    const group = wrapper.find('tbody tr.group')
    expect(group.text()).toContain('two_ccy')
    expect(group.text()).not.toContain('5.00')
    expect(group.text()).not.toContain('9.00')
  })

  /**
   * The scenario threshold. A thirteen-scenario run is already hard to read and a forty-scenario
   * one is unreadable, so past a settable count the unit summary becomes the primary thing and its
   * trades wait to be asked for. What must never happen is a silent drop: the group header keeps
   * the name, the total and the count either way.
   */
  describe('past the scenario threshold', () => {
    function units(count: number): TradeHistoryReport {
      const names = Array.from({ length: count }, (_, index) => `unit_${index}`)
      return report({
        trades: names.map((name, index) =>
          trade({ position_id: `pos_${index}`, scenario_name: name })),
        count,
        scenario_totals: names.map(name => ({
          ...BASE.scenario_totals[0]!, scenario_name: name, trade_count: 1, net_pnl: 5,
        })),
      })
    }

    it('draws every unit in full while there are few of them', () => {
      const wrapper = mountWithDisplay(units(3), { scenarioThreshold: 6 })
      expect(wrapper.findAll('tbody tr.group')).toHaveLength(3)
      expect(tradeRows(wrapper)).toHaveLength(3)
    })

    it('keeps the summaries and withholds the rows once there are many', () => {
      const wrapper = mountWithDisplay(units(8), { scenarioThreshold: 6 })
      expect(wrapper.findAll('tbody tr.group')).toHaveLength(8)
      expect(tradeRows(wrapper)).toHaveLength(0)
    })

    // the group row is what makes the collapse honest: it still answers what and how much
    it('still names the unit, its total and its count when collapsed', () => {
      const wrapper = mountWithDisplay(units(8), { scenarioThreshold: 6 })
      const first = wrapper.findAll('tbody tr.group')[0]
      expect(first?.text()).toContain('unit_0')
      expect(first?.text()).toContain('5.00')
      expect(first?.text()).toContain('1')
    })

    it('opens a collapsed unit when it is asked to', async () => {
      const wrapper = mountWithDisplay(units(8), { scenarioThreshold: 6 })
      await wrapper.findAll('tbody tr.group')[0]?.trigger('click')
      expect(tradeRows(wrapper)).toHaveLength(1)
    })

    it('closes a unit the reader chooses to close, however few there are', async () => {
      const wrapper = mountWithDisplay(units(2), { scenarioThreshold: 6 })
      expect(tradeRows(wrapper)).toHaveLength(2)
      await wrapper.findAll('tbody tr.group')[0]?.trigger('click')
      expect(tradeRows(wrapper)).toHaveLength(1)
    })

    it('reaches the collapse from a keyboard as well as a pointer', async () => {
      const wrapper = mountWithDisplay(units(8), { scenarioThreshold: 6 })
      await wrapper.findAll('tbody tr.group')[0]?.trigger('keydown.enter')
      expect(tradeRows(wrapper)).toHaveLength(1)
    })
  })

  it('draws as many rows as the settings allow, and says so', () => {
    const many = Array.from({ length: 640 }, (_, index) => trade({ position_id: `pos_${index}` }))
    const wrapper = mountWithDisplay(report({ trades: many, count: 640 }), { tradeRowCap: 120 })
    expect(tradeRows(wrapper)).toHaveLength(120)
    expect(wrapper.find('.notice').text()).toContain('120')
  })

  // no host, no settings — the panel behaves exactly as it did before there were any
  it('falls back to the defaults when no host supplied settings', { timeout: 20_000 }, () => {
    const many = Array.from({ length: 640 }, (_, index) => trade({ position_id: `pos_${index}` }))
    const wrapper = mountPanel(report({ trades: many, count: 640 }))
    expect(tradeRows(wrapper)).toHaveLength(DEFAULT_SETTINGS.tradeRowCap)
  })

  describe('narrowed to one scenario', () => {
    const MIXED = report({
      trades: [
        trade({ position_id: 'a1', scenario_name: 'unit_a' }),
        trade({ position_id: 'b1', scenario_name: 'unit_b' }),
        trade({ position_id: 'a2', scenario_name: 'unit_a' }),
      ],
      count: 3,
    })

    it('draws only the chosen scenario\'s trades', () => {
      const wrapper = mountNarrowed(MIXED, 'unit_a')
      expect(tradeRows(wrapper)).toHaveLength(2)
      expect(wrapper.text()).not.toContain('unit_b')
    })

    it('shows every trade again once the narrowing is cleared', () => {
      const wrapper = mountNarrowed(MIXED, null)
      expect(tradeRows(wrapper)).toHaveLength(3)
    })

    /**
     * The narrowing runs BEFORE the cap. Capped first, the first N trades of the whole run would
     * be filtered down and a unit that traded late would show nothing while the panel claimed it
     * had drawn everything it had.
     */
    it('narrows before it caps, so a late scenario keeps its trades', () => {
      const trades = [
        ...Array.from({ length: 300 }, (_, i) => trade({ position_id: `e${i}`, scenario_name: 'early' })),
        ...Array.from({ length: 5 }, (_, i) => trade({ position_id: `l${i}`, scenario_name: 'late' })),
      ]
      const wrapper = mountNarrowed(report({ trades, count: 305 }), 'late')
      expect(tradeRows(wrapper)).toHaveLength(5)
    })

    /**
     * A unit the run declared is in the roster whether it traded or not, so finding no trades is
     * a statement about the SCENARIO — never a failed match. The two read very differently.
     */
    it('says the scenario traded nothing, rather than showing the run\'s empty state', () => {
      const wrapper = mountNarrowed(MIXED, 'unit_c')
      expect(tradeRows(wrapper)).toHaveLength(0)
      expect(wrapper.find('.hint').text()).toContain('This scenario closed no positions')
    })

    /**
     * The funnel and the analytics come from `run-summary` and per CURRENCY — neither has a
     * per-unit version. Left unlabelled above one scenario's rows they read as that scenario's,
     * which is the silent wrongness this narrowing exists to remove.
     */
    it('marks the run-wide figures as the run\'s, not the scenario\'s', () => {
      const wrapper = mountNarrowed(MIXED, 'unit_a', SUMMARY)
      expect(wrapper.find('.funnel .scope').text()).toBe('whole run')
      expect(wrapper.find('.scope-line').exists()).toBe(true)
    })

    it('leaves those figures unmarked where nothing is narrowed', () => {
      const wrapper = mountNarrowed(MIXED, null, SUMMARY)
      expect(wrapper.find('.funnel .scope').exists()).toBe(false)
      expect(wrapper.find('.scope-line').exists()).toBe(false)
    })

    // `count` is the run's own total and can exceed the rows served, so under a narrowing it
    // names a number the drawn rows have nothing to do with.
    it('counts the cap against the narrowed set, not the run', () => {
      const trades = Array.from({ length: 60 }, (_, i) =>
        trade({ position_id: `p${i}`, scenario_name: i < 40 ? 'unit_a' : 'unit_b' }))
      const wrapper = mountNarrowed(report({ trades, count: 9999 }), 'unit_a', null,
        { tradeRowCap: 10 })
      const notice = wrapper.find('.notice')
      expect(notice.text()).toContain('40')
      expect(notice.text()).not.toContain('9999')
    })
  })
})
