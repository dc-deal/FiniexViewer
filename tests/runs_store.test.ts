import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo, RunSummary, RunSummaryCurrency } from '@/types/api/report_types'
import * as apiClient from '@/api/api_client'
import type { SectionAbsence } from '@/types/api/absence_types'

// the captured shape as the base — see the note in run_panels.test.ts
import runSummaryFixture from './fixtures/run_summary.json'

vi.mock('@/api/api_client', () => ({
  getRuns: vi.fn(),
  getRunSummary: vi.fn(),
}))

/** An index row with the header fields filled in — only what a test cares about is overridden. */
function runRow(overrides: Partial<RunInfo> & Pick<RunInfo, 'run_id' | 'group' | 'name'>): RunInfo {
  return {
    artifacts: ['run_summary.json'],
    stream_files: [],
    has_reports: true,
    // contract 15 — what the run DID. null is the ledger holding nothing, distinct from []
    results: null,
    run_outcome: null,
    error_count: null,
    warning_count: null,
    log_warning_count: null,
    tick_timespan_seconds: null,
    start_time: '2026-06-15T12:00:00+00:00',
    parent_id: null,
    parent_kind: null,
    config_id: '',
    reporting: 'expected',
    size_bytes: 0,
    app_version: '1.4.0',
    git_commit: 'abc1234',
    // null on every run recorded before contract 12 — unknown, never guessed
    ticks_from: null,
    orders_to: null,
    data_windows: null,
    config_snapshot: 'config.json',
    ...overrides,
  }
}

const RUNS: RunInfo[] = [
  runRow({ run_id: '20260615_130000', group: 'live',        name: 'my_profile' }),
  runRow({ run_id: '20260615_125000', group: 'live',        name: 'my_profile' }),
  runRow({ run_id: '20260615_124000', group: 'live',        name: 'other_profile' }),
  // exists as logs only — every report route answers 404 for it
  runRow({ run_id: '20260615_123000', group: 'live',        name: 'other_profile', has_reports: false }),
  runRow({ run_id: '20260615_120000', group: 'simulation', name: 'my_set' }),
]

const SUMMARY: RunSummary = {
  run_id: '20260615_130000',
  keys: { currencies: ['currency'], units_absent: ['name'] },
  currencies: [{
    ...(runSummaryFixture.currencies[0] as RunSummaryCurrency),
    currency: 'USD',
    net_pnl: 125.5,
    profit_factor: 1.8,
    win_rate: 0.62,
    account_max_drawdown: 40.25,
    total_fees: 3.1,
    total_trades: 21,
    winning_trades: 13,
    losing_trades: 8,
    expectancy: 0.35,
    avg_win_r: 1.4,
    avg_loss_r: -0.9,
    r_trade_count: 21,
    r_win_count: 13,
    r_loss_count: 8,
  }],
  orders_submitted: 25,
  orders_adopted: 0,
  orders_denied: 0,
  orders_cancelled: 0,
  orders_expired: 0,
  orders_undelivered: 0,
  orders_unaccounted: 0,
  orders_executed: 21,
  orders_rejected: 4,
  sl_tp_triggered: 6,
  unit_count: 1,
  // null on an artifact written before contract 6 — not a zero
  units_declared: null,
  units_disabled: null,
  units_absent: [],
  signal_fresh_ratio: null,
  disturbance_episode_count: 0,
  disturbance_stale_seconds: 0,
  disturbance_source_count: 0,
  disturbance_stress_injected: 0,
  tick_timespan_seconds: null,
  tick_timespan_total_seconds: null,
}


/**
 * What the client now answers where a section is not there: the cause and the backend's own
 * sentence, instead of the bare `null` that made four different situations look identical.
 */
const ABSENT: SectionAbsence = {
  absent: true,
  cause: 'artifact_not_produced',
  detail: 'This run does not write that section',
}

