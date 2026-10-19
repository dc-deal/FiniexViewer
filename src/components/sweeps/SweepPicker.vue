<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import AppButton from '@/components/base/AppButton.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import FacetBar from '@/components/base/FacetBar.vue'
import HintLine from '@/components/base/HintLine.vue'
import RecordList from '@/components/base/RecordList.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import { duration, sortInstant, startedAt, utcInstant } from '@/components/runs/report_format'
import { useFacetState } from '@/composables/use_facet_state'
import { rowKey } from '@/api/list_key'
import { useSweepsStore } from '@/stores/sweeps_store'
import type { SweepRow } from '@/types/api/sweep_types'
import type { FacetDefinition, SortDefinition } from '@/types/facet_types'
import type { Figure, FigureCard } from '@/types/figure_types'
import type { ListColumn } from '@/types/list_types'
import { plural, t } from '@/translate'

/**
 * Every parameter search on record, the way the deployments are picked: a facet bar over the flat
 * list, folded to one line once a sweep is chosen — its ranking below is what the reader came for.
 */
const store = useSweepsStore()
const { sweeps, sweepsKey, selectedSweepId, selectedSweep, loadingList } = storeToRefs(store)

const { selection, search, sort } = useFacetState('sweep-picker', 'newest')

function stated(value: string): string[] {
  return value ? [value] : []
}

const facets: FacetDefinition<SweepRow>[] = [
  { id: 'strategy', label: 'Strategy', valuesOf: row => stated(row.decision_logic_type) },
  { id: 'set', label: 'Set', valuesOf: row => stated(row.base_config) },
  { id: 'symbol', label: 'Symbol', valuesOf: row => row.symbols },
  { id: 'objective', label: 'Objective', valuesOf: row => stated(row.objective) },
]

const columns: ListColumn[] = [
  { label: t('Started'), width: 'minmax(0, 12fr)', rank: 3 },
  { label: t('Sweep'), width: 'minmax(9rem, 18fr)', rank: 1 },
  { label: t('Strategy'), width: 'minmax(0, 20fr)', rank: 2 },
  { label: t('Set'), width: 'minmax(0, 18fr)', rank: 4 },
  { label: t('Symbols'), width: 'minmax(0, 9fr)', rank: 4 },
  { label: t('Runs'), width: 'minmax(0, 8fr)', figure: true, rank: 1 },
  { label: t('Objective'), width: 'minmax(0, 13fr)', rank: 2 },
]

const sorts: SortDefinition<SweepRow>[] = [
  { id: 'newest', label: 'newest', compare: (a, b) => sortInstant(b.started) - sortInstant(a.started) },
  {
    id: 'runs',
    label: 'most runs',
    compare: (a, b) => b.run_count - a.run_count || sortInstant(b.started) - sortInstant(a.started),
  },
]

const shown = computed(() => sortRows(
  applyFacets({
    rows: sweeps.value,
    definitions: facets,
    selection: selection.value,
    search: search.value,
    searchOf: row => `${row.sweep_id} ${row.base_config} ${row.decision_logic_type}`,
  }),
  sorts,
  sort.value
))

/** The objective and its direction, in words; the arrow in the list is its short form. */
function objectiveWords(row: SweepRow): string {
  if (!row.objective) return t('none declared')
  return `${row.objective}, ${row.maximize ? t('highest first') : t('lowest first')}`
}

function card(row: SweepRow): FigureCard {
  const details: Figure[] = [
    { label: t('Started'), value: utcInstant(row.started), title: t('The earliest start of its runs') },
    {
      label: t('Starts spread over'),
      value: duration(row.duration_s / 3600),
      title: t("The last run's start minus the first's — not how long the sweep took: the last run's own duration falls outside it"),
    },
    { label: t('Runs'), value: plural(row.run_count, t('combination'), t('combinations')) },
    { label: t('Strategy'), value: `${row.decision_logic_type} ${row.decision_version}` },
    { label: t('Set'), value: row.base_config, title: t("The scenario set that was swept, with the sweep's own tag stripped off") },
    { label: t('Symbols'), value: row.symbols.join(', ') },
    { label: t('Objective'), value: objectiveWords(row) },
  ]
  // where every combination produced usable data, the count above says all of it
  if (row.error_count > 0) {
    details.push(
      { label: t('Usable'), value: String(row.ok_count) },
      { label: t('With errors'), value: String(row.error_count), tone: 'warning' },
    )
  }
  return { title: row.sweep_id, details }
}

