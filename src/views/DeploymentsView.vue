<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { useSettingsStore } from '@/stores/settings_store'
import { useDeploymentQuerySync } from '@/composables/use_deployment_query_sync'
import DeploymentPicker from '@/components/deployments/DeploymentPicker.vue'
import DeploymentHeader from '@/components/deployments/DeploymentHeader.vue'
import SessionsTable from '@/components/deployments/SessionsTable.vue'
import AdvisoryNotice from '@/components/deployments/AdvisoryNotice.vue'
import BookingPeriodTimeline from '@/components/runs/BookingPeriodTimeline.vue'
import BookingPeriodTable from '@/components/runs/BookingPeriodTable.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import { orderPeriods } from '@/components/runs/period_order'
import type { LaneOrder } from '@/types/settings_types'
import type { DeploymentSessionRow } from '@/types/api/deployment_types'
import { t } from '@/translate'

const store = useDeploymentsStore()
const {
  deployments, selectedDeploymentId, selectedRows, detail, periods,
  loadingList, loadingDetail, error, forbiddenSurface, unknownDeploymentId,
} = storeToRefs(store)

// loads the ledger listing and restores the selection from the URL
useDeploymentQuerySync()

/**
 * One order for the chart and the table beneath it. Across a deployment a lane is the SESSION —
 * `unit_name` is the profile name and identical in every session.
 *
 * Ordering matters here for a second reason: the ledger returns periods oldest-first by opening
 * time, and every session's `anchor` period opens at the same instant, so that order puts all the
 * anchors in a block and leaves the two periods of one session far apart. The table then reads as
 * though each session booked once, which is the opposite of what the chart shows.
 *
 * The default is the stored preference; the toggle above the chart stays local to this view.
 */
const { settings } = storeToRefs(useSettingsStore())
const laneOrder = ref<LaneOrder>(settings.value.laneOrder)

watch(() => settings.value.laneOrder, order => { laneOrder.value = order })

const orderedPeriods = computed(() =>
  orderPeriods(periods.value?.periods ?? [], laneOrder.value, row => row.run_id)
)

/** Sessions of one account currency — the rows are keyed by (run_id, currency), so they split. */
function sessionsOf(currency: string): DeploymentSessionRow[] {
  return (detail.value?.sessions ?? []).filter(session => session.currency === currency)
}

const showDeployment = computed(() =>
  !loadingList.value && !loadingDetail.value && !error.value && !forbiddenSurface.value
  && !unknownDeploymentId.value && selectedRows.value.length > 0
)
</script>

<template>
  <div class="deployments-view">
    <header class="deployments-header">
      <DeploymentPicker />
    </header>

    <div class="deployments-body">
      <div v-if="loadingList || loadingDetail" class="state-overlay">
        <AppSpinner />
      </div>
      <!-- a surface the token does not carry is neither an absence nor an outage, and
           "could not load" would send the reader looking in the wrong place -->
      <div v-else-if="forbiddenSurface" class="state-overlay">
        <span class="hint">
          {{ t('This viewer has no access to deployment data') }} ({{ forbiddenSurface }})
        </span>
      </div>
      <div v-else-if="error" class="state-overlay">
        <span class="error-msg">{{ error }}</span>
      </div>
      <div v-else-if="!deployments.length" class="state-overlay">
        <span class="hint">{{ t('The ledger reports no deployments') }}</span>
      </div>
      <div v-else-if="unknownDeploymentId" class="state-overlay">
        <span class="hint">
          {{ t('This link names a deployment the ledger does not list') }}: {{ unknownDeploymentId }}
        </span>
      </div>
      <div v-else-if="!selectedDeploymentId" class="state-overlay">
        <span class="hint">{{ t('Select a deployment to see its history') }}</span>
      </div>

      <template v-else-if="showDeployment">
        <!-- ABOVE the table, never beside it: by the time a reader reaches a change mark in the
             third row they have already added up the column above it -->
        <AdvisoryNotice v-if="detail?.advisory" :advisory="detail.advisory" />
        <p v-if="detail" class="counts">
          {{ detail.count }} {{ t('sessions') }} ·
          <!-- the WHY is on the title: the number is the fact, the explanation is a caveat -->
          <span
            :class="{ flagged: detail.unfinished > 0 }"
            :title="t('Runs that never reached their close, so the ledger holds no row for them')"
          >{{ detail.unfinished }} {{ t('unfinished') }}</span>
        </p>

        <section v-for="row in selectedRows" :key="row.currency" class="currency-block">
          <DeploymentHeader :row="row" />
          <SessionsTable
            v-if="detail"
            :sessions="sessionsOf(row.currency)"
            :key-fields="detail.key"
          />
        </section>

        <section v-if="periods && periods.periods.length" class="periods-block">
          <h2 class="section-title">{{ t('Booking periods across the deployment') }}</h2>
          <p v-if="periods.sessions_without_periods > 0" class="notice">
            {{ periods.sessions_without_periods }}
            {{ t('sessions predate the booking journal and contribute no periods') }}
          </p>
          <!-- passing the sessions is what switches the lane to the session and the axis to the
               wall clock — see the note in BookingPeriodTimeline -->
          <BookingPeriodTimeline
            v-model:order="laneOrder"
            :periods="orderedPeriods"
            :key-fields="periods.key"
            :sessions="detail?.sessions ?? []"
          />
          <BookingPeriodTable :periods="orderedPeriods" :key-fields="periods.key" show-run />
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.deployments-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.deployments-header {
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.deployments-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.state-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
}

.hint {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.error-msg {
  color: var(--color-error);
  font-size: var(--font-size-sm);
}

.currency-block,
.periods-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.section-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: normal;
  color: var(--color-text-secondary);
}

.counts {
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.counts .flagged {
  color: var(--color-error);
}

.notice {
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-text-secondary);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
