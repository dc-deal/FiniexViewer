import axios from 'axios'
import { ArtifactUnreadableError } from '@/api/artifact_unreadable_error'
import { RunIdMismatchError } from '@/api/run_id_mismatch_error'
import { RunNotFoundError } from '@/api/run_not_found_error'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import type { BrokerList, SymbolList } from '@/types/api/broker_types'
import type { ApiBar, BarAnswer, CoverageResponse } from '@/types/api/bar_types'
import type { CallerIdentity } from '@/types/api/caller_types'
import type { ActivityList, MachineResources } from '@/types/api/machine_types'
import type { SectionAbsence } from '@/types/api/absence_types'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'
import type { StateFramesLatest } from '@/types/api/state_frame_types'
import type { ValidationCheckList } from '@/types/api/validation_check_types'
import type { SweepDetail, SweepList } from '@/types/api/sweep_types'
import type { TimeframeList } from '@/types/api/timeframe_types'
import type {
  BookingPeriodsReport,
  RunConfigReport,
  TradeHistoryReport,
  AggregatedPortfolioReport,
  BrokerReport,
  OrderEventsReport,
  OrderHistoryReport,
  PendingOrdersReport,
  PortfolioReport,
  RunInfo,
  RunHeader,
  RunListResponse,
  RunSummary,
  WarningsErrorsReport,
} from '@/types/api/report_types'
import type {
  DeploymentBookingPeriodsReport,
  DeploymentDetail,
  DeploymentListResponse,
} from '@/types/api/deployment_types'

const http = axios.create({
  baseURL: '/api/v1'
})

/**
 * The contract the server stamped on its latest answer. Every response carries it in
 * `X-Api-Contract`, a refusal included, so a server restarted under another contract shows on the
 * next request rather than on a reload. Held here as well as handed on, so a listener registered
 * after the first answer still learns it.
 */
let lastStamp: number | null = null
let stampListener: (contract: number) => void = () => {}

/** Hands every stamp to `listener`, starting with the one already seen. */
export function onContractStamp(listener: (contract: number) => void): void {
  stampListener = listener
  if (lastStamp !== null) listener(lastStamp)
}

function noteStamp(headers: unknown): void {
  const raw = (headers as Record<string, unknown> | undefined)?.['x-api-contract']
  const stamp = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  // an answer without the header — none from this server, but a mock may send none
  if (Number.isNaN(stamp)) return
  lastStamp = stamp
  stampListener(stamp)
}

http.interceptors.response.use(
  response => {
    noteStamp(response.headers)
    return response
  },
  (error: unknown) => {
    if (axios.isAxiosError(error)) noteStamp(error.response?.headers)
    return Promise.reject(error)
  },
)

export async function getTimeframes(): Promise<TimeframeList> {
  const response = await http.get<{ timeframes: TimeframeList }>('/timeframes')
  return response.data.timeframes
}

export async function getBrokers(): Promise<BrokerList> {
  const response = await http.get<{ brokers: BrokerList }>('/brokers')
  return response.data.brokers
}

export async function getSymbols(broker: string): Promise<SymbolList> {
  const response = await http.get<{ symbols: SymbolList }>(`/brokers/${broker}/symbols`)
  return response.data.symbols
}

export async function getCoverage(broker: string, symbol: string): Promise<CoverageResponse> {
  const response = await http.get<CoverageResponse>(`/brokers/${broker}/symbols/${symbol}/coverage`)
  return response.data
}

/**
 * A market's coverage, or null where the archive holds none for it — a symbol the server does not
 * know and one it knows with no bars indexed both answer `404` (their `market-data` document).
 */
