import { rowKey } from '@/api/list_key'
import { amount, polarity, signClass, sortInstant, utcInstant } from '@/components/runs/report_format'
import { exitCard, openingCard } from '@/components/runs/trade_card'
import type { OpenPosition, OrderHistoryRow, TradeRow } from '@/types/api/report_types'
import type { PositionRef } from '@/types/context_types'
import type { Figure, FigureCard, Polarity } from '@/types/figure_types'
import type { ChartMark, Opening, TimeframeOffer } from '@/types/run_chart_types'
import { plural, t } from '@/translate'

/**
 * Where a unit's positions opened and its trades closed, on the candles drawn — one source per mark
 * (FiniexTestingIDE, 2026-10-16). An OPENING is the order history's executed `open` row, which every
 * position has, closed or not; an EXIT is a trade row, which carries its result. Measured 2026-10-19
 * over 110 runs: an opening's time and price equal the trade row's `entry_time` / `entry_price` on
 * 1,969 of 1,969 rows, so the entries moved source without moving. Pure functions over what the
 * run's reports already hold; nothing here fetches.
 */

/**
 * The width a mark takes on the chart, in pixels: lightweight-charts draws no shape narrower than
 * 12 px (4.2.3), and a margin keeps two from touching.
 */
export const MARK_FOOTPRINT_PX = 15

/**
 * The most bars a finer timeframe may draw the window in before it is offered — the route's own
 * cap (their `market-data` document: *"the maximum — 10,000"*). Past it the answer is cut.
 */
export const SERVED_BAR_MAX = 10_000

/** How many members a gathered mark's card lists before it says how many more there are. */
const GATHERED_LINES = 8

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
const SIGN_WORD: Record<Polarity | 'mixed', string> = { positive: '+', negative: '−', flat: '0', mixed: '±' }

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
    const at = seconds(row.event_time)
    const time = barOf(barTimes, at)
    if (time === null) continue
    const long = row.direction === 'long'
    marks.push({
      time,
      at,
      position: long ? 'belowBar' : 'aboveBar',
      shape: long ? 'arrowUp' : 'arrowDown',
      role: 'entry',
      text: '',
      focused: looksAt(focus, row.scenario_name, row.position_id),
      id: `entry|${row.scenario_name}|${row.position_id}`,
      card: openingCard(
        row, stillOpen.get(row.position_id) ?? null, firstTrade.get(row.position_id) ?? null, currency),
      line: {
        label: row.position_id,
        value: `${row.direction} ${row.executed_lots} @ ${row.executed_price} · ${utcInstant(row.event_time)}`,
      },
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
    const at = seconds(trade.exit_time)
    const time = barOf(barTimes, at)
    if (time === null) continue
    const result = polarity(trade.net_pnl)
    marks.push({
      time,
      at,
      position: trade.direction === 'long' ? 'aboveBar' : 'belowBar',
      shape: 'circle',
      role: result,
      text: SIGN_WORD[result],
      focused: looksAt(focus, trade.scenario_name, trade.position_id),
      id: `exit|${rowKey(trade, key)}`,
      card: exitCard(trade),
      line: {
        label: trade.position_id,
        value: `${amount(trade.net_pnl, trade.currency)} · ${utcInstant(trade.exit_time)}`,
        tone: signClass(trade.net_pnl),
      },
    })
  }
  return marks
}

/** The kind of a mark and the side of the bar it stands on: only marks of one of these gather. */
function sideOf(mark: ChartMark): string {
  return `${mark.role === 'entry' ? 'entry' : 'exit'}|${mark.position}`
}

function byTime(a: ChartMark, b: ChartMark): number {
  return a.time - b.time || a.at - b.at
}

/** The ISO-8601 form of an instant in UTC seconds, for the formatter that reads a stamp. */
function stamp(at: number): string {
  return new Date(at * 1000).toISOString()
}

/**
 * The card of a gathered mark: what its members are and where they fell, one line each — at most
 * a handful, then how many more. Nothing is summed: a total of several trades is a figure the run
 * does not state for them.
 */
export function gatheredCard(members: ChartMark[]): FigureCard {
  const entries = members[0]!.role === 'entry'
  const shown = members.slice(0, GATHERED_LINES)
  const rest = members.length - shown.length
  const instants = members.map(member => member.at)
  const details: Figure[] = [
    { label: t('Between'), value: `${utcInstant(stamp(Math.min(...instants)))} – ${utcInstant(stamp(Math.max(...instants)))}` },
    ...shown.map(member => member.line),
  ]
  if (rest > 0) details.push({ label: `+${rest}`, value: t('more — zoom in to draw them apart') })
  return {
    title: entries
      ? plural(members.length, t('position opened'), t('positions opened'))
      : plural(members.length, t('trade closed'), t('trades closed')),
    details,
  }
}

