import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMachineStore, POLL_MS } from '@/stores/machine_store'
import * as apiClient from '@/api/api_client'
import reading from './fixtures/machine_resources.json'

vi.mock('@/api/api_client', () => ({ getMachineResources: vi.fn() }))

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
})
