import { onMounted } from 'vue'
import { useContextStore } from '@/stores/context_store'
import { useDeploymentsStore } from '@/stores/deployments_store'

/**
 * Loads the ledger listing and brings back the deployment the reader had open — the deployment is
 * the context's, restored from storage before any view mounts, and this only loads what it names.
 * Called ONCE, at the app root (viewer#43): the deployment bundle and its members need it while the
 * deployment list is closed or behind a tab.
 */
export function useDeploymentBinding(): void {
  const context = useContextStore()
  const store = useDeploymentsStore()

  onMounted(async () => {
    await store.loadDeployments()
    const stored = context.main.deployment.id
    if (stored) await store.loadDeployment(stored)
  })
}
