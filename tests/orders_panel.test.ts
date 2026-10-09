import { describe, it, expect } from 'vitest'
import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import OrdersPanel from '@/components/runs/OrdersPanel.vue'
import { provideTestSelection } from './scenario_selection_harness'
import { provideTestPositionLink } from './position_link_harness'
import { provideTestOrderSteps, step } from './order_steps_harness'
import type {
  OrderHistoryRow,
  OrderHistoryReport,
  PendingOrderUnit,
  PendingOrdersReport,
  TradeHistoryReport,
  TradeRow,
} from '@/types/api/report_types'
import historyFixture from './fixtures/order_history.json'
import pendingFixture from './fixtures/pending_orders.json'
import tradeFixture from './fixtures/trade_history.json'

/**
 * The two order routes as ONE panel: a scenario's funnel over the orders that produced it.
 *
 * The captured run resolved its orders cleanly, so the cases this panel exists for are built by
 * hand — a rejection with the backend's sentence, a scenario the pending pipeline never saw, and a
 * row whose figures the record never held. All three occur in the archive and none is in a capture.
 */
const HISTORY: OrderHistoryReport = historyFixture
const PENDING: PendingOrdersReport = pendingFixture

const SCENARIO = 'ETHUSD_blocks_03'

function order(overrides: Partial<OrderHistoryRow> = {}): OrderHistoryRow {
  return {
    order_id: 'pos_ethusd_1',
    scenario_name: SCENARIO,
    position_id: null,
    symbol: 'ETHUSD',
    direction: 'long',
    action: 'open',
    status: 'pending',
    requested_lots: 0.1,
    executed_lots: null,
    executed_price: null,
    event_time: null,
    commission: 0,
    order_type: 'market',
    close_type: null,
    initiator: 'strategy',
    end_reason: null,
    rejection_reason: null,
    rejection_message: null,
    ...overrides,
  }
}

function unit(overrides: Partial<PendingOrderUnit> = {}): PendingOrderUnit {
  return {
    name: SCENARIO,
    symbol: 'ETHUSD',
    total_submitted: 1,
    total_accepted: 1,
    total_rejected: 0,
    total_never_confirmed: 0,
    total_expired: 0,
    avg_in_flight_ms: 60,
    min_in_flight_ms: 60,
    max_in_flight_ms: 60,
    in_flight_count: 1,
    never_confirmed_orders: [],
    active_limit_orders: [],
    active_stop_orders: [],
    ...overrides,
  }
}

/** A trade of one position, enough for the link to have somewhere to go. */
function tradesOf(...positions: [string, string][]): TradeHistoryReport {
  return {
    ...(tradeFixture as TradeHistoryReport),
    trades: positions.map(([scenario, position]) => ({
      ...(tradeFixture.trades[0] as TradeRow),
      scenario_name: scenario,
      position_id: position,
    })),
  }
}

function model(
  orders: OrderHistoryRow[],
  units: PendingOrderUnit[] | null = [unit()],
  trades: TradeHistoryReport | null = null
) {
  return {
    pending: units === null
      ? null
      : { run_id: '20260615_130000', units, key: ['name'] } satisfies PendingOrdersReport,
    history: {
      run_id: '20260615_130000',
      orders,
      count: orders.length,
      symbols: ['ETHUSD'],
    } satisfies OrderHistoryReport,
    trades,
  }
}

type Model = {
  pending: PendingOrdersReport | null
  history: OrderHistoryReport
  trades: TradeHistoryReport | null
}

function mountPanel(value: Model) {
  return mount(OrdersPanel, { props: { model: value } })
}

function heading(wrapper: ReturnType<typeof mountPanel>): string {
  return wrapper.find('.group-name').text()
}

