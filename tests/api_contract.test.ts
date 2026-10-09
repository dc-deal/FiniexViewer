import { describe, it, expect } from 'vitest'

import runsList from './fixtures/runs_list.json'
import deploymentsList from './fixtures/deployments_list.json'
import deploymentDetail from './fixtures/deployment_detail.json'
import deploymentBookingPeriods from './fixtures/deployment_booking_periods.json'
import runBookingPeriods from './fixtures/run_booking_periods.json'
import runSummary from './fixtures/run_summary.json'
import portfolio from './fixtures/portfolio.json'
import broker from './fixtures/broker.json'
import aggregated from './fixtures/aggregated_portfolio.json'
import pending from './fixtures/pending_orders.json'
import history from './fixtures/order_history.json'
import events from './fixtures/order_events.json'
import eventsLive from './fixtures/order_events_live.json'
import warningsErrors from './fixtures/warnings_errors.json'
import configLive from './fixtures/run_config_live.json'
import configSimulation from './fixtures/run_config_simulation.json'
import tradeHistory from './fixtures/trade_history.json'
import scenarioDetails from './fixtures/scenario_details.json'
import manifest from './fixtures/capture_manifest.json'

import type {
  AggregatedPortfolioReport,
  BookingPeriodsReport,
  BrokerReport,
  OrderEventsReport,
  OrderHistoryReport,
  PendingOrdersReport,
  PortfolioReport,
  RunConfigReport,
  RunListResponse,
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
const EXPECTED_CONTRACT = 25

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
  // one field is enough: a unit name IS a scenario name, and a set with a repeated name is refused
  pendingUnits: ['name'],
  brokers: ['broker_type'],
  // the stream declares a key PER LIST and both read the same: `seq` counts one unit's lines
  // and never repeats inside it, across both lists together
  streamEvents: ['scenario_name', 'seq'],
  streamBrokerTruth: ['scenario_name', 'seq'],
  // the portfolio's two lists — one row per scenario, one per account currency. `units` is what
  // the roster joins on, which is why it is a documented foreign key rather than a guess.
  portfolioUnits: ['name'],
  portfolioAggregates: ['currency'],
  // the run summary's two: its per-currency KPIs, and the units it declared and produced nothing for
  summaryCurrencies: ['currency'],
  summaryUnitsAbsent: ['name'],
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
    expect(typed.keys.currencies).toEqual(EXPECTED_KEYS.summaryCurrencies)
    expect(typed.keys.units_absent).toEqual(EXPECTED_KEYS.summaryUnitsAbsent)
  })

  it('the portfolio still satisfies the mirrored shape, per unit and in the totals', () => {
    const typed: PortfolioReport = portfolio
    expect(typed.units.length).toBeGreaterThan(0)
    expect(typed.aggregates.length).toBeGreaterThan(0)
    expect(typed.units[0]?.account_max_drawdown).toBeGreaterThanOrEqual(0)
    expect(typed.aggregates[0]?.account_max_drawdown).toBeGreaterThanOrEqual(0)
    expect(typed.keys.units).toEqual(EXPECTED_KEYS.portfolioUnits)
    expect(typed.keys.aggregates).toEqual(EXPECTED_KEYS.portfolioAggregates)
  })

  /**
   * The broker conditions, and the one value in here that must never be read as a figure: a spot
   * broker declares `margin_mode: 'none'` and its two margin LEVELS arrive as 0.0. That zero is
   * the absence of a regime, not a level of zero, and the panel gates on the mode for exactly that
   * reason. Held here because it is a property of the CONTRACT rather than of the component.
   */
  it('the broker section still satisfies the mirrored shape', () => {
    const typed: BrokerReport = broker
    expect(typed.key).toEqual(EXPECTED_KEYS.brokers)
    expect(typed.units.length).toBeGreaterThan(0)
    for (const unit of typed.units) {
      expect(unit.symbols.length).toBeGreaterThan(0)
      expect(unit.scenarios.length).toBeGreaterThan(0)
    }
    /*
     * BOTH account models in one capture, which is what the 2026-10-08 run added: the earlier one
     * traded spot only, so the margin half of this panel had no fixture at all.
     *
     * The spot unit is the reason this test exists. It declares `margin_mode: 'none'` and both
     * margin LEVELS arrive as 0.0 — that zero is the ABSENCE of a regime, not a level of zero, and
     * the panel gates on the mode for exactly that reason. The margin unit beside it shows what a
     * stated regime looks like, so a reader of this test can tell the two apart.
     */
    const margin = typed.units.find(unit => unit.broker_type === 'mt5')!
    expect(margin.margin_mode).toBe('retail_hedging')
    expect(margin.margin_call_level).toBe(50)
    expect(margin.stopout_level).toBe(20)
    expect(margin.leverage).toBe(500)
    expect(margin.hedging_allowed).toBe(true)

    const spot = typed.units.find(unit => unit.broker_type === 'kraken_spot')!
    expect(spot.margin_mode).toBe('none')
    expect(spot.margin_call_level).toBe(0)
    expect(spot.stopout_level).toBe(0)
    expect(spot.leverage).toBe(1)
    expect(spot.hedging_allowed).toBe(false)
  })

  /**
   * The aggregated fold. Two things here are structure rather than data, and reading either as the
   * other invents a run: `margin` and `spot` are the two HALVES of a currency that holds both
   * account models, and they are null where it holds one — not "nothing traded". And
   * `headline.final_equity` is ONE account's figure, null over several, the same rule run-summary
   * states.
   */
  it('the aggregated portfolio still satisfies the mirrored shape', () => {
    const typed: AggregatedPortfolioReport = aggregated
    expect(typed.currencies.length).toBeGreaterThan(0)
    const row = typed.currencies[0]!
    expect(row.scenario_names.length).toBe(row.scenario_count)
    expect(row.is_mixed).toBe(false)
    expect(row.margin).toBeNull()
    expect(row.spot).toBeNull()
    expect(row.combined.headline.final_equity).toBeNull()
    // the three figures this fold carries and run-summary does not
    expect(row.combined.highest_equity).toBeGreaterThan(0)
    expect(row.combined.highest_equity_scenario).not.toBe('')
    expect(row.combined.final_balance).toBeGreaterThan(0)
  })

  /**
   * The gap this used to STATE is closed, and the test that stated it is gone rather than kept.
   *
   * It asserted that every `mae_pnl` in the capture was `0.0` — true while the captured run traded
   * spot and predated contract 18, where an open position's excursion was measured only at entry
   * and close. Its own note said a re-capture would close this and fail the assertion, *"which is
   * the point: it is then removed rather than quietly kept."* The 2026-10-08 capture carries real
   * excursions, worst `-2.84`, so this is that removal — and the assertion below is what replaces
   * it, because it now proves something instead of being satisfied trivially.
   */
  it('carries a real adverse excursion, so the sign convention is fixture-driven', () => {
    const typed: TradeHistoryReport = tradeHistory
    expect(typed.trades.length).toBeGreaterThan(0)
    // SIGNED on a trade: an excursion against the position is negative, never a magnitude
    const worst = typed.trades.reduce((low, row) => Math.min(low, row.mae_pnl), 0)
    expect(worst).toBeLessThan(0)
  })

  /**
   * The pending orders, and TWO properties of the contract rather than of a component.
   *
   * The counts are a funnel: `submitted = accepted + rejected + never_confirmed + expired`,
   * measured 2026-10-08 on all 230 units across 44 runs without exception. Every name in it changed
   * with contract 23 — `resolved` → `submitted`, `filled` → `accepted` because the old name claimed
   * a fill where an order had only ARRIVED, `timed_out` → `never_confirmed`, `force_closed` →
   * `expired`. The panel renders the parts and computes nothing from the identity; this is where it
   * is checked, so a backend change to the arithmetic is noticed here rather than guessed at from a
   * screen.
   *
   * And the route DECLARES its key since contract 19 — it was the one list route this app consumed
   * without one. A unit name is a scenario name, and a scenario set whose names repeat is refused
   * at validation, which is why one field is enough where `trades` needs three.
   */
  it('the pending orders still satisfy the mirrored shape', () => {
    const typed: PendingOrdersReport = pending
    expect(typed.units.length).toBeGreaterThan(0)
    for (const row of typed.units) {
      expect(row.total_accepted + row.total_rejected
        + row.total_never_confirmed + row.total_expired).toBe(row.total_submitted)
    }
    expect(typed.key).toEqual(EXPECTED_KEYS.pendingUnits)
  })

  /**
   * The order history, and THREE properties of the contract.
   *
   * It is the one list route with no declared key, and that is the backend's answer rather than an
   * omission: a row is a lifecycle RECORD and one order appears as several. Asserted so that a key
   * appearing — the ordinal field planned in testingide#557 — is loud rather than silent.
   *
   * Its scenario names must be a SUBSET of the pending units, because the panel joins on them. Not
   * equality: a scenario whose every order was refused before the queue appears here and not there.
   *
   * And `event_time` carries the contract-20 rename. Finding `execution_time` on these rows again
   * would mean a response from before it, which this mirror does not support (CLAUDE.md §21).
   */
  /**
   * The order event stream, and the four properties that make a faithful DISPLAY possible.
   *
   * Two captures, because one cannot carry both halves. The narrowed one is what the panel asks
   * for — one position of the simulation — and a narrowed answer holds no `broker_truth` at all by
   * design. The live one is unnarrowed, and it is the only place a venue was ever asked: a backtest
   * has no venue to ask, its own book IS the venue.
   */
  /**
   * The purpose vocabulary, because the run picker NAMES it rather than deriving it.
   *
   * The list opens with everything except `fixture`, and that default is written as the three
   * values to keep. A fourth purpose would therefore be hidden silently — which is the kind of
   * narrowing nobody notices. This is the guard: a word we do not know turns the suite red.
   */
  it('serves no run purpose the picker does not know', () => {
    const typed: RunListResponse = runsList
    const known = new Set(['regular', 'fixture', 'certificate'])
    const unknown = [...new Set(typed.runs.map(row => row.run_purpose))]
      .filter(value => value !== null && !known.has(value))
    expect(unknown).toEqual([])
    // and the three are not theoretical: the archive carries each of them
    const served = new Set(typed.runs.map(row => row.run_purpose))
    expect(served.has('fixture')).toBe(true)
    expect(served.has('regular')).toBe(true)
  })

  it('the order event stream still satisfies the mirrored shape', () => {
    const narrowed: OrderEventsReport = events
    const live: OrderEventsReport = eventsLive

    for (const typed of [narrowed, live]) {
      expect(typed.events.length).toBeGreaterThan(0)
      expect(typed.count).toBe(typed.events.length)
      expect(typed.keys.events).toEqual(EXPECTED_KEYS.streamEvents)
      expect(typed.keys.broker_truth).toEqual(EXPECTED_KEYS.streamBrokerTruth)
      // nothing was cut off, so every assertion below reads a complete stream
      expect(typed.truncated_tail).toBe(false)
      // `seq` IS the order of the stream within a unit, and it is what a reader must be shown in
      expect(typed.events.map(row => row.seq)).toEqual([...typed.events.map(row => row.seq)].sort(
        (a, b) => a - b
      ))
      expect(typed.events.every(row => row.record_plane === 'bot')).toBe(true)
    }

    // ONE position, SEVERAL orders: `submitted_seq` is what identifies an order, and the partial
    // close is the case that proves the difference — four orders under one position id, where
    // `order_id` alone would have read as one thing.
    const orders = new Set(narrowed.events.map(row => row.submitted_seq))
    expect(orders.size).toBe(4)
    expect(new Set(narrowed.events.map(row => row.order_id)).size).toBe(1)
    expect(narrowed.broker_truth).toEqual([])

    // WHY a reader must never be shown this sorted by time: a backtest takes and fills a market
    // order in one instant, so the stamps repeat and a time sort would leave their order to chance.
    const stamps = narrowed.events.map(row => row.event_time)
    expect(new Set(stamps).size).toBeLessThan(stamps.length)

    // A `denied` order was never submitted and carries no submission to belong to. Their sentence,
    // and it is why the grouping has to survive a null rather than treat it as a missing value.
    const denied = live.events.filter(row => row.event_type === 'denied')
    expect(denied.length).toBeGreaterThan(0)
    expect(denied.every(row => row.submitted_seq === null)).toBe(true)

    // The venue's own lines, which exist on a live session only. A part has THREE states and the
    // capture carries two of them: a value (`[]` — the venue holds no open order) and a null that
    // means "this line does not read that part" — positions, on a spot account. The third, a null
    // WITH the part named in `unread_parts`, has no case in this capture.
    expect(live.broker_truth.length).toBeGreaterThan(0)
    for (const row of live.broker_truth) {
      expect(row.record_plane).toBe('broker_truth')
      expect(['session_start', 'session_end', 'reconcile']).toContain(row.read_reason)
      expect(row.unread_parts).toEqual([])
    }
  })

  it('the order history still satisfies the mirrored shape', () => {
    const typed: OrderHistoryReport = history
    expect(typed.orders.length).toBeGreaterThan(0)
    expect(typed.count).toBe(typed.orders.length)

    expect('key' in typed).toBe(false)
    expect('keys' in typed).toBe(false)

    const units = new Set((pending as PendingOrdersReport).units.map(unit => unit.name))
    const orphans = typed.orders
      .map(row => row.scenario_name)
      .filter(name => !units.has(name))
    expect(orphans).toEqual([])

    for (const row of typed.orders) {
      expect(row).toHaveProperty('event_time')
      expect(row).not.toHaveProperty('execution_time')
    }
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
     * The 2026-10-08 capture carries a real excursion, worst `-2.84`, so the equality below is no
     * longer satisfied trivially: it compares a signed trade figure against an unsigned analytics
     * magnitude and would catch either convention flipping. It had been trivial for as long as the
     * captured run traded spot and predated contract 18 — the warning that said so is gone with
     * the gap.
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
