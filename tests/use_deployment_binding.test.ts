import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useDeploymentBinding } from '@/composables/use_deployment_binding'
import { MAIN_LINK, emptyLink, useContextStore } from '@/stores/context_store'
import { useDeploymentsStore } from '@/stores/deployments_store'
import * as apiClient from '@/api/api_client'
import type {
  DeploymentBookingPeriodsReport,
  DeploymentDetail,
  DeploymentRow,
} from '@/types/api/deployment_types'

vi.mock('@/api/api_client', () => ({
  getDeployments: vi.fn(),
  getDeployment: vi.fn(),
  getDeploymentBookingPeriods: vi.fn(),
}))

const ID = 'deploy_20261012_074850'

function restoreDeployment(id: string): void {
  const link = emptyLink()
  link.deployment = { id }
  useContextStore().restore({ [MAIN_LINK]: link })
}

function mountBinding(): void {
  mount(defineComponent({
    setup() {
      useDeploymentBinding()
      return () => null
    },
  }))
}

describe('useDeploymentBinding', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(apiClient.getDeployments).mockResolvedValue({
      deployments: [{ deployment_id: ID } as DeploymentRow],
      key: ['deployment_id', 'currency'],
    } as Awaited<ReturnType<typeof apiClient.getDeployments>>)
    vi.mocked(apiClient.getDeployment).mockResolvedValue({ deployment_id: ID } as unknown as DeploymentDetail)
    vi.mocked(apiClient.getDeploymentBookingPeriods)
      .mockResolvedValue({ periods: [] } as unknown as DeploymentBookingPeriodsReport)
  })

  it('brings back the deployment the reader had open', async () => {
    restoreDeployment(ID)
    mountBinding()
    await flushPromises()

    expect(apiClient.getDeployment).toHaveBeenCalledWith(ID)
    expect(useDeploymentsStore().detail).not.toBeNull()
    expect(useContextStore().main.deployment.id).toBe(ID)
  })

  it('says which deployment is gone where the ledger no longer lists it', async () => {
    restoreDeployment('deploy_gone')
    mountBinding()
    await flushPromises()

    expect(apiClient.getDeployment).not.toHaveBeenCalled()
    expect(useDeploymentsStore().unknownDeploymentId).toBe('deploy_gone')
  })
})
