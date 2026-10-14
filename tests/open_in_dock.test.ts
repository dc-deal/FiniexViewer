import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { openInDock } from '@/components/dock/open_in_dock'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { useDockStore } from '@/stores/dock_store'
import { useRunsStore } from '@/stores/runs_store'
import * as apiClient from '@/api/api_client'
import type { DeploymentRow } from '@/types/api/deployment_types'
import type { RunInfo, RunSummary } from '@/types/api/report_types'
import runsFixture from './fixtures/runs_list.json'
import summaryFixture from './fixtures/run_summary.json'
import deploymentsFixture from './fixtures/deployments_list.json'
import detailFixture from './fixtures/deployment_detail.json'
import periodsFixture from './fixtures/deployment_booking_periods.json'

vi.mock('@/api/api_client', () => ({
  getRunSummary: vi.fn(),
  getDeployment: vi.fn(),
  getDeploymentBookingPeriods: vi.fn(),
}))

/** Two runs of the captured index that both carry a summary — the body names the run it answers for. */
const [FIRST, SECOND] = (runsFixture.runs as RunInfo[])
  .filter(run => run.has_reports && run.artifacts.includes('run_summary.json'))
  .map(run => run.run_id)

function summaryOf(runId: string): RunSummary {
  return { ...(summaryFixture as unknown as RunSummary), run_id: runId }
}

describe('openInDock', () => {
  let opened: string[]

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(apiClient.getRunSummary).mockImplementation(async runId => summaryOf(runId))
    vi.mocked(apiClient.getDeployment).mockResolvedValue(detailFixture)
    vi.mocked(apiClient.getDeploymentBookingPeriods).mockResolvedValue(periodsFixture)
    useRunsStore().runs = runsFixture.runs as RunInfo[]
    useDeploymentsStore().deployments = deploymentsFixture.deployments as DeploymentRow[]
    opened = []
    useDockStore().open = (kind: string) => { opened.push(kind) }
  })

  /**
   * The defect it exists for: a run opened from a deployment showed its own sections beside the
   * PREVIOUS run's executive summary, because only the context changed and the docked view stayed
   * mounted. Opening is CHOOSING, the same as a pick in the run list.
   */
  it('loads the summary of each run it opens, and brings the run report forward', async () => {
    const open = openInDock()
    open.openRun(FIRST!)
    await flushPromises()
    expect(useRunsStore().summary?.run_id).toBe(FIRST)

    open.openRun(SECOND!)
    await flushPromises()
    expect(useRunsStore().summary?.run_id).toBe(SECOND)
    expect(opened).toEqual(['run', 'run'])
  })

  it('starts the opened run with no narrowing of the run before it', async () => {
    const runs = useRunsStore()
    const open = openInDock()
    open.openRun(FIRST!)
    runs.setUnits(['a scenario of the first run'])
    open.openRun(SECOND!)
    await flushPromises()
    expect(runs.selectedUnits).toEqual([])
  })

  it('loads the deployment it opens, and brings the Deployments panel forward', async () => {
    const id = detailFixture.deployment_id
    openInDock().openDeployment(id)
    await flushPromises()
    expect(apiClient.getDeployment).toHaveBeenCalledWith(id)
    expect(useDeploymentsStore().detail?.deployment_id).toBe(id)
    expect(opened).toEqual(['deployments'])
  })
})
