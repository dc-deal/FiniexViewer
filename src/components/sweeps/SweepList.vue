<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/base/AppIcon.vue'
import FacetBar from '@/components/base/FacetBar.vue'
import HintLine from '@/components/base/HintLine.vue'
import RecordList from '@/components/base/RecordList.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import { amount, magnitude, numberOrNa, percentOrNa, signClass, sortInstant, startedAt } from '@/components/runs/report_format'
import {
  combinationCard, objectiveFigure, parametersText, parametersTitle, rankedBy, sweepListRows, sweepNotices, sweepTitle,
} from '@/components/sweeps/sweep_rows'
import type { SweepListRow } from '@/components/sweeps/sweep_rows'
import { useFacetState } from '@/composables/use_facet_state'
import { useRunsStore } from '@/stores/runs_store'
import { useSweepsStore } from '@/stores/sweeps_store'
import type { SweepRow } from '@/types/api/sweep_types'
import type { FacetDefinition, SortDefinition } from '@/types/facet_types'
import type { ListColumn } from '@/types/list_types'
import { plural, t } from '@/translate'

/**
 * Every parameter search on record as ONE list, the way the run list folds a family: each sweep a
 * heading that opens, and beneath it its combinations in the order the backend ranked them by the
 * objective the sweep declared. A combination is a run, chosen as the run list chooses one. No list
 * above and no ranking below: several sweeps can stand open at once, to be compared.
 */
const emit = defineEmits<{ chosen: [runId: string] }>()

const store = useSweepsStore()
const { sweeps, selectedSweepId, rankings, loadingRankings, rankingFailures, goneSweeps } = storeToRefs(store)
const runs = useRunsStore()
const { selectedRunId } = storeToRefs(runs)

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

const sorts: SortDefinition<SweepRow>[] = [
  { id: 'newest', label: 'newest', compare: (a, b) => sortInstant(b.started) - sortInstant(a.started) },
  {
    id: 'runs',
    label: 'most runs',
    compare: (a, b) => b.run_count - a.run_count || sortInstant(b.started) - sortInstant(a.started),
  },
]

function searchOf(row: SweepRow): string {
  return `${row.sweep_id} ${row.base_config} ${row.decision_logic_type}`
}

const shown = computed(() => sortRows(
  applyFacets({ rows: sweeps.value, definitions: facets, selection: selection.value, search: search.value, searchOf }),
  sorts,
  sort.value
))

/**
 * Every figure column keeps a floor its heading fits in: the parameters and the run give way
 * instead, each whole on its title (at 960 px the headings were cut one after the other).
 */
const columns: ListColumn[] = [
  // a combination is indented one step under its sweep's heading, and "1 ★" still has to fit
  { label: '#', width: 'minmax(5rem, 4fr)', rank: 1 },
  { label: t('Parameters'), width: 'minmax(0, 24fr)', rank: 1 },
  {
    label: t('Objective'),
    width: 'minmax(7rem, 11fr)',
    figure: true,
    rank: 1,
    hint: t("Each sweep's own objective, named on its line — its combinations stand in that order"),
  },
  { label: t('Net P&L'), width: 'minmax(7rem, 14fr)', figure: true, rank: 1 },
  { label: t('Trades'), width: 'minmax(4.5rem, 7fr)', figure: true, rank: 2 },
  // what a mean R rests on — "a small count beside a striking expectancy is the thing to show"
  { label: t('R trades'), width: 'minmax(5.5rem, 7fr)', figure: true, rank: 2, hint: t('How many trades the R figures rest on') },
  { label: t('Win rate'), width: 'minmax(5.5rem, 8fr)', figure: true, rank: 3 },
  { label: t('PF'), width: 'minmax(3.5rem, 6fr)', figure: true, rank: 3 },
  { label: t('Max DD'), width: 'minmax(7rem, 11fr)', figure: true, rank: 4 },
  { label: t('Run'), width: 'minmax(0, 16fr)', rank: 2 },
]

/**
 * Which sweeps are open. They start CLOSED, as the run list's families do: a list that opens every
 * sweep has folded nothing. Session state, not stored — the sweep looked at is the link's.
 */
const opened = ref(new Set<string>())

const rows = computed(() => sweepListRows(shown.value, {
  open: opened.value,
  rankings: rankings.value,
  loading: loadingRankings.value,
  failures: rankingFailures.value,
  gone: goneSweeps.value,
}))

const listRef = ref<{ $el: HTMLElement } | null>(null)

/**
 * The sweep the link names stands open, and in view: after a reload, and when the run header's
 * *Combination in sweep* led here. Opened once rather than held open — a heading that could not
 * close would be a button that did nothing.
 */
watch(selectedSweepId, async id => {
  if (!id) return
  if (!opened.value.has(id)) opened.value = new Set([...opened.value, id])
  await nextTick()
  const head = listRef.value?.$el?.querySelector?.(`[data-sweep="${id}"]`)
  head?.scrollIntoView?.({ block: 'nearest' })
}, { immediate: true })

/** Opening a sweep makes it the one looked at, and asks for its ranking the first time. */
function toggle(sweepId: string): void {
  const next = new Set(opened.value)
  if (next.delete(sweepId)) {
    opened.value = next
    return
  }
  next.add(sweepId)
  opened.value = next
  void store.selectSweep(sweepId)
}

