<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FacetBar from '@/components/base/FacetBar.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import type { FacetDefinition, FacetSelection, SortDefinition } from '@/types/facet_types'
import type { ScenarioDetailsReport, ScenarioRow } from '@/types/api/scenario_types'
import { t } from '@/translate'

/**
 * Every scenario the run declared — the ones that produced nothing included, each with its reason.
 *
 * This is the only complete list: `portfolio`, `broker` and `run-summary` each answer a narrower
 * question, and comparing them is how a reader would otherwise discover that two scenarios are
 * missing. Settled with the backend 2026-09-25.
 *
 * A plain list under a facet bar rather than anything cleverer — the arrangement that carries a
 * tracker of thousands of rows, and the one the operator asked for.
 */
const props = defineProps<{
  model: ScenarioDetailsReport
}>()

const selection = ref<FacetSelection>({})
const search = ref('')
const sort = ref('name')

// a different run is a different roster, so a narrowing made for the old one means nothing
watch(() => props.model, () => {
  selection.value = {}
  search.value = ''
})

/**
 * A value the row does not state is NOT offered as a facet value: `market_type` is empty on every
 * run recorded before contract 5, and an empty string in a dropdown reads as a category rather
 * than as an absence. The bar drops a facet that has nothing left to offer.
 */
function stated(value: string): string[] {
  return value ? [value] : []
}

const facets: FacetDefinition<ScenarioRow>[] = [
  { id: 'symbol', label: 'Symbol', valuesOf: row => stated(row.symbol) },
  { id: 'market', label: 'Market', valuesOf: row => stated(row.market_type) },
  { id: 'currency', label: 'Currency', valuesOf: row => stated(row.account_currency) },
  { id: 'status', label: 'State', valuesOf: row => stated(row.status) },
  { id: 'source', label: 'Data source', valuesOf: row => stated(row.data_source) },
]

/**
 * Sorting by net P&L and by trade count is missing on purpose: the roster carries no figures and
 * the response that does is a shorter list. Merging them here would invent a third thing — raised
 * with the backend 2026-09-27 and waiting on their answer.
 *
 * Nothing sorts by `worker_count`, `trades_requested` or the signal counters either: measured over
 * 370 rows on 2026-09-27, all five read 0 on EVERY row, including the 18 that processed ticks and
 * closed positions. A sort over a field that is always zero is a control that does nothing.
 */
const sorts: SortDefinition<ScenarioRow>[] = [
  { id: 'name', label: 'name', compare: (a, b) => a.name.localeCompare(b.name) },
  { id: 'ticks', label: 'ticks', compare: (a, b) => b.ticks_processed - a.ticks_processed },
  {
    id: 'duration',
    label: 'time taken',
    compare: (a, b) => b.execution_time_ms - a.execution_time_ms,
  },
]

/** Seconds as a reader takes them in — the rendering edge, per the UTC policy. */
function took(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`
  if (ms < 90_000) return `${(ms / 1000).toFixed(1)} s`
  return `${(ms / 60_000).toFixed(1)} min`
}

const shown = computed(() => sortRows(
  applyFacets({
    rows: props.model.units,
    definitions: facets,
    selection: selection.value,
    search: search.value,
    searchOf: row => row.name,
  }),
  sorts,
  sort.value
))

const failed = computed(() => props.model.units.filter(row => row.status === 'failed').length)
</script>

<template>
  <div class="scenario-roster">
    <!-- the count of what never ran belongs above the filter: it is a property of the RUN, and a
         narrowed list would otherwise hide the very rows a reader most needs to see -->
    <p v-if="failed" class="roster-notice">
      <span class="mark">⚠</span>
      {{ failed }} {{ t('of') }} {{ model.units.length }}
      {{ t('scenarios produced nothing — their reason is on the row') }}
    </p>

    <FacetBar
      v-model:selection="selection"
      v-model:search="search"
      v-model:sort="sort"
      :rows="model.units"
      :facets="facets"
      :sorts="sorts"
      :search-of="row => row.name"
      :search-placeholder="t('Search scenarios')"
    />

    <p v-if="!shown.length" class="hint">{{ t('No scenario matches') }}</p>

    <ul v-else class="roster-list">
      <li v-for="row in shown" :key="row.name" class="roster-row" :class="row.status">
        <div class="roster-head">
          <span class="roster-name">{{ row.name }}</span>
          <span class="roster-meta">
            {{ row.symbol }}
            <template v-if="row.market_type"> · {{ row.market_type }}</template>
            · {{ row.account_currency }}
            · {{ row.data_source }}
          </span>
          <span class="roster-state" :class="row.status">
            {{ row.status === 'failed' ? '✖' : '✓' }} {{ row.status }}
          </span>
        </div>
        <p v-if="row.error_message" class="roster-reason">{{ row.error_message }}</p>
        <!-- only the counters that are actually carried: worker_count, the signal counters and
             trades_requested read 0 on every row measured, so printing them would state a zero the
             run never reported -->
        <p v-else class="roster-figures">
          {{ row.ticks_processed.toLocaleString() }} {{ t('ticks') }}
          <template v-if="row.execution_time_ms"> · {{ took(row.execution_time_ms) }}</template>
        </p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.roster-notice {
  display: flex;
  gap: var(--space-xs);
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-warning);
  border-radius: 4px;
  color: var(--color-warning);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.roster-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.roster-row {
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--color-border);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.roster-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.roster-name {
  color: var(--color-text-primary);
}

.roster-meta,
.roster-figures {
  color: var(--color-text-secondary);
}

.roster-state {
  margin-left: auto;
}

.roster-state.success { color: var(--color-positive); }
.roster-state.failed { color: var(--color-error); }

.roster-reason {
  margin: var(--space-xs) 0 0;
  color: var(--color-error);
  white-space: pre-wrap;
}

.roster-figures {
  margin: var(--space-xs) 0 0;
}

.hint {
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