export async function findCoverage(broker: string, symbol: string): Promise<CoverageResponse | null> {
  try {
    return await getCoverage(broker, symbol)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}

export async function getBars(
  broker: string,
  symbol: string,
  timeframe: string,
  from: string,
  to: string
): Promise<BarAnswer> {
  const response = await http.get<ApiBar[]>(
    `/brokers/${broker}/symbols/${symbol}/bars`,
    { params: { timeframe, from, to } }
  )
  return {
    bars: response.data,
    truncated: String(response.headers?.['x-bar-truncated']) === 'true',
    priceBasis: String(response.headers?.['x-bar-price-basis'] ?? ''),
  }
}

/**
 * Confirms a report body belongs to the run that was asked for. Cheap, and the only thing that
 * catches a duplicated run_id: the index says the id exists, the route resolves it to whichever
 * run it finds first, and nothing else in the payload would give that away.
 */
function assertBelongsTo<T extends { run_id: string }>(requested: string, body: T): T {
  if (body.run_id !== requested) throw new RunIdMismatchError(requested, body.run_id)
  return body
}

/**
 * Turns a 404 into the ABSENCE it describes, keeping the cause and the backend's own sentence.
 *
 * Every section answer used to collapse to `null` here, which threw away the only thing that made
 * four different situations distinguishable. Anything that is not a 404 is still an error and is
 * re-thrown by the caller.
 */
function absenceFrom(error: unknown): SectionAbsence | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 404) return null
  const body = error.response.data as { error?: string, detail?: string } | undefined
  return { absent: true, cause: body?.error ?? 'unknown', detail: body?.detail ?? '' }
}

/**
 * Turns a 409 into the STALE ARTIFACT it describes: the file is there and no longer matches the
 * backend's model — usually its age — and the run has to be repeated. A state of the run, never an
 * outage, and one the backend answers for ANY report artifact (`errors`: "a report artifact exists
 * but no longer matches its model"). Three routes mapped it until 2026-10-14; on the others a 409
 * read as a failure and showed `Request failed with status code 409` instead of their sentence.
 */
function raiseIfUnreadable(error: unknown, fallback = 'The artifact could not be read'): void {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return
  const body = error.response.data as { detail?: string } | undefined
  throw new ArtifactUnreadableError(body?.detail ?? fallback)
}

export async function getRuns(): Promise<RunInfo[]> {
  const response = await http.get<RunListResponse>('/reports/runs')
  return response.data.runs
}

/**
 * Run summary for one run. Returns null when the run carries no run-summary artifact —
 * the backend answers 404 for that case, which is an absence, not a failure.
 */
