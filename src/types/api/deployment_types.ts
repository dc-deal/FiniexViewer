import type { BookingPeriodRow } from '@/types/api/report_types'

/**
 * One row of GET /api/v1/deployments — one entry per (deployment x account currency), which the
 * response states itself in `key`. Keying on deployment_id alone folds a two-currency bot into
 * one row and loses a whole currency's figures, silently and in the direction that loses data.
 */
export interface DeploymentRow {
  deployment_id: string
  // what the profile is CALLED — an operator improves this, so it is a label, not an identity
  bot: string
  /**
   * The identity that does not move. `bot` is what the profile is CALLED and an operator
   * improves that; `deployment_id` is minted per deployment and a deliberate restart mints a
   * fresh one. Two deployments sharing a bot_id are one bot restarted with --new-deployment,
   * which is the only join that answers "is this the same bot as the row above". Empty on a
   * profile that declares none.
   */
  bot_id: string
  sessions: number
  first_started: string   // ISO-8601 UTC
  last_started: string    // ISO-8601 UTC
  currency: string
  /**
   * A SUM over the sessions. Its neighbour below is not, and that is the trap: `max_drawdown` is
   * their MAXIMUM and never a sum, because each session carries the running decline against the
   * peak the deployment has reached so far. Adding the column counts one decline once per session
   * that was still inside it. Both arrive already reduced — nothing here is re-aggregated.
   */
  net_pnl: number
  max_drawdown: number
  max_drawdown_pct: number
  // null where no idle stretch exists at all — a deployment of one session has nothing between
  // its sessions. An absence, and 0 would claim a measured stretch of no length.
  longest_gap_hours: number | null
  // true when the sessions were not all produced by one configuration
  changed: boolean
}

/** Response type for GET /api/v1/deployments */
export interface DeploymentListResponse {
  // what makes one row unique — declared by the backend, not assumed here
  key: string[]
  deployments: DeploymentRow[]
  count: number
}

/**
 * One session of a deployment: a single run in the series, seen from the ledger rather than from
 * its own run directory. Keyed by (run_id, currency), so a run that booked in two currencies
 * appears once per currency.
 */
export interface DeploymentSessionRow {
  index: number
  // the hinge into every existing report route — a session is a run, addressed the normal way
  run_id: string
  started: string
  ended: string
  ran_hours: number
  net_pnl: number
  max_drawdown: number
  max_drawdown_pct: number
  currency: string
  bot: string
  bot_id: string
  /**
   * The stretch BEFORE this session, null on the first one — an absence, never a zero. Where
   * gap_between_starts is true it could only be measured start-to-start and therefore contains
   * the predecessor's whole runtime: an upper bound, and it is labelled as one.
   */
  gap_hours: number | null
  gap_between_starts: boolean
  /**
   * The boundary BEFORE this session, not a property of it. Everything above the mark was
   * produced by a different configuration from everything below, which is why it renders as a
   * line across the table: a badge at the end of a row reads as a property of that row.
   */
  strategy_changed: boolean
  operation_changed: boolean
}

/**
 * Whether the sessions may be read as ONE SERIES at all, counted rather than asserted. Two stands
 * over four sessions means the column below was produced by two different configurations, so a
 * total over it answers a question nobody asked.
 */
export interface DeploymentAdvisory {
  sessions: number
  strategy_stands: number
  operation_stands: number
  // null where no idle stretch could be measured — an absence, not a zero
  longest_gap_hours: number | null
}

/** Response type for GET /api/v1/deployments/{deployment_id} */
export interface DeploymentDetail {
  key: string[]
  deployment_id: string
  sessions: DeploymentSessionRow[]
  count: number
  /**
   * Runs of this deployment that never reached their close. ABSENT from `sessions` by
   * construction — the ledger row is written last, so a session killed mid-flight left a run
   * index entry and no ledger row. Rendered even when zero: a bare session count is a number the
   * reader has no reason to doubt.
   */
  unfinished: number
  /**
   * Null when nothing moved. Belongs ABOVE the table: by the time a reader reaches a change mark
   * in row 3 they have already added up the column above it. The wording is the component's — this
   * carries counts, not a sentence.
   */
  advisory: DeploymentAdvisory | null
}

/**
 * A booking period seen from the deployment, which is the run-scoped row plus the run it came
 * from. Across a deployment `run_id` is the only thing that tells two periods apart: `segment_no`
 * is a per-bot counter and restarts wherever a session wrote no carry-over floor, so two periods
 * of one deployment can both be number 1.
 */
export interface DeploymentBookingPeriodRow extends BookingPeriodRow {
  run_id: string
}

/**
 * Response type for GET /api/v1/deployments/{deployment_id}/booking-periods — every period of
 * every session in one call. Deliberately carries NO reconciliation figures: that check is
 * run-scoped, because it compares against what one run reports.
 */
export interface DeploymentBookingPeriodsReport {
  key: string[]
  deployment_id: string
  periods: DeploymentBookingPeriodRow[]
  count: number
  // every account currency these periods span
  currencies: string[]
  sessions: number
  // sessions whose rows predate the booking journal — counted rather than silently absent
  sessions_without_periods: number
}
