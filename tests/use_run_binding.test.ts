import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useRunBinding } from '@/composables/use_run_binding'
import { MAIN_LINK, emptyLink, useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import * as apiClient from '@/api/api_client'
import type { RunInfo, RunSummary } from '@/types/api/report_types'

vi.mock('@/api/api_client', () => ({
  getRuns: vi.fn(),
  getRunSummary: vi.fn(),
}))

const MARK = { scenario: 'EURGBP_partial_close', position: 'pos_eurgbp_1' }

/** Only what the binder and the store read off an index row. */
function row(run_id: string): RunInfo {
  return { run_id, has_reports: true } as RunInfo
}

function summaryOf(run_id: string): RunSummary {
  return { run_id } as RunSummary
}

/** The context as a reload leaves it: restored from storage before any view mounts. */
function restoreRun(id: string, units: string[] = [], position: typeof MARK | null = null): void {
  const link = emptyLink()
  link.run = { id, units, position }
  useContextStore().restore({ [MAIN_LINK]: link })
}

function mountBinding(): void {
  mount(defineComponent({
    setup() {
      useRunBinding()
      return () => null
    },
  }))
}

describe('useRunBinding', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(apiClient.getRuns).mockResolvedValue([row('a'), row('b')])
    vi.mocked(apiClient.getRunSummary).mockImplementation(async id => summaryOf(id))
  })

  /** A reload is not a new run: the narrowing and the mark stored with it stay as they were. */
  it('brings back the run the reader had open, with its narrowing and its mark', async () => {
    restoreRun('a', ['EURGBP_partial_close'], MARK)
    mountBinding()
    await flushPromises()

    expect(apiClient.getRunSummary).toHaveBeenCalledWith('a')
    expect(useRunsStore().selectedRun?.run_id).toBe('a')
    expect(useContextStore().main.run).toEqual({ id: 'a', units: ['EURGBP_partial_close'], position: MARK })
  })

  it('says which run is gone where the stored one is no longer in the index', async () => {
    restoreRun('gone')
    mountBinding()
    await flushPromises()

    expect(apiClient.getRunSummary).not.toHaveBeenCalled()
    expect(useRunsStore().unknownRunId).toBe('gone')
  })

  it('loads the index and nothing else where no run was open', async () => {
    mountBinding()
    await flushPromises()

    expect(apiClient.getRuns).toHaveBeenCalledTimes(1)
    expect(apiClient.getRunSummary).not.toHaveBeenCalled()
  })

  /** A run picked while the stored one still loads is a new run, and the late answer is not its. */
  it('keeps the run a reader picks while the stored one is still loading', async () => {
    let answerStored: (summary: RunSummary) => void = () => {}
    vi.mocked(apiClient.getRunSummary).mockImplementation(id => id === 'a'
      ? new Promise<RunSummary>(resolve => { answerStored = resolve })
      : Promise.resolve(summaryOf(id)))
    restoreRun('a', ['EURGBP_partial_close'])
    mountBinding()
    await flushPromises()

    await useRunsStore().selectRun('b')
    answerStored(summaryOf('a'))
    await flushPromises()

    expect(useRunsStore().summary?.run_id).toBe('b')
    expect(useRunsStore().loadingSummary).toBe(false)
    expect(useContextStore().main.run.units).toEqual([])
  })
})
