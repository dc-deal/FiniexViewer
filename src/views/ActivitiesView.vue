<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/base/AppIcon.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import FacetBar from '@/components/base/FacetBar.vue'
import HintLine from '@/components/base/HintLine.vue'
import RecordList from '@/components/base/RecordList.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import { bytes, clockTime, duration, largerFirst, sortInstant, startedAt, utcInstant } from '@/components/runs/report_format'
import { rowKey } from '@/api/list_key'
import { useFacetState } from '@/composables/use_facet_state'
import { useDockStore } from '@/stores/dock_store'
import { useMachineStore } from '@/stores/machine_store'
import type { ActivityRow } from '@/types/api/machine_types'
import type { FacetDefinition, SortDefinition } from '@/types/facet_types'
import type { Figure, FigureCard } from '@/types/figure_types'
import type { ListColumn } from '@/types/list_types'
import { plural, t } from '@/translate'

/**
 * What runs on the machine (viewer#49): FiniexTestingIDE's activity list, one row per activity —
 * every backtest, sweep, session, import, the test suite and the server itself — built the way the
 * run list is, a facet bar over a list, the rest of a row in its card.
 *
 * Their rules hold here unchanged: a row is an activity, never a process; one that runs inside
 * another stands beneath it, and its memory is that one's; memory that could not be read says so
 * and is never a zero; nothing is derived. The list is asked every few seconds while this panel is
 * on show — a panel behind another tab stays mounted, so on show is read off the dock, not off the
 * mount — and the last answer is held, its age said once the readings stop arriving.
 */
const machine = useMachineStore()
const { activities, activitiesError, activitiesStale } = storeToRefs(machine)
const { shownIds } = storeToRefs(useDockStore())

let stopReading: (() => void) | null = null
watch(() => shownIds.value.includes('activities'), shown => {
  if (shown && !stopReading) stopReading = machine.watchActivities()
  if (!shown && stopReading) {
    stopReading()
    stopReading = null
  }
}, { immediate: true })
onUnmounted(() => stopReading?.())

const { selection, search, sort } = useFacetState('activities', 'newest')

const rows = computed<ActivityRow[]>(() => activities.value?.activities ?? [])
const serverId = computed(() => activities.value?.server_activity_id ?? null)
const byId = computed(() => new Map(rows.value.map(row => [row.activity_id, row])))

/** `.` is the code the answering server runs from — said so, since a dot says nothing to a reader. */
function code(row: ActivityRow): string {
  return row.working_tree === '.' ? t('same as the server') : row.working_tree
}

const facets: FacetDefinition<ActivityRow>[] = [
  { id: 'kind', label: 'Kind', valuesOf: row => [row.activity_kind] },
  // a value the row does not state is not offered — an empty option reads as a category
  { id: 'origin', label: 'Origin', valuesOf: row => row.origin_channel ? [row.origin_channel] : [] },
  { id: 'code', label: 'Code', valuesOf: row => [code(row)] },
]

const sorts: SortDefinition<ActivityRow>[] = [
  { id: 'newest', label: 'newest', compare: (a, b) => sortInstant(b.started_at) - sortInstant(a.started_at) },
  { id: 'memory', label: 'memory', compare: (a, b) => largerFirst(a.rss_bytes, b.rss_bytes) },
  { id: 'longest', label: 'longest running', compare: (a, b) => b.uptime_s - a.uptime_s },
]

/**
 * Seven columns, ranked: what a narrow panel keeps is WHAT runs and how much it holds; when it
 * started, for how long, who started it and from which code go first.
 */
const columns: ListColumn[] = [
  { label: t('Started'), width: 'minmax(0, 11fr)', rank: 2 },
  // `autotrader_session` and `discovery_cache_build` are the longest words: room for them where there is room
  { label: t('Kind'), width: 'minmax(0, 15fr)', rank: 1 },
  { label: t('Label'), width: 'minmax(8rem, 30fr)', rank: 1 },
  { label: t('Uptime'), width: 'minmax(0, 8fr)', figure: true, rank: 3 },
  { label: t('Memory'), width: 'minmax(0, 10fr)', figure: true, rank: 1 },
  { label: t('Origin'), width: 'minmax(0, 8fr)', rank: 4 },
  { label: t('Code'), width: 'minmax(0, 12fr)', rank: 4 },
]