describe('OrdersPanel', () => {
  it('draws the captured run, one group per scenario', () => {
    const wrapper = mountPanel({ pending: PENDING, history: HISTORY, trades: null })
    const scenarios = new Set(HISTORY.orders.map(row => row.scenario_name))
    expect(wrapper.findAll('.group-name')).toHaveLength(scenarios.size)
    expect(wrapper.findAll('.order-list .record-row')).toHaveLength(HISTORY.orders.length)
  })

  describe('the group heading', () => {
    /**
     * The heading carries the SERVED funnel, never a count of the rows beneath it. One order is
     * several rows, so counting them would state a number the backend does not.
     */
    it('states the scenario funnel the backend served, not the rows beneath it', () => {
      const wrapper = mountPanel(model(
        [order(), order({ status: 'executed', action: 'open' }), order({ action: 'close', status: 'executed' })],
        [unit({ total_submitted: 1, total_accepted: 1 })],
      ))
      expect(heading(wrapper)).toContain('submitted 1')
      // ACCEPTED is their word since contract 23, and it replaced one that claimed a fill
      // where an order had merely arrived — the rename is the backend fixing its own defect
      expect(heading(wrapper)).toContain('accepted 1')
      expect(heading(wrapper)).not.toContain('arrived')
      expect(heading(wrapper)).not.toContain('filled')
      // three records of ONE order — said as records, and apart from the funnel
      expect(wrapper.find('.group-count').text()).toBe('3 records')
    })

    /**
     * GONE WITH ITS SUBJECT, and that is the point rather than a loss.
     *
     * This asserted a tooltip carrying the backend's own caveat: that `total_filled` counted
     * every order which ARRIVED after its modelled delay, so one that merely began resting was
     * counted and had not filled — *"a known defect, not a design"*
     * (`architecture_execution_layer.md:202`). Contract 23 FIXED it and named the field
     * `total_accepted`. A paraphrase of someone else's bug outlives the bug and then describes
     * nothing, so the tooltip and this test went together. The word itself is asserted above.
     */
    it('carries no caveat where the defect it described was fixed', () => {
      const wrapper = mountPanel(model([order()], [unit({ total_submitted: 1, total_accepted: 1 })]))
      const titles = wrapper.findAll('.group-meta span')
        .map(node => node.attributes('title') ?? '')
      expect(titles.some(title => title.includes('ARRIVED'))).toBe(false)
      expect(titles.some(title => title.includes('known defect'))).toBe(false)
    })

    it('marks a rejection in the heading and marks nothing where there was none', () => {
      const rejected = mountPanel(model([order()], [unit({ total_rejected: 2 })]))
      expect(rejected.find('.group-meta .negative').exists()).toBe(true)

      expect(mountPanel(model([order()])).find('.group-meta .negative').exists()).toBe(false)
    })

    /**
     * Two causes, both ordinary and both named by the backend: a scenario whose every order was
     * refused before the queue never enters the pending pipeline, and an AutoTrader run serves no
     * units at all. A funnel of zeroes would claim a measurement nobody made.
     */
    it('says a scenario reached no queue rather than drawing a funnel of zeroes', () => {
      const wrapper = mountPanel(model([order({ status: 'rejected' })], []))
      expect(heading(wrapper)).toContain('nothing reached the queue')
      expect(heading(wrapper)).not.toContain('resolved 0')
    })

    it('says the same where the run serves no pending section at all', () => {
      const wrapper = mountPanel(model([order()], null))
      expect(heading(wrapper)).toContain('nothing reached the queue')
    })

    /**
     * NOT added to the funnel: in a backtest the same order is recorded `expired` in the same step
     * and is already a row below. It is shown because it is a property of the SCENARIO that no
     * single row states.
     */
    /**
     * RESTING is their glossary word for the state, and the word went round once: `resting` ->
     * `open at data end` (their suggestion, 2026-10-01) -> back, after they called their own
     * "so they are not open" badly put and settled on *"resting at data end, then expired"*.
     */
    it('states the orders resting at data end, and only where there are any', () => {
      const resting = mountPanel(model([order()], [unit({
        active_limit_orders: [{
          order_id: 'pos_ethusd_1', order_type: 'limit', direction: 'long', lots: 0.01,
          entry_price: 1, limit_price: 1, stop_loss: 0, take_profit: 2,
        }],
      })]))
      expect(heading(resting)).toContain('resting at data end 1')
      expect(heading(mountPanel(model([order()])))).not.toContain('resting at data end')
    })

    /** Nothing timed is an absence; `0 ms` there would claim a measurement. */
    it('states an untimed scenario as absent rather than as zero', () => {
      const wrapper = mountPanel(model([order()], [unit({
        avg_in_flight_ms: 0, min_in_flight_ms: 0, max_in_flight_ms: 0, in_flight_count: 0,
      })]))
      expect(heading(wrapper)).toContain('avg in flight n/a')
    })

    /**
     * And the duration carries its WORD, like every other item in the heading. It did not: the
     * heading read `submitted 46 · accepted 46 · rejected 0 · 1438 ms`, and a bare duration there
     * says nothing about what was timed. Found on screen 2026-10-08, on the field study — the
     * only kind of run where orders rest long enough for the figure to be interesting.
     */
    it('names what the duration measures rather than printing a bare number', () => {
      expect(heading(mountPanel(model([order()])))).toContain('avg in flight 60 ms')
    })

    /**
     * Both counters read zero on every one of the 230 units measured 2026-10-08, so printing
     * them always is noise. `never confirmed` comes only from a live venue that never answered
     * and `expired` from an order still in flight when the data ended — neither of which a
     * simulation can produce, which is why only a hand-built unit exercises them.
     */
    it('keeps the two outcomes that have never fired out of the heading until they do', () => {
      expect(heading(mountPanel(model([order()])))).not.toContain('never confirmed')
      expect(heading(mountPanel(model([order()])))).not.toContain('expired')

      const fired = mountPanel(model([order()], [unit({ total_never_confirmed: 2, total_submitted: 3 })]))
      expect(heading(fired)).toContain('never confirmed 2')
    })
  })

  describe('a row', () => {
    /**
     * The reason this panel exists. The sentence is the backend's own prose and sits on a rejected
     * row and nowhere else — 548 of 4,660 rows measured 2026-10-02.
     */
    it('carries the rejection sentence beneath the row it belongs to', () => {
      const wrapper = mountPanel(model([order({
        status: 'rejected',
        rejection_reason: 'invalid_lot_size',
        rejection_message: 'Lot size 1e-05 below minimum 0.001',
      })]))
      const detail = wrapper.find('.record-detail')
      expect(detail.text()).toContain('invalid_lot_size')
      expect(detail.text()).toContain('below minimum 0.001')
    })

    it('draws no sentence under a row that was not refused', () => {
      expect(mountPanel(model([order()])).find('.record-detail').exists()).toBe(false)
    })

    /**
     * Contract 20 states an absent value as `null`, never as `""` or `0.0`. Rendering it as a zero
     * would invent a figure: measured over 4,660 rows, `executed_price` is null on 45 % of them.
     */
    it('states a value the record never held as absent rather than as zero', () => {
      const wrapper = mountPanel(model([order({
        direction: null, position_id: null, executed_price: null, event_time: null,
      })]))
      const cells = wrapper.find('.order-list .record-row').findAll(':scope > span')
      // direction, price and the event stamp all read as absent
      expect(cells.filter(cell => cell.text() === '—').length).toBeGreaterThanOrEqual(3)
      expect(wrapper.text()).not.toContain('0.00000')
    })

    it('shows what executed where it did, and what was asked for where it did not', () => {
      const filled = mountPanel(model([order({
        status: 'executed', executed_lots: 0.05, executed_price: 1.37424,
        event_time: '2026-01-29T14:02:11+00:00',
      })]))
      const text = filled.find('.order-list .record-row').text()
      expect(text).toContain('0.05')
      expect(text).toContain('1.37424')
      expect(text).toContain('2026-01-29')
    })

    it('marks a refusal and an expiry on different channels from an ordinary row', () => {
      expect(mountPanel(model([order({ status: 'rejected' })])).find('.negative').exists()).toBe(true)
      expect(mountPanel(model([order({ status: 'expired' })])).find('.warned').exists()).toBe(true)
      expect(mountPanel(model([order({ status: 'executed' })])).find('.negative').exists()).toBe(false)
    })

    /**
     * `order_id` is a per-unit position counter — 167 rows under one id on a measured run — and the
     * backend asked us not to adopt the content key either. Keying on it would make Vue fold the
     * lifecycle of one order into a single node.
     */
    it('keys a row by its position so one order can appear as several rows', () => {
      const wrapper = mountPanel(model([
        order({ status: 'pending' }),
        order({ status: 'executed', executed_price: 1.5 }),
        order({ status: 'executed', action: 'close', executed_price: 1.6 }),
      ]))
      const rows = wrapper.findAll('.order-list .record-row')
      expect(rows).toHaveLength(3)
      expect(new Set(rows.map(row => row.text())).size).toBe(3)
    })
  })

  /**
   * A position appears as several rows, and the panel has to SAY so — a reader who has to ask
   * whether three lines belong together is reading a list that does not answer it.
   */
  describe('the lifecycle of one position', () => {
    const LIFECYCLE = model([
      order({ order_id: 'pos_1', status: 'pending' }),
      order({ order_id: 'pos_1', status: 'executed', executed_price: 1.1 }),
      order({ order_id: 'pos_1', status: 'executed', action: 'close', executed_price: 1.2 }),
      order({ order_id: 'pos_2', status: 'pending' }),
    ])

    it('names the position once and carries the following rows on', () => {
      const ids = mountPanel(LIFECYCLE).findAll('.order-list .record-row')
        .map(row => row.find('.order-id').text())
      expect(ids).toEqual(['pos_1', '└─', '└─', 'pos_2'])
    })

    it('marks the row that opens a position, so the boundary is on the row and not in a line', () => {
      const starts = mountPanel(LIFECYCLE).findAll('.order-list .record-row')
        .map(row => row.classes().includes('starts-position'))
      expect(starts).toEqual([true, false, false, true])
    })

    /**
     * Measured 2026-10-05: 2 of 246 scenario groups interleave two positions, both in a scenario
     * named `partial_close_lifecycle`. The continuation is read from the row ABOVE, so an
     * alternating pair simply shows its id again — correct, and no case of its own.
     */
    it('shows the id again where two positions alternate', () => {
      const ids = mountPanel(model([
        order({ order_id: 'pos_1', status: 'pending' }),
        order({ order_id: 'pos_2', status: 'pending' }),
        order({ order_id: 'pos_1', status: 'executed' }),
        order({ order_id: 'pos_2', status: 'executed' }),
      ])).findAll('.order-list .record-row').map(row => row.find('.order-id').text())
      expect(ids).toEqual(['pos_1', 'pos_2', 'pos_1', 'pos_2'])
    })

    /** The continuation belongs to what the READER sees, so a narrowing rebuilds it. */
    it('reads the row above from the narrowed list rather than from the whole run', () => {
      const ids = mountPanel(model(
        [
          order({ order_id: 'pos_1', scenario_name: 'a', status: 'pending' }),
          order({ order_id: 'pos_1', scenario_name: 'b', status: 'pending' }),
          order({ order_id: 'pos_1', scenario_name: 'b', status: 'executed' }),
        ],
        [unit({ name: 'a' }), unit({ name: 'b' })],
      )).findAll('.order-list .record-row').map(row => row.find('.order-id').text())
      // the same id in two scenarios: each group starts its own
      expect(ids).toEqual(['pos_1', 'pos_1', '└─'])
    })
  })

  /**
   * The way from an order to what it became. The join is DECLARED — testingide, 2026-10-02: an
   * executed order row's `(scenario_name, position_id)` names the same position as a trade's, by
   * construction — and the row level is deliberately shut, because in a long session the two
   * histories are bounded buffers of different sizes.
   */
  describe('the way to the trades', () => {
    function mountLinked(
      value: Model,
      marked: Parameters<typeof provideTestPositionLink>[0] = null,
      reachable: Parameters<typeof provideTestPositionLink>[1] = 'all'
    ) {
      // the channel is created INSIDE the host's setup, where a provide actually reaches the panel
      let state!: ReturnType<typeof provideTestPositionLink>
      const Host = defineComponent({
        setup() {
          state = provideTestPositionLink(marked, reachable)
          return () => h(OrdersPanel, { model: value })
        },
      })
      // the hint line beside the link reads the hints store, so this host needs one
      const wrapper = mount(Host, { global: { plugins: [createPinia()] } })
      return { wrapper, state }
    }

    const WITH_TRADE = model(
      [order({ order_id: 'pos_1', status: 'pending' }), order({ order_id: 'pos_1', status: 'executed' })],
      [unit()],
      tradesOf([SCENARIO, 'pos_1']),
    )

    it('offers the way out on the row that names the position', () => {
      const { wrapper } = mountLinked(WITH_TRADE)
      const links = wrapper.findAll('.to-trades')
      expect(links).toHaveLength(1)
      expect(links[0]!.text()).toContain('pos_1')
    })

    /** 55 measured positions opened and never closed — there is nothing to go to. */
    it('draws no way out where the position produced no trade', () => {
      const { wrapper } = mountLinked(model([order({ order_id: 'pos_1' })], [unit()], tradesOf()))
      expect(wrapper.find('.to-trades').exists()).toBe(false)
      expect(wrapper.text()).toContain('pos_1')
    })

    /** 10 measured runs serve order-history and no trade history at all. */
    it('draws no way out where the run carries no trade history', () => {
      const { wrapper } = mountLinked(model([order({ order_id: 'pos_1' })], [unit()], null))
      expect(wrapper.find('.to-trades').exists()).toBe(false)
    })

    /** The panel is handed the trades but the WORKSPACE says that panel is not there. */
    it('draws no way out where the target panel is not in the workspace', () => {
      const { wrapper } = mountLinked(WITH_TRADE, null, ['orders'])
      expect(wrapper.find('.to-trades').exists()).toBe(false)
    })

    it('names the panel and the POSITION, never the position id alone', async () => {
      const { wrapper, state } = mountLinked(WITH_TRADE)
      await wrapper.find('.to-trades').trigger('click')
      expect(state.jumps).toEqual([
        { panelId: 'trade-history', ref: { scenario: SCENARIO, position: 'pos_1' } },
      ])
    })

    describe('the mark', () => {
      it('covers the whole lifecycle of the position, not one row of it', () => {
        const { wrapper } = mountLinked(
          model([
            order({ order_id: 'pos_1', status: 'pending' }),
            order({ order_id: 'pos_1', status: 'executed' }),
            order({ order_id: 'pos_2', status: 'pending' }),
          ]),
          { scenario: SCENARIO, position: 'pos_1' },
        )
        const marked = wrapper.findAll('.order-list .record-row')
          .map(row => row.classes().includes('marked'))
        expect(marked).toEqual([true, true, false])
      })

      /**
       * Every scenario counts from `pos_<symbol>_1`, so the id alone names nothing. Their own
       * warning, and the reason the mark carries both halves.
       */
      it('does not mark the same id in another scenario', () => {
        const { wrapper } = mountLinked(
          model(
            [order({ order_id: 'pos_1', scenario_name: 'other' })],
            [unit({ name: 'other' })],
          ),
          { scenario: SCENARIO, position: 'pos_1' },
        )
        expect(wrapper.find('.record-row.marked').exists()).toBe(false)
      })
    })
  })

  describe('what a narrow panel keeps', () => {
    it('gives every cell the rank its own column declares', () => {
      const wrapper = mountPanel({ pending: PENDING, history: HISTORY, trades: null })
      const heads = wrapper.findAll('.order-list .record-head > span')
        .map(node => node.attributes('data-rank'))
      const row = wrapper.find('.order-list .record-row').findAll(':scope > span')
        .map(node => node.attributes('data-rank'))

      expect(heads).toHaveLength(8)
      expect(row).toEqual(heads)
      // which order, what became of it, and when
      expect(heads.filter(rank => rank === '1')).toHaveLength(3)
    })

    /**
     * WHICH KIND of order it was, which nothing else on the page states: the pending unit's two
     * lists hold the orders still resting, not the ones that resolved. Served since contract 23
     * and empty on no row of a real run — 66 limit, 17 market and 3 stop on the field study of
     * 2026-10-07, against `market` on all 102 rows of the simulation capture, which is why the
     * column looks pointless until an AutoTrader run is opened.
     */
    it('says what kind of order was asked for, and states an absence as one', () => {
      const labels = mountPanel({ pending: PENDING, history: HISTORY, trades: null })
        .findAll('.order-list .record-head > span').map(node => node.text())
      expect(labels).toContain('Type')

      const typed = mountPanel(model([order({ order_type: 'limit' })]))
      expect(typed.find('.order-list .record-row').text()).toContain('limit')
      // null is the contract's own value on a row it was never asked of
      const untyped = mountPanel(model([order({ order_type: null })]))
      expect(untyped.find('.order-list .record-row').findAll(':scope > span')[2]!.text())
        .toBe('—')
    })

    /**
     * There is no POSITION column. Their docs state `order_id (= position_id)` by design, and over
     * 2,548 rows carrying a position the two strings were identical on every one — the column
     * repeated the first. What it really said, a position exists here, the status already says.
     */
    it('does not repeat the order id under a second heading', () => {
      const labels = mountPanel({ pending: PENDING, history: HISTORY, trades: null })
        .findAll('.order-list .record-head > span').map(node => node.text())
      expect(labels).toContain('Order id')
      expect(labels).not.toContain('Position')
    })

    /**
     * Their term, and their sentence with it. `order_id` is the id of the POSITION — the glossary
     * opens the entry with "Not an order's own id" — so a heading reading `Order` alone claimed
     * something false, and the reader needs the meaning one hover away.
     */
    it('names the column their way and carries what it means on the heading', () => {
      const head = mountPanel({ pending: PENDING, history: HISTORY, trades: null })
        .findAll('.order-list .record-head > span')[0]!
      expect(head.text()).toBe('Order id')
      expect(head.attributes('title')).toContain('Order id — ')
      expect(head.attributes('title')).toContain('the id of the POSITION')
    })
  })

  /**
   * Ambient, the way it reaches every other scenario-shaped panel. A narrowing that reached Trade
   * History and not this one would put two different populations side by side under one heading
   * saying the view is narrowed.
   */
  describe('under a narrowing', () => {
    function mountNarrowed(value: ReturnType<typeof model>, units: string[]) {
      const Host = defineComponent({
        setup() {
          provideTestSelection(units)
          return () => h(OrdersPanel, { model: value })
        },
      })
      return mount(Host)
    }

    const TWO = model(
      [order(), order({ scenario_name: 'ETHUSD_blocks_04' })],
      [unit(), unit({ name: 'ETHUSD_blocks_04' })],
    )

    it('draws only the chosen scenarios', () => {
      expect(mountNarrowed(TWO, []).findAll('.group-name')).toHaveLength(2)

      const narrowed = mountNarrowed(TWO, ['ETHUSD_blocks_04'])
      expect(narrowed.findAll('.group-name')).toHaveLength(1)
      expect(narrowed.find('.group-name').text()).toContain('ETHUSD_blocks_04')
    })

    /** A scenario the narrowing drops takes its funnel with it — the heading belongs to the group. */
    it('states an empty result as the chosen scenarios rather than as the run', () => {
      const wrapper = mountNarrowed(TWO, ['a_scenario_with_no_orders'])
      expect(wrapper.text()).toContain('The chosen scenarios placed no order')
      expect(wrapper.find('.order-list').exists()).toBe(false)
    })
  })

  it('says so plainly where a run placed no order', () => {
    const wrapper = mountPanel(model([]))
    expect(wrapper.text()).toContain('placed no order')
    expect(wrapper.find('.order-list').exists()).toBe(false)
  })

  /** Read-only: these are records of what happened, with nothing to choose. */
  /**
   * The THIRD level: what the orders of one position went through, from the event stream.
   *
   * It hangs off the POSITION and not off a row, and that is forced rather than chosen: an
   * `order-history` row carries no `seq`, `submitted_seq` or `client_order_id`, so nothing on it
   * says which order it belongs to (testingide#557). The stream identifies its own orders, so the
   * order level comes from there.
   */
  /**
   * Two orders both `cancelled` are not the same event, and the list showed them as one. Measured
   * on the field study: `pos_ethusd_44` was taken back by the strategy, `protect_pos_ethusd_41`
   * released by the framework — same word, different thing, and nothing on the row said which.
   */
  it('says WHO ended an order beside the status, and nothing where the record is silent', () => {
    const byStrategy = mountPanel(model([order({ status: 'cancelled', initiator: 'strategy' })]))
    expect(byStrategy.find('.order-list .record-row').text()).toContain('cancelled · strategy')

    const byFramework = mountPanel(model([order({ status: 'cancelled', initiator: 'framework' })]))
    expect(byFramework.find('.order-list .record-row').text()).toContain('cancelled · framework')

    // and a record that names nobody says nobody — the separator appears with the name, not before
    const plain = mountPanel(model([order({ status: 'executed', initiator: null })]))
    expect(plain.find('.order-list .record-row').text()).toContain('executed')
    expect(plain.find('.order-list .record-row').text()).not.toContain('·')
  })

  describe('the steps of a position', () => {
    function mountStepped(
      value: ReturnType<typeof model>,
      held: Parameters<typeof provideTestOrderSteps>[0] = {},
      available: Parameters<typeof provideTestOrderSteps>[1] = true,
      reading: Parameters<typeof provideTestOrderSteps>[2] = []
    ) {
      let state!: ReturnType<typeof provideTestOrderSteps>
      const Host = defineComponent({
        setup() {
          provideTestPositionLink(null, [])
          state = provideTestOrderSteps(held, available, reading)
          return () => h(OrdersPanel, { model: value })
        },
      })
      const wrapper = mount(Host, { global: { plugins: [createPinia()] } })
      return { wrapper, state }
    }

    /** The reader clicks the LINE, which is what they tried first and what the list now offers. */
    async function openPosition(wrapper: ReturnType<typeof mountStepped>['wrapper']) {
      await wrapper.find('.order-list .record-row.starts-position').trigger('click')
    }

    const TWO_ROWS = model([
      order({ order_id: 'pos_1', status: 'pending' }),
      order({ order_id: 'pos_1', status: 'executed' }),
    ])

    /**
     * On the row that STARTS a position and nowhere else. The rows beneath it are the same
     * position, so a second disclosure would ask for the same thing twice over — and the list
     * cannot make one row interactive and another not, which is why the control sits inside the
     * cell rather than on the row.
     */
    it('makes the row that names a position the control, and the rows under it not', () => {
      const { wrapper } = mountStepped(TWO_ROWS)
      const rows = wrapper.findAll('.order-list .record-row')
      expect(rows).toHaveLength(2)
      // the row that STARTS the position is a button; the row carrying it on is a plain div
      expect(rows[0]!.element.tagName).toBe('BUTTON')
      expect(rows[1]!.element.tagName).toBe('DIV')
      expect(rows[1]!.classes()).toContain('inert')
      // and the glyph says it opens something, drawn by the LIST rather than by this panel
      expect(wrapper.findAll('.record-marker')).toHaveLength(1)
      expect(rows[0]!.attributes('aria-expanded')).toBe('false')
    })

    /** The glyph turns with the state, which is the half a reader checks after clicking. */
    it('turns the glyph and the announcement when the row is opened', async () => {
      const { wrapper } = mountStepped(TWO_ROWS, { [SCENARIO + '~pos_1']: [step()] })
      expect(wrapper.find('.record-marker').text()).toBe('▸')
      await openPosition(wrapper)
      expect(wrapper.find('.record-marker').text()).toBe('▾')
      expect(wrapper.find('.order-list .record-row').attributes('aria-expanded')).toBe('true')
    })

    /**
     * A run that wrote no stream gets no disclosure at all. The gate is `stream_files` on the run
     * index row, answered by the host — offering a control that can only ever answer 404 is the
     * defect class this project cares most about.
     */
    it('draws nothing where the run wrote no stream', () => {
      const { wrapper } = mountStepped(TWO_ROWS, {}, false)
      // no glyph, and no row is a control: a disclosure that can only answer 404 is not offered
      expect(wrapper.findAll('.record-marker')).toHaveLength(0)
      expect(wrapper.findAll('.order-list .record-row button')).toHaveLength(0)
      expect(wrapper.find('.order-list .record-row').element.tagName).toBe('DIV')
    })

    /** Asked for on OPENING, never on mount: a run holds hundreds of positions. */
    it('asks for that one position, and only when it is opened', async () => {
      const { wrapper, state } = mountStepped(TWO_ROWS)
      expect(state.asked).toEqual([])
      await openPosition(wrapper)
      expect(state.asked).toEqual([{ scenario: SCENARIO, position: 'pos_1' }])
    })

    it('says it is reading rather than claiming the stream is empty', async () => {
      const { wrapper } = mountStepped(TWO_ROWS, {}, true, [SCENARIO + '~pos_1'])
      await openPosition(wrapper)
      expect(wrapper.find('.step-state').text()).toContain('Reading the stream')
    })

    it('states an empty stream as an absence rather than drawing an empty list', async () => {
      const { wrapper } = mountStepped(TWO_ROWS, { [SCENARIO + '~pos_1']: [] })
      await openPosition(wrapper)
      expect(wrapper.find('.step-state').text()).toContain('records no step')
      expect(wrapper.find('.step-list').exists()).toBe(false)
    })

    /**
     * ONE position, SEVERAL orders, grouped by `submitted_seq` — their instruction, and the reason
     * is that `order_id` repeats across a position's open and its closes. Grouped by `order_id`
     * these five steps would read as one order.
     */
    it('groups the steps into the orders they belong to', async () => {
      const held = { [SCENARIO + '~pos_1']: [
        step({ seq: 2, submitted_seq: 2, event_type: 'submitted', action: 'open' }),
        step({ seq: 3, submitted_seq: 2, event_type: 'accepted', action: 'open', in_flight_ms: 503 }),
        step({ seq: 4, submitted_seq: 2, event_type: 'filled', action: 'open', fill_price: 2573.6 }),
        step({ seq: 9, submitted_seq: 9, event_type: 'submitted', action: 'close' }),
        step({ seq: 10, submitted_seq: 9, event_type: 'cancelled', action: 'close',
          initiator: 'strategy', end_reason: 'cancel_requested' }),
      ] }
      const { wrapper } = mountStepped(TWO_ROWS, held)
      await openPosition(wrapper)

      const groups = wrapper.findAll('.step-group')
      expect(groups).toHaveLength(2)
      expect(groups[0]!.text()).toContain('order 2')
      expect(groups[1]!.text()).toContain('order 9')
      // what the order WAS, stated once on the heading rather than down every step
      expect(groups[0]!.text()).toContain('limit open long')
      expect(wrapper.findAll('.step-list .record-row')).toHaveLength(5)
    })

    /**
     * The order of the STREAM, never of the clock. A backtest takes and fills a market order in one
     * instant, so the stamps repeat and sorting by time would leave their order to chance.
     */
    it('keeps the steps in the order the stream wrote them', async () => {
      const same = '2026-10-08T10:36:27.000000+00:00'
      const held = { [SCENARIO + '~pos_1']: [
        step({ seq: 7, event_type: 'submitted', event_time: same }),
        step({ seq: 8, event_type: 'accepted', event_time: same }),
        step({ seq: 9, event_type: 'filled', event_time: same }),
      ] }
      const { wrapper } = mountStepped(TWO_ROWS, held)
      await openPosition(wrapper)
      const rows = wrapper.findAll('.step-list .record-row').map(row => row.text())
      expect(rows[0]).toContain('submitted')
      expect(rows[1]).toContain('accepted')
      expect(rows[2]).toContain('filled')
    })

    /** A denied order was never submitted, so it is named by that rather than by a number. */
    it('names an order that was never submitted rather than inventing a number', async () => {
      const held = { [SCENARIO + '~pos_1']: [
        step({ seq: 5, submitted_seq: null, event_type: 'denied',
          rejection_reason: 'invalid_lot_size', message: 'Lot size 1e-05 below minimum 0.001' }),
      ] }
      const { wrapper } = mountStepped(TWO_ROWS, held)
      await openPosition(wrapper)
      expect(wrapper.find('.step-group').text()).toContain('never submitted')
      // and the backend's own sentence is the detail, never our paraphrase of it
      expect(wrapper.find('.step-detail').text()).toContain('Lot size 1e-05 below minimum 0.001')
    })

    /**
     * One thing per step, in their order of weight: why it was refused, who ended it and why, how
     * long the venue took, the price where one was reached. A step carries at most one.
     */
    it('says the one thing each step adds', async () => {
      const held = { [SCENARIO + '~pos_1']: [
        step({ seq: 1, event_type: 'accepted', in_flight_ms: 503 }),
        step({ seq: 2, event_type: 'cancelled', initiator: 'strategy',
          end_reason: 'cancel_requested' }),
        step({ seq: 3, event_type: 'filled', fill_price: 2573.6 }),
      ] }
      const { wrapper } = mountStepped(TWO_ROWS, held)
      await openPosition(wrapper)
      const notes = wrapper.findAll('.step-detail').map(cell => cell.text())
      expect(notes[0]).toBe('in flight 503 ms')
      expect(notes[1]).toContain('strategy')
      expect(notes[1]).toContain('cancel_requested')
      // the price carries its word too, like the duration above it
      expect(notes[2]).toBe('at 2573.60000')
    })

    /**
     * Opening and closing is the panel's own state, and asking is all it does about the data.
     *
     * It asks on EVERY opening and deliberately does not check first: what is held and what is in
     * flight is the store's knowledge, and the store already refuses a second request for a
     * position it has (`run_reports_store.test.ts`, *does not ask twice for a position it already
     * holds*). A panel repeating that check would be a second place to get it wrong.
     */
    /**
     * The way back out, and it exists only while there is a way back out. Where everything is
     * fine nothing is printed — with nothing expanded there is nothing to close.
     *
     * Not called "collapse all": that name belongs to the app bar's control over the PANELS, and
     * a second one meaning something else is a trap rather than a convenience.
     */
    it('offers a way to close everything, and only while something is open', async () => {
      const held = { [SCENARIO + '~pos_1']: [step()] }
      const { wrapper } = mountStepped(TWO_ROWS, held)
      expect(wrapper.find('.steps-open').exists()).toBe(false)

      await openPosition(wrapper)
      expect(wrapper.find('.steps-open').text()).toContain('1 position open')
      expect(wrapper.find('.step-list').exists()).toBe(true)

      await wrapper.find('.close-steps').trigger('click')
      expect(wrapper.find('.step-list').exists()).toBe(false)
      expect(wrapper.find('.steps-open').exists()).toBe(false)
    })

    it('closes again, and leaves the de-duplication to the one place that can do it', async () => {
      const held = { [SCENARIO + '~pos_1']: [step()] }
      const { wrapper, state } = mountStepped(TWO_ROWS, held)
      await openPosition(wrapper)
      expect(wrapper.find('.step-list').exists()).toBe(true)
      await openPosition(wrapper)
      expect(wrapper.find('.step-list').exists()).toBe(false)
      await openPosition(wrapper)
      expect(wrapper.find('.step-list').exists()).toBe(true)
      // the same position both times, never another one
      expect(new Set(state.asked.map(ref => ref.position))).toEqual(new Set(['pos_1']))
    })
  })

  it('offers nothing to click but the group headings', () => {
    const wrapper = mountPanel({ pending: PENDING, history: HISTORY, trades: null })
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBe(wrapper.findAll('.group-name').length)
  })
})
