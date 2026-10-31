import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import LatestStatePanel from '@/components/runs/LatestStatePanel.vue'
import { provideTickSizes } from '@/composables/use_tick_sizes'
import type { StateFrame, StateFrameUnit, StateFramesLatest } from '@/types/api/state_frame_types'
import endedFixture from './fixtures/state_frames_ended.json'
import stoppedFixture from './fixtures/state_frames_stopped.json'

/** A captured answer with its one unit changed where a case needs it — the shape stays the server's. */
function answer(
  source: unknown,
  unit: Partial<StateFrameUnit> = {},
  frame: Partial<StateFrame> = {},
): StateFramesLatest {
  const copy = structuredClone(source) as StateFramesLatest
  const first = copy.units[0]!
  Object.assign(first, unit)
  Object.assign(first.frame, frame)
  return copy
}

function mountPanel(model: StateFramesLatest) {
  return mount(LatestStatePanel, { props: { model } })
}

describe('LatestStatePanel', () => {
  /** The route's own verdict, with its glyph and its word; the colour only reinforces. */
  it('says how the session records, in a line of its own', () => {
    const live = mountPanel(answer(stoppedFixture, { recording: 'current', age_s: 21 }))
    expect(live.find('.status').text()).toContain('● recording · written 21 s ago · cadence M1')
    expect(live.find('.status').classes()).toContain('current')

    const stopped = mountPanel(answer(stoppedFixture))
    expect(stopped.find('.status').text()).toContain('⚠ recording stopped')
    expect(stopped.find('.status').text()).toContain('Panels ▸ Activities')

    const replay = mountPanel(answer(endedFixture, { recording: null, outcome: null }))
    expect(replay.find('.status').text()).toContain('replaying recorded data')
    // the age of a replayed frame says nothing, so it is not said
    expect(replay.find('.status').text()).not.toContain('ago')
  })

  /** The session clock is said as a time and named as that clock; the machine clock only as an age. */
  it('says the frame in the session clock, apart from how long ago it was written', () => {
    const wrapper = mountPanel(answer(endedFixture))
    expect(wrapper.find('.as-of').text()).toContain('2026-01-25 08:00:00Z')
    expect(wrapper.find('.as-of').text()).toContain('the session clock')
    expect(wrapper.find('.as-of').text()).toContain('written for shutdown')
  })

  /**
   * Once ended with its outcome written, the frame is what the report describes: it folds away
   * behind the status and the memory, which no report states.
   */
  it('folds the last frame of a closed session behind its outcome and its memory', () => {
    const wrapper = mountPanel(answer(endedFixture))
    expect(wrapper.find('.status').text()).toContain('■ ended · success · shutdown normal')
    expect(wrapper.find('details.frame').exists()).toBe(true)
    expect(wrapper.find('details.frame summary').text()).toContain('the state its report sections describe')
    expect(wrapper.find('.memory').text()).toContain('First frame')

    const open = mountPanel(answer(stoppedFixture))
    expect(open.find('details').exists()).toBe(false)
    expect(open.find('.frame').exists()).toBe(true)
  })

  /** Ctrl+C is an emergency shutdown, and the outcome says the operator stopped it. */
  it('says a session the operator stopped as stopped by the operator', () => {
    const ended = answer(endedFixture)
    ended.units[0]!.outcome = { ...ended.units[0]!.outcome!, shutdown_mode: 'emergency', operator_interrupted: true }
    expect(mountPanel(ended).find('.status').text()).toContain('shutdown emergency · stopped by the operator')
  })

  /** Memory now and at the first frame, side by side — two points are not a series, and nothing is subtracted. */
  it('puts the memory now beside the memory at the first frame', () => {
    const wrapper = mountPanel(answer(stoppedFixture,
      { first_frame: { written_at: '2026-10-22T12:37:19Z', process_memory: { rss_bytes: 226_000_000, private_bytes: 159_000_000 } } },
      { process_memory: { rss_bytes: 227_000_000, private_bytes: 160_000_000 } }))
    const memory = wrapper.find('.memory').text()
    expect(memory).toContain('private 160.0 MB')
    expect(memory).toContain('private 159.0 MB')
    expect(memory).not.toContain('1.0 MB')
  })

  /** A check that passes says nothing; one that is off speaks, and so does one that did not run. */
  it('speaks only where a check is off or was not made', () => {
    const quiet = mountPanel(answer(stoppedFixture, {},
      { safety_blocked: false, market_stale: false, feed_stale: null, reconcile_clean: true }))
    expect(quiet.findAll('.health')).toHaveLength(0)

    const loud = mountPanel(answer(stoppedFixture, {},
      { safety_blocked: true, market_stale: false, feed_stale: true, reconcile_clean: null }))
    const lines = loud.findAll('.health')
    expect(lines.find(line => line.text().includes('circuit breaker'))?.classes()).toContain('warning')
    expect(lines.find(line => line.text().includes('signal'))?.classes()).toContain('warning')
    const unchecked = lines.find(line => line.text().includes('reconciliation'))
    expect(unchecked?.classes()).not.toContain('warning')
  })

  /** What the decision sent: the order id on the frame written for it. */
  it('names the order the decision sent, and the account at the moment of the frame', () => {
    const wrapper = mountPanel(answer(stoppedFixture))
    const text = wrapper.text()
    expect(text).toContain('Order id')
    expect(text).toContain('pos_ethusd_1')
    expect(text).toContain('BUY')
    // a holding the session computed, without the float noise below its last quoted digit
    expect(text).toContain('0.01655583 ETH')
    expect(text).not.toContain('0.016555830000')
  })

  /** A frame's prices at the tick size of the unit's instrument; a holding is no price and keeps its own digits. */
  it('prints the prices of a frame at the tick size of its unit\'s instrument', () => {
    const model = answer(endedFixture)
    const unit = model.units[0]!
    // values that round UP, so an unrounded print does not contain the expected one
    unit.frame.last_price = 88635.16000000001
    const position = unit.frame.open_positions[0]!
    position.entry_price = 88635.16000000001
    position.stop_loss = 88000.06000000001
    position.take_profit = 89000.06000000001
    unit.frame.active_orders = [{
      order_id: 'pos_resting', order_type: 'stop_limit', direction: 'long', lots: 0.1,
      entry_price: 88500.16000000001, limit_price: 88500.26000000001,
    } as never]
    const seen: [string, string | null][] = []
    const Host = defineComponent({
      setup() {
        provideTickSizes((name, symbol) => {
          seen.push([name, symbol])
          return 0.1
        })
        return () => h(LatestStatePanel, { model })
      },
    })
    const wrapper = mount(Host)
    const [holding, resting] = wrapper.findAll('.holding').map(row => row.text())
    expect(holding).toContain('@ 88635.2')
    expect(holding).toContain('SL 88000.1')
    expect(holding).toContain('TP 89000.1')
    expect(resting).toContain('@ 88500.2')
    expect(resting).toContain('limit 88500.3')
    expect(wrapper.text()).toContain('88635.2 BTCUSD')
    expect(seen).toContainEqual([unit.unit_name, unit.frame.symbol])
  })

  /** The rows the portfolio serves, said as a position; none is said as none. */
  it('lists the open positions and the resting orders, and says none where there are none', () => {
    const ended = mountPanel(answer(endedFixture))
    expect(ended.findAll('.holding')).toHaveLength(1)
    expect(ended.find('.holding').text()).toContain('long 0.1 BTCUSD @ 88635.1')

    const none = mountPanel(answer(stoppedFixture))
    expect(none.findAll('.holding')).toHaveLength(0)
    expect(none.findAll('.holding-line').map(line => line.text())).toEqual(['Open positions none', 'Resting orders none'])
    expect(ended.findAll('.holding-line')[0]?.text()).toBe('Open positions')
  })
})
