import { rowKey } from '@/api/list_key'
import {
  amount, drawdownFigure, duration, figure, magnitude, numberOrNa, orDash, percentOrNa, rValue, shortHash, signClass, utcInstant,
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
    const led = statesFigure(rows[0]!, detail.objective)
    return rows.map((combination, index): CombinationRow => ({
      kind: 'combination',
      sweep,
      objective: detail.objective,
      combination,
      key: `${sweep.sweep_id}|${rowKey(combination, detail.key)}`,
      place: index + 1,
      // equality of the served value, nothing ranked here: four combinations of
      // `sweep_20261008_223212` all read `net_pnl` 0.0 (measured 2026-10-19). Only on a figure the row
      // and the first both state: a ranking led by a value nobody measured has no first
      first: led && objectiveValue(combination, detail.objective) === best && statesFigure(combination, detail.objective),
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
function figureOf(combination: SweepCombination, objective: string): string {
  switch (objective) {
    case 'expectancy': return rValue(combination.expectancy, combination.r_trade_count)
    case 'net_pnl': return amount(combination.net_pnl, combination.currency)
    case 'win_rate': return percentOrNa(combination.win_rate, combination.total_trades)
    case 'profit_factor': return numberOrNa(combination.profit_factor, combination.total_trades)
    case 'account_max_drawdown': return orDash(combination.account_max_drawdown, value => magnitude(value, combination.currency))
  }
  // their vocabulary may grow: the field the response names, read by that name
  const value = objectiveValue(combination, objective)
  return typeof value === 'number' ? figure(value) : t('n/a')
}

export function objectiveFigure(row: CombinationRow): string {
  return figureOf(row.combination, row.objective)
}

/** Whether a row states the objective's figure at all, or only an absence. */
function statesFigure(combination: SweepCombination, objective: string): boolean {
  const shown = figureOf(combination, objective)
  return shown !== t('n/a') && shown !== '—'
}

/** A parameter by the last part of its configuration key; the whole key is in the row's card. */
export function parametersText(combination: SweepCombination): string {
  return Object.entries(combination.sweep_params).map(([key, value]) => `${key.split('.').pop()} ${value}`).join(' · ')
}

/**
 * What the ranking is ordered by, in a word for the heading and a sentence for its card: the
 * sweep's own objective, or — where it declared none — the one the route names instead.
 */
export function rankedBy(sweep: SweepRow, detail: SweepDetail | undefined): { word: string, sentence: string } {
  const objective = detail?.objective ?? sweep.objective
  if (!objective) return { word: t('no objective'), sentence: t('nothing: the sweep declared no objective') }
  const maximize = detail?.maximize ?? sweep.maximize
  const direction = maximize ? t('highest first') : t('lowest first')
  const whose = sweep.objective ? t("the sweep's own objective") : t('the sweep declared none, so the backend ranked by this')
  const currencies = new Set(detail?.combinations.map(row => row.currency) ?? []).size
  const within = currencies > 1 ? ` · ${t('within each account currency')}` : ''
  return {
    word: `${objective} ${maximize ? '↑' : '↓'}`,
    sentence: `${objective}, ${direction} — ${whose}${within}`,
  }
}

/** The order features a row was allowed beyond its venue, from their comma-joined string (contract 45). */
function featureWords(features: string): string[] {
  return features.split(',').map(word => word.trim()).filter(Boolean)
}

/** A word for the heading, and the sentence behind it in the heading's card. */
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
  // the broker configuration frozen with each run (contract 40); a combination's own rendered set
  // always differs, since its parameters do
  ['broker_config_id', t('broker configuration')],
]

/** How many combinations the rows are: a run in two account currencies is a row each (their `sweeps` document). */
function combinationCount(rows: SweepCombination[]): number {
  return new Set(rows.map(row => row.run_id)).size
}

/** The account currencies whose ranking is led by a row that does not state the objective's figure. */
function unledCurrencies(detail: SweepDetail): string[] {
  return [...new Set(detail.combinations.map(row => row.currency))].filter(currency => {
    const first = detail.combinations.find(row => row.currency === currency)!
    return !statesFigure(first, detail.objective)
  })
}

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
  // `expectancy` reads 0 where no trade has an R, as on all four rows of `sweep_20261008_223212`
  // (measured 2026-10-30): a combination that never traded, and since contract 45 one whose strategy
  // keeps its stop itself. That sorts above every negative mean, so it can lead a ranking
  const unled = unledCurrencies(detail)
  if (unled.length) {
    const within = new Set(detail.combinations.map(row => row.currency)).size > 1 ? ` (${unled.join(', ')})` : ''
    notices.push({
      word: t('first states no figure'),
      sentence: `${t('The first combination states no figure for')} ${detail.objective}${within} — ${t('its place rests on a value nobody measured, and no row is first')}`,
    })
  }
  // without it a shorter ranking would read as the whole sweep (contract 40)
  if (detail.unranked) {
    notices.push({
      word: `${detail.unranked} ${t('not ranked')}`,
      sentence: `${plural(detail.unranked, t('combination'), t('combinations'))} ${t('carry no value for the objective and are left out of the ranking')}`,
    })
  }
  const differing = COMPARABLE
    .filter(([field]) => new Set(detail.combinations.map(row => row[field])).size > 1)
    .map(([, words]) => words)
  if (differing.length) {
    notices.push({
      word: t('unlike runs'),
      sentence: `${t('The combinations differ in')} ${differing.join(', ')} — ${t('the ranking compares measures that may have changed underneath')}`,
    })
  }
  const pruned = combinationCount(detail.combinations.filter(row => row.records_pruned_at !== ''))
  if (pruned) {
    notices.push({
      word: t('records pruned'),
      sentence: `${plural(pruned, t('combination'), t('combinations'))} ${t('whose run records a prune removed — the figures can no longer be checked against them')}`,
    })
  }
  // a row allowed features its venue's API does not hold does not predict a session there
  // (FiniexTestingIDE, 2026-10-30). The field is the scenario set's, so the ranked rows of a sweep read
  // alike. Read off the ranking: the row of the sweep list does not carry it
  const beyond = detail.combinations.filter(row => row.features_beyond_venue !== '')
  if (beyond.length) {
    const features = new Set(beyond.flatMap(row => featureWords(row.features_beyond_venue)))
    notices.push({
      word: t('beyond the venue'),
      sentence: `${plural(combinationCount(beyond), t('combination'), t('combinations'))} ${t("allowed order features the venue's API does not hold")}: ${[...features].join(' · ')} — ${t('such a combination does not predict a session there')}`,
    })
  }
  return notices
}

/**
 * The heading's card: what the search was beyond the words on its line, how it is ranked, and what
 * each word on the line means. A notice's row stands in the warning role with its glyph, and its own
 * word as the label. One card, because a heading is one button: a keyboard reaches it and nothing inside.
 */
export function sweepCard(sweep: SweepRow, detail: SweepDetail | undefined): FigureCard {
  return {
    title: sweep.sweep_id,
    details: [
      { label: t('Set'), value: sweep.base_config },
      { label: t('Symbols'), value: sweep.symbols.join(', ') },
      { label: t('Started'), value: utcInstant(sweep.started) },
      // the spread of the starts, not how long the sweep took: the last run's duration falls outside it
      { label: t('Starts spread over'), value: duration(sweep.duration_s / 3600) },
      { label: t('Combinations'), value: `${sweep.run_count} · ${sweep.ok_count} ${t('usable')}` },
      { label: t('Ranked by'), value: rankedBy(sweep, detail).sentence },
      ...sweepNotices(sweep, detail).map(notice => ({ label: notice.word, value: `⚠ ${notice.sentence}`, tone: 'warning' })),
    ],
  }
}

/**
 * The order counts in their own words, those that counted something — the executive panel's funnel
 * words. The dash on a row written before the counts folded.
 */
function ordersText(combination: SweepCombination): string {
  const counts: [number | null, string][] = [
    [combination.orders_submitted, t('submitted')],
    [combination.orders_executed, t('executed')],
    [combination.orders_rejected, t('rejected')],
    [combination.orders_cancelled, t('cancelled')],
    [combination.orders_expired, t('expired')],
    [combination.orders_denied, t('denied')],
    [combination.orders_adopted, t('adopted')],
    [combination.orders_undelivered, t('undelivered')],
    [combination.orders_unaccounted, t('unaccounted')],
    [combination.sl_tp_triggered, t('closed by SL/TP')],
  ]
  if (combination.orders_submitted === null) return '—'
  return counts.filter(([count]) => count).map(([count, word]) => `${count} ${word}`).join(' · ') || '0'
}

function configurationIds(combination: SweepCombination): Figure[] {
  const ids: Figure[] = []
  if (combination.rendered_config_id) {
    ids.push({
      label: t('Rendered configuration id'),
      value: shortHash(combination.rendered_config_id),
      title: combination.rendered_config_id,
    })
  }
  if (combination.broker_config_id) {
    ids.push({ label: t('Broker configuration id'), value: shortHash(combination.broker_config_id), title: combination.broker_config_id })
  }
  return ids
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
      value: drawdownFigure(combination.account_max_drawdown, combination.account_max_drawdown_pct, combination.currency),
    },
    { label: t('Fees'), value: amount(combination.total_fees, combination.currency) },
    // they fold since contract 42, each period counting the orders it handled; null on an older row
    { label: t('Orders'), value: ordersText(combination) },
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
    // what the combination RAN with (contract 40), for comparing; empty on a row written before
    ...configurationIds(combination),
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
  if (combination.features_beyond_venue) {
    details.push({
      label: t('Beyond the venue'),
      value: `⚠ ${featureWords(combination.features_beyond_venue).join(' · ')}`,
      tone: 'warning',
    })
  }
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
