import { describe, it, expect } from 'vitest'
import { listedRows, unbookedOf } from '@/components/deployments/deployment_rows'
import listFixture from './fixtures/deployments_list.json'
import type { DeploymentListResponse, DeploymentRow } from '@/types/api/deployment_types'

/** The captured ledger (contract 49): several deployments carry a row of sessions without booked figures. */
const ROWS = (listFixture as DeploymentListResponse).deployments

describe('the deployment list rows', () => {
  it('draws one row per deployment and currency, the row that booked nothing folded beside a booked one', () => {
    const listed = listedRows(ROWS)
    const keys = listed.map(row => `${row.deployment_id}|${row.currency}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(listed.map(row => row.deployment_id)).size).toBe(new Set(ROWS.map(row => row.deployment_id)).size)
    expect(ROWS.some(row => row.currency === null)).toBe(true)
    for (const row of listed.filter(entry => entry.currency !== null)) {
      const nothing = unbookedOf(row, ROWS)
      if (nothing) expect(nothing.deployment_id).toBe(row.deployment_id)
    }
  })

  it('keeps the row that booked nothing where the deployment has no other', () => {
    const only = { ...ROWS[0]!, deployment_id: 'deploy_new', currency: null, net_pnl: null } as DeploymentRow
    expect(listedRows([only])).toEqual([only])
    expect(unbookedOf(only, [only])).toBeNull()
  })
})