describe('useRunsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(apiClient.getRuns).mockReset()
    vi.mocked(apiClient.getRunSummary).mockReset()
  })

  describe('loadRuns', () => {
    it('fills the run index', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      const store = useRunsStore()
      await store.loadRuns()
      expect(store.runs).toEqual(RUNS)
      expect(store.error).toBeNull()
    })

    it('reloads on every call — new runs appear while the app is open', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      const store = useRunsStore()
      await store.loadRuns()
      await store.loadRuns()
      expect(apiClient.getRuns).toHaveBeenCalledTimes(2)
    })

    it('surfaces a failure as an error message', async () => {
      vi.mocked(apiClient.getRuns).mockRejectedValue(new Error('network down'))
      const store = useRunsStore()
      await store.loadRuns()
      expect(store.runs).toEqual([])
      expect(store.error).toBe('Could not load the run index: network down')
      expect(store.loadingRuns).toBe(false)
    })
  })

  describe('selection', () => {
    async function loadedStore() {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      const store = useRunsStore()
      await store.loadRuns()
      return store
    }

    /**
     * The group/set/run cascade is gone: the picker is a facet bar over the flat index, so the
     * store holds a run and nothing above it. What the cascade used to prove — that choosing a
     * level clears the levels below — has no levels left to clear.
     */
    it('holds the whole index, ungrouped', async () => {
      const store = await loadedStore()
      expect(store.runs.map(run => run.run_id)).toEqual(RUNS.map(run => run.run_id))
    })

    /**
     * The scenario narrowing is the bottom step of the same cascade. Carried across a run change
     * it would silently narrow the new run to a name that run may not even have — or, worse, to a
     * name it does have, which then reads as a deliberate choice nobody made.
     */
    it('drops the scenario narrowing whenever the run below it changes', async () => {
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(SUMMARY)
      const store = await loadedStore()
      await store.selectRun('20260615_130000')
      store.toggleUnit('ETHUSD_blocks_03')
      expect(store.selectedUnits).toEqual(['ETHUSD_blocks_03'])

      await store.selectRun('20260615_120000')
      expect(store.selectedUnits).toEqual([])

    })

    it('shows the whole run again when the narrowing is cleared', async () => {
      const store = await loadedStore()
      store.toggleUnit('ETHUSD_blocks_03')
      store.clearUnits()
      expect(store.selectedUnits).toEqual([])
    })

    // Several scenarios at once is what makes the roster a comparison rather than a jump.
    it('narrows to several scenarios, and takes one back out without losing the rest', async () => {
      const store = await loadedStore()
      store.toggleUnit('a')
      store.toggleUnit('b')
      store.toggleUnit('c')
      expect(store.selectedUnits).toEqual(['a', 'b', 'c'])

      store.toggleUnit('b')
      expect(store.selectedUnits).toEqual(['a', 'c'])
    })

    // A link is written by hand as often as it is copied, and a repeated name is not a selection.
    it('never lets the same scenario into the narrowing twice', async () => {
      const store = await loadedStore()
      store.setUnits(['a', 'b', 'a'])
      expect(store.selectedUnits).toEqual(['a', 'b'])
    })
  })

  describe('selectRun', () => {
    it('loads the summary of the selected run', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(SUMMARY)
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260615_130000')
      expect(apiClient.getRunSummary).toHaveBeenCalledWith('20260615_130000')
      expect(store.summary).toEqual(SUMMARY)
      expect(store.summaryMissing).toBe(false)
    })

    it('resolves selectedRun from the index without a follow-up request', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(SUMMARY)
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260615_120000')
      expect(store.selectedRun).toEqual(RUNS.find(run => run.run_id === '20260615_120000'))
      expect(apiClient.getRuns).toHaveBeenCalledTimes(1)
    })

    it('flags a missing artifact instead of raising an error', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(ABSENT)
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260615_130000')
      expect(store.summary).toBeNull()
      expect(store.summaryMissing).toBe(true)
      expect(store.error).toBeNull()
    })

    it('surfaces a summary failure as an error message', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      vi.mocked(apiClient.getRunSummary).mockRejectedValue(new Error('boom'))
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260615_130000')
      expect(store.error).toBe('Could not load the run summary: boom')
      expect(store.loadingSummary).toBe(false)
    })

    it('never requests a run the index does not contain', async () => {
      // a link or a reloaded URL can name a run whose artifacts were removed since — asking for
      // it produces one 404 per section, which is not something the view can show
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260829_200849')
      expect(apiClient.getRunSummary).not.toHaveBeenCalled()
      expect(store.unknownRunId).toBe('20260829_200849')
      expect(store.selectedRunId).toBeNull()
      expect(store.error).toBeNull()
    })

    it('never requests anything while the index is empty', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue([])
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260615_130000')
      expect(apiClient.getRunSummary).not.toHaveBeenCalled()
      expect(store.unknownRunId).toBe('20260615_130000')
    })

    it('drops the unknown-run flag as soon as a real selection is made', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(SUMMARY)
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260829_200849')
      expect(store.unknownRunId).not.toBeNull()

      await store.selectRun('20260615_130000')
      expect(store.unknownRunId).toBeNull()
      expect(store.selectedRunId).toBe('20260615_130000')
    })

    it('never requests a run the index marks as logs only', async () => {
      // has_reports false means every report route answers 404 — the index already said so
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260615_123000')
      expect(apiClient.getRunSummary).not.toHaveBeenCalled()
      expect(store.selectedRunId).toBe('20260615_123000')
      expect(store.selectedRun?.has_reports).toBe(false)
      // it is a known run, so it is not the unknown-run case
      expect(store.unknownRunId).toBeNull()
      expect(store.error).toBeNull()
      expect(store.summaryMissing).toBe(false)
    })

    it('drops the unknown-run flag as soon as a real run is chosen', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(SUMMARY)
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260829_200849')
      expect(store.unknownRunId).toBe('20260829_200849')

      await store.selectRun('20260615_130000')
      expect(store.unknownRunId).toBeNull()
    })
  })

  /**
   * The panel holds two different things and only one is about SIGNAL: freshness comes from the
   * signal report, the four disturbance figures from the feed-stability report and describe the
   * DATA SOURCES. So "no SIGNAL worker" alone does not make the panel vacuous — a market feed can
   * stall with no SIGNAL worker anywhere. It is vacuous only when NEITHER half speaks, and the
   * backend's console draws the same line: it prints nothing at zero episodes.
   */
  describe('feed health', () => {
    function summaryWith(fields: Partial<RunSummary>): RunSummary {
      return { ...SUMMARY, ...fields }
    }

    async function selectWith(fields: Partial<RunSummary>) {
      vi.mocked(apiClient.getRuns).mockResolvedValue([runRow({
        run_id: '20260615_130000', group: 'live', name: 'p',
      })])
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(summaryWith(fields))
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260615_130000')
      return store
    }

    it('says nothing where no SIGNAL worker ran and nothing was disturbed', async () => {
      const store = await selectWith({ signal_fresh_ratio: null, disturbance_episode_count: 0 })
      expect(store.feedHealth).toBeNull()
    })

    it('speaks where a freshness was actually measured', async () => {
      const store = await selectWith({ signal_fresh_ratio: 0.98, disturbance_episode_count: 0 })
      expect(store.feedHealth).not.toBeNull()
    })

    // the half that has nothing to do with SIGNAL
    it('speaks where the feed was disturbed, SIGNAL worker or not', async () => {
      const store = await selectWith({ signal_fresh_ratio: null, disturbance_episode_count: 3 })
      expect(store.feedHealth).not.toBeNull()
    })

    it('says nothing at all where the run carries no summary', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue([runRow({
        run_id: '20260615_130000', group: 'live', name: 'p',
      })])
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(ABSENT)
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260615_130000')
      expect(store.feedHealth).toBeNull()
    })
  })
})
