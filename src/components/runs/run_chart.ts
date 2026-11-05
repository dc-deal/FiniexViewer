import { tickDecimals } from '@/components/runs/report_format'
import { executedOpenings } from '@/components/runs/run_chart_marks'
import type { BrokerReport, DataWindow, OrderHistoryRow } from '@/types/api/report_types'
import type { ScenarioRow } from '@/types/api/scenario_types'
import type { ChartUnit } from '@/types/run_chart_types'

/**
 * What the run chart reads off a run, as pure functions over what the run's reports already hold:
 * which units it can be pointed at, the timeframe a window is drawn in, and the bar an instant
 * falls in. Where the marks stand is `run_chart_marks.ts`. Nothing here fetches.
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
  /** The run's order history, whose executed openings name the positions each unit opened. */
  orders: OrderHistoryRow[] | null
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
  const opened = executedOpenings(sources.orders ?? [])
  const openingsOf = (name: string): number => opened.filter(row => row.scenario_name === name).length

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
        openings: openingsOf(name),
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
    openings: openingsOf(window.unit_name),
    block: !broker || !symbol ? 'no-market' : null,
  }))
}

/**
 * The unit the chart opens on where nothing is in focus and nothing was chosen (viewer#31, decided
 * 2026-10-14): the first unit that opened a position — closed or not — else the first that can be
 * drawn at all.
 */
export function defaultUnit(units: ChartUnit[]): ChartUnit | null {
  const drawable = units.filter(unit => unit.block === null)
  return drawable.find(unit => unit.openings > 0) ?? drawable[0] ?? null
}

/**
 * The tick size of the unit's instrument, as the run's broker report states it: the broker the unit
 * traded through names it among its scenarios, and that broker's symbol carries the tick size. A
 * session's report is one row that lists no scenario (measured 2026-10-31, `"scenarios": []`), so a
 * report of one row answers for every unit. Null where the report has not arrived or names no such
 * symbol — the chart then keeps its own format.
 */
export function unitTickSize(broker: BrokerReport | null, unit: Pick<ChartUnit, 'name' | 'symbol'>): number | null {
  if (!broker || !unit.symbol) return null
  const own = broker.units.find(entry => entry.scenarios.includes(unit.name))
    ?? (broker.units.length === 1 ? broker.units[0] : undefined)
  const symbol = own?.symbols.find(entry => entry.symbol === unit.symbol)
  return symbol && symbol.tick_size > 0 ? symbol.tick_size : null
}

/**
 * The chart's price format for an instrument quoted in steps of `tickSize`: the decimals the step
 * has, and the step itself as the least move. The backend's rule for a price it COMPUTED (a bar of a
 * quote-driven venue is a midpoint) is to round it for display to the instrument's tick size
 * (its prices document, contract 34); a price the venue wrote already lies on that step. Without a
 * format the chart library rounds every price to two decimals, so EURUSD read `1.16` on every label.
 */
export function chartPriceFormat(tickSize: number | null): { precision: number, minMove: number } | null {
  if (tickSize === null || !(tickSize > 0)) return null
  return { precision: tickDecimals(tickSize), minMove: tickSize }
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
