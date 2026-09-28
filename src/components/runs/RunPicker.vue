<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import FacetBar from '@/components/base/FacetBar.vue'
import AppButton from '@/components/base/AppButton.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import type { FacetDefinition, FacetSelection, SortDefinition } from '@/types/facet_types'
import type { RunInfo } from '@/types/api/report_types'
import { t } from '@/translate'

/**
 * Which run to look at — a facet bar over a flat list, not a cascade of dropdowns.
 *
 * The cascade it replaces asked for a group, then a set, then a run. Measured over the real index
 * on 2026-09-27: 40 runs sit in 29 different (group, set) pairs, the largest set holds six runs and
 * exactly one set holds more than five. So the third dropdown was choosing between one and six
 * things, while the SECOND held 29 — and the question a reader actually arrives with, "the run I
 * did on Thursday", is navigation by time, which a name cascade cannot answer at all.
 *
 * The same `FacetBar` the scenario roster uses, pointed at a different row type. It is generic and
 * holds no state, so this costs the facet definitions and nothing else.
 */
const runsStore = useRunsStore()
const { runs, selectedRun, selectedRunId, loadingRuns } = storeToRefs(runsStore)

const selection = ref<FacetSelection>({})
const search = ref('')
const sort = ref('newest')

/** A value the row does not state is not offered — an empty option reads as a category. */
function stated(value: string | null): string[] {
  return value ? [value] : []
}

const facets: FacetDefinition<RunInfo>[] = [
  { id: 'group', label: 'Group', valuesOf: row => stated(row.group) },
  { id: 'set', label: 'Set', valuesOf: row => stated(row.name) },
  // the one facet built rather than read: it is the presence of a field, which has two names
  { id: 'artifacts', label: 'Artifacts', valuesOf: row => [row.has_reports ? 'reports' : 'logs only'] },
  { id: 'reporting', label: 'Reporting', valuesOf: row => stated(row.reporting) },
  { id: 'origin', label: 'Origin', valuesOf: row => stated(row.parent_kind) },
  { id: 'version', label: 'Version', valuesOf: row => stated(row.app_version) },
]

/**
 * Parsed rather than compared as text: `start_time` is ISO-8601 with an explicit offset, and two
 * offsets sort lexicographically in the wrong order. An unreadable stamp sorts last under
 * "newest" rather than jumping to the top.
 */
function instant(iso: string): number {
  const at = Date.parse(iso)
  return Number.isNaN(at) ? 0 : at
}

const sorts: SortDefinition<RunInfo>[] = [
  { id: 'newest', label: 'newest', compare: (a, b) => instant(b.start_time) - instant(a.start_time) },
  { id: 'oldest', label: 'oldest', compare: (a, b) => instant(a.start_time) - instant(b.start_time) },
  {
    id: 'name',
    label: 'name',
    // within one set the newest first, or a set of six runs is six rows in arbitrary order
    compare: (a, b) =>
      a.name.localeCompare(b.name) || instant(b.start_time) - instant(a.start_time),
  },
]

const shown = computed(() => sortRows(
  applyFacets({
    rows: runs.value,
    definitions: facets,
    selection: selection.value,
    search: search.value,
    searchOf: row => `${row.run_id} ${row.name}`,
  }),
  sorts,
  sort.value
))

/**
 * When the run started, in the reader's own zone. The id encodes the same instant, but nobody
 * reads `20260925_095227` as a date at a glance — which is the whole reason this column exists.
 */
function startedAt(iso: string): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at)
}

/**
 * The list is the way in, so it is open until there is something to look at — and it collapses
 * once a run is chosen, or forty rows push every panel off the screen.
 */
const open = ref(true)

watch(selectedRunId, runId => { open.value = runId === null })
</script>

<template>
  <div class="run-picker">
    <div v-if="loadingRuns" class="picker-state">
      <AppSpinner />
    </div>

    <!-- chosen: one line saying which, and the way back to the list -->
    <div v-else-if="!open" class="picker-chosen">
      <span class="chosen-label">{{ t('Run') }}</span>
      <span class="chosen-id">{{ selectedRun?.run_id }}</span>
      <span class="chosen-meta">
        {{ selectedRun?.group }} · {{ selectedRun?.name }}
        <template v-if="selectedRun?.start_time">
          · {{ startedAt(selectedRun.start_time) }}
        </template>
      </span>
      <AppButton variant="quiet" @click="open = true">{{ t('Change run') }}</AppButton>
    </div>

    <template v-else>
      <FacetBar
        v-model:selection="selection"
        v-model:search="search"
        v-model:sort="sort"
        :rows="runs"
        :facets="facets"
        :sorts="sorts"
        :search-of="row => `${row.run_id} ${row.name}`"
        :search-placeholder="t('Search runs by id or set')"
      />

      <p v-if="!runs.length" class="picker-hint">
        {{ t('The backend reports no runs — its run index is empty') }}
      </p>
      <p v-else-if="!shown.length" class="picker-hint">{{ t('No run matches') }}</p>

      <ul v-else class="run-list">
        <li v-for="run in shown" :key="run.run_id">
          <!-- A logs-only run is chosen like any other: the view says what it is, and the store
               asks for nothing. A row that cannot be clicked is the look of a broken control. -->
          <button
            type="button"
            class="run-row"
            :class="{ picked: run.run_id === selectedRunId }"
            @click="runsStore.selectRun(run.run_id)"
          >
            <span class="run-when">{{ startedAt(run.start_time) || t('no date') }}</span>
            <span class="run-group">{{ run.group }}</span>
            <span class="run-name">{{ run.name }}</span>
            <span class="run-id">{{ run.run_id }}</span>
            <span v-if="run.parent_kind" class="run-mark">{{ run.parent_kind }}</span>
            <span v-if="!run.has_reports" class="run-mark logs">{{ t('logs only') }}</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.run-picker {
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
  align-items: baseline;
  gap: var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.chosen-label {
  color: var(--color-text-secondary);
}

.chosen-id {
  color: var(--color-text-primary);
}

.chosen-meta {
  color: var(--color-text-secondary);
}

.picker-chosen .app-button {
  margin-left: auto;
}

.picker-hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/* the list is the way in, so it gets room — but never more than a third of the window, or the
   panels it leads to are never on screen at the same time */
.run-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 33vh;
  overflow-y: auto;
}

.run-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
  border: none;
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--color-border);
  background: none;
  font-family: monospace;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.run-row:hover {
  background-color: var(--color-bg-hover);
}

.run-row:active {
  background-color: var(--color-bg-active);
}

.run-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* the chosen row is marked by a rule AND by colour, never by colour alone */
.run-row.picked {
  border-left-color: var(--color-annotation);
}

.run-row.picked .run-name {
  color: var(--color-annotation);
}

.run-when {
  flex: 0 0 11rem;
  color: var(--color-text-primary);
}

.run-group {
  flex: 0 0 6rem;
  color: var(--color-text-secondary);
}

.run-name {
  flex: 1;
  color: var(--color-accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-id,
.run-mark {
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.run-mark {
  padding: 0 var(--space-xs);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.run-mark.logs {
  border-style: dashed;
  border-color: var(--color-annotation);
  color: var(--color-annotation);
}
</style>
