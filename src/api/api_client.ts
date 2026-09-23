import axios from 'axios'
import { ArtifactUnreadableError } from '@/api/artifact_unreadable_error'
import { RunIdMismatchError } from '@/api/run_id_mismatch_error'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import type { BrokerList, SymbolList } from '@/types/api/broker_types'
import type { CoverageResponse, ApiBar } from '@/types/api/bar_types'
import type { TimeframeList } from '@/types/api/timeframe_types'
import type {
  BookingPeriodsReport,
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

export async function getRuns(): Promise<RunInfo[]> {
  const response = await http.get<RunListResponse>('/reports/runs')
  return response.data.runs
}

/**
 * Run summary for one run. Returns null when the run carries no run-summary artifact —
 * the backend answers 404 for that case, which is an absence, not a failure.
 */
export async function getRunSummary(runId: string): Promise<RunSummary | null> {
  try {
    const response = await http.get<RunSummary>(`/reports/runs/${runId}/run-summary`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}

/**
 * Warnings and errors of a run. Null when the run carries no such artifact — an absence. Raises
 * ArtifactUnreadableError on 409, which the backend answers for an artifact written by an older
 * schema: it is there, it cannot be parsed, and the run has to be repeated.
 */
export async function getWarningsErrors(runId: string): Promise<WarningsErrorsReport | null> {
  try {
    const response = await http.get<WarningsErrorsReport>(
      `/reports/runs/${runId}/warnings-errors`
    )
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error
    if (error.response?.status === 404) return null
    if (error.response?.status === 409) {
      const body = error.response.data as { detail?: string } | undefined
      throw new ArtifactUnreadableError(body?.detail ?? 'The artifact could not be read')
    }
    throw error
  }
}

/** Per-unit portfolio breakdown of a run. Null when the run carries no such artifact. */
export async function getPortfolio(runId: string): Promise<PortfolioReport | null> {
  try {
    const response = await http.get<PortfolioReport>(`/reports/runs/${runId}/portfolio`)
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
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
export async function getBookingPeriods(runId: string): Promise<BookingPeriodsReport | null> {
  try {
    const response = await http.get<BookingPeriodsReport>(
      `/reports/runs/${runId}/booking-periods`
    )
    return assertBelongsTo(runId, response.data)
  } catch (error) {
    raiseIfForbidden(error, 'reports')
    if (!axios.isAxiosError(error)) throw error
    if (error.response?.status === 404) return null
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
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}
