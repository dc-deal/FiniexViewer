import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTimeframeStore } from '@/stores/timeframe_store'
import type { TimeframeInfo } from '@/types/api/timeframe_types'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getTimeframes: vi.fn(),
}))

const ALL_TFS: TimeframeInfo[] = [
  { name: 'M1',  minutes: 1    },
  { name: 'M5',  minutes: 5    },
  { name: 'M15', minutes: 15   },
  { name: 'M30', minutes: 30   },
  { name: 'H1',  minutes: 60   },
  { name: 'H4',  minutes: 240  },
  { name: 'D1',  minutes: 1440 },
]

describe('useTimeframeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads timeframes and exposes name list', async () => {
    vi.mocked(apiClient.getTimeframes).mockResolvedValue(ALL_TFS)
    const store = useTimeframeStore()
    await store.loadTimeframes()
    expect(store.timeframes).toEqual(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'])
    expect(store.error).toBeNull()
  })

  it('minutesFor returns correct minutes for known timeframe', async () => {
    vi.mocked(apiClient.getTimeframes).mockResolvedValue(ALL_TFS)
    const store = useTimeframeStore()
    await store.loadTimeframes()
    expect(store.minutesFor('M1')).toBe(1)
    expect(store.minutesFor('H4')).toBe(240)
    expect(store.minutesFor('D1')).toBe(1440)
  })

  it('minutesFor returns undefined for unknown timeframe', async () => {
    vi.mocked(apiClient.getTimeframes).mockResolvedValue(ALL_TFS)
    const store = useTimeframeStore()
    await store.loadTimeframes()
    expect(store.minutesFor('W1')).toBeUndefined()
  })

  it('does not call the API again when already loaded', async () => {
    vi.mocked(apiClient.getTimeframes).mockResolvedValue(ALL_TFS)
    const store = useTimeframeStore()
    await store.loadTimeframes()
    await store.loadTimeframes()
    expect(apiClient.getTimeframes).toHaveBeenCalledTimes(1)
  })

  it('sets error and leaves timeframes empty on API failure', async () => {
    vi.mocked(apiClient.getTimeframes).mockRejectedValue(new Error('Unreachable'))
    const store = useTimeframeStore()
    await store.loadTimeframes()
    expect(store.error).toBe('Unreachable')
    expect(store.timeframes).toEqual([])
  })

  it('clears loading flag after fetch', async () => {
    vi.mocked(apiClient.getTimeframes).mockResolvedValue(ALL_TFS)
    const store = useTimeframeStore()
    await store.loadTimeframes()
    expect(store.loading).toBe(false)
  })
})
