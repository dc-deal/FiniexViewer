import { describe, it, expect } from 'vitest'

import runsList from './fixtures/runs_list.json'
import deploymentsList from './fixtures/deployments_list.json'
import deploymentDetail from './fixtures/deployment_detail.json'
import deploymentBookingPeriods from './fixtures/deployment_booking_periods.json'
import runBookingPeriods from './fixtures/run_booking_periods.json'
import runSummary from './fixtures/run_summary.json'
import portfolio from './fixtures/portfolio.json'
import warningsErrors from './fixtures/warnings_errors.json'
import configLive from './fixtures/run_config_live.json'
import configSimulation from './fixtures/run_config_simulation.json'
import tradeHistory from './fixtures/trade_history.json'
import scenarioDetails from './fixtures/scenario_details.json'
import manifest from './fixtures/capture_manifest.json'

import type {
  BookingPeriodsReport,
  PortfolioReport,
  RunListResponse,
  RunConfigReport,
  RunSummary,
  TradeHistoryReport,
  WarningsErrorsReport,
} from '@/types/api/report_types'
import type {
  DeploymentBookingPeriodsReport,
  DeploymentDetail,
  DeploymentListResponse,
} from '@/types/api/deployment_types'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'

/**
 * The contract this code was written against. The backend stamps every response with
 * `X-Api-Contract`, and the fixtures below were captured under the number recorded in their
 * manifest. Re-capturing them against a newer backend therefore fails HERE rather than in
 * production, which is the whole point of the header: the assertion stays local and needs no
 * connection to the backend to run.
 *
 * Raise it only together with reading `GET /api/v1/contract`, whose `changes` list says what moved.
 */
const EXPECTED_CONTRACT = 18

/**
 * What each list declares about its own row identity. Keying on the obvious field is wrong in
 * several of these, so the tuples are asserted rather than assumed — a deployment row is one per
 * (deployment x currency), a booking period's period_no restarts per bot, and a trade's
 * `position_id` repeats because a partial close books several records of ONE position.
 *
 * A response serving SEVERAL lists declares `keys`, one entry per list; one list keeps `key`.
 */
const EXPECTED_KEYS = {
  runs: ['run_id'],
  // the run index carries a NESTED list — one row per account currency, not per run
  runResults: ['currency'],
  dataBrokers: ['data_broker_type'],
  deployments: ['deployment_id', 'currency'],
  sessions: ['run_id', 'currency'],
  deploymentPeriods: ['run_id', 'unit_name', 'period_no'],
  runPeriods: ['unit_name', 'period_no'],
  // the folded row is one per UNIT, so the period number is not part of what makes it unique
  runUnitTotals: ['unit_name'],
  trades: ['scenario_name', 'position_id', 'exit_tick_index'],
}

