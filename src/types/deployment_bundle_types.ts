import type {
  DeploymentBookingPeriodsReport, DeploymentDetail, DeploymentRow, DeploymentSessionRow,
} from '@/types/api/deployment_types'

/**
 * What the deployment bundle's members are handed (viewer#43) — the panel contract: a member
 * receives its model and never fetches.
 */

/** The sessions member: the deployment's own line, and each currency's header and sessions. */
export interface DeploymentSessionsModel {
  detail: DeploymentDetail
  /** The chosen deployment's ledger rows — one per account currency. */
  rows: DeploymentRow[]
}

/** The booking periods member: every session's periods on one clock. */
export interface DeploymentPeriodsModel {
  periods: DeploymentBookingPeriodsReport
  /** The sessions the periods are laid out by — the lane of a period is its session. */
  sessions: DeploymentSessionRow[]
}
