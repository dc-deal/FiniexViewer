import { rowKey } from '@/api/list_key'
import {
  amount, duration, figure, magnitude, numberOrNa, percentFigure, percentOrNa, rValue, shortHash, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { SweepCombination, SweepDetail, SweepRow } from '@/types/api/sweep_types'
import type { Figure, FigureCard } from '@/types/figure_types'
import { plural, t } from '@/translate'

/**
 * The lines of the Sweeps panel's one list. Every sweep is a heading; opened, its combinations stand
 * beneath it IN THE ORDER THE ROUTE RANKED THEM, within each account currency — nothing here
 * re-sorts or re-ranks: the order is the answer. Where its ranking is not on screen, one line says
 * why: on its way, unreadable, gone, or empty. A closed sweep keeps that one line too, because a
 * heading exists only for the rows beneath it — and a closed heading draws none of them.
 */
export type SweepListRow = CombinationRow | StateRow

export interface CombinationRow {
  kind: 'combination'
  sweep: SweepRow
  /** The objective the ranking USED — the sweep's own, or the one the route names instead. */
  objective: string
  combination: SweepCombination
  key: string
  /** Its place in its currency's ranking: the route's order, numbered. */
  place: number
  /** First, or tied with the first on the objective: a tie has no single winner. */
  first: boolean
}

export interface StateRow {
  kind: 'state'
  sweep: SweepRow
  key: string
  message: string
}

/** What the store holds about the rankings, read by the list. */
export interface SweepRankings {
  open: ReadonlySet<string>
  rankings: Readonly<Record<string, SweepDetail>>
  loading: readonly string[]
  failures: Readonly<Record<string, string>>
  gone: readonly string[]
}

function stateRow(sweep: SweepRow, message: string): StateRow {
  return { kind: 'state', sweep, key: `${sweep.sweep_id}|state`, message }
}

/** The objective's served value, read by the field the response names. */
function objectiveValue(row: SweepCombination, objective: string): unknown {
  return (row as unknown as Record<string, unknown>)[objective]
}

function rankedRows(sweep: SweepRow, detail: SweepDetail): SweepListRow[] {
  if (!detail.combinations.length) return [stateRow(sweep, t('No combination produced usable data'))]
  const currencies = [...new Set(detail.combinations.map(row => row.currency))]
  return currencies.flatMap(currency => {
    const rows = detail.combinations.filter(row => row.currency === currency)
    const best = objectiveValue(rows[0]!, detail.objective)
    return rows.map((combination, index): CombinationRow => ({
      kind: 'combination',
      sweep,
      objective: detail.objective,
      combination,
      key: `${sweep.sweep_id}|${rowKey(combination, detail.key)}`,
      place: index + 1,
      // equality of the served value, nothing ranked here: four combinations of
      // `sweep_20261008_223212` all read `net_pnl` 0.0 (measured 2026-10-19)
      first: objectiveValue(combination, detail.objective) === best,
    }))
  })
}

/** Every line of the list, sweep by sweep in the order given. */
export function sweepListRows(sweeps: SweepRow[], state: SweepRankings): SweepListRow[] {
  return sweeps.flatMap(sweep => {
    const id = sweep.sweep_id
    if (!state.open.has(id)) return [stateRow(sweep, '')]
    if (state.failures[id]) return [stateRow(sweep, state.failures[id]!)]
    if (state.gone.includes(id)) return [stateRow(sweep, t('The ledger knows this sweep no longer'))]
    const detail = state.rankings[id]
    if (detail) return rankedRows(sweep, detail)
    return [stateRow(sweep, t('Reading its ranking …'))]
  })
}

/** The objective's figure, formatted as the summary formats the same field; one unknown here, as a number. */
export function objectiveFigure(row: CombinationRow): string {
  const combination = row.combination
  switch (row.objective) {
    case 'expectancy': return rValue(combination.expectancy, combination.r_trade_count)
    case 'net_pnl': return amount(combination.net_pnl, combination.currency)
    case 'win_rate': return percentOrNa(combination.win_rate, combination.total_trades)
    case 'profit_factor': return numberOrNa(combination.profit_factor, combination.total_trades)
    case 'account_max_drawdown': return magnitude(combination.account_max_drawdown, combination.currency)
  }
  // their vocabulary may grow: the field the response names, read by that name
  const value = objectiveValue(combination, row.objective)
  return typeof value === 'number' ? figure(value) : t('n/a')
}

/** A parameter by the last part of its configuration key; the whole key is on the title and the card. */
export function parametersText(combination: SweepCombination): string {
  return Object.entries(combination.sweep_params).map(([key, value]) => `${key.split('.').pop()} ${value}`).join(' · ')
}

export function parametersTitle(combination: SweepCombination): string {
  return Object.entries(combination.sweep_params).map(([key, value]) => `${key} ${value}`).join('\n')
}

/**
 * What the ranking is ordered by, in a word for the heading and a sentence for its title: the
 * sweep's own objective, or — where it declared none — the one the route names instead.
 */
export function rankedBy(sweep: SweepRow, detail: SweepDetail | undefined): { word: string, sentence: string } {
  const objective = detail?.objective ?? sweep.objective
  if (!objective) return { word: t('no objective'), sentence: t('The sweep declared no objective') }
  const maximize = detail?.maximize ?? sweep.maximize
  const direction = maximize ? t('highest first') : t('lowest first')
  const whose = sweep.objective ? t("the sweep's own objective") : t('the sweep declared none, so the backend ranked by this')
  const currencies = new Set(detail?.combinations.map(row => row.currency) ?? []).size
  const within = currencies > 1 ? ` · ${t('within each account currency')}` : ''
  return {
    word: `${objective} ${maximize ? '↑' : '↓'}`,
    sentence: `${t('Ranked by')} ${objective}, ${direction} — ${whose}${within}`,
  }
}

/** A word for the heading, and the sentence behind it on hover. */
export interface SweepNotice {
  word: string
  sentence: string
}

/**
 * The fields that make a ranking comparable, where the combinations disagree on them: they then
 * compare measures that changed underneath (their `sweeps` document). Equality of served values.
 */
const COMPARABLE: [keyof SweepCombination, string][] = [
  ['logic_version', t('logic version')],
  ['decision_version', t('strategy version')],
  ['git_commit', t('code')],
  ['profile_hash', t('simulator settings')],
]

/** Only where the ranking compares unlike things — where everything is alike, nothing is said. */
export function sweepNotices(sweep: SweepRow, detail: SweepDetail | undefined): SweepNotice[] {
  const notices: SweepNotice[] = []
  if (sweep.error_count) {
    notices.push({
      word: `${sweep.error_count} ${t('with errors')}`,
      sentence: `${plural(sweep.error_count, t('combination'), t('combinations'))} ${t('produced no usable data and are not ranked')}`,
    })
  }
  if (!detail) return notices
  const differing = COMPARABLE
    .filter(([field]) => new Set(detail.combinations.map(row => row[field])).size > 1)
    .map(([, words]) => words)
  if (differing.length) {
    notices.push({
      word: t('unlike runs'),
      sentence: `${t('The combinations differ in')} ${differing.join(', ')} — ${t('the ranking compares measures that may have changed underneath')}`,
    })
  }
  const pruned = detail.combinations.filter(row => row.records_pruned_at !== '').length
  if (pruned) {
    notices.push({
      word: t('records pruned'),
      sentence: `${plural(pruned, t('combination'), t('combinations'))} ${t('whose run records a prune removed — the figures can no longer be checked against them')}`,
    })
  }
  return notices
}

/** The heading's title: what the search was, beyond the words on its line. */
export function sweepTitle(sweep: SweepRow): string {
  return [
    `${t('Set')}: ${sweep.base_config}`,
    `${t('Symbols')}: ${sweep.symbols.join(', ')}`,
    `${t('Started')}: ${utcInstant(sweep.started)}`,
    // the spread of the starts, not how long the sweep took: the last run's duration falls outside it
    `${t('Starts spread over')}: ${duration(sweep.duration_s / 3600)}`,
    `${plural(sweep.run_count, t('combination'), t('combinations'))} · ${sweep.ok_count} ${t('usable')}`,
  ].join('\n')
}

/** A combination's card: the figures it is judged on, and the fields that make it comparable. */
export function combinationCard(row: CombinationRow): FigureCard {
  const combination = row.combination
  const details: Figure[] = [
    ...Object.entries(combination.sweep_params).map(([key, value]) => ({ label: key, value: String(value) })),
    { label: t('Net P&L'), value: amount(combination.net_pnl, combination.currency), tone: signClass(combination.net_pnl) },
    {
      label: t('Expectancy'),
      value: rValue(combination.expectancy, combination.r_trade_count),
      title: t('The mean R. Read it beside the trades it rests on: R is the result over the loss the stop of the trade would have taken'),
    },
    { label: t('R trades'), value: `${combination.r_trade_count} (${combination.r_win_count}W/${combination.r_loss_count}L)` },
    { label: t('Avg win R'), value: rValue(combination.avg_win_r, combination.r_win_count) },
    { label: t('Avg loss R'), value: rValue(combination.avg_loss_r, combination.r_loss_count) },
    { label: t('Trades'), value: `${combination.total_trades} (${combination.winning_trades}W/${combination.losing_trades}L)` },
    { label: t('Win rate'), value: percentOrNa(combination.win_rate, combination.total_trades) },
    { label: t('Profit factor'), value: numberOrNa(combination.profit_factor, combination.total_trades) },
    {
      // the account's deepest decline, named as every other card names this pair of fields
      label: t('Deepest drawdown'),
      value: combination.account_max_drawdown_pct === null
        ? magnitude(combination.account_max_drawdown, combination.currency)
        : `${magnitude(combination.account_max_drawdown, combination.currency)} (${percentFigure(combination.account_max_drawdown_pct)})`,
    },
    { label: t('Fees'), value: amount(combination.total_fees, combination.currency) },
    {
      label: t('Mean hold'),
      value: combination.avg_trade_duration_s === null ? t('n/a') : duration(combination.avg_trade_duration_s / 3600),
    },
    { label: t('Run'), value: combination.run_id },
    {
      label: t('Code'),
      value: [combination.git_commit, combination.git_branch, combination.git_dirty ? t('dirty or not determined') : ''].filter(Boolean).join(' · '),
      title: t('Dirty covers every repository a part of the run came from, and also code whose state could not be determined'),
    },
    { label: t('Logic version'), value: combination.logic_version === null ? t('unknown') : String(combination.logic_version) },
    { label: t('Parameters hash'), value: shortHash(combination.param_hash), title: combination.param_hash },
    {
      label: t('Settings hash'),
      value: combination.profile_hash ? shortHash(combination.profile_hash) : t('not recorded'),
      title: combination.profile_hash || undefined,
    },
    {
      label: t('Candidates'),
      value: combination.trial_count === null ? t('unknown') : String(combination.trial_count),
      title: t('How many candidates this run was selected from'),
    },
  ]
  if (combination.records_pruned_at) {
    details.push({
      label: t('Records pruned'),
      value: utcInstant(combination.records_pruned_at),
      tone: 'warning',
      title: t('The run records behind these figures were removed: they can no longer be checked'),
    })
  }
  return { title: `${row.place}. ${parametersText(combination)}`, details }
}
