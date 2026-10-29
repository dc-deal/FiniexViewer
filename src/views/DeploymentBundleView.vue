<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import AppSpinner from '@/components/base/AppSpinner.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import PanelColumn from '@/components/panels/PanelColumn.vue'
import { deploymentCard } from '@/components/deployments/deployment_card'
import { useDeploymentSectionsStore } from '@/stores/deployment_sections_store'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { t } from '@/translate'

/**
 * The deployment bundle (viewer#43): the chosen deployment's line, and a column of its members — the
 * sessions across its restarts, and the booking periods of every session on one clock — each of
 * which opens as a panel of its own and goes back, the way the run report's sections do. A pick in
 * the deployment list shows it; it fetches nothing of its own.
 */
const store = useDeploymentsStore()
const {
  deployments, selectedDeploymentId, loadingList, error, forbiddenSurface, unknownDeploymentId,
} = storeToRefs(store)
const { sources, pending } = storeToRefs(useDeploymentSectionsStore())

/** The chosen deployment's own row, for the one line above its members. */
const chosen = computed(() =>
  deployments.value.find(row => row.deployment_id === selectedDeploymentId.value) ?? null
)

/**
 * The line names it and its bot, and nothing its members say below it: the sessions and the
 * starts stand in their own lines. The rest of its row — the bot id among it — is on the card, the
 * same one the deployment list shows.
 */
const chosenCard = computed(() => chosen.value ? deploymentCard(chosen.value) : null)
</script>

<template>
  <div class="deployment-bundle">
    <!-- a surface the token does not carry is neither an absence nor an outage -->
    <p v-if="forbiddenSurface" class="hint">
      {{ t('This viewer has no access to deployment data') }} ({{ forbiddenSurface }})
    </p>
    <div v-else-if="loadingList" class="state"><AppSpinner /></div>
    <p v-else-if="error" class="error-msg">{{ error }}</p>
    <p v-else-if="unknownDeploymentId" class="hint">
      {{ t('The deployment you had open is no longer in the ledger') }}: {{ unknownDeploymentId }}
    </p>
    <p v-else-if="!selectedDeploymentId" class="hint">
      {{ t('No deployment is chosen — the Deployments panel lists them') }}
    </p>

    <template v-else>
      <p class="chosen">
        <span class="chosen-label">{{ t('Deployment') }}</span>
        <HoverCard v-if="chosenCard" :title="chosenCard.title" :details="chosenCard.details">
          <!-- reachable by the keyboard, so the card is not the pointer's alone -->
          <span class="chosen-name" tabindex="0">
            <span class="chosen-id">{{ selectedDeploymentId }}</span>
            <!-- in a narrow panel it ends in an ellipsis instead of taking a second line -->
            <span class="chosen-meta">{{ chosen?.bot }}</span>
          </span>
        </HoverCard>
        <span v-else class="chosen-id">{{ selectedDeploymentId }}</span>
      </p>
      <div class="bundle-body">
        <PanelColumn bundle="deployment" :sources="sources" :pending="pending" />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* A SIZE container, like the run report: the lists inside cap themselves against THIS panel. */
.deployment-bundle {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  container-type: size;
}

.bundle-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* the scrollbar's track is held free: one appearing as a member opens moves nothing */
  scrollbar-gutter: stable;
  padding: 0 var(--space-md) var(--space-md);
}

.state {
  display: flex;
  justify-content: center;
  padding: var(--space-md);
}

.hint,
.error-msg {
  margin: 0;
  padding: var(--space-md);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.error-msg {
  color: var(--color-error);
}

.chosen {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  min-width: 0;
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-border);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.chosen-label,
.chosen-meta {
  color: var(--color-text-secondary);
}

.chosen-label,
.chosen-id {
  flex-shrink: 0;
  white-space: nowrap;
}

.chosen-id {
  color: var(--color-text-primary);
}

.chosen-name {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  min-width: 0;
}

.chosen-meta {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