/** The parent an activity runs inside, where it is still listed — one that has ended is not. */
function parentOf(row: ActivityRow): ActivityRow | null {
  return row.parent_activity_id ? byId.value.get(row.parent_activity_id) ?? null : null
}

/**
 * Each activity right beneath the one it runs inside, the rest in the order chosen. A row whose
 * parent is filtered away or has ended stands on its own.
 */
const shown = computed(() => {
  const ordered = sortRows(
    applyFacets({
      rows: rows.value,
      definitions: facets,
      selection: selection.value,
      search: search.value,
      searchOf: row => `${row.activity_label} ${row.run_id ?? ''} ${row.command_line}`,
    }),
    sorts,
    sort.value,
  )
  const present = new Set(ordered.map(row => row.activity_id))
  const children = new Map<string, ActivityRow[]>()
  const tops: ActivityRow[] = []
  for (const row of ordered) {
    const parent = row.parent_activity_id
    if (parent && present.has(parent)) children.set(parent, [...(children.get(parent) ?? []), row])
    else tops.push(row)
  }
  const nested: ActivityRow[] = []
  const place = (row: ActivityRow): void => {
    nested.push(row)
    for (const child of children.get(row.activity_id) ?? []) place(child)
  }
  tops.forEach(place)
  return nested
})

/** Beneath the one it runs inside, in this list as drawn. */
function nestedRow(row: ActivityRow): boolean {
  const parent = parentOf(row)
  return parent !== null && shown.value.includes(parent)
}

/**
 * Its memory as the answer states it: an activity inside another holds none of its own — its
 * processes count toward the one that started them — and one that could not be read says so.
 */
function memory(row: ActivityRow): string {
  if (row.rss_bytes === null) return t('unreadable')
  // the parent stands right above it in the list, or its card says it has ended
  if (row.process_count === 0 && row.parent_activity_id) return t('in its parent')
  return bytes(row.rss_bytes)
}

/** What the row has no width for — every field of it, nothing derived. */
function card(row: ActivityRow): FigureCard {
  const parent = parentOf(row)
  const origin = [row.origin_channel, row.origin_client, row.origin_principal, row.origin_host].filter(Boolean)
  const details: Figure[] = [
    { label: t('State'), value: row.activity_state },
    { label: t('Started'), value: utcInstant(row.started_at) },
    { label: t('Uptime'), value: duration(row.uptime_s / 3600) },
    {
      label: t('Memory'),
      value: `${memory(row)} · ${plural(row.process_count, t('process'), t('processes'))}`,
      ...(row.rss_bytes === null ? { tone: 'warning' as const } : {}),
    },
    ...(row.run_id ? [{ label: t('Run'), value: row.run_id }] : []),
    ...(row.sweep_id ? [{ label: t('Sweep'), value: row.sweep_id }] : []),
    ...(row.parent_activity_id
      ? [{
          label: t('Runs inside'),
          value: parent ? `${parent.activity_kind} · ${parent.activity_label}` : `${row.parent_activity_id} — ${t('has ended')}`,
        }]
      : []),
    { label: t('Code'), value: row.git_commit ? `${code(row)} · ${row.git_commit}` : code(row) },
    { label: t('Origin'), value: origin.length ? origin.join(' · ') : t('not recorded') },
    ...(row.console_session ? [{ label: t('Console session'), value: row.console_session }] : []),
    { label: t('Process id'), value: String(row.pid) },
    { label: t('Command line'), value: row.command_line },
  ]
  return { title: `${row.activity_kind} · ${row.activity_label}`, details }
}

/** Activities that run and cannot be read by this server: they hold memory all the same. */
const unreadable = computed(() => activities.value?.unreadable_activity_ids.length ?? 0)
</script>

