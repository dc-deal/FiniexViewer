import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { PortfolioReport, WarningsErrorsReport } from '@/types/api/report_types'
import * as apiClient from '@/api/api_client'
import { ArtifactUnreadableError } from '@/api/artifact_unreadable_error'

vi.mock('@/api/api_client', () => ({
  getWarningsErrors: vi.fn(),
  getPortfolio: vi.fn(),
}))

const REPORT: WarningsErrorsReport = {
  run_id: '20260615_130000',
  warnings: [{ tier: 'major', scope: 'run', message: 'STRESS TEST ACTIVE' }],
  errors: [],
  outcome: {
    run_outcome: 'success',
    failed_count: 0,
    total_units: 3,
    failed_unit_names: [],
    first_failure_name: '',
    first_failure_error: '',
    emergency_reason: '',
    shutdown_mode: 'normal',
  },
}

const PORTFOLIO: PortfolioReport = {
  run_id: '20260615_130000',
  units: [],
  aggregates: [{
    currency: 'USD',
    unit_count: 2,
    total_trades: 4,
    winning_trades: 2,
    losing_trades: 2,
    win_rate: 0.5,
    profit_factor: 1.2,
    total_profit: 12,
    total_loss: 10,
    net_profit: 2,
    max_drawdown: 5,
    total_fees: 1,
  }],
}

describe('useRunReportsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(apiClient.getWarningsErrors).mockReset()
    vi.mocked(apiClient.getPortfolio).mockReset()
  })

  it('loads the section for a run', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(REPORT)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    expect(apiClient.getWarningsErrors).toHaveBeenCalledWith('20260615_130000')
    expect(store.warningsErrors).toEqual(REPORT)
    expect(store.error).toBeNull()
    expect(store.loadingWarningsErrors).toBe(false)
  })

  it('keeps the section null when the run carries no such artifact', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(null)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    expect(store.warningsErrors).toBeNull()
    expect(store.error).toBeNull()
  })

  it('surfaces a failure as a readable message', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockRejectedValue(new Error('boom'))
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    expect(store.error).toBe('Could not load warnings and errors: boom')
    expect(store.loadingWarningsErrors).toBe(false)
  })

  it('treats an unreadable artifact as a state of the run, not as a failed request', async () => {
    vi.mocked(apiClient.getWarningsErrors)
      .mockRejectedValue(new ArtifactUnreadableError('Re-run to regenerate it.'))
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    expect(store.unreadable).toBe('Re-run to regenerate it.')
    expect(store.error).toBeNull()
    expect(store.warningsErrors).toBeNull()
  })

  it('clears the unreadable state with the rest of the run', async () => {
    vi.mocked(apiClient.getWarningsErrors)
      .mockRejectedValue(new ArtifactUnreadableError('old schema'))
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    store.clear()
    expect(store.unreadable).toBeNull()
  })

  it('clear drops the previous run — its numbers must never survive a selection change', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(REPORT)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    store.clear()
    expect(store.warningsErrors).toBeNull()
    expect(store.error).toBeNull()
  })

  it('drops the previous section before the next one arrives', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(REPORT)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')

    vi.mocked(apiClient.getWarningsErrors).mockRejectedValue(new Error('gone'))
    await store.loadWarningsErrors('20260615_120000')
    expect(store.warningsErrors).toBeNull()
  })
})

describe('useRunReportsStore — portfolio section', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(apiClient.getWarningsErrors).mockReset()
    vi.mocked(apiClient.getPortfolio).mockReset()
  })

  it('loads the section for a run', async () => {
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(PORTFOLIO)
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    expect(apiClient.getPortfolio).toHaveBeenCalledWith('20260615_130000')
    expect(store.portfolio).toEqual(PORTFOLIO)
    expect(store.loadingPortfolio).toBe(false)
  })

  it('keeps the section null when the run carries no such artifact', async () => {
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(null)
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    expect(store.portfolio).toBeNull()
    expect(store.error).toBeNull()
  })

  it('surfaces a failure as a readable message', async () => {
    vi.mocked(apiClient.getPortfolio).mockRejectedValue(new Error('boom'))
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    expect(store.error).toBe('Could not load the portfolio breakdown: boom')
  })

  it('clear drops every section together', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(REPORT)
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(PORTFOLIO)
    const store = useRunReportsStore()
    await Promise.all([
      store.loadWarningsErrors('20260615_130000'),
      store.loadPortfolio('20260615_130000'),
    ])
    store.clear()
    expect(store.warningsErrors).toBeNull()
    expect(store.portfolio).toBeNull()
  })

  it('a succeeding section never erases the message a sibling section wrote', async () => {
    // the sections share one error slot and load concurrently — a loader that reset it on the
    // way in would silently drop the failure the other one just reported
    vi.mocked(apiClient.getWarningsErrors).mockRejectedValue(new Error('gone'))
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(PORTFOLIO)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    await store.loadPortfolio('20260615_130000')
    expect(store.error).toBe('Could not load warnings and errors: gone')
    expect(store.portfolio).toEqual(PORTFOLIO)
  })
})
