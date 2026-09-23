import { watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { readQuery, writeParam } from '@/composables/query_param_utils'

/**
 * Keeps the selected deployment in the URL, so a bot's history is a shareable link that survives
 * reload. Same priority as every other selection: the URL wins over an empty store.
 */
export function useDeploymentQuerySync(): void {
  const router = useRouter()
  const route = useRoute()
  const store = useDeploymentsStore()
  const { selectedDeploymentId } = storeToRefs(store)

  let _ready = false

  onMounted(async () => {
    await router.isReady()
    // the ledger listing has to exist before a param can select anything in it
    await store.loadDeployments()

    const params = readQuery(route.query)
    if (params['deployment']) await store.selectDeployment(params['deployment'])

    _ready = true
  })

  watch(selectedDeploymentId, deploymentId => {
    if (!_ready) return
    // merge, never replace — the chart and the run view own params in the same query
    const query = readQuery(route.query)
    writeParam(query, 'deployment', deploymentId)
    router.replace({ query })
  })
}