export async function getRunSummary(runId: string): Promise<RunSummary | SectionAbsence> {
  try {
    const response = await http.get<RunSummary>(`/reports/runs/${runId}/run-summary`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/**
 * Warnings and errors of a run. Null when the run carries no such artifact — an absence. Raises
 * ArtifactUnreadableError on 409, which the backend answers for an artifact written by an older
 * schema: it is there, it cannot be parsed, and the run has to be repeated.
 */
export async function getWarningsErrors(runId: string): Promise<WarningsErrorsReport | SectionAbsence> {
  try {
    const response = await http.get<WarningsErrorsReport>(
      `/reports/runs/${runId}/warnings-errors`
    )
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/** Per-unit portfolio breakdown of a run. Null when the run carries no such artifact. */
export async function getPortfolio(runId: string): Promise<PortfolioReport | SectionAbsence> {
  try {
    const response = await http.get<PortfolioReport>(`/reports/runs/${runId}/portfolio`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/**
 * What the run came to, folded over its scenarios by the backend. An AutoTrader session omits the
 * section entirely, so the absence is ordinary structure here as everywhere else.
 */
export async function getAggregatedPortfolio(
  runId: string
): Promise<AggregatedPortfolioReport | SectionAbsence> {
  try {
    const response = await http.get<AggregatedPortfolioReport>(
      `/reports/runs/${runId}/aggregated-portfolio`
    )
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/**
 * What became of a run's pending orders, per scenario, and what is still open. An AutoTrader
 * session omits the section, so the absence is ordinary structure here as everywhere else.
 */
export async function getPendingOrders(
  runId: string
): Promise<PendingOrdersReport | SectionAbsence> {
  try {
    const response = await http.get<PendingOrdersReport>(`/reports/runs/${runId}/pending-orders`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/**
 * Every order a run placed, as the lifecycle records they are. The companion to `pending-orders`:
 * that route states what became of a scenario's orders, this one states the orders themselves.
 *
 * Deliberately UNFILTERED. The route takes a `symbol`, and the panel groups by scenario — one
 * scenario is one symbol, so the parameter would narrow nothing a reader asked for.
 */
export async function getOrderHistory(
  runId: string
): Promise<OrderHistoryReport | SectionAbsence> {
  try {
    const response = await http.get<OrderHistoryReport>(`/reports/runs/${runId}/order-history`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/**
 * The STEPS of an order, which `order-history` does not keep: it has a row for the submission and
 * one for each way an order ended, and their own words for the difference are *"what happened in
 * between is missing there"*.
 *
 * NARROWED on purpose, and it is the route itself that offers it. One position costs 3 KB where
 * the whole run costs 138 KB (measured 2026-10-08 on the field study), and a reader opens one
 * position at a time. A narrowed answer also carries no `broker_truth` - no line of that list is
 * about one order - which is correct rather than a loss.
 *
 * Two refusals, both ordinary: 404 where the run wrote no stream, which is every run from before
 * the stream existed and every backtest whose scenarios never placed an order, and 409 where the
 * stream is in an older form and the run has to be repeated.
 */
export async function getOrderEvents(
  runId: string,
  scenarioName: string,
  orderId: string
): Promise<OrderEventsReport | SectionAbsence> {
  try {
    const response = await http.get<OrderEventsReport>(
      `/reports/runs/${runId}/order-events`,
      { params: { scenario_name: scenarioName, order_id: orderId } }
    )
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error, 'The stream could not be read')
    throw error
  }
}

/**
 * The record a run wrote before it did anything else. **The one route that answers for a run
 * carrying no report artifacts at all** — measured 2026-10-10 on all three logs-only runs here,
 * 200 with an empty `artifacts`. It is therefore asked for ungated, the way the configuration is,
 * rather than behind the artifact list, which does not name it.
 *
 * `run_header_missing` (404) is its own absence: the index lists the run and the file is gone.
 * `artifact_unreadable` (409) keeps its one meaning — the file is there and no longer matches
 * their model — and on this route its detail names the failing fields.
 */
export async function getRunHeader(runId: string): Promise<RunHeader | SectionAbsence> {
  try {
    const response = await http.get<RunHeader>(`/reports/runs/${runId}/header`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/**
 * The brokers a run traded through. One of the nine report routes this app did not consume until
 * the portfolio panel was replaced by it — an AutoTrader session omits the section, so the absence
 * is as normal here as anywhere else.
 */
export async function getBroker(runId: string): Promise<BrokerReport | SectionAbsence> {
  try {
    const response = await http.get<BrokerReport>(`/reports/runs/${runId}/broker`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/** Every validation check the backend can report, with what it means — the catalogue a warning names. */
export async function getValidationChecks(): Promise<ValidationCheckList> {
  const response = await http.get<ValidationCheckList>('/validation-checks')
  return response.data
}

/**
 * How a running session stands: the latest state frame of each unit, how old it is and whether the
 * session still records (contract 38). Asked once a cadence, never faster — a frame is written once
 * per `cadence_s`, so asking sooner returns the same one. Its 404s are absences like any section's:
 * `state_frames_not_recorded` (a backtest, or a session from before they were recorded) and
 * `state_frame_not_written_yet` (the stream is open, its first frame not written); its 409 a stream
 * that cannot be read. The answer names no run, so there is nothing to hold it against.
 */
export async function getLatestStateFrames(runId: string): Promise<StateFramesLatest | SectionAbsence> {
  try {
    const response = await http.get<StateFramesLatest>(`/reports/runs/${runId}/state-frames/latest`)
    return response.data
  } catch (error) {
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error, 'The state frames could not be read')
    throw error
  }
}

/**
 * Maps a refusal that is about ACCESS rather than about the resource. A 403 means the token is
 * valid and carries nothing on this surface — neither an absence nor an outage, and repeating the
 * request will not help. The backend's own text names every grant the token holds, so the surface
 * is passed instead of that text.
 */
function raiseIfForbidden(error: unknown, surface: string): void {
  if (!axios.isAxiosError(error)) return
  if (error.response?.status === 403) throw new SurfaceForbiddenError(surface)
}

/**
 * Booking periods of one run — the bookkeeping stretches it was divided into. Null when the run
 * carries no such artifact, which is every run from before the journal existed: nothing is
 * back-filled. Raises ArtifactUnreadableError on 409, like every other stored artifact.
 */
export async function getBookingPeriods(runId: string): Promise<BookingPeriodsReport | SectionAbsence> {
  try {
    const response = await http.get<BookingPeriodsReport>(
      `/reports/runs/${runId}/booking-periods`
    )
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    raiseIfForbidden(error, 'reports')
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/** Every deployment the ledger knows, one row per (deployment x account currency). */
export async function getDeployments(): Promise<DeploymentListResponse> {
  try {
    const response = await http.get<DeploymentListResponse>('/deployments')
    return response.data
  } catch (error) {
    raiseIfForbidden(error, 'deployments')
    throw error
  }
}

/**
 * The sessions of one deployment, oldest first. Null when the ledger does not know the id — the
 * same absence a removed run produces, not a failure.
 */
export async function getDeployment(deploymentId: string): Promise<DeploymentDetail | null> {
  try {
    const response = await http.get<DeploymentDetail>(`/deployments/${deploymentId}`)
    return response.data
  } catch (error) {
    raiseIfForbidden(error, 'deployments')
    // A deployment's absence is a different question from a report section's — an unknown id is a
    // stale link, which `deployments_store` already renders as its own state. Left as null on
    // purpose rather than folded into the section mechanism.
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}

/**
 * Every booking period of every session of one deployment, in one call rather than one request
 * per session. Deliberately carries no reconciliation figures — that check is run-scoped.
 */
export async function getDeploymentBookingPeriods(
  deploymentId: string
): Promise<DeploymentBookingPeriodsReport | null> {
  try {
    const response = await http.get<DeploymentBookingPeriodsReport>(
      `/deployments/${deploymentId}/booking-periods`
    )
    return response.data
  } catch (error) {
    raiseIfForbidden(error, 'deployments')
    // A deployment's absence is a different question from a report section's — an unknown id is a
    // stale link, which `deployments_store` already renders as its own state. Left as null on
    // purpose rather than folded into the section mechanism.
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}

/** Every parameter search on record, newest first — the third plane beside runs and deployments. */
export async function getSweeps(): Promise<SweepList> {
  try {
    const response = await http.get<SweepList>('/sweeps')
    return response.data
  } catch (error) {
    raiseIfForbidden(error, 'sweeps')
    throw error
  }
}

/**
 * One sweep's combinations, ranked by the route within each currency. Null when the ledger knows
 * no such sweep (`404 sweep_not_found`): a stale link, rendered as its own state like a deployment's.
 */
export async function getSweep(sweepId: string): Promise<SweepDetail | null> {
  try {
    const response = await http.get<SweepDetail>(`/sweeps/${sweepId}`)
    return response.data
  } catch (error) {
    raiseIfForbidden(error, 'sweeps')
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}

/**
 * The configuration a run was commissioned with, resolved from the run-config store.
 *
 * The route answers 404 for two different things and they are not interchangeable:
 *
 *   config_snapshot_missing   the run exists and predates the store, so it carries no id to
 *                             resolve through — an absence, mapped to null like any other
 *                             section a run does not have
 *   run_not_found             the backend does not know this run AT ALL, although our index just
 *                             named it. That is the two indexes disagreeing, and swallowing it as
 *                             "no section" would hide it behind a blank panel
 *
 * The distinction is only in the body, so it is read there rather than inferred from the status.
 */
export async function getRunConfig(runId: string): Promise<RunConfigReport | SectionAbsence> {
  try {
    const response = await http.get<RunConfigReport>(`/reports/runs/${runId}/config`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    raiseIfForbidden(error, 'reports')
    if (!axios.isAxiosError(error)) throw error
    if (error.response?.status !== 404) throw error
    const body = error.response.data as { error?: string } | undefined
    if (body?.error === 'run_not_found') throw new RunNotFoundError(runId)
    return absenceFrom(error) ?? { absent: true, cause: 'unknown', detail: '' }
  }
}

/** Every closed position of a run, with its excursion statistics. Null when the run has none. */
export async function getTradeHistory(runId: string): Promise<TradeHistoryReport | SectionAbsence> {
  try {
    const response = await http.get<TradeHistoryReport>(`/reports/runs/${runId}/trade-history`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    raiseIfForbidden(error, 'reports')
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/**
 * The ROSTER of a run — every scenario it declared, including those that produced nothing, each
 * with its reason. Backtests only: an AutoTrader session has no scenario grid and the route answers 404,
 * which is an absence here, not a failure.
 */
export async function getScenarioDetails(runId: string): Promise<ScenarioDetailsReport | SectionAbsence> {
  try {
    const response = await http.get<ScenarioDetailsReport>(
      `/reports/runs/${runId}/scenario-details`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    raiseIfForbidden(error, 'reports')
    const absence = absenceFrom(error)
    if (absence) return absence
    raiseIfUnreadable(error)
    throw error
  }
}

/**
 * Who the server takes this client to be. Needs the bearer while gating is on but no grant, so it
 * answers for every consumer — and it is the one route whose 200 says nothing on its own: read
 * `enforced` before any identity field.
 *
 * Deliberately NOT cached: an account or a grant changes on the backend only across a restart of
 * its process, and a restart is invisible from here — no response carries a boot id or a start
 * time (confirmed by the backend 2026-09-25). The caller re-reads instead.
 */
export async function getCaller(): Promise<CallerIdentity> {
  const response = await http.get<CallerIdentity>('/caller')
  return response.data
}

/**
 * A reading the server makes in a fraction of a millisecond. One still unanswered after this long
 * is given up, so a hung request cannot hold up the next poll.
 */
const MACHINE_READ_TIMEOUT_MS = 4000

/**
 * How full the machine is (contract 31), on the `machine` surface since contract 35. Meant to be
 * asked every few seconds — the route reads no file of the project, and costs the server next to
 * nothing.
 */
export async function getMachineResources(): Promise<MachineResources> {
  const response = await http.get<MachineResources>('/machine-resources', { timeout: MACHINE_READ_TIMEOUT_MS })
  return response.data
}

/**
 * What runs on the machine (contract 35) — made to be asked every few seconds; a reading costs the
 * server about a tenth of a second. A 403 is the `machine` surface missing from the token. A list
 * that exists and cannot be read is a `500 activity_registry_unreadable` — "could not read" is not
 * "nothing runs" — and its sentence is passed on as it is written.
 */
export async function getActivities(): Promise<ActivityList> {
  try {
    const response = await http.get<ActivityList>('/activities', { timeout: MACHINE_READ_TIMEOUT_MS })
    return response.data
  } catch (error) {
    raiseIfForbidden(error, 'machine')
    const sentence = axios.isAxiosError(error) ? (error.response?.data as { detail?: string } | undefined)?.detail : undefined
    if (sentence) throw new Error(sentence)
    throw error
  }
}
