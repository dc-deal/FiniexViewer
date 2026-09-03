import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo, RunSummary } from '@/types/api/report_types'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getRuns: vi.fn(),
  getRunSummary: vi.fn(),
}))

/** An index row with the header fields filled in — only what a test cares about is overridden. */
function runRow(overrides: Partial<RunInfo> & Pick<RunInfo, 'run_id' | 'group' | 'name'>): RunInfo {
  return {
    artifacts: ['run_summary.json'],
    has_reports: true,
    start_time: '2026-06-15T12:00:00+00:00',
    parent_id: null,
    app_version: '1.4.0',
    git_commit: 'abc1234',
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
  currencies: [{
    currency: 'USD',
    net_pnl: 125.5,
    profit_factor: 1.8,
    win_rate: 0.62,
    max_drawdown: -40.25,
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
  orders_sent: 25,
  orders_executed: 21,
  orders_rejected: 4,
  sl_tp_triggered: 6,
  unit_count: 1,
  signal_fresh_ratio: null,
  disturbance_episode_count: 0,
  disturbance_stale_seconds: 0,
  disturbance_source_count: 0,
  disturbance_stress_injected: 0,
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

  describe('cascade', () => {
    async function loadedStore() {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      const store = useRunsStore()
      await store.loadRuns()
      return store
    }

    it('derives the group list from the index, without duplicates', async () => {
      const store = await loadedStore()
      expect(store.groups).toEqual(['live', 'simulation'])
    })

    it('narrows names to the selected group', async () => {
      const store = await loadedStore()
      store.setGroup('live')
      expect(store.names).toEqual(['my_profile', 'other_profile'])
      store.setGroup('simulation')
      expect(store.names).toEqual(['my_set'])
    })

    it('narrows runs to the selected group and name', async () => {
      const store = await loadedStore()
      store.setGroup('live')
      store.setName('my_profile')
      expect(store.runsInSelection.map(run => run.run_id))
        .toEqual(['20260615_130000', '20260615_125000'])
    })

    it('setGroup clears the name and the run below it', async () => {
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(SUMMARY)
      const store = await loadedStore()
      store.setGroup('live')
      store.setName('my_profile')
      await store.selectRun('20260615_130000')

      store.setGroup('simulation')
      expect(store.selectedName).toBeNull()
      expect(store.selectedRunId).toBeNull()
      expect(store.summary).toBeNull()
    })

    it('setName clears the run but keeps the group', async () => {
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(SUMMARY)
      const store = await loadedStore()
      store.setGroup('live')
      store.setName('my_profile')
      await store.selectRun('20260615_130000')

      store.setName('other_profile')
      expect(store.selectedGroup).toBe('live')
      expect(store.selectedRunId).toBeNull()
      expect(store.summary).toBeNull()
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
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(null)
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

    it('drops the unknown-run flag when the group changes', async () => {
      vi.mocked(apiClient.getRuns).mockResolvedValue(RUNS)
      const store = useRunsStore()
      await store.loadRuns()
      await store.selectRun('20260829_200849')
      store.setGroup('live')
      expect(store.unknownRunId).toBeNull()
    })
  })
})
