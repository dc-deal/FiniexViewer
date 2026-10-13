import { onMounted } from 'vue'
import { useContextStore } from '@/stores/context_store'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { onPanelShownAgain } from '@/composables/use_panel_visibility'

/**
 * Loads the ledger listing and brings back the deployment the reader had open — the deployment is
 * the context's, restored from storage before any view mounts, and this only loads what it names.
 */
export function useDeploymentBinding(): void {
  const context = useContextStore()
  const store = useDeploymentsStore()

  onMounted(async () => {
    await store.loadDeployments()
    const stored = context.main.deployment.id
    if (stored) await store.loadDeployment(stored)
  })

  // a docked panel stays mounted, so the ledger is fetched again whenever the panel comes back
  onPanelShownAgain(() => { void store.loadDeployments(true) })
}
