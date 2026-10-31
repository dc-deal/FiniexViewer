import { describe, it, expect } from 'vitest'
import {
  combinationCard, objectiveFigure, parametersText, rankedBy, sweepCard, sweepListRows, sweepNotices,
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
        combination({ run_id: 'run_b', currency: 'USD', net_pnl: -9999 }),
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

  /** Contract 46: ranked by `expectancy` where no trade has an R, the ranking is empty and every row counted out. They ran. */
  it('says a ranking left empty by its objective for what it is, not as data that failed', () => {
    const empty = { ...DETAIL, objective: 'expectancy', combinations: [], count: 0, unranked: 9 }
    const [row] = sweepListRows([SWEEP], state({ rankings: { [SWEEP.sweep_id]: empty } }))
    expect(row).toMatchObject({ kind: 'state', message: '9 combinations ran, and none has a figure for expectancy' })
    expect(sweepNotices(SWEEP, empty).map(entry => entry.word)).toEqual(['9 not ranked'])
  })

  it('prints the objective as the summary prints the same field, and an unknown one as its number', () => {
    const [row] = combinations({ combinations: [combination({ expectancy: 0.5, r_trade_count: 4 })] })
    expect(objectiveFigure({ ...row!, objective: 'expectancy' })).toMatch(/R$/)
    expect(objectiveFigure({ ...row!, objective: 'net_pnl' })).toContain(row!.combination.currency)
    expect(objectiveFigure({ ...row!, objective: 'total_trades' })).toMatch(new RegExp(`^${row!.combination.total_trades}`))
    expect(objectiveFigure({ ...row!, objective: 'no_such_field' })).toBe('n/a')
  })

  it('names each parameter by the last part of its key, the whole key in its card', () => {
    const params = combination({ sweep_params: { 'decision_logic_config.sl_mult': 0.8, 'decision_logic_config.tp_mult': 1.5 } })
    expect(parametersText(params)).toBe('sl_mult 0.8 · tp_mult 1.5')
    const [row] = combinations({ combinations: [params] })
    expect(combinationCard(row!).details).toContainEqual({ label: 'decision_logic_config.sl_mult', value: '0.8' })
  })

  /** What the line has no width for, and what each word on it means: one card, which a keyboard reaches too. */
  it('says in the card of a heading what the sweep searched, how it is ranked and each word on its line', () => {
    const card = sweepCard({ ...SWEEP, features_beyond_venue: 'stop_loss' }, DETAIL)
    expect(card.title).toBe(SWEEP.sweep_id)
    const pairs = Object.fromEntries(card.details.map(pair => [pair.label, pair]))
    expect(pairs['Set']!.value).toBe(SWEEP.base_config)
    expect(pairs['Ranked by']!.value).toContain(`${DETAIL.objective}, `)
    expect(pairs['beyond the venue']).toMatchObject({ tone: 'warning' })
    expect(pairs['beyond the venue']!.value).toMatch(/^⚠ .*do not predict a session there$/)
    // no row of a card shares its label, which is its key
    expect(new Set(card.details.map(pair => pair.label)).size).toBe(card.details.length)
    // a ranking not read yet: what the sweep's own row holds stands, and nothing it does not state
    const closed = sweepCard(SWEEP, undefined).details.map(pair => pair.label)
    expect(closed).toContain('Set')
    expect(closed).not.toContain('beyond the venue')
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

  /**
   * A search allowed order features its venue's API does not hold does not predict a session there.
   * On the sweep's own row since contract 46, so the word stands before a ranking is read.
   */
  it('says which features a search was allowed beyond the venue, closed or open, and nothing where it was allowed none', () => {
    const allowed = { ...SWEEP, features_beyond_venue: 'stop_loss,take_profit' }
    for (const detail of [undefined, DETAIL]) {
      const notice = sweepNotices(allowed, detail).find(entry => entry.word === 'beyond the venue')!
      expect(notice.sentence).toContain(': stop_loss · take_profit — ')
      expect(notice.sentence).toContain('do not predict a session there')
      expect(sweepNotices(SWEEP, detail).map(entry => entry.word)).not.toContain('beyond the venue')
    }
  })

  /** Where a row prints the objective's figure as an absence, nobody is first on it: `win_rate` over no trades reads 0. */
  it('stars no row on a figure it does not state, and says so', () => {
    const empty = { win_rate: 0, total_trades: 0 }
    const none = {
      objective: 'win_rate',
      combinations: [combination({ run_id: 'run_a', ...empty, net_pnl: -47 }), combination({ run_id: 'run_b', ...empty, net_pnl: -198 })],
    }
    const rows = combinations(none)
    expect(rows.map(objectiveFigure)).toEqual(['n/a', 'n/a'])
    expect(rows.map(row => row.first)).toEqual([false, false])
    const notice = sweepNotices(SWEEP, { ...DETAIL, ...none }).find(entry => entry.word === 'first states no figure')!
    expect(notice.sentence).toContain('win_rate')
    expect(notice.sentence).not.toContain('(')
  })

  /** Lowest first, a row with no trades leads on a 0 nobody measured: the rows below it state one, and none is first. */
  it('stars no row where the first states no figure, whatever the rows below it state', () => {
    const led = (...below: Partial<SweepCombination>[]) => ({
      objective: 'win_rate',
      maximize: false,
      combinations: [
        combination({ run_id: 'run_a', win_rate: 0, total_trades: 0 }),
        ...below.map((fields, index) => combination({ run_id: `run_${index}`, ...fields })),
      ],
    })
    const stated = led({ win_rate: 0.25, total_trades: 12 }, { win_rate: 0.8, total_trades: 9 })
    expect(combinations(stated).map(row => row.first)).toEqual([false, false, false])
    expect(sweepNotices(SWEEP, { ...DETAIL, ...stated }).map(entry => entry.word)).toContain('first states no figure')
    // a stated 0 below it ties with no first
    expect(combinations(led({ win_rate: 0, total_trades: 4 })).map(row => row.first)).toEqual([false, false])
  })

  /** The stars are decided within each account currency, so the word is too, and names the one it means. */
  it('says which account currency has no first, and keeps the star of the other', () => {
    const mixed = {
      objective: 'win_rate',
      combinations: [
        combination({ run_id: 'run_a', currency: 'USD', win_rate: 0.4, total_trades: 5 }),
        combination({ run_id: 'run_a', currency: 'EUR', win_rate: 0, total_trades: 0 }),
        combination({ run_id: 'run_b', currency: 'EUR', win_rate: 0, total_trades: 0 }),
      ],
    }
    expect(combinations(mixed).map(row => row.first)).toEqual([true, false, false])
    const notice = sweepNotices(SWEEP, { ...DETAIL, ...mixed }).find(entry => entry.word === 'first states no figure')!
    expect(notice.sentence).toContain('(EUR)')
  })

  /** A 0 a row states is a figure like any other: the rows tied on it are first, and nothing needs saying. */
  it('keeps the star on a figure a row does state, zero included', () => {
    const stated = {
      objective: 'win_rate',
      combinations: [
        combination({ run_id: 'run_a', win_rate: 0, total_trades: 4 }),
        combination({ run_id: 'run_b', win_rate: 0, total_trades: 7 }),
        combination({ run_id: 'run_c', win_rate: 0, total_trades: 0 }),
      ],
    }
    expect(combinations(stated).map(row => row.first)).toEqual([true, true, false])
    expect(sweepNotices(SWEEP, { ...DETAIL, ...stated }).map(entry => entry.word)).not.toContain('first states no figure')
  })

  /** Contract 46: a logic on own levels has no R, so beside a ranking by `net_pnl` its expectancy reads as absent. */
  it('reads an expectancy of null as absent in the card', () => {
    const [row] = combinations({ combinations: [combination({ expectancy: null, r_trade_count: 0 })] })
    expect(combinationCard(row!).details.find(pair => pair.label === 'Expectancy')?.value).toBe('n/a')
  })

  /** Two rows of one run are one combination, wherever a notice counts combinations. */
  it('counts a run in two account currencies once', () => {
    const pruned = '2026-10-19T08:00:00+00:00'
    const notices = sweepNotices(SWEEP, {
      ...DETAIL,
      combinations: [
        combination({ run_id: 'run_a', currency: 'EUR', records_pruned_at: pruned }),
        combination({ run_id: 'run_a', currency: 'USD', records_pruned_at: pruned }),
      ],
    })
    expect(notices.find(entry => entry.word === 'records pruned')!.sentence).toMatch(/^1 combination /)
  })

  /** In the card of the combination it concerns, in the warning role with its glyph; nothing on any other. */
  it('names the features of a combination allowed them in its card, and nothing on one allowed none', () => {
    const [row] = combinations({ combinations: [combination({ features_beyond_venue: 'stop_loss,take_profit' })] })
    expect(combinationCard(row!).details.find(pair => pair.label === 'Beyond the venue'))
      .toEqual({ label: 'Beyond the venue', value: '⚠ stop_loss · take_profit', tone: 'warning' })
    const [plain] = combinations({ combinations: [combination({ features_beyond_venue: '' })] })
    expect(combinationCard(plain!).details.map(pair => pair.label)).not.toContain('Beyond the venue')
  })

  /**
   * Contract 40: the combinations the ranking left out because they carry no value for its objective.
   * Without the count a shorter ranking would read as the whole sweep; a broker configuration that
   * differs between combinations makes them unlike runs.
   */
  it('says how many combinations the ranking left out, and a broker configuration that differs', () => {
    const notices = sweepNotices(SWEEP, {
      ...DETAIL,
      unranked: 2,
      combinations: [
        combination({ run_id: 'run_a', broker_config_id: 'aaa' }),
        combination({ run_id: 'run_b', broker_config_id: 'bbb' }),
      ],
    })
    expect(notices.map(notice => notice.word)).toEqual(['2 not ranked', 'unlike runs'])
    expect(notices[0]!.sentence).toContain('left out of the ranking')
    expect(notices[1]!.sentence).toContain('broker configuration')
  })

  /** The order counts fold since contract 42; a row written before says it has none. */
  it('carries the order counts of a combination, and a dash on a row from before they folded', () => {
    const [row] = combinations({
      combinations: [combination({
        orders_submitted: 12, orders_executed: 11, orders_rejected: 1, orders_cancelled: 0, sl_tp_triggered: 4,
      })],
    })
    const orders = combinationCard(row!).details.find(pair => pair.label === 'Orders')
    expect(orders?.value).toBe('12 submitted · 11 executed · 1 rejected · 4 closed by SL/TP')

    const [old] = combinations({ combinations: [combination({ orders_submitted: null })] })
    expect(combinationCard(old!).details.find(pair => pair.label === 'Orders')?.value).toBe('—')
  })

  /** What a combination ran with, for comparing (contract 40) — and nothing where a row predates it. */
  it('names the configuration a combination ran with, where its row records one', () => {
    const [row] = combinations({ combinations: [combination({ rendered_config_id: 'r'.repeat(64), broker_config_id: 'b'.repeat(64) })] })
    const labels = combinationCard(row!).details.map(pair => pair.label)
    expect(labels).toContain('Rendered configuration id')
    expect(labels).toContain('Broker configuration id')

    const [old] = combinations({ combinations: [combination({ rendered_config_id: '', broker_config_id: '' })] })
    expect(combinationCard(old!).details.map(pair => pair.label)).not.toContain('Rendered configuration id')
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
