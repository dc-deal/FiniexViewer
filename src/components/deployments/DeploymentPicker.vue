<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeploymentsStore } from '@/stores/deployments_store'
import AppSelect from '@/components/base/AppSelect.vue'
import { t } from '@/translate'

const store = useDeploymentsStore()
const { deployments, selectedDeploymentId, loadingList } = storeToRefs(store)

/**
 * One option per deployment, not per row. The ledger lists one row per (deployment, currency),
 * so a bot that booked in two account currencies appears twice — offering both would present one
 * history as two. The order the ledger returned is kept: newest first, by its decision.
 */
const options = computed(() => {
  const seen = new Set<string>()
  const result: { value: string, label: string }[] = []
  for (const row of deployments.value) {
    if (seen.has(row.deployment_id)) continue
    seen.add(row.deployment_id)
    result.push({ value: row.deployment_id, label: `${row.bot} · ${row.deployment_id}` })
  }
  return result
})
</script>

<template>
  <div class="deployment-picker">
    <label class="picker-label">{{ t('Deployment') }}</label>
    <AppSelect
      :model-value="selectedDeploymentId"
      :options="options"
      :placeholder="options.length ? t('Select deployment') : t('No deployments available')"
      :disabled="loadingList || options.length === 0"
      @update:model-value="store.selectDeployment"
    />
  </div>
</template>

<style scoped>
.deployment-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  max-width: 34rem;
}

.picker-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
