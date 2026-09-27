import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { getCaller } from '@/api/api_client'
import type { CallerIdentity } from '@/types/api/caller_types'

/**
 * What the last read produced. A STATE rather than a message, so the wording stays in the component
 * where the display-string marker can reach it.
 *
 * `unenforced` is its own state rather than a flavour of `ready`, because it is the case where a
 * 200 arrived and proves nothing: the server verifies no token, so every identity field is null
 * even for a caller that sent a valid one.
 */
export type CallerState = 'idle' | 'loading' | 'ready' | 'unenforced' | 'unauthenticated' | 'failed'

export const useCallerStore = defineStore('caller', () => {
  const identity = ref<CallerIdentity | null>(null)
  const state = ref<CallerState>('idle')
  /** When the answer was received — the identity is only ever as of this instant. */
  const readAt = ref<Date | null>(null)

  const displayName = computed(() =>
    identity.value?.display_name ?? identity.value?.account ?? null
  )

  /**
   * Reads the route again from scratch. Called at start and whenever the tab regains focus: an
   * account or a grant takes effect on the backend only across a restart of its process, and
   * nothing on a response marks that restart, so re-reading is the only approximation available.
   */
  async function load(): Promise<void> {
    state.value = 'loading'
    try {
      const answer = await getCaller()
      identity.value = answer
      readAt.value = new Date()
      state.value = answer.enforced ? 'ready' : 'unenforced'
    } catch (error) {
      identity.value = null
      readAt.value = null
      // 401 is a refused credential, which is a different thing from a server that did not answer
      state.value = axios.isAxiosError(error) && error.response?.status === 401
        ? 'unauthenticated'
        : 'failed'
    }
  }

  return { identity, state, readAt, displayName, load }
})
