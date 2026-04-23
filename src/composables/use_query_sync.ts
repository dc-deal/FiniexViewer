import { watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSelectionStore } from '@/stores/selection_store'
import { useSymbolStore } from '@/stores/symbol_store'

export function useQuerySync(): void {
  const router = useRouter()
  const route  = useRoute()
  const selectionStore = useSelectionStore()
  const symbolStore    = useSymbolStore()
  const { broker, symbol, timeframe } = storeToRefs(selectionStore)

  let _ready = false

  onMounted(async () => {
    // wait for the router to finish its initial navigation before reading query params
    await router.isReady()

    const qBroker    = route.query['broker']    as string | undefined
    const qSymbol    = route.query['symbol']    as string | undefined
    const qTimeframe = route.query['timeframe'] as string | undefined

    if (qBroker)    selectionStore.setBroker(qBroker)
    if (qSymbol)    selectionStore.setSymbol(qSymbol)
    if (qTimeframe) selectionStore.setTimeframe(qTimeframe)

    if (broker.value) symbolStore.loadSymbols(broker.value)

    _ready = true
  })

  // only write URL after init is complete — prevents intermediate states from clobbering params
  watch([broker, symbol, timeframe], ([b, s, tf]) => {
    if (!_ready) return
    const query: Record<string, string> = {}
    if (b)  query['broker']    = b
    if (s)  query['symbol']    = s
    if (tf) query['timeframe'] = tf
    router.replace({ query })
  })
}
