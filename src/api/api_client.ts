import axios from 'axios'
import { ArtifactUnreadableError } from '@/api/artifact_unreadable_error'
import { RunIdMismatchError } from '@/api/run_id_mismatch_error'
import { RunNotFoundError } from '@/api/run_not_found_error'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import type { BrokerList, SymbolList } from '@/types/api/broker_types'
import type { CoverageResponse, ApiBar } from '@/types/api/bar_types'
import type { CallerIdentity } from '@/types/api/caller_types'
import type { SectionAbsence } from '@/types/api/absence_types'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'
import type { TimeframeList } from '@/types/api/timeframe_types'
import type {
  BookingPeriodsReport,
  RunConfigReport,
  TradeHistoryReport,
  AggregatedPortfolioReport,
  BrokerReport,
  OrderHistoryReport,
  PendingOrdersReport,
  PortfolioReport,
  RunInfo,
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

export async function getBars(
  broker: string,
  symbol: string,
  timeframe: string,
  from: string,
  to: string
): Promise<ApiBar[]> {
  const response = await http.get<ApiBar[]>(
    `/brokers/${broker}/symbols/${symbol}/bars`,
    { params: { timeframe, from, to } }
  )
  return response.data
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
    if (!axios.isAxiosError(error)) throw error
    const absence = absenceFrom(error)
    if (absence) return absence
    if (error.response?.status === 409) {
      const body = error.response.data as { detail?: string } | undefined
      throw new ArtifactUnreadableError(body?.detail ?? 'The artifact could not be read')
    }
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
    if (!axios.isAxiosError(error)) throw error
    const absence = absenceFrom(error)
    if (absence) return absence
    if (error.response?.status === 409) {
      const body = error.response.data as { detail?: string } | undefined
      throw new ArtifactUnreadableError(body?.detail ?? 'The artifact could not be read')
    }
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