function gathered(members: ChartMark[]): ChartMark {
  const first = members[0]!
  if (members.length === 1) return first
  const roles = new Set(members.map(member => member.role))
  const role = first.role === 'entry' ? 'entry' : roles.size === 1 ? first.role : 'mixed'
  return {
    time: first.time,
    at: first.at,
    position: first.position,
    shape: first.shape,
    role,
    // an exit's sign stands before the count: a bare `+3` beside the gain colour reads as an amount
    text: `${role === 'entry' ? '' : SIGN_WORD[role]}×${members.length}`,
    focused: false,
    id: `gathered|${first.id}`,
    card: gatheredCard(members),
    line: first.line,
    count: members.length,
  }
}

/** How many bars one mark covers at a bar spacing of `spacing` px — at least its own bar. */
export function barsPerMark(spacing: number | null): number {
  if (spacing === null || !(spacing > 0)) return 1
  return Math.max(1, Math.ceil(MARK_FOOTPRINT_PX / spacing))
}

/**
 * Marks of one kind and one side of the bar that stand closer than a mark is wide become ONE mark
 * with a count, its card listing them (viewer#41, decided 2026-10-19). What a reader sees as density
 * is OVERLAP: measured over the archive, two events rarely share a candle at the timeframe drawn,
 * but 2,000 bars on 600 px are 0.3 px each and no mark is narrower than 12 px. So a mark gathers what
 * it would cover — one candle zoomed in, several zoomed out — and splits again as the reader zooms
 * in, the way TradingView groups its executions and a map its pins.
 *
 * A group runs from its first member to `perMark` bars after it, so a gathered mark is drawn on its
 * first member's bar and the next one starts where it ends. The position the reader is looking at is
 * never gathered: it stands apart, drawn larger.
 */
export function gatherMarks(marks: ChartMark[], barTimes: number[], perMark: number): ChartMark[] {
  const index = new Map(barTimes.map((time, at) => [time, at]))
  const result: ChartMark[] = []
  const open = new Map<string, ChartMark[]>()
  for (const mark of [...marks].sort(byTime)) {
    if (mark.focused) {
      result.push(mark)
      continue
    }
    const side = sideOf(mark)
    const group = open.get(side)
    if (group && (index.get(mark.time) ?? 0) - (index.get(group[0]!.time) ?? 0) < perMark) {
      group.push(mark)
      continue
    }
    if (group) result.push(gathered(group))
    open.set(side, [mark])
  }
  for (const group of open.values()) result.push(gathered(group))
  return result.sort(byTime)
}

/**
 * A finer timeframe to offer where candles hold several marks of one kind (viewer#41, decided
 * 2026-10-19) — or null. Only where it works: the automatic timeframe already is the finest within
 * its 2,000 bars, so the offer looks further, to every covered timeframe finer than the one drawn
 * that still draws the window within the route's cap, coarsest first — the fewest bars that do it.
 *
 * A timeframe draws a candle's marks apart where every two of them lie at least one of its periods
 * apart: two instants that far apart never share a bar, whatever the bars' alignment, so no bar has
 * to be computed. Measured 2026-10-19: in 72 of 137 such candles the exits share one instant, and no
 * timeframe draws those apart — they get no offer.
 */
export function timeframeOffer(
  events: ChartMark[], current: string, covered: string[],
  minutesFor: (timeframe: string) => number | undefined, windowMinutes: number,
): TimeframeOffer | null {
  const candles = new Map<string, number[]>()
  for (const mark of events) {
    const key = `${sideOf(mark)}|${mark.time}`
    candles.set(key, [...(candles.get(key) ?? []), mark.at])
  }
  const several = [...candles.values()]
    .filter(instants => instants.length > 1)
    .map(instants => [...instants].sort((a, b) => a - b))
  const drawn = minutesFor(current)
  if (!several.length || !drawn) return null
  const finer = covered
    .map(timeframe => ({ timeframe, minutes: minutesFor(timeframe) ?? 0 }))
    .filter(entry => entry.minutes > 0 && entry.minutes < drawn && windowMinutes / entry.minutes <= SERVED_BAR_MAX)
    .sort((a, b) => b.minutes - a.minutes)
  for (const { timeframe, minutes } of finer) {
    const apart = several.filter(instants =>
      instants.every((at, position) => position === 0 || at - instants[position - 1]! >= minutes * 60))
    if (apart.length) {
      return { timeframe, candles: several.length, apart: apart.length, at: Math.min(...apart.map(instants => instants[0]!)) }
    }
  }
  return null
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
