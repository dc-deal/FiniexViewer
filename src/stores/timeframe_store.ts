import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getTimeframes } from '@/api/api_client'
import type { TimeframeInfo } from '@/types/api/timeframe_types'

export const useTimeframeStore = defineStore('timeframe', () => {
  const _infos = ref<TimeframeInfo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const timeframes = computed(() => _infos.value.map(tf => tf.name))

  function minutesFor(name: string): number | undefined {
    return _infos.value.find(tf => tf.name === name)?.minutes
  }

  async function loadTimeframes(): Promise<void> {
    if (_infos.value.length) return
    loading.value = true
    error.value = null
    try {
      _infos.value = await getTimeframes()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load timeframes'
    } finally {
      loading.value = false
    }
  }

  return { timeframes, loading, error, loadTimeframes, minutesFor }
})
