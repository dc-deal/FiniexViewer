import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PendingOrdersPanel from '@/components/runs/PendingOrdersPanel.vue'
import type {
  PendingOrderRow,
  PendingOrderUnit,
  PendingOrdersReport,
} from '@/types/api/report_types'
import pendingFixture from './fixtures/pending_orders.json'

/**
 * Why an order did not become what it was meant to be — the one question no other panel reaches.
 *
 * The captured run resolved one order per unit and filled it, with nothing left open, so the two
 * cases that matter are built by hand here: a unit that resolved hundreds and filled none, and a
 * unit with orders still waiting. Both occur in the archive and neither is in the capture.
 */
const REPORT: PendingOrdersReport = pendingFixture

const ORDER: PendingOrderRow = {
  order_id: 'pos_gbpusd_1',
  order_type: 'limit',
  direction: 'long',
  lots: 0.01,
  entry_price: 1.37424,
  limit_price: 1.37424,
  stop_loss: 1.37366,
  take_profit: 1.37541,
}

function unit(overrides: Partial<PendingOrderUnit> = {}): PendingOrderUnit {
  return {
    name: 'ETHUSD_blocks_03',
    symbol: 'ETHUSD',
    total_resolved: 1,
    total_filled: 1,
    total_rejected: 0,
    total_timed_out: 0,
    total_force_closed: 0,
    avg_latency_ms: 60,
    min_latency_ms: 60,
    max_latency_ms: 60,
    latency_count: 1,
    active_limit_orders: [],
    active_stop_orders: [],
    ...overrides,
  }
}

function report(units: PendingOrderUnit[]): PendingOrdersReport {
  return { run_id: '20260615_130000', units }
}

function mountPanel(model: PendingOrdersReport = REPORT) {
  return mount(PendingOrdersPanel, { props: { model } })
}

function cells(wrapper: ReturnType<typeof mountPanel>): Record<string, string> {
  const heads = wrapper.findAll('.pending-list .record-head > span').map(node => node.text())
  const row = wrapper.find('.pending-list .record-row').findAll(':scope > span')
  return Object.fromEntries(heads.map((head, index) => [head, row[index]?.text() ?? '']))
}

