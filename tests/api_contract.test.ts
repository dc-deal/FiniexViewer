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
import manifest from './fixtures/capture_manifest.json'

import type {
  BookingPeriodsReport,
  PortfolioReport,
  RunListResponse,
  RunConfigReport,
  RunSummary,
  WarningsErrorsReport,
} from '@/types/api/report_types'
import type {
  DeploymentBookingPeriodsReport,
  DeploymentDetail,
  DeploymentListResponse,
} from '@/types/api/deployment_types'

/**
 * The contract this code was written against. The backend stamps every response with
 * `X-Api-Contract`, and the fixtures below were captured under the number recorded in their
 * manifest. Re-capturing them against a newer backend therefore fails HERE rather than in
 * production, which is the whole point of the header: the assertion stays local and needs no
 * connection to the backend to run.
 *
 * Raise it only together with reading `GET /api/v1/contract`, whose `changes` list says what moved.
 */
const EXPECTED_CONTRACT = 3

/**
 * What each list declares about its own row identity. Keying on the obvious field is wrong in
 * three of these five cases, so the tuples are asserted rather than assumed — a deployment row is
 * one per (deployment x currency), and a booking period's segment_no restarts per bot.
 */
const EXPECTED_KEYS = {
  runs: ['run_id'],
  deployments: ['deployment_id', 'currency'],
  sessions: ['run_id', 'currency'],
  deploymentPeriods: ['run_id', 'unit_name', 'segment_no'],
  runPeriods: ['unit_name', 'segment_no'],
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

  it('run-scoped periods are unique without the run, which is implied', () => {
    const typed: BookingPeriodsReport = runBookingPeriods
    expect(typed.periods.length).toBeGreaterThan(0)
    expect(typed.key).toEqual(EXPECTED_KEYS.runPeriods)
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

  /**
   * The fixtures are only worth having while they still carry the hard cases. Re-capturing them
   * against a quiet deployment would leave every test green and testing nothing — the same failure
   * as a gate with no files in scope, one level up.
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

  // The trap the backend warned about, held by a fixture rather than by a comment: across a
  // deployment the same segment number recurs, so a component keying on it alone folds rows.
  it('segment_no alone does not identify a period across a deployment', () => {
    const typed: DeploymentBookingPeriodsReport = deploymentBookingPeriods
    const numbers = typed.periods.map(period => period.segment_no)
    expect(numbers.length).toBeGreaterThan(new Set(numbers).size)
  })
})
