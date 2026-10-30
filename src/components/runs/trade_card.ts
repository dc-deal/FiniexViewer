import {
  amount, magnitude, modelledSpreadFigures, numberOrNa, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { OpenPosition, TradeRow } from '@/types/api/report_types'
import type { Figure, FigureCard } from '@/types/figure_types'
import type { Opening } from '@/types/run_chart_types'
import { t } from '@/translate'

/**
 * What a card says about a trade, wherever the trade is shown: beside its row in the trade list,
 * and on its marks on the run chart. One builder, so the two cannot come to say a trade differently.
 * Every figure is a field of the row as served; nothing is worked out here.
 */

function opened(trade: TradeRow): Figure {
  return { label: t('Opened'), value: `${utcInstant(trade.entry_time)} @ ${trade.entry_price}` }
}

function closed(trade: TradeRow): Figure {
  return { label: t('Closed'), value: `${utcInstant(trade.exit_time)} @ ${trade.exit_price}` }
}

function entry(trade: TradeRow): Figure {
  return { label: t('Entry'), value: `${trade.entry_type} · ${trade.entry_side}` }
}

function net(trade: TradeRow): Figure {
  return { label: t('Net P&L'), value: amount(trade.net_pnl, trade.currency), tone: signClass(trade.net_pnl) }
}

/** '' means the close was not attributed — shown only where it says something. */
function closedBy(trade: TradeRow): Figure[] {
  return trade.close_reason ? [{ label: t('Closed by'), value: trade.close_reason }] : []
}

/** The level an exit fired at, which of the two it was, and its price. */
export interface OwnLevel {
  label: 'SL' | 'TP'
  price: number
}

/**
 * The level a trade's exit fired at where the strategy kept it itself — an *own level* in their
 * glossary. No position carried it, so `exit_level` is the only place a trade row names it, and
 * `close_reason` says which of the two it was (contract 45). A level the position carried states
 * itself on `stop_loss` / `take_profit`: an `exit_level` equal to it is that level, not a second one.
 * One that did not fire stands on no trade row: a close with no level firing shows none.
 */
export function ownLevel(trade: Pick<TradeRow, 'stop_loss' | 'take_profit' | 'exit_level' | 'close_reason'>): OwnLevel | null {
  if (trade.exit_level === null) return null
  if (trade.close_reason === 'sl_triggered' && trade.stop_loss !== trade.exit_level) return { label: 'SL', price: trade.exit_level }
  if (trade.close_reason === 'tp_triggered' && trade.take_profit !== trade.exit_level) return { label: 'TP', price: trade.exit_level }
  return null
}

/** Its line on a card: their word, short enough to leave a narrow chart card room for its values. */
export function ownLevelFigure(own: OwnLevel): Figure {
  const word = own.label === 'SL' ? t('stop loss') : t('take profit')
  return { label: t('Own level'), value: `${word} ${own.price}` }
}

/** The own level this part of a position closed at, where it did. */
function firedLevel(trade: TradeRow): Figure[] {
  const own = ownLevel(trade)
  return own ? [ownLevelFigure(own)] : []
}

/** A stop or a target only where one was set — on a trade row, or on a position still open. */
function stops(row: Pick<TradeRow, 'stop_loss' | 'take_profit'>): Figure[] {
  const rows: Figure[] = []
  if (row.stop_loss !== null) rows.push({ label: t('Stop loss'), value: String(row.stop_loss) })
  if (row.take_profit !== null) rows.push({ label: t('Take profit'), value: String(row.take_profit) })
  return rows
}

/**
 * The reference of the exit's slippage, said only where it is not the mid the entry and every other
 * exit are measured against (contract 44, `exit_slippage_measured_against`): a stop-loss or
 * take-profit exit is measured against the level that closed it. A backtest reads 0 only where the
 * position carries that level; one the strategy keeps itself fills at the next price (contract 45).
 * Without the word the two halves of the card read as one comparison.
 */
function exitReference(trade: TradeRow): string {
  if (trade.exit_slippage === null || trade.exit_slippage_measured_against !== 'protective_level') return ''
  return ` ${t('vs SL/TP level')}`
}

/**
 * Everything the row has no width for. The excursions are given three ways by the backend — as a
 * price, as the unrealised P&L at that price, and as a distance — and all three are here, because
 * which one answers a question depends on the question.
 */
export function tradeDetails(trade: TradeRow): Figure[] {
  return [
    opened(trade),
    closed(trade),
    { label: t('Ticks'), value: `${trade.entry_tick_index} to ${trade.exit_tick_index}` },
    ...closedBy(trade),
    entry(trade),
    {
      label: t('Gross'),
      value: amount(trade.gross_pnl, trade.currency),
      tone: signClass(trade.gross_pnl),
    },
    net(trade),
    {
      // `total_fees` is commission plus swap and nothing else — measured over 1,591 trade rows,
      // 1,563 of which carry a non-zero spread. Listing the spread as a third part of it printed
      // `Fees 0.00 · spread 1.30` on a trade whose spread WAS the whole cost. So the spread stands
      // on its own below, the way the aggregated panel has always listed it.
      label: t('Fees'),
      value: `${amount(trade.total_fees, trade.currency)} · ${t('commission')} `
        + `${trade.commission_cost.toFixed(2)} · ${t('swap')} ${trade.swap_cost.toFixed(2)}`,
    },
    {
      label: t('Spread'),
      value: amount(trade.spread_cost, trade.currency),
    },
    ...modelledSpreadFigures(trade.modelled_spread_cost, value => amount(value, trade.currency)),
    {
      label: t('Slippage'),
      // the exit half is absent on a quarter of the trades in this archive — stated as such rather
      // than as a zero, and never assumed to be a number
      value: `${t('in')} ${trade.entry_slippage.toFixed(4)} · `
        + `${t('out')} ${trade.exit_slippage === null ? t('n/a') : trade.exit_slippage.toFixed(4)}`
        + exitReference(trade),
    },
    {
      label: t('Worst against'),
      value: `${magnitude(trade.mae_pnl, trade.currency)} @ ${trade.mae_price} · `
        + `${trade.mae_distance.toFixed(2)} ${trade.price_unit}`,
    },
    {
      label: t('Best in favour'),
      value: `${amount(trade.mfe_pnl, trade.currency)} @ ${trade.mfe_price} · `
        + `${trade.mfe_distance.toFixed(2)} ${trade.price_unit}`,
    },
    // null where the position carried no stop, an own stop included: the trade has no R to be a
    // multiple of, which is an absence
    { label: t('R multiple'), value: numberOrNa(trade.r_multiple) },
    {
      label: t('Fills'),
      value: `${trade.entry_executions.length} / ${trade.exit_executions.length}`,
    },
    ...stops(trade),
    ...firedLevel(trade),
  ]
}

/**
 * What a position still open at the end stood at — its entry in `open_positions`: what was left of
 * it and its value at the last price, which is a mark rather than a result.
 */
function stillOpen(entry: OpenPosition, currency: string): Figure[] {
  return [
    { label: t('Still open'), value: String(entry.lots) },
    { label: t('Last price'), value: String(entry.last_price) },
    entry.valued
      ? {
          label: t('Unrealized'),
          value: amount(entry.unrealized_pnl, currency),
          tone: signClass(entry.unrealized_pnl),
          title: t('A mark at the last price, not a result'),
        }
      : { label: t('Unrealized'), value: t('n/a'), title: t('The position could not be marked') },
  ]
}

/**
 * Where a position opened, for the mark on its entry candle — read off the order history's executed
 * opening, the one row every position has, closed or not. The position, not a trade: a position
 * closed in parts has one opening and a trade per part, so this card names the lots it opened with
 * and says nothing about how any part ended. Where the run ended with the position still open, the
 * portfolio's `open_positions` says what was left of it; a closed position's stops are those on its
 * first trade row, as they stood when that part closed. An own level says how a part ended, so it
 * stands on that exit's card and not here.
 */
export function openingCard(
  row: Opening, open: OpenPosition | null, trade: TradeRow | null, currency: string,
): FigureCard {
  const details: Figure[] = [{ label: t('Opened'), value: `${utcInstant(row.event_time)} @ ${row.executed_price}` }]
  if (row.order_type) details.push({ label: t('Type'), value: row.order_type })
  if (open) details.push(...stillOpen(open, currency))
  const levels = open ?? trade
  if (levels) details.push(...stops(levels))
  return { title: `${row.position_id} · ${row.direction} ${row.executed_lots}`, details }
}

/**
 * Where a trade closed, for the mark on its exit candle: which position, what part of it, how it
 * ended and what it came to. The rest stands in the card beside its row in the trade list.
 */
export function exitCard(trade: TradeRow): FigureCard {
  return {
    title: `${trade.position_id} · ${trade.direction} ${trade.lots}`,
    details: [opened(trade), closed(trade), ...closedBy(trade), ...firedLevel(trade), net(trade)],
  }
}
