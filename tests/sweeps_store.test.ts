import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSweepsStore } from '@/stores/sweeps_store'
import { useContextStore } from '@/stores/context_store'
import * as apiClient from '@/api/api_client'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import type { SweepDetail, SweepList } from '@/types/api/sweep_types'

import listFixture from './fixtures/sweeps_list.json'
import detailFixture from './fixtures/sweep_detail.json'

vi.mock('@/api/api_client', () => ({
  getSweeps: vi.fn(),
  getSweep: vi.fn(),
}))

const LIST: SweepList = listFixture
const DETAIL: SweepDetail = detailFixture
// read from the capture rather than transcribed, so a re-capture cannot strand it
const ID = DETAIL.sweep_id

function resolveAll(): void {
  vi.mocked(apiClient.getSweeps).mockResolvedValue(LIST)
  vi.mocked(apiClient.getSweep).mockResolvedValue(DETAIL)
}

/**
 * The parameter searches: the list, the sweep the link names, and each sweep's ranking loaded the
 * first time it is opened — kept exactly as the route serves it.
 */
describe('sweeps_store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('holds the list in the order the route serves, with the key it declares', async () => {
    resolveAll()
    const store = useSweepsStore()
    await store.loadSweeps()
    expect(store.sweeps.map(row => row.sweep_id)).toEqual(LIST.sweeps.map(row => row.sweep_id))
    expect(store.sweepsKey).toEqual(LIST.key)
  })

  it('asks for the list once, and again only when told to refresh', async () => {
    resolveAll()
    const store = useSweepsStore()
    await store.loadSweeps()
    await store.loadSweeps()
    expect(apiClient.getSweeps).toHaveBeenCalledTimes(1)
    await store.loadSweeps(true)
    expect(apiClient.getSweeps).toHaveBeenCalledTimes(2)
  })

  /** The ranking is the route's: kept as served, nothing re-sorted here. */
  it('writes an opened sweep into the link and keeps its ranking as served', async () => {
    resolveAll()
    const store = useSweepsStore()
    await store.loadSweeps()
    await store.selectSweep(ID)
    expect(useContextStore().main.sweep.id).toBe(ID)
    expect(store.rankings[ID]!.combinations.map(row => row.run_id)).toEqual(DETAIL.combinations.map(row => row.run_id))
    expect(store.loadingRankings).toEqual([])
  })

  it('asks for a ranking once, however often its sweep is opened', async () => {
    resolveAll()
    const store = useSweepsStore()
    await store.loadSweeps()
    await store.selectSweep(ID)
    await store.selectSweep(ID)
    expect(apiClient.getSweep).toHaveBeenCalledTimes(1)
  })

  /** A sweep newer than the list on screen is asked for once more before it is called gone. */
  it('says a linked sweep is gone only after the list was asked again', async () => {
    resolveAll()
    const store = useSweepsStore()
    await store.loadSweeps()
    await store.selectSweep('sweep_19990101_000000')
    expect(apiClient.getSweeps).toHaveBeenCalledTimes(2)
    expect(store.unknownSweepId).toBe('sweep_19990101_000000')
    expect(apiClient.getSweep).not.toHaveBeenCalled()
  })

  it('marks a sweep the ledger answers 404 for as gone, rather than as a failure', async () => {
    resolveAll()
    vi.mocked(apiClient.getSweep).mockResolvedValue(null)
    const store = useSweepsStore()
    await store.loadSweeps()
    await store.selectSweep(ID)
    expect(store.goneSweeps).toEqual([ID])
    expect(store.rankingFailures).toEqual({})
  })

  it('says what failed for the one sweep whose ranking could not be read', async () => {
    resolveAll()
    vi.mocked(apiClient.getSweep).mockRejectedValue(new Error('Network Error'))
    const store = useSweepsStore()
    await store.loadSweeps()
    await store.selectSweep(ID)
    expect(store.rankingFailures[ID]).toBe('Could not load the ranking: Network Error')
    expect(store.error).toBeNull()
  })

  it('names the surface a token is refused on, apart from a failure', async () => {
    vi.mocked(apiClient.getSweeps).mockRejectedValue(new SurfaceForbiddenError('sweeps'))
    const store = useSweepsStore()
    await store.loadSweeps()
    expect(store.forbiddenSurface).toBe('sweeps')
    expect(store.error).toBeNull()
  })

  it('says what failed, with the detail, where the list could not be read', async () => {
    vi.mocked(apiClient.getSweeps).mockRejectedValue(new Error('Network Error'))
    const store = useSweepsStore()
    await store.loadSweeps()
    expect(store.error).toBe('Could not load the sweeps: Network Error')
  })

  /** The panel came back: the list, and every ranking it holds — a running sweep grew meanwhile. */
  it('fetches the list and every ranking held again on a refresh', async () => {
    resolveAll()
    const store = useSweepsStore()
    await store.loadSweeps()
    await store.selectSweep(ID)
    await store.refresh()
    expect(apiClient.getSweeps).toHaveBeenCalledTimes(2)
    expect(apiClient.getSweep).toHaveBeenCalledTimes(2)
  })
})
