import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useRunReportsLoading } from '@/composables/use_run_reports_loading'
import { MAIN_LINK, emptyLink, useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { RUN_BUNDLE } from '@/panel_kinds'
import stateFramesFixture from './fixtures/state_frames_ended.json'
import * as apiClient from '@/api/api_client'
import type { SectionAbsence } from '@/types/api/absence_types'
import type { RunInfo } from '@/types/api/report_types'
import type { StateFramesLatest } from '@/types/api/state_frame_types'

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
  getLatestStateFrames: vi.fn(async () => ABSENT),
  getRuns: vi.fn(async () => []),
  getRunSummary: vi.fn(async () => ABSENT),
}))

/** Only what the loader reads off an index row. */
function row(run_id: string, artifacts: string[], has_reports = true, stream_files: string[] = []): RunInfo {
  return { run_id, artifacts, has_reports, stream_files } as RunInfo
}

/** The ended fixture, with each unit read as still recording. */
function recording(): StateFramesLatest {
  const ended = structuredClone(stateFramesFixture) as unknown as StateFramesLatest
  for (const unit of ended.units) {
    unit.recording = 'current'
    unit.outcome = null
  }
  return ended
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

  /** The configuration is the run's source, not an artifact: a run without reports answers it too. */
  it('asks a run without reports for its header and its configuration alone', async () => {
    useRunsStore().runs = [row('a', [], false)]
    choose('a')
    mountLoading()
    await flushPromises()
    expect(apiClient.getRunHeader).toHaveBeenCalledWith('a')
    expect(apiClient.getRunConfig).toHaveBeenCalledWith('a')
    expect(apiClient.getTradeHistory).not.toHaveBeenCalled()
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

  /** A session writes its state frames from its first pass, long before any report. */
  it('asks a session for its latest state frame whatever its reports, and a run without the stream not at all', async () => {
    useRunsStore().runs = [
      row('session', [], false, ['order_events.jsonl', 'state_frames.jsonl']),
      row('backtest', ['trade_history.json'], true, ['order_events.jsonl']),
    ]
    // the dock comes up with the app, before any choice is restored
    useDockStore()
    choose('session')
    mountLoading()
    await flushPromises()
    expect(apiClient.getLatestStateFrames).toHaveBeenCalledWith('session')

    choose('backtest')
    await flushPromises()
    expect(apiClient.getLatestStateFrames).toHaveBeenCalledTimes(1)
  })

  describe('the check-in, asked again once a cadence', () => {
    // only the timers: the promise flushing between steps runs on setImmediate
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    /**
     * Once a cadence while the bundle is on show, and no longer once the session ended and wrote its
     * outcome — then its reports exist, and the index is asked so the bundle loads them.
     */
    it('asks once a cadence while on show, and stops once the session ended', async () => {
      vi.mocked(apiClient.getLatestStateFrames).mockResolvedValue(recording())
      useRunsStore().runs = [row('session', [], false, ['state_frames.jsonl'])]
      useDockStore().noteShown(RUN_BUNDLE, true)
      choose('session')
      mountLoading()
      await flushPromises()
      expect(apiClient.getLatestStateFrames).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(60_000)
      expect(apiClient.getLatestStateFrames).toHaveBeenCalledTimes(2)
      expect(useRunReportsStore().stateFrames?.units[0]?.recording).toBe('current')

      vi.mocked(apiClient.getLatestStateFrames).mockResolvedValue(
        stateFramesFixture as unknown as StateFramesLatest)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(apiClient.getLatestStateFrames).toHaveBeenCalledTimes(3)
      expect(apiClient.getRuns).toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(180_000)
      expect(apiClient.getLatestStateFrames).toHaveBeenCalledTimes(3)
    })

    /** Nobody reads a section that is not on show; a panel behind another tab stays mounted. */
    it('asks nothing again while neither the bundle nor the section is on show', async () => {
      vi.mocked(apiClient.getLatestStateFrames).mockResolvedValue(recording())
      useRunsStore().runs = [row('session', [], false, ['state_frames.jsonl'])]
      choose('session')
      mountLoading()
      await flushPromises()
      await vi.advanceTimersByTimeAsync(180_000)
      expect(apiClient.getLatestStateFrames).toHaveBeenCalledTimes(1)
    })
  })
})
