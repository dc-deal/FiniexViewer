import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getSymbols } from '@/api/api_client'
import type { BrokerSymbol } from '@/types/api/broker_types'

export const useSymbolStore = defineStore('symbol', () => {
  const symbolsByBroker = ref<Record<string, BrokerSymbol[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadSymbols(broker: string): Promise<void> {
    if (symbolsByBroker.value[broker]) return
    loading.value = true
    error.value = null
    try {
      symbolsByBroker.value[broker] = await getSymbols(broker)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load symbols'
    } finally {
      loading.value = false
    }
  }

  return { symbolsByBroker, loading, error, loadSymbols }
})
