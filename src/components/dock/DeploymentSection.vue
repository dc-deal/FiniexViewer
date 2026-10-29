<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import LoadingLine from '@/components/base/LoadingLine.vue'
import { bundleMembers } from '@/bundle_members'
import { provideFillsPanel } from '@/composables/use_fills_panel'
import { useDeploymentSectionsStore } from '@/stores/deployment_sections_store'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { t } from '@/translate'

/**
 * One member of the deployment bundle as a panel of its own (viewer#43): the same component the
 * bundle's column draws, with the same model, beside the bundle rather than in it — a member is in
 * one place at a time, and ⇲ on its tab puts it back.
 *
 * Where it has nothing to draw, the panel STANDS and says why, rather than closing: a selection
 * never moves the layout.
 *
 * @param memberId The member's id in the bundle's register.
 */
const props = defineProps<{ memberId: string }>()

const descriptor = bundleMembers('deployment').find(member => member.id === props.memberId) ?? null
// the member is the whole panel here, so a list in it may take the height the rest leaves
provideFillsPanel()
const { sources, pending } = storeToRefs(useDeploymentSectionsStore())
const { selectedDeploymentId, unknownDeploymentId, error } = storeToRefs(useDeploymentsStore())

const model = computed(() => descriptor ? sources.value[descriptor.source] ?? null : null)
const loading = computed(() => model.value === null && Boolean(descriptor && pending.value[descriptor.source]))

/** Why the member has nothing to draw, where it has nothing. */
const emptyReason = computed<string | null>(() => {
  if (!descriptor) return t('This panel could not be drawn')
  if (!selectedDeploymentId.value) return t('No deployment is chosen — the Deployments panel lists them')
  if (unknownDeploymentId.value) return `${t('The deployment you had open is no longer in the ledger')}: ${unknownDeploymentId.value}`
  if (loading.value || error.value || model.value !== null) return null
  return t('This deployment carries no such section')
})
</script>

<template>
  <div class="deployment-section" :data-panel="memberId">
    <p v-if="error" class="notice failed">{{ error }}</p>
    <LoadingLine v-if="loading" class="panel-loading" />
    <p v-else-if="emptyReason" class="notice">{{ emptyReason }}</p>
    <component :is="descriptor.component" v-else-if="descriptor && model !== null" :model="model" />
  </div>
</template>

<style scoped>
.deployment-section {
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  scrollbar-gutter: stable;
  container-type: size;
  padding: 0 var(--space-md) var(--space-md);
}

/* no room ABOVE the content inside a scroll area, for the sticky headings — the room scrolls away */
.deployment-section::before {
  content: '';
  display: block;
  height: var(--space-md);
}

.notice {
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-text-secondary);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.notice.failed {
  border-left-color: var(--color-error);
  color: var(--color-error);
}
</style>
