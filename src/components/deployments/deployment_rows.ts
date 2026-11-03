import type { DeploymentRow } from '@/types/api/deployment_types'

/**
 * The rows the deployment list draws: one per deployment and account currency, and never one for its
 * sessions that have booked nothing yet beside a row that booked (operator, 2026-11-03).
 *
 * Since contract 49 the ledger lists such sessions in a row of their own, with `currency: null` and no
 * figure, after the deployment's other rows — the key needs the null to keep it apart. Drawn as served
 * it read as the same deployment twice, one of them empty. Folded, the deployment is one row: its
 * booked row's figures as served, and the row that booked nothing said beside them
 * (`unbookedOf`). A deployment whose sessions have booked nothing at all keeps that row, the only one
 * it has. Nothing is added up: the two rows' session counts stand apart.
 *
 * A deployment that booked in two account currencies keeps a row per currency: their figures are no
 * one number. None on this machine does (measured 2026-11-03).
 */
export function listedRows(rows: DeploymentRow[]): DeploymentRow[] {
  const booked = new Set(rows.filter(row => row.currency !== null).map(row => row.deployment_id))
  return rows.filter(row => row.currency !== null || !booked.has(row.deployment_id))
}

/** The row of a deployment's sessions that have booked nothing yet, beside a booked row — or null. */
export function unbookedOf(row: DeploymentRow, rows: DeploymentRow[]): DeploymentRow | null {
  if (row.currency === null) return null
  return rows.find(other => other.deployment_id === row.deployment_id && other.currency === null) ?? null
}
