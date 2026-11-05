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
    exit_level: null, close_reason: '',
    ...fields,
  }
}

const OPEN: OpenPosition = {
  position_id: 'pos_1', direction: 'long', lots: 0.1, entry_price: 1.1, entry_time: '2025-10-31T05:01:10+00:00',
  last_price: 1.15, unrealized_pnl: 0.5, valued: true, stop_loss: 1.05, take_profit: null,
}

/**
 * The levels of the position looked at, and the line from its entry to its exit — the served
 * fields of its trade rows and of its entry in `open_positions`, placed on the bars they fell in.
 */
describe('run_chart_levels', () => {
  describe('positionLevels', () => {
    /**
     * The levels on a trade row are those in force when its close was booked, after any move: known
     * at the exit alone, so drawn at its bar alone, and never back to the entry.
     */
    it('draws a set stop and target at the bar of the exit alone, on their prices', () => {
      const [stop, target] = positionLevels([trade({ stop_loss: 1.05, take_profit: 1.3 })], KEY, [], 'pos_1', BARS, null)
      expect(stop).toMatchObject({ kind: 'segment', label: 'SL', role: 'negative', price: 1.05, from: BARS[2], to: BARS[2] })
      expect(stop!.card.details.find(pair => pair.label === 'In force at')?.title).toContain('not recorded')
      expect(target).toMatchObject({ label: 'TP', role: 'positive', price: 1.3 })
      expect(stop!.id).not.toBe(target!.id)
      expect(stop!.card.title).toBe('Stop loss · pos_1')
    })

    /**
     * An own level (contract 45): the strategy keeps it, so the row leaves `stop_loss` and
     * `take_profit` null and names the one that fired in `exit_level`, `close_reason` saying which.
     */
    it('draws an own level that fired as the level its close reason names, saying whose it is', () => {
      const [stop] = positionLevels(
        [trade({ exit_level: 1.05, close_reason: 'sl_triggered' })], KEY, [], 'pos_1', BARS, null,
      )
      expect(stop).toMatchObject({ kind: 'segment', label: 'SL', role: 'negative', price: 1.05, from: BARS[2], to: BARS[2], focused: true })
      expect(stop!.card.title).toBe('Stop loss · pos_1')
      expect(stop!.card.details).toContainEqual({ label: 'Own level', value: 'stop loss 1.05' })
      // the close's own time: it fills at the next price, and no field says when the level was reached
      expect(stop!.card.details).toContainEqual({ label: 'Closed', value: '2025-10-31 05:02:10Z' })
      const [target] = positionLevels(
        [trade({ exit_level: 1.3, close_reason: 'tp_triggered' })], KEY, [], 'pos_1', BARS, null,
      )
      expect(target).toMatchObject({ label: 'TP', role: 'positive', price: 1.3 })
      expect(target!.card.details).toContainEqual({ label: 'Own level', value: 'take profit 1.3' })
    })

    /** Its mark among every position's levels is the plain one, like any other position's. */
    it('marks an own level of a position not looked at as such', () => {
      const levels = positionLevels([trade({ exit_level: 1.05, close_reason: 'sl_triggered' })], KEY, [], 'pos_2', BARS, null)
      expect(levels[0]!.focused).toBe(false)
    })

    /** A level the position carried states itself; its `exit_level` names the same level, not a second one. */
    it('does not name a carried level twice where it also fired', () => {
      const stopFired = positionLevels(
        [trade({ stop_loss: 1.05, take_profit: 1.3, exit_level: 1.05, close_reason: 'sl_triggered' })], KEY, [], 'pos_1', BARS, null,
      )
      expect(stopFired.map(level => [level.label, level.price])).toEqual([['SL', 1.05], ['TP', 1.3]])
      expect(stopFired[0]!.card.details[0]).toEqual({ label: 'Stop loss', value: '1.05' })
      const targetFired = positionLevels(
        [trade({ stop_loss: 1.05, take_profit: 1.3, exit_level: 1.3, close_reason: 'tp_triggered' })], KEY, [], 'pos_1', BARS, null,
      )
      expect(targetFired.map(level => [level.label, level.price])).toEqual([['SL', 1.05], ['TP', 1.3]])
      expect(targetFired[1]!.card.details[0]).toEqual({ label: 'Take profit', value: '1.3' })
    })

    /** Beside a level the position carried, one the strategy keeps itself: each read where it stands. */
    it('reads a carried level beside an own level that fired, each with an id of its own', () => {
      const read = (fields: Partial<TradeRow>) => positionLevels([trade(fields)], KEY, [], 'pos_1', BARS, null)
      const pairs = (fields: Partial<TradeRow>) => read(fields).map(level => [level.label, level.price])
      expect(pairs({ take_profit: 1.3, exit_level: 1.05, close_reason: 'sl_triggered' })).toEqual([['TP', 1.3], ['SL', 1.05]])
      expect(pairs({ stop_loss: 1.05, exit_level: 1.3, close_reason: 'tp_triggered' })).toEqual([['SL', 1.05], ['TP', 1.3]])
      // a wide stop on the position and a tighter one the strategy keeps itself: the row names where it fired
      const both = { stop_loss: 1.0, exit_level: 1.05, close_reason: 'sl_triggered' }
      expect(pairs(both)).toEqual([['SL', 1.0], ['SL', 1.05]])
      expect(new Set(read(both).map(level => level.id)).size).toBe(2)
    })

    /** Only these two reasons say which level it was: any other, known or not, draws no guess. */
    it('draws no level for an exit level whose close reason does not say which', () => {
      expect(positionLevels([trade({ exit_level: 1.05, close_reason: '' })], KEY, [], 'pos_1', BARS, null)).toEqual([])
      expect(positionLevels([trade({ exit_level: 1.05, close_reason: 'scenario_end' })], KEY, [], 'pos_1', BARS, null)).toEqual([])
    })

    it('draws an own level past how far the bars are loaded only once they arrive', () => {
      const late = trade({ exit_level: 1.05, close_reason: 'sl_triggered', exit_time: '2025-10-31T05:40:00+00:00' })
      expect(positionLevels([late], KEY, [], 'pos_1', BARS, BARS[2]!)).toEqual([])
      expect(positionLevels([late], KEY, [], 'pos_1', BARS, null)).toHaveLength(1)
    })

    /** Only the printed figure is rounded: the card reads the tick size, the drawing stays on the price as served. */
    it('prints a price at the tick size in the card, and draws on the price as served', () => {
      const served = 1.1677499513751617
      const [carried, target] = positionLevels(
        [trade({ stop_loss: served, take_profit: served })], KEY, [], 'pos_1', BARS, null, 0.00001,
      )
      expect(carried!.price).toBe(served)
      expect(carried!.card.details).toContainEqual({ label: 'Stop loss', value: '1.16775' })
      expect(target!.card.details).toContainEqual({ label: 'Take profit', value: '1.16775' })
      const [own] = positionLevels(
        [trade({ exit_level: served, close_reason: 'tp_triggered' })], KEY, [], 'pos_1', BARS, null, 0.00001,
      )
      expect(own!.price).toBe(served)
      expect(own!.card.details).toContainEqual({ label: 'Own level', value: 'take profit 1.16775' })
      const [open, openTarget] = positionLevels(
        [], KEY, [{ ...OPEN, stop_loss: served, take_profit: served }], 'pos_1', BARS, null, 0.00001,
      )
      expect(open!.card.details).toContainEqual({ label: 'Stop loss', value: '1.16775' })
      expect(openTarget!.card.details).toContainEqual({ label: 'Take profit', value: '1.16775' })
    })

    it('draws nothing where no level was set', () => {
      expect(positionLevels([trade({})], KEY, [], 'pos_1', BARS, null)).toEqual([])
      // a stop that fired on a row recorded before contract 45 names no level
      expect(positionLevels([trade({ close_reason: 'sl_triggered' })], KEY, [], 'pos_1', BARS, null)).toEqual([])
    })

    /** A position the run ended with still open: its levels as they stand at the end, at the last bar. */
    it('draws the levels of a position still open at the end at the last bar', () => {
      const [stop] = positionLevels([], KEY, [OPEN], 'pos_1', BARS, null)
      expect(stop).toMatchObject({ label: 'SL', price: 1.05, from: BARS[2], to: BARS[2] })
      expect(stop!.card.details.map(pair => pair.value).join(' ')).toContain('still open')
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

    /** Past how far the bars are loaded there is no candle yet: a level known only there is not drawn. */
    it('draws nothing whose exit lies past how far the bars are loaded', () => {
      const across = trade({ stop_loss: 1.05, exit_time: '2025-10-31T05:40:00+00:00' })
      expect(positionLevels([across], KEY, [], 'pos_1', BARS, BARS[2]!)).toEqual([])
      const inside = trade({ stop_loss: 1.05, exit_time: '2025-10-31T05:01:30+00:00' })
      expect(positionLevels([inside], KEY, [], 'pos_1', BARS, BARS[2]!)[0]).toMatchObject({ from: BARS[1], to: BARS[1] })
    })

    /** Still open at the END of the record: while the window's end is not loaded, the last bar is not the end. */
    it('draws the levels of a position still open only once the end of the window is loaded', () => {
      expect(positionLevels([], KEY, [OPEN], 'pos_1', BARS, BARS[2]!)).toEqual([])
      expect(positionLevels([], KEY, [OPEN], 'pos_1', BARS, null)).toHaveLength(1)
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

    it('prints the prices of its card at the tick size, and draws on the prices as served', () => {
      const [line] = entryExitLines([trade({ exit_price: 1.2000000476837158 })], KEY, BARS, null, 0.00001)
      expect(line).toMatchObject({ to: { price: 1.2000000476837158 } })
      expect(line!.card.details.find(pair => pair.label === 'Closed')?.value.endsWith('@ 1.20000')).toBe(true)
      expect(line!.card.details.find(pair => pair.label === 'Opened')?.value.endsWith('@ 1.10000')).toBe(true)
    })

    it('draws no line where the trade entered and left in one candle', () => {
      const quick = trade({ exit_time: '2025-10-31T05:00:50+00:00' })
      expect(entryExitLines([quick], KEY, BARS, null)).toEqual([])
    })
  })
})
