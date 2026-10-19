import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getActivities, getMachineResources } from '@/api/api_client'
import { describeFailure } from '@/stores/describe_failure'
import type { ActivityList, MachineResources } from '@/types/api/machine_types'
import { t } from '@/translate'

/** How often the machine is asked. Every few seconds is what the route is made for. */
export const POLL_MS = 5000

/** A reading older than three polls has stopped arriving. */
const STALE_MS = 3 * POLL_MS

/**
 * How full the machine is, read again every few seconds while the page is in view — and what runs
 * on it, read on the same beat only while someone reads THAT: the Activities panel while it is on
 * show, the menu bar's card while it is open (viewer#49). Both answers are the `machine` surface's.
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

  /** What runs on the machine, held like the reading: through a failure, its age said. */
  const activities = ref<ActivityList | null>(null)
  const activitiesReceivedAt = ref<number | null>(null)
  /** Why the last request for the list failed — the backend's own sentence where it sent one. */
  const activitiesError = ref<string | null>(null)
  /** How many readers want the list right now; it is asked only while there is one. */
  const readers = ref(0)

  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false
  let activitiesInFlight = false

  const stale = computed(() => receivedAt.value !== null && now.value - receivedAt.value > STALE_MS)
  const activitiesStale = computed(() =>
    activitiesReceivedAt.value !== null && now.value - activitiesReceivedAt.value > STALE_MS)

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

  async function readActivities(): Promise<void> {
    if (activitiesInFlight || readers.value === 0) return
    activitiesInFlight = true
    try {
      activities.value = await getActivities()
      activitiesReceivedAt.value = Date.now()
      activitiesError.value = null
    } catch (error) {
      activitiesError.value = describeFailure(error, t('Could not read what runs on the machine'))
    } finally {
      activitiesInFlight = false
      now.value = Date.now()
    }
  }

  function tick(): void {
    now.value = Date.now()
    void read()
    void readActivities()
  }

  function resume(): void {
    if (timer) return
    void read()
    void readActivities()
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

  /**
   * Asks for the list while the caller reads it. The first reader has it read at once, where the
   * page is in view; once the last one has gone, it is asked no more. Returns the way to stop
   * reading, which counts once however often it is called.
   */
  function watchActivities(): () => void {
    readers.value += 1
    if (readers.value === 1 && document.visibilityState === 'visible') void readActivities()
    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      readers.value -= 1
    }
  }

  return {
    reading, failed, stale, start, stop,
    activities, activitiesError, activitiesStale, watchActivities,
  }
})
