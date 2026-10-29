import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConfigCompareStore } from '@/stores/config_compare_store'
import * as apiClient from '@/api/api_client'
import type { RunConfigReport } from '@/types/api/report_types'
import live from './fixtures/run_config_live.json'

vi.mock('@/api/api_client', () => ({
  getRunConfig: vi.fn(),
}))

const LIVE: RunConfigReport = live

describe('useConfigCompareStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('holds the configuration across the mark for the run on show, and lets go of it on stop', async () => {
    vi.mocked(apiClient.getRunConfig).mockResolvedValue(LIVE)
    const store = useConfigCompareStore()
    await store.compare('run_b', 'run_a', 'before')
    expect([store.shown, store.other, store.side]).toEqual(['run_b', 'run_a', 'before'])
    expect(store.otherConfig).toEqual(LIVE)
    expect(store.loading).toBe(false)
    store.stop()
    expect([store.shown, store.other, store.otherConfig]).toEqual([null, null, null])
  })

  /** The backend's sentence where the other session has no configuration on record. */
  it('says why the other configuration is not there', async () => {
    vi.mocked(apiClient.getRunConfig).mockResolvedValue(
      { absent: true, cause: 'config_snapshot_missing', detail: 'This run recorded no configuration.' })
    const store = useConfigCompareStore()
    await store.compare('run_b', 'run_a', 'before')
    expect(store.missing).toBe('This run recorded no configuration.')
    expect(store.otherConfig).toBeNull()
  })

  /** A comparison asked for again wins over the one still on its way. */
  it('drops an answer that arrives after another comparison was asked for', async () => {
    let answer: (value: RunConfigReport) => void = () => {}
    vi.mocked(apiClient.getRunConfig).mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
    vi.mocked(apiClient.getRunConfig).mockResolvedValueOnce({ ...LIVE, config_snapshot: 'second.json' })
    const store = useConfigCompareStore()
    const first = store.compare('run_b', 'run_a', 'before')
    await store.compare('run_c', 'run_b', 'before')
    answer(LIVE)
    await first
    expect(store.otherConfig?.config_snapshot).toBe('second.json')
  })
})
