import { describe, it, expect } from 'vitest'
import { entryExitLines, positionLevels } from '@/components/runs/run_chart_levels'
import type { OpenPosition, TradeHistoryReport, TradeRow } from '@/types/api/report_types'

import tradeFixture from './fixtures/trade_history.json'

const trades = (tradeFixture as unknown as TradeHistoryReport).trades
const KEY = (tradeFixture as unknown as TradeHistoryReport).keys.trades

// 2025-10-31 05:00, 05:01, 05:02 UTC
const BARS = [1761886800, 1761886860, 1761886920]

function trade(fields: Partial<TradeRow>): TradeRow {
  return {
    ...trades[0]!, scenario_name: 'unit', position_id: 'pos_1', direction: 'long',
    entry_time: '2025-10-31T05:00:40+00:00', exit_time: '2025-10-31T05:02:10+00:00',
    entry_price: 1.1, exit_price: 1.2, net_pnl: 1.5, stop_loss: null, take_profit: null,
    ...fields,
  }
}

const OPEN: OpenPosition = {
  position_id: 'pos_1', direction: 'long', lots: 0.1, entry_price: 1.1, entry_time: '2025-10-31T05:01:10+00:00',
  last_price: 1.15, unrealized_pnl: 0.5, valued: true, stop_loss: 1.05, take_profit: null,
  protective_level_enforcement: 'local', take_profit_enforcement: '',
}

/**
 * The levels of the position looked at, and the line from its entry to its exit — the served
 * fields of its trade rows and of its entry in `open_positions`, placed on the bars they fell in.
 */
describe('run_chart_levels', () => {
  describe('positionLevels', () => {
    it('holds a set stop and target from the trade\'s entry to its exit, on their prices', () => {
      const [stop, target] = positionLevels([trade({ stop_loss: 1.05, take_profit: 1.3 })], KEY, [], 'pos_1', BARS, null)
      expect(stop).toMatchObject({ kind: 'segment', label: 'SL', role: 'negative', price: 1.05, from: BARS[0], to: BARS[2] })
      expect(target).toMatchObject({ label: 'TP', role: 'positive', price: 1.3 })
      expect(stop!.id).not.toBe(target!.id)
      expect(stop!.card.title).toBe('Stop loss · pos_1')
    })

    it('draws nothing where no level was set', () => {
      expect(positionLevels([trade({})], KEY, [], 'pos_1', BARS, null)).toEqual([])
    })

    /** A position the run ended with still open holds its levels to the edge of the window. */
    it('holds the levels of a position still open at the end to the edge of the window', () => {
      const [stop] = positionLevels([], KEY, [OPEN], 'pos_1', BARS, null)
      expect(stop).toMatchObject({ label: 'SL', price: 1.05, from: BARS[1], to: null })
      expect(stop!.card.details.map(pair => pair.value).join(' ')).toContain('still open at the end')
    })

    /** Every position's levels, where the reader asks for them — only the one looked at is marked as such. */
    it('marks the levels of the position looked at among those of every position', () => {
      const levels = positionLevels(
        [trade({ stop_loss: 1.05 }), trade({ position_id: 'pos_2', stop_loss: 1.0 })],
        KEY, [{ ...OPEN, position_id: 'pos_3' }], 'pos_1', BARS, null,
      )
      expect(levels.map(level => [level.card.title, level.focused])).toEqual([
        ['Stop loss · pos_1', true], ['Stop loss · pos_2', false], ['Stop loss · pos_3', false],
      ])
    })

    /** Past the last bar of a CUT window there is no candle: what began there is not drawn. */
    it('draws nothing that began past the last bar of a cut window, and runs one that ends there to the edge', () => {
      const late = trade({ stop_loss: 1.05, entry_time: '2025-10-31T05:30:00+00:00', exit_time: '2025-10-31T05:40:00+00:00' })
      const across = trade({ stop_loss: 1.05, exit_time: '2025-10-31T05:40:00+00:00' })
      expect(positionLevels([late], KEY, [], 'pos_1', BARS, BARS[2]!)).toEqual([])
      expect(positionLevels([across], KEY, [], 'pos_1', BARS, BARS[2]!)[0]).toMatchObject({ from: BARS[0], to: null })
    })
  })

  describe('entryExitLines', () => {
    it('joins where each trade entered and left, coloured by the polarity of its result', () => {
      const [line] = entryExitLines([trade({ net_pnl: -0.4 })], KEY, BARS, null)
      expect(line).toMatchObject({
        kind: 'line', role: 'negative', from: { time: BARS[0], price: 1.1 }, to: { time: BARS[2], price: 1.2 },
      })
      expect(line!.id.startsWith('line|')).toBe(true)
    })

    it('draws no line where the trade entered and left in one candle', () => {
      const quick = trade({ exit_time: '2025-10-31T05:00:50+00:00' })
      expect(entryExitLines([quick], KEY, BARS, null)).toEqual([])
    })
  })
})
