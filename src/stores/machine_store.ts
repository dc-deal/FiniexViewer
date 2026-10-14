import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getMachineResources } from '@/api/api_client'
import type { MachineResources } from '@/types/api/machine_types'

/** How often the machine is asked. Every few seconds is what the route is made for. */
export const POLL_MS = 5000

/** A reading older than three polls has stopped arriving. */
const STALE_MS = 3 * POLL_MS

/**
 * How full the machine is, read again every few seconds while the page is in view.
 *
 * The LAST reading is held through a failure: it is still the best statement there is, and its age
 * says how good. The backend asks for exactly that, so a reading that has stopped arriving is
 * visibly old rather than silently current. A hidden page asks nothing, and reads at once when it
 * is back in view.
 */
export const useMachineStore = defineStore('machine', () => {
  const reading = ref<MachineResources | null>(null)
  /** When the last reading ARRIVED, by this browser's clock — what its age is measured against. */
  const receivedAt = ref<number | null>(null)
  /** The last request failed. Whatever reading came before it is still held. */
  const failed = ref(false)
  /**
   * This browser's clock as of the last poll. The polls move it, so the age of a reading needs no
   * clock of its own — and a page that was hidden does not call its reading old for the moment it
   * takes the first new one to arrive.
   */
  const now = ref(Date.now())

  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  const stale = computed(() => receivedAt.value !== null && now.value - receivedAt.value > STALE_MS)

  async function read(): Promise<void> {
    // a slow answer is not asked for a second time: the next poll waits for this one
    if (inFlight) return
    inFlight = true
    try {
      reading.value = await getMachineResources()
      receivedAt.value = Date.now()
      failed.value = false
    } catch {
      failed.value = true
    } finally {
      inFlight = false
      now.value = Date.now()
    }
  }

  function tick(): void {
    now.value = Date.now()
    void read()
  }

  function resume(): void {
    if (timer) return
    void read()
    timer = setInterval(tick, POLL_MS)
  }

  function pause(): void {
    if (timer) clearInterval(timer)
    timer = null
  }

  /** Nobody reads a hidden page, so it asks nothing; back in view, it reads at once. */
  function followVisibility(): void {
    if (document.visibilityState === 'visible') resume()
    else pause()
  }

  function start(): void {
    document.addEventListener('visibilitychange', followVisibility)
    followVisibility()
  }

  function stop(): void {
    document.removeEventListener('visibilitychange', followVisibility)
    pause()
  }

  return { reading, failed, stale, start, stop }
})