/** A combination is a run, and chosen the way the run list chooses one. */
function choose(row: SweepListRow): void {
  if (row.kind !== 'combination') return
  void runs.selectRun(row.combination.run_id)
  emit('chosen', row.combination.run_id)
}
</script>

<template>
  <div class="sweep-browser">
    <HintLine id="sweeps" />
    <FacetBar
      v-model:selection="selection"
      v-model:search="search"
      v-model:sort="sort"
      :rows="sweeps"
      :facets="facets"
      :sorts="sorts"
      :search-of="searchOf"
      :search-placeholder="t('Search sweeps by id, set or strategy')"
    />

    <p v-if="!sweeps.length" class="list-hint">{{ t('The ledger reports no sweeps') }}</p>
    <p v-else-if="!shown.length" class="list-hint">{{ t('No sweep matches') }}</p>

    <RecordList
      v-else
      ref="listRef"
      class="sweep-list"
      :rows="rows"
      :columns="columns"
      :row-key="row => row.key"
      :group-by="row => row.sweep.sweep_id"
      :is-open="key => opened.has(key)"
      :can-pick="row => row.kind === 'combination'"
      :is-picked="row => row.kind === 'combination' && row.combination.run_id === selectedRunId"
      :row-card="row => row.kind === 'combination' ? combinationCard(row) : null"
      @toggle="toggle"
      @pick="choose"
    >
      <!-- the sweep on a line of its own: WHAT it searched, HOW MANY runs, by WHICH objective, WHEN —
           and, only where the ranking compares unlike things, a word saying so -->
      <template #group="{ group, marker }">
        <span class="sweep-head" :data-sweep="group.key" :title="sweepTitle(group.rows[0]!.sweep)">
          <span v-if="marker" class="record-marker" aria-hidden="true">{{ marker }}</span>
          <span class="sweep-id">{{ group.key }}</span>
          <span class="sweep-meta">
            {{ group.rows[0]!.sweep.decision_logic_type }} {{ group.rows[0]!.sweep.decision_version }}
            · {{ plural(group.rows[0]!.sweep.run_count, t('run'), t('runs')) }}
            · <span :title="rankedBy(group.rows[0]!.sweep, rankings[group.key]).sentence"
              >{{ rankedBy(group.rows[0]!.sweep, rankings[group.key]).word }}</span>
            · {{ startedAt(group.rows[0]!.sweep.started) || t('no date') }}
          </span>
          <span
            v-for="notice in sweepNotices(group.rows[0]!.sweep, rankings[group.key])"
            :key="notice.word"
            class="sweep-notice"
            :title="notice.sentence"
          >
            <AppIcon name="status-warning" /> {{ notice.word }}
          </span>
        </span>
      </template>

      <!-- the rank on every cell is the one its own column declares -->
      <template #default="{ row }">
        <template v-if="row.kind === 'combination'">
          <span
            :data-rank="1"
            class="figure-cell place"
            :class="{ best: row.first }"
            :title="row.first ? (row.place === 1 ? t('First in the ranking — the best by its objective') : t('Tied with the first on its objective')) : undefined"
          >{{ row.place }}<template v-if="row.first"> ★</template></span>
          <span :data-rank="1" :title="parametersTitle(row.combination)">{{ parametersText(row.combination) }}</span>
          <span :data-rank="1" class="figure-cell objective">{{ objectiveFigure(row) }}</span>
          <span :data-rank="1" class="figure-cell" :class="signClass(row.combination.net_pnl)">
            {{ amount(row.combination.net_pnl, row.combination.currency) }}
          </span>
          <span :data-rank="2" class="figure-cell">{{ row.combination.total_trades }}</span>
          <span :data-rank="2" class="figure-cell">{{ row.combination.r_trade_count }}</span>
          <span :data-rank="3" class="figure-cell">{{ percentOrNa(row.combination.win_rate, row.combination.total_trades) }}</span>
          <span :data-rank="3" class="figure-cell">{{ numberOrNa(row.combination.profit_factor, row.combination.total_trades) }}</span>
          <span :data-rank="4" class="figure-cell">{{ magnitude(row.combination.account_max_drawdown, row.combination.currency) }}</span>
          <span :data-rank="2" class="run-id" :title="row.combination.run_id">{{ row.combination.run_id }}</span>
        </template>
        <!-- where the ranking is not on screen, one line across every column says why -->
        <span v-else :data-rank="1" class="state-line">{{ row.message }}</span>
      </template>
    </RecordList>
  </div>
</template>

<style scoped>
.sweep-browser {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  flex: 1;
  min-height: 0;
}

.list-hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/* the list is the whole panel: it takes the rest of it, and keeps a third of a short one */
.sweep-list {
  flex: 1 1 0;
  min-height: 33cqh;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.sweep-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sweep-list :deep(.figure-cell) {
  text-align: right;
}

/* the heading spans every column, as the run list's family heading does */
.sweep-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.sweep-id {
  flex-shrink: 0;
}

.sweep-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text-secondary);
}

.sweep-notice {
  flex-shrink: 0;
  color: var(--color-warning);
}

/* the column the ranking is ordered by, set apart by weight */
.objective {
  font-weight: 600;
}

/* the first of a ranking: a mark AND a weight, never colour alone */
.place.best {
  font-weight: 600;
}

.run-id {
  color: var(--color-text-secondary);
}

.state-line {
  grid-column: 1 / -1;
  color: var(--color-text-secondary);
}
</style>
