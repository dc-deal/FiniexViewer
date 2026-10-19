import { rowKey } from '@/api/list_key'
import { polarity, sortInstant, utcInstant } from '@/components/runs/report_format'
import { barOf } from '@/components/runs/run_chart_marks'
import { exitCard } from '@/components/runs/trade_card'
import type { OpenPosition, TradeRow } from '@/types/api/report_types'
import type { LineDrawing, SegmentDrawing } from '@/types/chart_drawing_types'
import type { Figure } from '@/types/figure_types'
import { t } from '@/translate'

/**
 * The levels of the position looked at, and the line from its entry to its exit (viewer#41) — for
 * that position alone: drawn for every position they become a tangle. Pure functions over what the
 * run's reports already hold.
 *
 * A level is the trade row's `stop_loss` / `take_profit`, *"the levels that were set"*, held from
 * the row's entry to its exit; the rows of a position closed in parts overlap, so no end has to be
 * chosen. A position still open at the end holds the levels the portfolio's `open_positions` states
 * from its entry to the edge of the window. Measured 2026-10-19: no position's rows ever differ in
 * their levels, and no event records a stop that moved — whether a moved stop is recorded anywhere
 * is asked of FiniexTestingIDE, and until it is answered a trailed stop would be drawn flat.
 */

function seconds(iso: string): number {
  return sortInstant(iso) / 1000
}

const WORD: Record<'SL' | 'TP', string> = { SL: t('Stop loss'), TP: t('Take profit') }

/** The bar an instant falls in on a drawn window — none before it, none past the last bar of a CUT one. */
function barIn(barTimes: number[], instant: number, cutAt: number | null): number | null {
  if (cutAt !== null && instant > cutAt) return null
  return barOf(barTimes, instant)
}

function level(
  id: string, label: 'SL' | 'TP', price: number, from: number, to: number | null, held: string, position: string,
): SegmentDrawing {
  const details: Figure[] = [
    { label: WORD[label], value: String(price) },
    { label: t('Held'), value: held },
  ]
  return {
    kind: 'segment',
    id,
    from,
    to,
    price,
    label,
    // the stop is where the loss is taken, the target where the profit is: the polarity of the
    // outcome at that price — the word beside it says which, so the colour only reinforces it
    role: label === 'SL' ? 'negative' : 'positive',
    card: { title: `${WORD[label]} · ${position}`, details },
  }
}

/**
 * The stop and the target of the position looked at: one segment per trade row that set one, and
 * for a position still open at the end, its levels to the edge of the window. `cutAt` is the last
 * bar of a window the route cut — nothing past it has a candle.
 */
export function positionLevels(
  trades: TradeRow[], key: string[], open: OpenPosition | null, barTimes: number[], cutAt: number | null,
): SegmentDrawing[] {
  const segments: SegmentDrawing[] = []
  for (const trade of trades) {
    const from = barIn(barTimes, seconds(trade.entry_time), cutAt)
    if (from === null) continue
    const exit = seconds(trade.exit_time)
    // an exit past the cut runs to the edge of what is drawn
    const to = cutAt !== null && exit > cutAt ? null : barOf(barTimes, exit)
    const held = `${utcInstant(trade.entry_time)} – ${utcInstant(trade.exit_time)}`
    const row = rowKey(trade, key)
    if (trade.stop_loss !== null) {
      segments.push(level(`level|SL|${row}`, 'SL', trade.stop_loss, from, to, held, trade.position_id))
    }
    if (trade.take_profit !== null) {
      segments.push(level(`level|TP|${row}`, 'TP', trade.take_profit, from, to, held, trade.position_id))
    }
  }
  if (open) {
    const from = barIn(barTimes, seconds(open.entry_time), cutAt)
    if (from !== null) {
      const id = `level|open|${open.position_id}`
      const held = `${utcInstant(open.entry_time)} – ${t('still open at the end')}`
      if (open.stop_loss !== null) segments.push(level(`${id}|SL`, 'SL', open.stop_loss, from, null, held, open.position_id))
      if (open.take_profit !== null) segments.push(level(`${id}|TP`, 'TP', open.take_profit, from, null, held, open.position_id))
    }
  }
  return segments
}

/**
 * The line from where each trade of the position looked at entered to where it left, coloured by
 * the polarity of its result — none where both fall in one candle, where it would be a dot inside
 * the marks already there.
 */
export function entryExitLines(trades: TradeRow[], key: string[], barTimes: number[], cutAt: number | null): LineDrawing[] {
  const lines: LineDrawing[] = []
  for (const trade of trades) {
    const from = barIn(barTimes, seconds(trade.entry_time), cutAt)
    const to = barIn(barTimes, seconds(trade.exit_time), cutAt)
    if (from === null || to === null || from === to) continue
    lines.push({
      kind: 'line',
      id: `line|${rowKey(trade, key)}`,
      from: { time: from, price: trade.entry_price },
      to: { time: to, price: trade.exit_price },
      role: polarity(trade.net_pnl),
      card: exitCard(trade),
    })
  }
  return lines
}
