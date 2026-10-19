import { rowKey } from '@/api/list_key'
import { polarity, sortInstant } from '@/components/runs/report_format'
import { exitCard, openingCard } from '@/components/runs/trade_card'
import type { OpenPosition, OrderHistoryRow, TradeRow } from '@/types/api/report_types'
import type { PositionRef } from '@/types/context_types'
import type { Polarity } from '@/types/figure_types'
import type { ChartMark, Opening } from '@/types/run_chart_types'

/**
 * Where a unit's positions opened and its trades closed, on the candles drawn — one source per mark
 * (FiniexTestingIDE, 2026-10-16). An OPENING is the order history's executed `open` row, which every
 * position has, closed or not; an EXIT is a trade row, which carries its result. Measured 2026-10-19
 * over 110 runs: an opening's time and price equal the trade row's `entry_time` / `entry_price` on
 * 1,969 of 1,969 rows, so the entries moved source without moving. Pure functions over what the
 * run's reports already hold; nothing here fetches.
 */

/**
 * The bar an instant falls in: the last one that OPENED at or before it, looked up in the bars
 * served — never computed from a period's length. A bar is stamped with the open of its period
 * (`X-Bar-Time-Basis: open`), and a period that does not start on a multiple of its length (a
 * trading day, a week) would put a computed mark on a bar that does not exist; lightweight-charts
 * snaps a mark between two bars onto the NEXT one. Null before the first bar.
 */
export function barOf(barTimes: number[], instant: number): number | null {
  let low = 0
  let high = barTimes.length - 1
  let found: number | null = null
  while (low <= high) {
    const middle = (low + high) >> 1
    if (barTimes[middle]! <= instant) {
      found = barTimes[middle]!
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

function seconds(iso: string): number {
  return sortInstant(iso) / 1000
}

/** An exit's result as a word, beside its colour — a colour never travels alone. */
const SIGN_WORD: Record<Polarity, string> = { positive: '+', negative: '−', flat: '0' }

function looksAt(focus: PositionRef | null, scenario: string, position: string): boolean {
  return focus !== null && focus.scenario === scenario && focus.position === position
}

/**
 * The positions an order history opened: its executed `open` rows, one per position — measured
 * 2026-10-19, no position of the archive has two, so none was added to after it opened.
 */
export function executedOpenings(rows: OrderHistoryRow[]): Opening[] {
  return rows.filter((row): row is Opening => row.action === 'open' && row.status === 'executed'
    && row.position_id !== null && row.event_time !== null && row.direction !== null
    && row.executed_price !== null && row.executed_lots !== null)
}

/**
 * Where each position of a unit opened: an arrow in its direction — up below the bar for a long,
 * down above it for a short. An opening before the first bar drawn has no candle and gets no mark.
 *
 * Its card says how the position opened and, where the run ended with it still open, what the
 * portfolio states of it then (`open`, the unit's `open_positions`); a closed position's stops come
 * from its trade rows. `currency` is the unit's, which its unrealised P&L is in.
 */
export function openingMarks(
  openings: Opening[], open: OpenPosition[], trades: TradeRow[], currency: string,
  barTimes: number[], focus: PositionRef | null,
): ChartMark[] {
  const stillOpen = new Map(open.map(position => [position.position_id, position]))
  const firstTrade = new Map<string, TradeRow>()
  for (const trade of trades) if (!firstTrade.has(trade.position_id)) firstTrade.set(trade.position_id, trade)
  const marks: ChartMark[] = []
  for (const row of openings) {
    const time = barOf(barTimes, seconds(row.event_time))
    if (time === null) continue
    const long = row.direction === 'long'
    marks.push({
      time,
      position: long ? 'belowBar' : 'aboveBar',
      shape: long ? 'arrowUp' : 'arrowDown',
      role: 'entry',
      text: '',
      focused: looksAt(focus, row.scenario_name, row.position_id),
      id: `entry|${row.scenario_name}|${row.position_id}`,
      card: openingCard(
        row, stillOpen.get(row.position_id) ?? null, firstTrade.get(row.position_id) ?? null, currency),
    })
  }
  return marks
}

/**
 * Where each trade closed: a circle on the side away from its entry, coloured by the polarity of
 * its net result and carrying the sign as a word, since a colour never travels alone. A position
 * closed in parts has an exit per part. An exit is a trade row, so its id is the row's declared key.
 */
export function exitMarks(
  trades: TradeRow[], key: string[], barTimes: number[], focus: PositionRef | null,
): ChartMark[] {
  const marks: ChartMark[] = []
  for (const trade of trades) {
    const time = barOf(barTimes, seconds(trade.exit_time))
    if (time === null) continue
    const result = polarity(trade.net_pnl)
    marks.push({
      time,
      position: trade.direction === 'long' ? 'aboveBar' : 'belowBar',
      shape: 'circle',
      role: result,
      text: SIGN_WORD[result],
      focused: looksAt(focus, trade.scenario_name, trade.position_id),
      id: `exit|${rowKey(trade, key)}`,
      card: exitCard(trade),
    })
  }
  return marks
}

/**
 * The instant a position opened, in UTC seconds — where the chart centres on it — or null. Read off
 * its opening; a position the run inherited from an earlier session has none in its own run, and
 * its trade rows' `entry_time` is then the only record of when it was entered.
 */
export function focusTime(openings: Opening[], trades: TradeRow[], focus: PositionRef | null): number | null {
  if (!focus) return null
  const opening = openings.find(row => row.scenario_name === focus.scenario && row.position_id === focus.position)
  if (opening) return seconds(opening.event_time)
  const entries = trades
    .filter(trade => trade.scenario_name === focus.scenario && trade.position_id === focus.position)
    .map(trade => seconds(trade.entry_time))
    .filter(time => time > 0)
  return entries.length ? Math.min(...entries) : null
}