describe('api contract', () => {
  it('fixtures were captured under the contract this code targets', () => {
    expect(manifest.contract).toBe(EXPECTED_CONTRACT)
  })

  // Each assignment is a STRUCTURAL check performed by the type-checker, not by the assertion
  // below it: a field the backend drops makes the fixture stop satisfying our mirror and the
  // build fails. The runtime expectation only proves the fixture is not empty.
  it('the run index still satisfies the mirrored shape', () => {
    const typed: RunListResponse = runsList
    expect(typed.runs.length).toBeGreaterThan(0)
    expect(typed.key).toEqual(EXPECTED_KEYS.runs)
    expect(typed.results_key).toEqual(EXPECTED_KEYS.runResults)
  })

  /**
   * What a run DID, on the index row (contract 15) — and the THREE states of `results`, which the
   * capture happens to carry all of. Reading `null` and `[]` as one invents a fact: the first says
   * the ledger holds nothing for that run, the second that it closed without figures.
   */
  it('the index states what each run did, in three distinguishable states', () => {
    const typed: RunListResponse = runsList
    const states = typed.runs.map(run =>
      run.results === null ? 'null' : (run.results.length ? 'list' : 'empty'))
    expect(new Set(states).size).toBeGreaterThan(1)
    const earning = typed.runs.find(run => run.results?.length)!
    expect(earning.results![0]!.currency).toBeTruthy()
    expect(typeof earning.results![0]!.net_pnl).toBe('number')
    expect(typeof earning.results![0]!.total_trades).toBe('number')
    // a count nobody took is null, never 0 — and the outcome travels with it
    expect(earning.run_outcome).toBeTruthy()
    const unrecorded = typed.runs.find(run => run.results === null)
    if (unrecorded) expect(unrecorded.run_outcome).toBeNull()
  })

  it('the deployment list is keyed per account currency', () => {
    const typed: DeploymentListResponse = deploymentsList
    expect(typed.deployments.length).toBeGreaterThan(0)
    expect(typed.key).toEqual(EXPECTED_KEYS.deployments)
  })

  it('deployment sessions are keyed per account currency', () => {
    const typed: DeploymentDetail = deploymentDetail
    expect(typed.sessions.length).toBeGreaterThan(0)
    expect(typed.key).toEqual(EXPECTED_KEYS.sessions)
  })

  it('deployment-scoped periods need the run to be unique', () => {
    const typed: DeploymentBookingPeriodsReport = deploymentBookingPeriods
    expect(typed.periods.length).toBeGreaterThan(0)
    expect(typed.key).toEqual(EXPECTED_KEYS.deploymentPeriods)
  })

  /**
   * Since contract 17 the response declares a key per LIST rather than one for itself, because it
   * carries two: the periods and the fold over them.
   */
  it('run-scoped periods are unique without the run, which is implied', () => {
    const typed: BookingPeriodsReport = runBookingPeriods
    expect(typed.periods.length).toBeGreaterThan(0)
    expect(typed.keys.periods).toEqual(EXPECTED_KEYS.runPeriods)
  })

  it('declares a key for the served fold as well as for the periods', () => {
    const typed: BookingPeriodsReport = runBookingPeriods
    expect(typed.unit_totals.length).toBeGreaterThan(0)
    expect(typed.keys.unit_totals).toEqual(EXPECTED_KEYS.runUnitTotals)
  })

  /**
   * The key that would have been guessed wrong. `position_id` alone repeats in 3 of the 11 runs
   * measured on this machine, and a duplicated row identity is the defect Vue pays for by patching
   * the wrong row. Held here because it is a property of the CONTRACT.
   */
  it('a trade needs its scenario and its exit tick to be one row', () => {
    const typed: TradeHistoryReport = tradeHistory
    expect(typed.keys.trades).toEqual(EXPECTED_KEYS.trades)
  })

  /**
   * The roster — the only list that carries a scenario which produced nothing. Added when the
   * route was first consumed, so a field the backend drops from it fails the build rather than a
   * panel.
   */
  it('the scenario roster still satisfies the mirrored shape', () => {
    const typed: ScenarioDetailsReport = scenarioDetails
    expect(typed.units.length).toBeGreaterThan(0)
    expect(typed.keys.units).toEqual(['name'])
    // contract 14 split the word `data_source`: this half is the BROKER a unit read its ticks from
    expect(typed.keys.data_brokers).toEqual(EXPECTED_KEYS.dataBrokers)
  })

  /**
   * The three sections that had NO fixture when contract 2 renamed max_drawdown to
   * account_max_drawdown. Nothing compared them, so the panels rendered `NaN USD` and every gate
   * stayed green — the type-checker had no shape to check the mirror against. These assignments
   * are that missing comparison: a rename now fails the BUILD.
   */
  it('the run summary still satisfies the mirrored shape', () => {
    const typed: RunSummary = runSummary
    expect(typed.currencies.length).toBeGreaterThan(0)
    // the field that was renamed, read explicitly so the reason for this test stays visible
    expect(typed.currencies[0]?.account_max_drawdown).toBeGreaterThanOrEqual(0)
  })

  it('the portfolio still satisfies the mirrored shape, per unit and in the totals', () => {
    const typed: PortfolioReport = portfolio
    expect(typed.units.length).toBeGreaterThan(0)
    expect(typed.aggregates.length).toBeGreaterThan(0)
    expect(typed.units[0]?.account_max_drawdown).toBeGreaterThanOrEqual(0)
    expect(typed.aggregates[0]?.account_max_drawdown).toBeGreaterThanOrEqual(0)
  })

  it('the warnings and errors section still satisfies the mirrored shape', () => {
    const typed: WarningsErrorsReport = warningsErrors
    expect(typed.outcome).toBeDefined()
  })

  /**
   * `_pct` arrives ALREADY multiplied while `_rate` and `_ratio` arrive as 0..1. Passing one to
   * the other formatter is out by a factor of 100 and still looks like a percentage — we rendered
   * a 3.47 % drawdown as 347.4 %. Held here because it is a property of the CONTRACT, not of a
   * component: if the convention ever flips, this is where it should be noticed.
   */
  it('a _pct field is a percentage and a _rate field is a ratio', () => {
    const currency = (runSummary as RunSummary).currencies[0]
    expect(currency?.win_rate).toBeLessThanOrEqual(1)
    const drawdown = currency?.account_max_drawdown ?? 0
    const equity = currency?.max_equity ?? 1
    // the percentage equals the magnitude over the peak, times 100 — not the bare ratio
    expect(currency?.account_max_dd_pct).toBeCloseTo((drawdown / equity) * 100, 2)
  })

  /**
   * Both configuration shapes, because one route serves two of them: an autotrader profile carries
   * its strategy at the top, a scenario set carries `global` plus a list of scenarios. A fixture of
   * only one would let the other rot unnoticed.
   */
  it('serves two different configuration shapes under one route', () => {
    const live: RunConfigReport = configLive
    const simulation: RunConfigReport = configSimulation
    expect(live.config['strategy_config']).toBeDefined()
    expect(live.config['global']).toBeUndefined()
    expect(simulation.config['global']).toBeDefined()
    expect(simulation.config['scenarios']).toBeDefined()
  })

  it('the trade history still satisfies the mirrored shape', () => {
    const typed: TradeHistoryReport = tradeHistory
    expect(typed.trades.length).toBeGreaterThan(0)
    expect(typed.analytics.length).toBeGreaterThan(0)
    /*
     * The two sign conventions for one quantity, held here because it is a property of the
     * CONTRACT: `mae_pnl` arrives signed on a trade, `largest_mae` as a magnitude in the analytics.
     *
     * ⚠ The current capture has NO adverse excursion — every `mae_pnl` is 0 and so is
     * `largest_mae` — so the equality below is satisfied trivially and this assertion proves less
     * than it did. It is kept because it is the one that would catch a flipped convention, and the
     * gap is recorded rather than hidden: the next capture from a run that actually went against
     * its position restores it.
     */
    const worst = typed.trades.reduce((low, row) => Math.min(low, row.mae_pnl), 0)
    const largest = typed.analytics[0]?.largest_mae ?? -1
    expect(largest).toBeGreaterThanOrEqual(0)
    expect(largest).toBeCloseTo(Math.abs(worst))
  })

  /**
   * The fixtures are only worth having while they still carry the hard cases. Re-capturing them
   * against a quiet deployment would leave every test green and testing nothing — the same failure
   * as a gate with no files in scope, one level up.
   *
   * A re-capture on 2026-09-27 emptied them: the backend then held ONE deployment of ONE session,
   * with no advisory and no change of either kind. The guard fired as designed and the three were
   * skipped rather than weakened, so the gap showed in every run. The backend produced a real
   * four-session history the same afternoon and they are back — except the third, retired below
   * for a reason that is not data.
   */
  it('the captured deployment still exercises the cases the tests rely on', () => {
    const typed: DeploymentDetail = deploymentDetail
    expect(typed.advisory).not.toBeNull()
    expect(typed.sessions.some(session => session.strategy_changed)).toBe(true)
    expect(typed.sessions.some(session => session.operation_changed)).toBe(true)
    // `unfinished` is deliberately NOT asserted here: the regenerated demo carries 0, because the
    // session the generator kills now dies before its run header is written. That render is held
    // by a synthetic case in deployment_panels instead, and the gap is on the backend's list.
  })

  // The staircase the earlier demo could not show: four sessions on four consecutive days rather
  // than four replays of one window. It is what makes the timeline's geometry testable at all.
  it('the captured periods advance instead of repeating one window', () => {
    const typed: DeploymentBookingPeriodsReport = deploymentBookingPeriods
    const opens = typed.periods.map(period => period.opened_at)
    expect(new Set(opens).size).toBeGreaterThan(1)
  })

  /**
   * RETIRED as a data check, kept as a key check — and the difference is the point.
   *
   * It used to assert that `period_no` REPEATS across a deployment, because it did: the floor was
   * persisted before the last period was sealed, so a session booking one period never advanced it.
   * The backend fixed that on 2026-09-23, and a capture made since counts 1…8 straight through, so
   * no fresh data can ever satisfy the old assertion again.
   *
   * What has not changed is the KEY: it still carries `run_id`, because rows written before the fix
   * keep their repeats and nothing back-fills them. So the declaration is what is asserted now —
   * the thing that stays true whichever era a row comes from.
   */
  it('a deployment-scoped period still needs the run in its key', () => {
    const typed: DeploymentBookingPeriodsReport = deploymentBookingPeriods
    expect(typed.key).toContain('run_id')
    expect(typed.periods.length).toBeGreaterThan(1)
  })
})
