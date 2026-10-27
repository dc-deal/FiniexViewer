<script setup lang="ts">
import { storeToRefs } from 'pinia'
import DeploymentPicker from '@/components/deployments/DeploymentPicker.vue'
import { onPanelShownAgain } from '@/composables/use_panel_visibility'
import { DEPLOYMENT_BUNDLE } from '@/panel_kinds'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { useDockStore } from '@/stores/dock_store'
import { t } from '@/translate'

/**
 * Every deployment in the ledger, as a list that picks (viewer#43): a pick chooses the deployment,
 * and its bundle — the sessions and the booking periods across its restarts — shows it, the way a
 * pick in the run list shows the run bundle. The ledger is loaded at the app root, so the bundle
 * has it while this list is closed.
 */
const dock = useDockStore()
const store = useDeploymentsStore()
const { forbiddenSurface, error, deployments } = storeToRefs(store)

// a docked panel stays mounted, so the ledger is fetched again whenever the panel comes back
onPanelShownAgain(() => { void store.loadDeployments(true) })
</script>

<template>
  <div class="deployments-view">
    <!-- a surface the token does not carry is neither an absence nor an outage, and
         "could not load" would send the reader looking in the wrong place -->
    <p v-if="forbiddenSurface" class="hint">
      {{ t('This viewer has no access to deployment data') }} ({{ forbiddenSurface }})
    </p>
    <p v-else-if="error && !deployments.length" class="error-msg">{{ error }}</p>
    <DeploymentPicker v-else @chosen="dock.reveal(DEPLOYMENT_BUNDLE, 'selection', 'deployments')" />
  </div>
</template>

<style scoped>
.deployments-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
  overflow: hidden;
}

.hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.error-msg {
  margin: 0;
  color: var(--color-error);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
