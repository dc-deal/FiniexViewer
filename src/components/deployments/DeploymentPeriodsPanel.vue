<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import BookingPeriodTimeline from '@/components/runs/BookingPeriodTimeline.vue'
import BookingPeriodTable from '@/components/runs/BookingPeriodTable.vue'
import { orderPeriods } from '@/components/runs/period_order'
import { useViewExpanded } from '@/composables/use_panel_view'
import { useSettingsStore } from '@/stores/settings_store'
import type { LaneOrder } from '@/types/settings_types'
import type { DeploymentPeriodsModel } from '@/types/deployment_bundle_types'
import { t } from '@/translate'

/**
 * The deployment bundle's booking periods (viewer#43): every session's periods on one clock, the
 * timeline above and the table below.
 */
const props = defineProps<{
  model: DeploymentPeriodsModel
}>()

// whether the reader left the period list open — kept as this member's own view, across deployments
const periodsOpen = useViewExpanded('periods-table')

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
  orderPeriods(props.model.periods.periods, laneOrder.value, row => row.run_id)
)
</script>

<template>
  <div class="deployment-periods">
    <p v-if="model.periods.sessions_without_periods > 0" class="notice">
      {{ model.periods.sessions_without_periods }}
      {{ t('sessions predate the booking journal and contribute no periods') }}
    </p>
    <!-- passing the sessions is what switches the lane to the session and the axis to the
         wall clock — see the note in BookingPeriodTimeline -->
    <BookingPeriodTimeline
      v-model:order="laneOrder"
      :periods="orderedPeriods"
      :key-fields="model.periods.key"
      :sessions="model.sessions"
    />
    <BookingPeriodTable v-model:open="periodsOpen" :periods="orderedPeriods" :key-fields="model.periods.key" show-run />
  </div>
</template>

<style scoped>
.deployment-periods {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
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
