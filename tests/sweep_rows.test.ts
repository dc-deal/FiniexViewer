import { describe, it, expect } from 'vitest'
import {
  combinationCard, objectiveFigure, parametersText, parametersTitle, rankedBy, sweepListRows, sweepNotices,
} from '@/components/sweeps/sweep_rows'
import type { CombinationRow, SweepRankings } from '@/components/sweeps/sweep_rows'
import type { SweepCombination, SweepDetail, SweepList, SweepRow } from '@/types/api/sweep_types'

import listFixture from './fixtures/sweeps_list.json'
import detailFixture from './fixtures/sweep_detail.json'

const LIST: SweepList = listFixture
const DETAIL: SweepDetail = detailFixture
// read from the capture rather than transcribed, so a re-capture cannot strand it
const SWEEP: SweepRow = LIST.sweeps.find(row => row.sweep_id === DETAIL.sweep_id)!

function combination(fields: Partial<SweepCombination>): SweepCombination {
  return { ...DETAIL.combinations[0]!, ...fields }
}

function state(fields: Partial<SweepRankings> = {}): SweepRankings {
  return { open: new Set([SWEEP.sweep_id]), rankings: {}, loading: [], failures: {}, gone: [], ...fields }
}

function combinations(detail: Partial<SweepDetail>): CombinationRow[] {
  const rows = sweepListRows([SWEEP], state({ rankings: { [SWEEP.sweep_id]: { ...DETAIL, ...detail } } }))
  return rows.filter((row): row is CombinationRow => row.kind === 'combination')
}

/**
 * The Sweeps panel's one list: a heading per sweep, and beneath an open one its combinations in the
 * order the route ranked them — numbered, the first starred, nothing re-sorted here.
 */
describe('sweep_rows', () => {
  it('keeps a closed sweep to one silent line, so its heading still stands', () => {
    const rows = sweepListRows([SWEEP], state({ open: new Set() }))
    expect(rows).toEqual([{ kind: 'state', sweep: SWEEP, key: `${SWEEP.sweep_id}|state`, message: '' }])
  })

  it('says an open sweep is on its way, could not be read, or is gone, in the one line beneath it', () => {
    const id = SWEEP.sweep_id
    const message = (fields: Partial<SweepRankings>) => sweepListRows([SWEEP], state(fields))[0]
    expect(message({ loading: [id] })).toMatchObject({ kind: 'state', message: 'Reading its ranking …' })
    expect(message({ failures: { [id]: 'Could not load the ranking: Network Error' } }))
      .toMatchObject({ message: 'Could not load the ranking: Network Error' })
    expect(message({ gone: [id] })).toMatchObject({ message: 'The ledger knows this sweep no longer' })
  })

  it('stands an open sweep\'s combinations in the order served, numbered, the first starred', () => {
    const rows = combinations({})
    expect(rows.map(row => row.combination.run_id)).toEqual(DETAIL.combinations.map(row => row.run_id))
    expect(rows.map(row => row.place)).toEqual(DETAIL.combinations.map((_, index) => index + 1))
    expect(rows[0]!.first).toBe(true)
    expect(rows[0]!.objective).toBe(DETAIL.objective)
  })

  /** A tie has no single winner: every row that ties the first on the objective shares its star. */
  it('stars every combination tied with the first on the objective', () => {
    const rows = combinations({
      objective: 'net_pnl',
      combinations: [
        combination({ run_id: 'run_a', net_pnl: 0 }),
        combination({ run_id: 'run_b', net_pnl: 0 }),
        combination({ run_id: 'run_c', net_pnl: -5 }),
      ],
    })
    expect(rows.map(row => row.first)).toEqual([true, true, false])
  })

  /** Ranked within each account currency: each currency's ranking starts at its own first. */
  it('numbers each account currency apart', () => {
    const rows = combinations({
      combinations: [
        combination({ run_id: 'run_a', currency: 'USD' }),
        combination({ run_id: 'run_b', currency: 'USD', expectancy: 1 }),
        combination({ run_id: 'run_a', currency: 'EUR' }),
      ],
    })
    expect(rows.map(row => [row.place, row.first])).toEqual([[1, true], [2, false], [1, true]])
    expect(new Set(rows.map(row => row.key)).size).toBe(3)
  })

  it('says a sweep whose combinations all failed has nothing ranked', () => {
    const rows = sweepListRows([SWEEP], state({ rankings: { [SWEEP.sweep_id]: { ...DETAIL, combinations: [] } } }))
    expect(rows).toEqual([expect.objectContaining({ kind: 'state', message: 'No combination produced usable data' })])
  })

  it('prints the objective as the summary prints the same field, and an unknown one as its number', () => {
    const [row] = combinations({})
    expect(objectiveFigure({ ...row!, objective: 'expectancy' })).toMatch(/R$/)
    expect(objectiveFigure({ ...row!, objective: 'net_pnl' })).toContain(row!.combination.currency)
    expect(objectiveFigure({ ...row!, objective: 'total_trades' })).toMatch(new RegExp(`^${row!.combination.total_trades}`))
    expect(objectiveFigure({ ...row!, objective: 'no_such_field' })).toBe('n/a')
  })

  it('names each parameter by the last part of its key, the whole key on its title', () => {
    const params = combination({ sweep_params: { 'decision_logic_config.sl_mult': 0.8, 'decision_logic_config.tp_mult': 1.5 } })
    expect(parametersText(params)).toBe('sl_mult 0.8 · tp_mult 1.5')
    expect(parametersTitle(params)).toContain('decision_logic_config.sl_mult 0.8')
  })

  it('says whose objective ordered the ranking — the sweep\'s own, or the backend\'s stand-in', () => {
    expect(rankedBy(SWEEP, DETAIL).sentence).toContain("the sweep's own objective")
    expect(rankedBy({ ...SWEEP, objective: '' }, { ...DETAIL, objective: 'expectancy', maximize: true }).sentence)
      .toContain('the sweep declared none, so the backend ranked by this')
    expect(rankedBy({ ...SWEEP, objective: '' }, undefined).word).toBe('no objective')
  })

  /** Only where the ranking compares unlike things: failed combinations, unlike code, lost records. */
  it('says nothing where the combinations compare alike, and a word for each thing that is off', () => {
    expect(sweepNotices(SWEEP, DETAIL)).toEqual([])
    const off = sweepNotices({ ...SWEEP, error_count: 2 }, {
      ...DETAIL,
      combinations: [
        combination({ run_id: 'run_a', logic_version: 18 }),
        combination({ run_id: 'run_b', logic_version: 17, records_pruned_at: '2026-10-19T08:00:00+00:00' }),
      ],
    })
    expect(off.map(notice => notice.word)).toEqual(['2 with errors', 'unlike runs', 'records pruned'])
    expect(off[1]!.sentence).toContain('logic version')
  })

  it('titles a combination\'s card with its place and its parameters', () => {
    const [row] = combinations({})
    expect(combinationCard(row!).title).toBe(`1. ${parametersText(row!.combination)}`)
  })

  /** The account's deepest decline carries one name on every card: the run report's, the roster's, a period's. */
  it('names the drawdown of a combination as the other cards name it', () => {
    const [row] = combinations({})
    const labels = combinationCard(row!).details.map(pair => pair.label)
    expect(labels).toContain('Deepest drawdown')
    expect(labels).not.toContain('Max drawdown')
  })
})
