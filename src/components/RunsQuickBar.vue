<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import AppButton from '@/components/base/AppButton.vue'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import { t } from '@/translate'

/**
 * The scenario narrowing, said beside the Runs tab — where it is seen whatever is scrolled, and
 * where saying it moves nothing. It stood above the panel column until 2026-10-13 and pushed the
 * column down a line on every choice (a selection never moves the layout). The column's frame is
 * still drawn in the same annotation colour, so the bar and the edge read as one statement.
 */
const runsStore = useRunsStore()
const { selectedUnits } = storeToRefs(runsStore)
const { scenarios } = storeToRefs(useRunReportsStore())

/**
 * The narrowing as words. Names while they still fit — a reader recognises the scenario they
 * clicked — and a count past that, because eleven names in one line is not something anyone reads.
 */
const narrowingLabel = computed(() => {
  const units = selectedUnits.value
  if (units.length <= 3) return units.join(' · ')
  return `${units.length} ${t('scenarios')}`
})

/**
 * Names in the narrowing this run does not have — one saved before the set was changed. Claimed
 * ONLY where the roster actually arrived: `scenario-details` is backtest-only by construction, so
 * its absence on a session says nothing about a name and must not be reported as a bad one.
 */
const unknownUnits = computed(() => {
  const roster = scenarios.value
  if (roster === null) return []
  return selectedUnits.value.filter(unit => !roster.units.some(row => row.name === unit))
})
</script>

<template>
  <p v-if="selectedUnits.length" class="narrowed-head">
    <span class="mark" aria-hidden="true">⌖</span>
    <span class="narrowed-text">
      {{ t('Showing only') }} <strong>{{ narrowingLabel }}</strong>
      <template v-if="unknownUnits.length">
        — {{ t('not in this run:') }} {{ unknownUnits.join(', ') }}
      </template>
    </span>
    <AppButton variant="quiet" @click="runsStore.clearUnits()">
      {{ t('Show all') }}
    </AppButton>
  </p>
</template>

<style scoped>
.narrowed-head {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  height: 100%;
  margin: 0;
  padding: 0 var(--space-sm);
  min-width: 0;
  color: var(--color-annotation);
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.narrowed-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.narrowed-head strong {
  font-weight: normal;
}

.narrowed-head .mark {
  flex-shrink: 0;
}
</style>
