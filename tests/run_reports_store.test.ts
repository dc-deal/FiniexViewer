import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { WarningsErrorsReport } from '@/types/api/report_types'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getWarningsErrors: vi.fn(),
}))

const REPORT: WarningsErrorsReport = {
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

describe('useRunReportsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(apiClient.getWarningsErrors).mockReset()
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
