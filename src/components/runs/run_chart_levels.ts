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
 * that position alone unless the reader asks the Layers panel for every position's levels: drawn
 * for every position they are a lot to read. Pure functions over what the run's reports already hold.
 *
 * A level is the trade row's `stop_loss` / `take_profit`: *"the levels in force when this row's
 * close was booked — after any move, not the levels at entry"* (their trade-history document). So it
 * is drawn at the bar of the row's exit alone: where it stood before is not recorded, and drawn flat
 * back to the entry it showed a trailed stop where it never stood — 100 of the 108 positions with two
 * rows in the sweeps of a trailing logic moved theirs (FiniexTestingIDE, 2026-10-20). A position
 * still open at the end has the levels the portfolio's `open_positions` states at the end of the
 * record, drawn at the last bar. The levels at entry and every move are testingide#618's.
 */

function seconds(iso: string): number {
  return sortInstant(iso) / 1000
}

const WORD: Record<'SL' | 'TP', string> = { SL: t('Stop loss'), TP: t('Take profit') }

/** The bar an instant falls in on the bars loaded — none before them, none past how far they are loaded. */
function barIn(barTimes: number[], instant: number, cutAt: number | null): number | null {
  if (cutAt !== null && instant > cutAt) return null
  return barOf(barTimes, instant)
}

function level(
  id: string, label: 'SL' | 'TP', price: number, at: number, when: string, position: string, focused: boolean,
): SegmentDrawing {
  const details: Figure[] = [
    { label: WORD[label], value: String(price) },
    {
      label: t('In force at'),
      value: when,
      title: t('The level in force when the close was booked, after any move. Where it stood before is not recorded.'),
    },
  ]
  return {
    kind: 'segment',
    id,
    from: at,
    to: at,
    price,
    label,
    // the stop is where the loss is taken, the target where the profit is: the polarity of the
    // outcome at that price — the word beside it says which, so the colour only reinforces it
    role: label === 'SL' ? 'negative' : 'positive',
    focused,
    card: { title: `${WORD[label]} · ${position}`, details },
  }
}

/**
 * The stops and the targets of the trade rows given: one level per row that had one, at its exit's
 * bar, and for each position still open at the end, its levels at the last bar. `looked` is the
 * position looked at — only its levels put their price on the axis. `cutAt` is how far the bars are
 * loaded while the window holds more — nothing past it has a candle yet.
 */
export function positionLevels(
  trades: TradeRow[], key: string[], open: OpenPosition[], looked: string | null, barTimes: number[],
  cutAt: number | null,
): SegmentDrawing[] {
  const segments: SegmentDrawing[] = []
  for (const trade of trades) {
    // an exit past the cut has no candle to stand at
    const at = barIn(barTimes, seconds(trade.exit_time), cutAt)
    if (at === null) continue
    const when = utcInstant(trade.exit_time)
    const row = rowKey(trade, key)
    const focused = trade.position_id === looked
    if (trade.stop_loss !== null) {
      segments.push(level(`level|SL|${row}`, 'SL', trade.stop_loss, at, when, trade.position_id, focused))
    }
    if (trade.take_profit !== null) {
      segments.push(level(`level|TP|${row}`, 'TP', trade.take_profit, at, when, trade.position_id, focused))
    }
  }
  const last = barTimes[barTimes.length - 1]
  // still open at the END of the record: drawn once the window's end is loaded — before that, the
  // last bar loaded is not the end
  if (last === undefined || cutAt !== null) return segments
  for (const entry of open) {
    if (barIn(barTimes, seconds(entry.entry_time), cutAt) === null) continue
    const focused = entry.position_id === looked
    const id = `level|open|${entry.position_id}`
    const when = t('the end of the record, still open')
    if (entry.stop_loss !== null) {
      segments.push(level(`${id}|SL`, 'SL', entry.stop_loss, last, when, entry.position_id, focused))
    }
    if (entry.take_profit !== null) {
      segments.push(level(`${id}|TP`, 'TP', entry.take_profit, last, when, entry.position_id, focused))
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
