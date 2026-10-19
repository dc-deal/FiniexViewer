import {
  amount, magnitude, numberOrNa, percentFigure, percentOrNa, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { BookingPeriodRow, BookingPeriodUnitTotal } from '@/types/api/report_types'
import type { Figure, FigureCard } from '@/types/figure_types'
import { plural, t } from '@/translate'

/**
 * The cards of the booking periods — FiniexTestingIDE's ledger (their glossary: *journal · ledger ·
 * closing*). A period's card says what the period DID, its own figures: what it booked, its rates,
 * its band and its decline. A unit total's card adds what the ACCOUNT carried across the periods,
 * which no period row can say: the account's own drawdown, cumulative over the boundaries. Every
 * figure is served; nothing here is computed beyond the formatting.
 */

/** A period row from either scope: the deployment-wide route adds the run that booked it. */
export type PeriodRow = BookingPeriodRow & { run_id?: string }

/**
 * What a period or a unit PAID, beside the total: commission and swap add up to the fees, the spread
 * stands beside them and never inside (measured over 1,044 periods), the modelled spread only where
 * one was charged — 0 on recorded quotes, null on a period recorded before contract 33. The amounts
 * are the caller's: the table prints them bare under its stated currency, a card in full.
 */
export function feeSplit(
  costs: Pick<BookingPeriodRow, 'commission_cost' | 'swap_cost' | 'spread_cost' | 'modelled_spread_cost'>,
  money: (value: number) => string,
): string {
  const modelled = costs.modelled_spread_cost
    ? ` · ${t('modelled spread')} ${money(costs.modelled_spread_cost)}`
    : ''
  return `${t('commission')} ${money(costs.commission_cost)}`
    + ` · ${t('swap')} ${money(costs.swap_cost)}`
    + ` — ${t('spread')} ${money(costs.spread_cost)}${modelled} ${t('besides, not part of this total')}`
}

/** The heading a period carries wherever it is drawn: which unit, which period. */
export function periodTitle(period: PeriodRow): string {
  return `${period.unit_name} · ${t('booking period')} ${period.period_no}`
}

/**
 * Everything a period says, for the card on its bar and on its row — one builder, so the two never
 * disagree. Including the EQUITY BAND, which the table gives up first on a narrow panel: it keeps a
 * booked result readable, since a trade belongs to the period it CLOSED in, and a position opened on
 * one day and closed the next puts its whole result on the second. The booked figure and the account
 * movement then differ by exactly the unrealised movement across the boundary.
 */
export function periodFigures(period: PeriodRow): Figure[] {
  const money = (value: number) => amount(value, period.currency)
  const rows: Figure[] = [
    { label: t('Opened'), value: utcInstant(period.opened_at) },
    { label: t('Closed'), value: utcInstant(period.closed_at) },
    { label: t('Reason'), value: period.reason },
    { label: t('Trades'), value: String(period.trade_count) },
    { label: t('Net P&L'), value: money(period.net_pnl), tone: signClass(period.net_pnl) },
    { label: t('Win rate'), value: percentOrNa(period.win_rate, period.trade_count) },
    { label: t('PF'), value: numberOrNa(period.profit_factor, period.trade_count) },
    { label: t('Fees'), value: money(period.total_fees), title: feeSplit(period, money) },
    // a magnitude: the stored sign is not reliable across the archive
    { label: t('Max DD'), value: magnitude(period.max_drawdown, period.currency) },
    // stamped at the source since contract 17, null before — never `final_equity - net_pnl`
    { label: t('Opening'), value: period.opening_equity === null ? t('n/a') : money(period.opening_equity) },
    { label: t('Equity band'), value: `${money(period.min_equity)} … ${money(period.max_equity)}` },
    { label: t('Final equity'), value: money(period.final_equity) },
  ]
  if (period.run_id) rows.unshift({ label: t('Run'), value: period.run_id })
  return rows
}

export function periodCard(period: PeriodRow): FigureCard {
  return { title: periodTitle(period), details: periodFigures(period) }
}

/**
 * A unit's periods folded into its total, as the backend folds them (its `booking-periods`
 * document): flows summed, rates rebuilt from their summed components rather than averaged, the
 * widest band, and two declines side by side — the deepest WITHIN one period, which is what the
 * table's column shows, and the account's own, cumulative from the unit's start. A fall that runs
 * across a period boundary is deeper than any one period's; on `20261007_144351_e167cfa3` a unit's
 * deepest period fell 34.10 while its account fell 66.50.
 */
export function unitTotalCard(total: BookingPeriodUnitTotal): FigureCard {
  const money = (value: number) => amount(value, total.currency)
  return {
    title: `${total.unit_name} · ${plural(total.period_count, t('booking period'), t('booking periods'))}`,
    details: [
      { label: t('Opened'), value: utcInstant(total.opened_at) },
      { label: t('Closed'), value: utcInstant(total.closed_at) },
      { label: t('Trades'), value: String(total.trade_count) },
      { label: t('Net P&L'), value: money(total.net_pnl), tone: signClass(total.net_pnl) },
      { label: t('Gross profit'), value: money(total.gross_profit) },
      { label: t('Gross loss'), value: magnitude(total.gross_loss, total.currency) },
      {
        label: t('Win rate'),
        value: percentOrNa(total.win_rate, total.trade_count),
        title: t('Rebuilt from the summed trades of every period, never an average of the periods'),
      },
      { label: t('PF'), value: numberOrNa(total.profit_factor, total.trade_count) },
      { label: t('Fees'), value: money(total.total_fees), title: feeSplit(total, money) },
      {
        label: t('Opening'),
        value: total.opening_equity === null ? t('n/a') : money(total.opening_equity),
        title: t('What the first period opened with'),
      },
      { label: t('Final equity'), value: money(total.final_equity) },
      {
        label: t('Equity band'),
        value: `${money(total.min_equity)} … ${money(total.max_equity)}`,
        title: t("The widest band across the unit's periods"),
      },
      {
        label: t('Deepest period drawdown'),
        value: magnitude(total.deepest_period_drawdown, total.currency),
        title: t('The deepest decline within a single period — what the Max DD column shows'),
      },
      {
        label: t('Deepest drawdown'),
        value: `${magnitude(total.account_max_drawdown, total.currency)} (${percentFigure(total.account_max_dd_pct)})`,
        title: t("The account's own decline, cumulative from the unit's start — from the deployment's start for a session of one. A fall across a period boundary is deeper than any one period's own"),
      },
    ],
  }
}
