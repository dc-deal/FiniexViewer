<script setup lang="ts">
import DeploymentHeader from '@/components/deployments/DeploymentHeader.vue'
import SessionsTable from '@/components/deployments/SessionsTable.vue'
import AdvisoryNotice from '@/components/deployments/AdvisoryNotice.vue'
import type { DeploymentSessionRow } from '@/types/api/deployment_types'
import type { DeploymentSessionsModel } from '@/types/deployment_bundle_types'
import { plural, t } from '@/translate'

/**
 * The deployment bundle's sessions (viewer#43): the deployment's own line — how many sessions, how
 * many unfinished, and the advisory — then each account currency's header and its sessions. The
 * advisory stands above the table it qualifies wherever this member stands, in the bundle or as a
 * panel of its own.
 */
const props = defineProps<{
  model: DeploymentSessionsModel
}>()

/** Sessions of one account currency — the rows are keyed by (run_id, currency), so they split. */
function sessionsOf(currency: string): DeploymentSessionRow[] {
  return props.model.detail.sessions.filter(session => session.currency === currency)
}
</script>

<template>
  <div class="deployment-sessions">
    <!-- the deployment's own line, above every currency: a run that died before its first sealed
         day has no ledger row and so no currency, and the advisory speaks of the whole history -->
    <p class="counts">
      <span>{{ plural(model.detail.count, t('session'), t('sessions')) }}</span>
      <!-- the WHY is on the title: the number is the fact, the explanation is a caveat -->
      <span
        :class="{ flagged: model.detail.unfinished > 0 }"
        :title="t('Runs that never reached their close, a session running now among them. One that sealed a day stands among the sessions too, so the two counts overlap and are never added')"
      >{{ model.detail.unfinished }} {{ t('unfinished') }}</span>
      <!-- ABOVE the table, never beside it: by the time a reader reaches a change mark in the
           third row they have already added up the column above it -->
      <AdvisoryNotice v-if="model.detail.advisory" :advisory="model.detail.advisory" />
    </p>

    <section v-for="row in model.rows" :key="row.currency" class="currency-block">
      <DeploymentHeader :row="row" />
      <SessionsTable :sessions="sessionsOf(row.currency)" :key-fields="model.detail.key" />
    </section>
  </div>
</template>

<style scoped>
.deployment-sessions {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.currency-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.counts {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-xs) var(--space-md);
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.counts .flagged {
  color: var(--color-error);
}
</style>
