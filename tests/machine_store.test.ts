import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMachineStore, POLL_MS } from '@/stores/machine_store'
import * as apiClient from '@/api/api_client'
import type { ActivityList } from '@/types/api/machine_types'
import reading from './fixtures/machine_resources.json'
import activityFixture from './fixtures/activities.json'

vi.mock('@/api/api_client', () => ({ getMachineResources: vi.fn(), getActivities: vi.fn() }))

const activities = activityFixture as unknown as ActivityList

let visibility: DocumentVisibilityState = 'visible'

/** The page leaves view or comes back, the way the browser announces it. */
function showPage(state: DocumentVisibilityState): void {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useMachineStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    vi.mocked(apiClient.getMachineResources).mockReset()
    vi.mocked(apiClient.getActivities).mockReset()
    visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  })

  afterEach(() => {
    useMachineStore().stop()
    vi.useRealTimers()
  })

  it('reads at once on start, then every few seconds', async () => {
    vi.mocked(apiClient.getMachineResources).mockResolvedValue(reading)
    const store = useMachineStore()
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.reading?.measured_at).toBe(reading.measured_at)
    expect(apiClient.getMachineResources).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(POLL_MS * 2)
    expect(apiClient.getMachineResources).toHaveBeenCalledTimes(3)
  })

  /** The backend asks for it: the last answer is held, so its age can say how good it still is. */
  it('keeps the last reading through a failure, and says the read failed', async () => {
    vi.mocked(apiClient.getMachineResources)
      .mockResolvedValueOnce(reading)
      .mockRejectedValue(new Error('gateway timed out'))
    const store = useMachineStore()
    store.start()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(store.failed).toBe(true)
    expect(store.reading?.measured_at).toBe(reading.measured_at)
  })

  it('calls a reading old once three polls brought nothing new', async () => {
    vi.mocked(apiClient.getMachineResources)
      .mockResolvedValueOnce(reading)
      .mockRejectedValue(new Error('gateway timed out'))
    const store = useMachineStore()
    store.start()
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(store.stale).toBe(false)
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(store.stale).toBe(true)
  })

  it('does not ask again while an answer is still on its way', async () => {
    vi.mocked(apiClient.getMachineResources).mockReturnValue(new Promise(() => {}))
    const store = useMachineStore()
    store.start()
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(apiClient.getMachineResources).toHaveBeenCalledTimes(1)
  })

  it('asks nothing while the page is hidden, and reads at once when it is back', async () => {
    vi.mocked(apiClient.getMachineResources).mockResolvedValue(reading)
    const store = useMachineStore()
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    showPage('hidden')
    await vi.advanceTimersByTimeAsync(POLL_MS * 4)
    expect(apiClient.getMachineResources).toHaveBeenCalledTimes(1)
    showPage('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(apiClient.getMachineResources).toHaveBeenCalledTimes(2)
  })

  /** A page back in view is not told its reading is old for the moment the next one takes. */
  it('does not call a reading old while a returning page waits for the next', async () => {
    let answer: (value: typeof reading) => void = () => {}
    vi.mocked(apiClient.getMachineResources)
      .mockResolvedValueOnce(reading)
      .mockImplementationOnce(() => new Promise(resolve => { answer = resolve }))
    const store = useMachineStore()
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    showPage('hidden')
    await vi.advanceTimersByTimeAsync(POLL_MS * 10)
    showPage('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(store.stale).toBe(false)
    answer(reading)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.stale).toBe(false)
  })

  it('stops asking when stopped', async () => {
    vi.mocked(apiClient.getMachineResources).mockResolvedValue(reading)
    const store = useMachineStore()
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    store.stop()
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(apiClient.getMachineResources).toHaveBeenCalledTimes(1)
  })

  describe('what runs on the machine', () => {
    /** A reading costs the server a tenth of a second: asked while someone reads it, and only then. */
    it('asks for the list only while someone reads it, on the same beat, until the last reader goes', async () => {
      vi.mocked(apiClient.getMachineResources).mockResolvedValue(reading)
      vi.mocked(apiClient.getActivities).mockResolvedValue(activities)
      const store = useMachineStore()
      store.start()
      await vi.advanceTimersByTimeAsync(POLL_MS * 2)
      expect(apiClient.getActivities).not.toHaveBeenCalled()

      const stopPanel = store.watchActivities()
      const stopCard = store.watchActivities()
      await vi.advanceTimersByTimeAsync(0)
      expect(apiClient.getActivities).toHaveBeenCalledTimes(1)
      expect(store.activities?.server_activity_id).toBe(activities.server_activity_id)
      await vi.advanceTimersByTimeAsync(POLL_MS)
      expect(apiClient.getActivities).toHaveBeenCalledTimes(2)

      // a reader that stops twice counts once: the card still reads
      stopPanel()
      stopPanel()
      await vi.advanceTimersByTimeAsync(POLL_MS)
      expect(apiClient.getActivities).toHaveBeenCalledTimes(3)
      stopCard()
      await vi.advanceTimersByTimeAsync(POLL_MS * 2)
      expect(apiClient.getActivities).toHaveBeenCalledTimes(3)
    })

    /** "Could not read" is not "nothing runs": the last list stays, and the backend's sentence is said. */
    it('keeps the last list through a failure, says why, and calls it old once three polls brought nothing', async () => {
      vi.mocked(apiClient.getMachineResources).mockResolvedValue(reading)
      vi.mocked(apiClient.getActivities)
        .mockResolvedValueOnce(activities)
        .mockRejectedValue(new Error('the list of what runs on the machine could not be read'))
      const store = useMachineStore()
      store.start()
      store.watchActivities()
      await vi.advanceTimersByTimeAsync(POLL_MS)
      expect(store.activities).not.toBeNull()
      expect(store.activitiesError).toContain('could not be read')
      expect(store.activitiesStale).toBe(false)
      await vi.advanceTimersByTimeAsync(POLL_MS * 3)
      expect(store.activitiesStale).toBe(true)
    })

    it('asks nothing for a reader while the page is hidden', async () => {
      vi.mocked(apiClient.getActivities).mockResolvedValue(activities)
      showPage('hidden')
      useMachineStore().watchActivities()
      await vi.advanceTimersByTimeAsync(0)
      expect(apiClient.getActivities).not.toHaveBeenCalled()
    })
  })
})
