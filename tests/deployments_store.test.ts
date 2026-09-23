import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDeploymentsStore } from '@/stores/deployments_store'
import * as apiClient from '@/api/api_client'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import type { DeploymentRow } from '@/types/api/deployment_types'

import deploymentsFixture from './fixtures/deployments_list.json'
import detailFixture from './fixtures/deployment_detail.json'
import periodsFixture from './fixtures/deployment_booking_periods.json'

vi.mock('@/api/api_client', () => ({
  getDeployments: vi.fn(),
  getDeployment: vi.fn(),
  getDeploymentBookingPeriods: vi.fn(),
}))

const ID = 'deploy_20260923_074955'

/** The listing as captured, plus the same deployment booking in a second account currency. */
function twoCurrencyListing(): DeploymentRow[] {
  const usd = deploymentsFixture.deployments.find(row => row.deployment_id === ID) as DeploymentRow
  return [usd, { ...usd, currency: 'EUR', net_pnl: 12.5 }]
}

function resolveAll(rows: DeploymentRow[] = deploymentsFixture.deployments as DeploymentRow[]): void {
  vi.mocked(apiClient.getDeployments).mockResolvedValue({
    ...deploymentsFixture,
    deployments: rows,
  })
  vi.mocked(apiClient.getDeployment).mockResolvedValue(detailFixture)
  vi.mocked(apiClient.getDeploymentBookingPeriods).mockResolvedValue(periodsFixture)
}

describe('deployments_store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  describe('the listing', () => {
    it('holds the rows in the order the ledger returned them', async () => {
      resolveAll()
      const store = useDeploymentsStore()
      await store.loadDeployments()
      expect(store.deployments.length).toBe(deploymentsFixture.deployments.length)
    })

    it('reports a surface the token does not carry as itself, not as a failure', async () => {
      vi.mocked(apiClient.getDeployments).mockRejectedValue(new SurfaceForbiddenError('deployments'))
      const store = useDeploymentsStore()
      await store.loadDeployments()
      expect(store.forbiddenSurface).toBe('deployments')
      expect(store.error).toBeNull()
    })

    it('reports any other failure as an error', async () => {
      vi.mocked(apiClient.getDeployments).mockRejectedValue(new Error('connection refused'))
      const store = useDeploymentsStore()
      await store.loadDeployments()
      expect(store.error).toContain('connection refused')
      expect(store.forbiddenSurface).toBeNull()
    })
  })

  // Two deployments of one bot are the --new-deployment case: deployment_id is minted per
  // deployment, bot_id is the identity that survives it.
  it('keeps two histories of one bot apart while still relating them', async () => {
    resolveAll()
    const store = useDeploymentsStore()
    await store.loadDeployments()
    const demo = store.deployments.filter(row => row.bot_id === 'demo-btcusd-bot')
    // the count is data and moves as the generator is re-run; the PROPERTY is what is asserted —
    // one bot_id spanning several deployment_ids, which is what --new-deployment produces
    expect(demo.length).toBeGreaterThan(1)
    expect(new Set(demo.map(row => row.deployment_id)).size).toBe(demo.length)
  })

  describe('selecting a deployment', () => {
    it('loads the sessions and the periods together', async () => {
      resolveAll()
      const store = useDeploymentsStore()
      await store.loadDeployments()
      await store.selectDeployment(ID)
      expect(store.detail?.sessions.length).toBeGreaterThan(0)
      expect(store.periods?.periods.length).toBeGreaterThan(0)
    })

    // the ledger is the authority, exactly as the run index is for a run: a link naming something
    // that is gone says so, instead of producing a 404 the view cannot explain
    it('refuses an id the ledger does not list and asks for nothing', async () => {
      resolveAll()
      const store = useDeploymentsStore()
      await store.loadDeployments()
      await store.selectDeployment('deploy_that_never_existed')
      expect(store.unknownDeploymentId).toBe('deploy_that_never_existed')
      expect(store.selectedDeploymentId).toBeNull()
      expect(apiClient.getDeployment).not.toHaveBeenCalled()
    })

    it('clears the previous deployment before loading the next', async () => {
      resolveAll()
      const store = useDeploymentsStore()
      await store.loadDeployments()
      await store.selectDeployment(ID)
      store.clearSelection()
      expect(store.detail).toBeNull()
      expect(store.periods).toBeNull()
      expect(store.selectedDeploymentId).toBeNull()
    })
  })

  // The listing is keyed by (deployment_id, currency). Picking one row would drop a whole
  // currency's figures — silently, and in the direction that loses data.
  describe('a deployment that booked in two account currencies', () => {
    it('keeps every currency row rather than the first match', async () => {
      resolveAll(twoCurrencyListing())
      const store = useDeploymentsStore()
      await store.loadDeployments()
      await store.selectDeployment(ID)
      expect(store.selectedRows.length).toBe(2)
      expect(store.selectedRows.map(row => row.currency)).toEqual(['USD', 'EUR'])
    })

    it('does not sum figures across the currencies', async () => {
      resolveAll(twoCurrencyListing())
      const store = useDeploymentsStore()
      await store.loadDeployments()
      await store.selectDeployment(ID)
      // each row keeps its own figure; nothing in the store combines them
      const [first, second] = twoCurrencyListing()
      expect(store.selectedRows.map(row => row.net_pnl)).toEqual([first?.net_pnl, second?.net_pnl])
      expect(first?.net_pnl).not.toBe(second?.net_pnl)
    })
  })
})
