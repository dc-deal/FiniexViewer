import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useRunReportsLoading } from '@/composables/use_run_reports_loading'
import { MAIN_LINK, emptyLink, useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import * as apiClient from '@/api/api_client'
import type { SectionAbsence } from '@/types/api/absence_types'
import type { RunInfo } from '@/types/api/report_types'

const ABSENT: SectionAbsence = { absent: true, cause: 'artifact_not_produced', detail: '' }

vi.mock('@/api/api_client', () => ({
  getRunHeader: vi.fn(async () => ABSENT),
  getWarningsErrors: vi.fn(async () => ABSENT),
  getPortfolio: vi.fn(async () => ABSENT),
  getBroker: vi.fn(async () => ABSENT),
  getAggregatedPortfolio: vi.fn(async () => ABSENT),
  getPendingOrders: vi.fn(async () => ABSENT),
  getOrderHistory: vi.fn(async () => ABSENT),
  getBookingPeriods: vi.fn(async () => ABSENT),
  getTradeHistory: vi.fn(async () => ABSENT),
  getScenarioDetails: vi.fn(async () => ABSENT),
  getRunConfig: vi.fn(async () => ABSENT),
  getOrderEvents: vi.fn(async () => ABSENT),
}))

/** Only what the loader reads off an index row. */
function row(run_id: string, artifacts: string[], has_reports = true): RunInfo {
  return { run_id, artifacts, has_reports } as RunInfo
}

/** The reader's choice, the way the context holds it once a run is picked or restored. */
function choose(id: string): void {
  const link = emptyLink()
  link.run = { id, units: [], position: null }
  useContextStore().restore({ [MAIN_LINK]: link })
}

function mountLoading(): void {
  mount(defineComponent({
    setup() {
      useRunReportsLoading()
      return () => null
    },
  }))
}

describe('useRunReportsLoading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  /** The two pipelines write different sets, and asking for the difference produced a 404 each. */
  it('asks only for the sections the run lists, and for its header and configuration whatever it lists', async () => {
    useRunsStore().runs = [row('a', ['trade_history.json'])]
    choose('a')
    mountLoading()
    await flushPromises()
    expect(apiClient.getTradeHistory).toHaveBeenCalledWith('a')
    expect(apiClient.getScenarioDetails).not.toHaveBeenCalled()
    expect(apiClient.getRunHeader).toHaveBeenCalledWith('a')
    expect(apiClient.getRunConfig).toHaveBeenCalledWith('a')
  })

  it('asks a run kept as logs only for its header alone', async () => {
    useRunsStore().runs = [row('a', [], false)]
    choose('a')
    mountLoading()
    await flushPromises()
    expect(apiClient.getRunHeader).toHaveBeenCalledWith('a')
    expect(apiClient.getRunConfig).not.toHaveBeenCalled()
  })

  /** After a reload the id is back before the index is — the load waits for the run itself. */
  it('waits for the index before it asks for anything', async () => {
    choose('a')
    mountLoading()
    await flushPromises()
    expect(apiClient.getRunHeader).not.toHaveBeenCalled()
    useRunsStore().runs = [row('a', ['trade_history.json'])]
    await flushPromises()
    expect(apiClient.getRunHeader).toHaveBeenCalledWith('a')
  })

  it('asks again for the run chosen next', async () => {
    useRunsStore().runs = [row('a', ['trade_history.json']), row('b', ['trade_history.json'])]
    choose('a')
    mountLoading()
    await flushPromises()
    choose('b')
    await flushPromises()
    expect(apiClient.getTradeHistory).toHaveBeenLastCalledWith('b')
  })
})