<template>
  <div class="activities-view">
    <HintLine id="activities" />

    <!-- notices only where something is off: a list that is fine says nothing about itself -->
    <p v-if="activitiesError" class="notice error-msg">
      <AppIcon name="status-error" class="notice-mark" />{{ activitiesError }}
    </p>
    <template v-if="activities">
      <p v-if="activitiesStale" class="notice warning-msg">
        <AppIcon name="status-warning" class="notice-mark" />
        {{ t('as of') }} {{ clockTime(activities.measured_at) }} — {{ t('the readings have stopped arriving') }}
      </p>
      <p v-if="activities.server_activity_id === null" class="notice warning-msg">
        <AppIcon name="status-warning" class="notice-mark" />{{ t('The server is not in its own list — it may not be complete') }}
      </p>
      <p v-if="unreadable" class="notice warning-msg">
        <AppIcon name="status-warning" class="notice-mark" />
        {{ plural(unreadable, t('activity runs'), t('activities run')) }}
        {{ t('whose entry this server cannot read — written by another version of the code, holding memory all the same') }}
      </p>
    </template>

    <div v-if="!activities && !activitiesError" class="state">
      <AppSpinner />
    </div>
    <template v-else-if="activities">
      <p class="measured">{{ t('Measured') }} {{ clockTime(activities.measured_at) }}</p>
      <FacetBar
        v-model:selection="selection"
        v-model:search="search"
        v-model:sort="sort"
        :rows="rows"
        :facets="facets"
        :sorts="sorts"
        :search-of="row => `${row.activity_label} ${row.run_id ?? ''} ${row.command_line}`"
        :search-placeholder="t('Search by label, run id or command line')"
      />
      <p v-if="!rows.length" class="hint">{{ t('No activity is listed') }}</p>
      <p v-else-if="!shown.length" class="hint">{{ t('No activity matches') }}</p>
      <RecordList
        v-else
        class="activity-list"
        :rows="shown"
        :columns="columns"
        :row-key="row => rowKey(row, activities!.key)"
        :row-card="card"
        inert
      >
        <template #default="{ row }">
          <span :data-rank="2">{{ startedAt(row.started_at) }}</span>
          <span :data-rank="1" class="cell-text" :title="row.activity_kind">{{ row.activity_kind }}</span>
          <span :data-rank="1" class="activity-label" :class="{ nested: nestedRow(row) }" :title="row.activity_label">
            <span v-if="nestedRow(row)" class="activity-nest" aria-hidden="true">↳</span>
            {{ row.activity_label }}
            <span v-if="row.activity_id === serverId" class="activity-mark">{{ t('this server') }}</span>
          </span>
          <span :data-rank="3" class="figure-cell">{{ duration(row.uptime_s / 3600) }}</span>
          <span :data-rank="1" class="figure-cell" :class="{ 'warning-msg': row.rss_bytes === null }">
            <AppIcon v-if="row.rss_bytes === null" name="status-warning" class="notice-mark" /> {{ memory(row) }}
          </span>
          <span :data-rank="4" class="cell-text" :title="row.origin_channel ?? undefined">{{ row.origin_channel ?? '—' }}</span>
          <span :data-rank="4" class="cell-text" :title="row.git_commit ? `${code(row)} · ${row.git_commit}` : code(row)">
            {{ code(row) }}
          </span>
        </template>
      </RecordList>
    </template>
  </div>
</template>

<style scoped>
.activities-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  height: 100%;
  padding: var(--space-sm);
  overflow-y: auto;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.state {
  display: flex;
  justify-content: center;
  padding: var(--space-md);
}

.measured,
.hint {
  margin: 0;
  color: var(--color-text-secondary);
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-xs);
  margin: 0;
}

.notice-mark {
  flex-shrink: 0;
}

/* held on the FIRST line of a notice that wraps, where the words it belongs to begin */
.notice > .notice-mark {
  margin-top: 0.15em;
}

/* the data or the request is wrong: the error role, its mark beside it — a colour never travels alone */
.error-msg {
  color: var(--color-error);
}

/* something to weigh before trusting what is beside it */
.warning-msg {
  color: var(--color-warning);
}

/* every text cell cuts itself off at its track: uncut, `autotrader_session` ran on into the label
   beside it (operator, on screen, 2026-10-19) — the whole value is on hover */
.cell-text,
.activity-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* beneath the one it runs inside: the arrow in an indent of its own, the label after it */
.activity-label.nested {
  padding-left: 0.5em;
}

.activity-nest {
  color: var(--color-text-secondary);
}

.activity-mark {
  margin-left: var(--space-xs);
  color: var(--color-text-secondary);
}

.figure-cell {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
