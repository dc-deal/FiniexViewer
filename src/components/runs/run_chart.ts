import { sortInstant } from '@/components/runs/report_format'
import type { DataWindow, TradeRow } from '@/types/api/report_types'
import type { ScenarioRow } from '@/types/api/scenario_types'
import type { PositionRef } from '@/types/context_types'
import type { ChartMark, ChartUnit } from '@/types/run_chart_types'

/**
 * What the run chart reads off a run, as pure functions over what the run's reports already hold:
 * which units it can be pointed at, the timeframe a window is drawn in, and where each trade sits
 * on its candles. Nothing here fetches.
 */

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** What a run says about its units, as the stores hold it — any part may still be on its way. */
export interface RunUnitSources {
  /** `simulation` or `autotrader`: which of the two names the market. */
  group: string
  windows: DataWindow[] | null
  scenarios: ScenarioRow[] | null
  /** The run's resolved configuration — an untyped record, read here only for a session's market. */
  config: Record<string, unknown> | null
  trades: TradeRow[] | null
}

/**
 * The units the chart can be pointed at, in the run's own order, or null while the source that
 * names their market has not arrived.
 *
 * A BACKTEST names its market per unit in `scenario-details` (`symbol`, `data_broker_type`) and the
 * span its ticks actually covered (`first_tick_time` … `last_tick_time`), which is what is drawn: it
 * can run past the window the index declares, and a trade near the end falls outside the declared
 * one. A SESSION names one market for the whole run in its configuration (`broker_type`, `symbol`)
 * and declares only a start: its window stays open to the end of what the archive covers.
 */
export function chartUnits(sources: RunUnitSources): ChartUnit[] | null {
  const tradesOf = (name: string): number =>
    (sources.trades ?? []).filter(trade => trade.scenario_name === name).length

  if (sources.group === 'simulation') {
    if (!sources.scenarios) return null
    const rows = sources.scenarios
    // the index's order where it declares the windows, the roster's where a run predates them
    const names = sources.windows?.map(window => window.unit_name) ?? rows.map(row => row.name)
    return names.map(name => {
      const row = rows.find(entry => entry.name === name)
      const from = text(row?.first_tick_time)
      const broker = text(row?.data_broker_type)
      const symbol = text(row?.symbol)
      return {
        name,
        broker,
        symbol,
        from,
        to: text(row?.last_tick_time),
        trades: tradesOf(name),
        block: !from ? 'no-ticks' : !broker || !symbol ? 'no-market' : null,
      }
    })
  }

  if (!sources.config) return null
  const broker = text(sources.config['broker_type'])
  const symbol = text(sources.config['symbol'])
  return (sources.windows ?? []).map(window => ({
    name: window.unit_name,
    broker,
    symbol,
    from: text(window.start_date),
    to: text(window.end_date),
    trades: tradesOf(window.unit_name),
    block: !broker || !symbol ? 'no-market' : null,
  }))
}

/**
 * The unit the chart opens on (viewer#31, decided 2026-10-14): the one scenario the run is narrowed
 * to, else the first unit with trades, else the first that can be drawn at all.
 */
export function defaultUnit(units: ChartUnit[], narrowedTo: string[]): ChartUnit | null {
  const drawable = units.filter(unit => unit.block === null)
  if (narrowedTo.length === 1) {
    const narrowed = drawable.find(unit => unit.name === narrowedTo[0])
    if (narrowed) return narrowed
  }
  return drawable.find(unit => unit.trades > 0) ?? drawable[0] ?? null
}

/**
 * The finest timeframe the archive renders for the market that still draws the window in at most
 * `limit` bars (viewer#31, decided 2026-10-14) — an hour's unit in minutes, a fortnight in hours.
 * The coverage lists its timeframes ALPHABETICALLY, so they are ordered here by their length, which
 * the server's own timeframe list states. A window too long for all of them gets the longest.
 */
export function autoTimeframe(
  covered: string[],
  minutesFor: (timeframe: string) => number | undefined,
  windowMinutes: number,
  limit = 2000
): string | null {
  const known = covered
    .map(timeframe => ({ timeframe, minutes: minutesFor(timeframe) }))
    .filter((entry): entry is { timeframe: string, minutes: number } => (entry.minutes ?? 0) > 0)
    .sort((a, b) => a.minutes - b.minutes)
  if (!known.length) return null
  return (known.find(entry => windowMinutes / entry.minutes <= limit) ?? known.at(-1)!).timeframe
}

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

/**
 * Where a unit's trades opened and closed, on the candles drawn. The entry is an arrow in the
 * direction of the trade — up below the bar for a long, down above it for a short — and the exit a
 * circle on the other side, coloured by the sign of the net result and carrying the sign as a word,
 * since a colour never travels alone. A position closed in parts has one entry and an exit per part.
 * An event before the first bar drawn has no candle and gets no mark.
 */
export function tradeMarks(trades: TradeRow[], barTimes: number[], focus: PositionRef | null): ChartMark[] {
  const marks: ChartMark[] = []
  const entered = new Set<string>()
  for (const trade of trades) {
    const long = trade.direction === 'long'
    const focused = focus !== null
      && focus.scenario === trade.scenario_name && focus.position === trade.position_id
    if (!entered.has(trade.position_id)) {
      entered.add(trade.position_id)
      const time = barOf(barTimes, seconds(trade.entry_time))
      if (time !== null) {
        marks.push({
          time,
          position: long ? 'belowBar' : 'aboveBar',
          shape: long ? 'arrowUp' : 'arrowDown',
          role: 'entry',
          text: '',
          focused,
        })
      }
    }
    const time = barOf(barTimes, seconds(trade.exit_time))
    if (time === null) continue
    const net = trade.net_pnl
    marks.push({
      time,
      position: long ? 'aboveBar' : 'belowBar',
      shape: 'circle',
      role: net > 0 ? 'gain' : net < 0 ? 'loss' : 'flat',
      text: net > 0 ? '+' : net < 0 ? '−' : '0',
      focused,
    })
  }
  // the chart takes its marks in time order
  return marks.sort((a, b) => a.time - b.time)
}

/** The instant a position opened, in UTC seconds — where the chart centres on it — or null. */
export function focusTime(trades: TradeRow[], focus: PositionRef | null): number | null {
  if (!focus) return null
  const entries = trades
    .filter(trade => trade.scenario_name === focus.scenario && trade.position_id === focus.position)
    .map(trade => seconds(trade.entry_time))
    .filter(time => time > 0)
  return entries.length ? Math.min(...entries) : null
}
