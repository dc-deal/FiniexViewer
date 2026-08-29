import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBrokers } from '@/api/api_client'
import { t } from '@/translate'

export const useBrokerStore = defineStore('broker', () => {
  const brokers = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadBrokers(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      brokers.value = await getBrokers()
    } catch (e) {
      error.value = e instanceof Error ? e.message : t('Failed to load brokers')
    } finally {
      loading.value = false
    }
  }

  return { brokers, loading, error, loadBrokers }
})