/**
 * The list is the way in, so it is open until a sweep is chosen and folds once one is, as the
 * deployments' does. A sweep already chosen when it mounts folds it from the start.
 */
const open = ref(selectedSweepId.value === null)

watch(selectedSweepId, id => { open.value = id === null })

/** A pick folds the list away — the watch above sees only a CHANGE, so a re-pick folds it too. */
function pick(row: SweepRow): void {
  open.value = false
  void store.selectSweep(row.sweep_id)
}

/** Its strategy, its size and its start — one line, cut short where the panel is narrow. */
const chosenMeta = computed(() => {
  const row = selectedSweep.value
  if (!row) return ''
  return [
    `${row.decision_logic_type} ${row.decision_version}`,
    plural(row.run_count, t('combination'), t('combinations')),
    startedAt(row.started) || t('no date'),
  ].join(' · ')
})
</script>

<template>
  <div class="sweep-picker">
    <div v-if="loadingList" class="picker-state">
      <AppSpinner />
    </div>

    <!-- chosen: one line saying which, and the way back to the list -->
    <div v-else-if="!open" class="picker-chosen">
      <span class="chosen-label">{{ t('Sweep') }}</span>
      <span class="chosen-id">{{ selectedSweepId }}</span>
      <span v-if="selectedSweep" class="chosen-meta" :title="chosenMeta">{{ chosenMeta }}</span>
      <AppButton variant="quiet" @click="open = true">{{ t('Change sweep') }}</AppButton>
    </div>

    <template v-else>
      <HintLine id="sweeps" />
      <FacetBar
        v-model:selection="selection"
        v-model:search="search"
        v-model:sort="sort"
        :rows="sweeps"
        :facets="facets"
        :sorts="sorts"
        :search-of="row => `${row.sweep_id} ${row.base_config} ${row.decision_logic_type}`"
        :search-placeholder="t('Search sweeps by id, set or strategy')"
      />

      <p v-if="!sweeps.length" class="picker-hint">{{ t('The ledger reports no sweeps') }}</p>
      <p v-else-if="!shown.length" class="picker-hint">{{ t('No sweep matches') }}</p>

      <RecordList
        v-else
        class="sweep-list"
        :rows="shown"
        :columns="columns"
        :row-key="row => rowKey(row, sweepsKey)"
        :is-picked="row => row.sweep_id === selectedSweepId"
        :row-card="card"
        @pick="pick"
      >
        <!-- the rank on every cell is the one its own column declares -->
        <template #default="{ row }">
          <span :data-rank="3">{{ startedAt(row.started) || t('no date') }}</span>
          <span :data-rank="1" class="sweep-id" :title="row.sweep_id">{{ row.sweep_id }}</span>
          <span :data-rank="2" :title="`${row.decision_logic_type} ${row.decision_version}`">
            {{ row.decision_logic_type }} {{ row.decision_version }}
          </span>
          <span :data-rank="4" :title="row.base_config">{{ row.base_config }}</span>
          <span :data-rank="4">{{ row.symbols.join(', ') }}</span>
          <span :data-rank="1" class="figure-cell">
            {{ row.run_count }}<span v-if="row.error_count" class="sweep-errors" :title="t('Combinations that produced no usable data, and are not ranked')">
              · <AppIcon name="status-warning" /> {{ row.error_count }} {{ t('err') }}
            </span>
          </span>
          <!-- the arrow is the direction's short form; the words are on its title and the card -->
          <span :data-rank="2" :title="objectiveWords(row)">
            <template v-if="row.objective">{{ row.objective }} {{ row.maximize ? '↑' : '↓' }}</template>
            <template v-else>—</template>
          </span>
        </template>
      </RecordList>
    </template>
  </div>
</template>

<style scoped>
.sweep-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.picker-state {
  display: flex;
  justify-content: center;
  padding: var(--space-sm);
}

.picker-chosen {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.chosen-label {
  color: var(--color-text-secondary);
}

.chosen-id {
  flex-shrink: 0;
}

.chosen-meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.picker-hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/* of the view that holds the list, not of the browser window: the ranking below needs the room */
.sweep-list {
  max-height: 33cqh;
  overflow-y: auto;
}

.sweep-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sweep-list :deep(.figure-cell) {
  text-align: right;
}

.sweep-errors {
  color: var(--color-warning);
}
</style>