describe('PendingOrdersPanel', () => {
  it('draws one row per scenario, from the capture', () => {
    const wrapper = mountPanel()
    expect(wrapper.findAll('.pending-list .record-row')).toHaveLength(REPORT.units.length)
    expect(wrapper.text()).toContain(REPORT.units[0]!.name)
  })

  /**
   * The five counts are a FUNNEL the backend states in full —
   * `resolved = filled + rejected + timed_out + force_closed`, which held on all 202 units
   * measured. The parts are shown beside their total so the shape is readable; nothing is computed
   * from the identity.
   */
  it('shows every part of the funnel beside its total', () => {
    const shown = cells(mountPanel(report([unit({
      total_resolved: 527, total_filled: 0, total_rejected: 527,
    })])))
    expect(shown['Resolved']).toBe('527')
    expect(shown['Filled']).toBe('0')
    expect(shown['Rejected']).toBe('527')
    expect(shown['Timed out']).toBe('0')
    expect(shown['Force closed']).toBe('0')
  })

  /**
   * The case the panel exists for: hundreds resolved, none filled — and every other section of
   * that run showing a normal-looking result. The rejection wears the polarity of a figure that
   * went the wrong way, and only where there is one.
   */
  it('marks a rejection, and marks nothing where there was none', () => {
    const rejected = mountPanel(report([unit({ total_rejected: 527, total_filled: 0 })]))
    expect(rejected.find('.negative').exists()).toBe(true)

    expect(mountPanel(report([unit()])).find('.negative').exists()).toBe(false)
  })

  describe('latency', () => {
    it('shows the average with its spread and its count one hover away', () => {
      const wrapper = mountPanel(report([unit({
        avg_latency_ms: 50.6, min_latency_ms: 27, max_latency_ms: 60, latency_count: 7,
      })]))
      const cell = wrapper.find('.pending-list .record-row').findAll(':scope > span')[7]!
      expect(cell.text()).toBe('51 ms')
      expect(cell.attributes('title')).toContain('27–60 ms')
      expect(cell.attributes('title')).toContain('7 resolutions')
    })

    /** Nothing timed is an absence, and `0 ms` there would claim a measurement. */
    it('states an untimed unit as absent rather than as zero', () => {
      const wrapper = mountPanel(report([unit({
        avg_latency_ms: 0, min_latency_ms: 0, max_latency_ms: 0, latency_count: 0,
      })]))
      const cell = wrapper.find('.pending-list .record-row').findAll(':scope > span')[7]!
      expect(cell.text()).toBe('n/a')
      expect(cell.attributes('title')).toContain('No resolution was timed')
    })
  })

  /**
   * OPEN AT END is a SEPARATE population from the funnel: their execution-layer doc says every
   * order that *leaves the queue* is what gets counted there, so a unit can read
   * `resolved 1 · filled 1 · open at end 1` and have had two orders. Measured on
   * `20260929_085949_ccc36468`, which is exactly that case.
   *
   * It was called *resting* until testingide corrected it on 2026-10-01: in a backtest the
   * simulation also records such an order as `expired` at scenario end and deliberately leaves it
   * in these lists, so nothing is waiting for a price any more.
   */
  describe('the orders still open when the data ended', () => {
    it('counts such an order apart from the funnel it never entered', () => {
      const shown = cells(mountPanel(report([unit({
        total_resolved: 1, total_filled: 1, active_limit_orders: [ORDER],
      })])))
      expect(shown['Resolved']).toBe('1')
      expect(shown['Filled']).toBe('1')
      // two orders: one left the queue, one was still open when the data ended
      expect(shown['Open at end']).toBe('1')
    })

    it('counts them on the row and draws them beneath it', () => {
      const wrapper = mountPanel(report([unit({
        active_limit_orders: [ORDER],
        active_stop_orders: [{ ...ORDER, order_type: 'stop', direction: 'short' }],
      })]))
      expect(cells(wrapper)['Open at end']).toBe('2')

      const orders = wrapper.findAll('.order-list .record-row')
      expect(orders).toHaveLength(2)
      expect(orders[0]!.text()).toContain('limit')
      expect(orders[0]!.text()).toContain('pos_gbpusd_1')
      expect(orders[1]!.text()).toContain('stop')
    })

    /**
     * The array a resting order arrives in is a GROUPING, not its type. Measured 2026-10-01 over
     * 219 units: `active_stop_orders` carried an order whose own `order_type` is `stop_limit`,
     * which this panel drew as `stop` until the measurement found it.
     */
    it('names an order by its own type rather than by the array that held it', () => {
      const wrapper = mountPanel(report([unit({
        active_stop_orders: [{ ...ORDER, order_type: 'stop_limit' }],
      })]))
      expect(wrapper.find('.order-list .record-row').text()).toContain('stop_limit')
    })

    /** An empty block under every row would treble the list to say nothing. */
    it('draws nothing beneath a unit that ended with none open', () => {
      const wrapper = mountPanel(report([unit()]))
      expect(cells(wrapper)['Open at end']).toBe('0')
      expect(wrapper.find('.order-list').exists()).toBe(false)
    })

    /**
     * `order_id` is NOT unique across the response: measured 2026-10-01, `pos_gbpusd_1` appears in
     * two scenarios of one run. testingide declared it a key WITHIN a unit the same day, but
     * contract 18 serves no key at all, so the list is keyed by a drawing position scoped by the
     * unit — which holds whichever of the two it turns out to be.
     */
    it('keys an order by position rather than by an id that repeats', () => {
      const wrapper = mountPanel(report([unit({
        active_limit_orders: [ORDER, { ...ORDER, limit_price: 1.4, direction: 'short' }],
      })]))
      const orders = wrapper.findAll('.order-list .record-row')
      expect(orders).toHaveLength(2)
      expect(orders[0]!.text()).not.toBe(orders[1]!.text())
    })
  })

  describe('what a narrow panel keeps', () => {
    /**
     * The rank lives twice — on the column and on the cell — because the list owns the tracks while
     * this panel owns the cells.
     */
    it('gives every cell the rank its own column declares', () => {
      const wrapper = mountPanel()
      const heads = wrapper.findAll('.pending-list .record-head > span')
        .map(node => node.attributes('data-rank'))
      const row = wrapper.find('.pending-list .record-row').findAll(':scope > span')
        .map(node => node.attributes('data-rank'))

      expect(heads).toHaveLength(9)
      expect(row).toEqual(heads)
      // which scenario, how many resolved, how many REJECTED, what is still open
      expect(heads.filter(rank => rank === '1')).toHaveLength(4)
    })

    /**
     * `Timed out` and `Force closed` go first, and that is measured: both read zero on all 202
     * units across 20 runs. They are part of the funnel's vocabulary, not of this archive's data.
     */
    it('gives up the two halves that have never fired before anything else', () => {
      const wrapper = mountPanel()
      const byLabel = Object.fromEntries(
        wrapper.findAll('.pending-list .record-head > span')
          .map(node => [node.text(), node.attributes('data-rank')])
      )
      expect(byLabel['Timed out']).toBe('5')
      expect(byLabel['Force closed']).toBe('5')
      expect(byLabel['Rejected']).toBe('1')
    })
  })

  /**
   * It does not claim the run placed no such order: `units` is EMPTY on an AutoTrader run, where
   * this section is simply not produced (testingide, 2026-10-01), so the honest sentence names the
   * absence of the statistics rather than the absence of orders.
   */
  it('states the absence of the statistics without claiming what the run did', () => {
    const wrapper = mountPanel(report([]))
    expect(wrapper.text()).toContain('No pending-order statistics')
    expect(wrapper.find('.pending-list').exists()).toBe(false)
  })

  /** Read-only: these are records of what happened, with nothing to choose and nothing to sort by. */
  it('offers nothing to click', () => {
    expect(mountPanel().findAll('button')).toHaveLength(0)
  })
})
