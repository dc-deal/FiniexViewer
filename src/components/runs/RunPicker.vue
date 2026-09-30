<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import FacetBar from '@/components/base/FacetBar.vue'
import AppButton from '@/components/base/AppButton.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import RecordList from '@/components/base/RecordList.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import { useFacetQuery } from '@/composables/use_facet_query'
import type { FacetDefinition, SortDefinition } from '@/types/facet_types'
import type { ListCard, ListColumn } from '@/types/list_types'
import type { Figure } from '@/types/figure_types'
import { amount, bytes, marketSpan, shortHash, utcInstant } from '@/components/runs/report_format'
import type { RunInfo, RunResult } from '@/types/api/report_types'
import { plural, t } from '@/translate'

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

// the narrowing rides in the URL under `runf` / `runq` / `runsort`, so a filtered index is a link
const { selection, search, sort } = useFacetQuery('run', 'newest')

/** A value the row does not state is not offered — an empty option reads as a category. */
function stated(value: string | null): string[] {
  return value ? [value] : []
}

const facets: FacetDefinition<RunInfo>[] = [
  { id: 'group', label: 'Run type', valuesOf: row => stated(row.group) },
  { id: 'set', label: 'Set', valuesOf: row => stated(row.name) },
  // the one facet built rather than read: it is the presence of a field, which has two names
  { id: 'artifacts', label: 'Artifacts', valuesOf: row => [row.has_reports ? 'reports' : 'logs only'] },
  { id: 'reporting', label: 'Reporting', valuesOf: row => stated(row.reporting) },
  { id: 'origin', label: 'Origin', valuesOf: row => stated(row.parent_kind) },
  { id: 'version', label: 'Version', valuesOf: row => stated(row.app_version) },
  // contract 15. A run the ledger holds nothing for states no outcome, and an absence is not a
  // category — `stated` drops it rather than offering "unknown" as something to pick.
  { id: 'outcome', label: 'Outcome', valuesOf: row => stated(row.run_outcome) },
  {
    id: 'trouble',
    label: 'Trouble',
    // PRESENCE of a stated count, never a threshold of our own: null means nobody counted, which
    // is not the same as zero and claims nothing either way
    valuesOf: row => {
      const marks: string[] = []
      if (row.error_count) marks.push('error')
      if (row.warning_count) marks.push('warning')
      return marks
    },
  },
]

/**
 * What a run earned, ONE ENTRY PER ACCOUNT CURRENCY — never folded into a single figure.
 *
 * `results` has three states and they are three different statements: `null` is the ledger holding
 * nothing for this run (still going, died before its close, or `reporting: none` — read it beside
 * `reporting`), `[]` is a run that closed without figures, a list is what it earned. Measured over
 * the 41 runs here: 38 lists, 2 null, 1 empty, so all three reach the screen.
 *
 * A run with two currencies shows two figures. Adding them would be the derivation this repo does
 * not do — and it would be wrong as arithmetic besides, since the two are different money.
 */
function earned(run: RunInfo): RunResult[] {
  return run.results ?? []
}

/**
 * The column headings, in the order of the list's tracks. Held here rather than written out in the
 * template because `P&L` in markup is an invalid character reference — `&L` is not an entity, and
 * the template stops compiling on it. The last track carries the origin and logs-only marks and
 * has no heading: they are marks, not a measured column.
 *
 * **What a narrow list keeps**, and it is the question this list exists to answer: WHICH run
 * (`Started`, `Set`), whether it worked (`Outcome`), and what it earned (`Net P&L`). Everything
 * else is given up in order, and every one of them is in the row's card whatever the width.
 *
 * `Run id` goes FIRST although it is the row's declared key, and that is the one choice here worth
 * stating: it renders as the timestamp part of the id, which is the same instant `Started` already
 * shows in words. Two spellings of one fact are not two facts.
 *
 * Every rung of the ladder gives something up — 10 columns, then 8, 7, 6 and 4. A rank the list
 * does not use makes a breakpoint that changes nothing, which reads as a broken one: the first
 * version of this declared no rank 4 at all and so held all ten columns down to 48rem, then dropped
 * six at once.
 *
 * The FIFTH rung earns its place by measurement rather than by symmetry. At 71 rem — the ordinary
 * width of a maximised window here, not a narrow one — the ten columns left `Set` with 112 px for
 * 157 px of text, so the one cell a reader recognises read `aggressive_t…` while the run id beside
 * it showed the same instant `Started` already spells out. Those two go at 80 rem and `Set` gets
 * their width.
 */
const columns: ListColumn[] = [
  // Sized from the cells rather than from a rem number, now that the stamp is 13 characters
  // instead of 22. `auto` needs the cell to stay on one line, which `.run-when` declares — the
  // 13rem it replaces was chosen because the old stamp wrapped at 11.
  { label: t('Started'), width: 'auto', rank: 1 },
  { label: t('Run type'), width: '7rem', rank: 5 },
  // a floor as well as the slack: the set NAMES the run, and with a bare `1fr` the columns added
  // since squeezed it to `EU…` — the one cell on the row a reader actually recognises
  { label: t('Set'), width: 'minmax(7rem, 1fr)', rank: 1 },
  // the id and `Started` encode the SAME instant, so the id is the one that goes: the stamp is
  // what a reader scans by, and the whole id stays in the cell's title and in the card
  { label: t('Run id'), width: 'auto', rank: 5 },
  // How much MARKET the run read — what the scenario roster puts first for the same reason: it is
  // the figure that says how big a run was, and nothing else on the row carries it.
  { label: t('Market time'), width: 'auto', figure: true, rank: 4 },
  { label: t('Outcome'), width: 'auto', rank: 1 },
  { label: t('Net P&L'), width: 'auto', figure: true, rank: 1 },
  { label: t('Trades'), width: 'auto', figure: true, rank: 3 },
  { label: t('Trouble'), width: 'auto', figure: true, rank: 2 },
  { label: '', width: 'auto', rank: 2 },
]

/**
 * The run id, shortened to the part a reader recognises: the timestamp. The eight hex characters
 * after it separate two runs of the same second and nothing else, and they were costing the set
 * name nine characters in every row since the columns began sharing one grid.
 */
function shortId(runId: string): string {
  const at = runId.lastIndexOf('_')
  return at > 0 ? `${runId.slice(0, at)}…` : runId
}

/** The polarity of a figure, the same role it carries in every other panel. */
function signOf(value: number): string {
  if (value === 0) return ''
  return value > 0 ? 'positive' : 'negative'
}

/**
 * Parsed rather than compared as text: `start_time` is ISO-8601 with an explicit offset, and two
 * offsets sort lexicographically in the wrong order. An unreadable stamp sorts last under
 * "newest" rather than jumping to the top.
 */
function instant(iso: string): number {
  const at = Date.parse(iso)
  return Number.isNaN(at) ? 0 : at
}

/** A run that never recorded its span sorts last under "longest" rather than first. */
function span(run: RunInfo): number {
  return run.tick_timespan_seconds ?? -1
}

const sorts: SortDefinition<RunInfo>[] = [
  { id: 'newest', label: 'newest', compare: (a, b) => instant(b.start_time) - instant(a.start_time) },
  { id: 'oldest', label: 'oldest', compare: (a, b) => instant(a.start_time) - instant(b.start_time) },
  {
    id: 'span',
    label: 'market time',
    compare: (a, b) => span(b) - span(a) || instant(b.start_time) - instant(a.start_time),
  },
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
 *
 * A label says only what its neighbours do not, which is the same rule the time axis follows: the
 * year is dropped inside the current one and kept outside it, and the seconds are gone — two runs
 * of the same minute are told apart by the id, not by this. `Sep 29, 2026, 12:27 PM` was 22
 * characters and needed 13rem of a 28rem panel, which is what made the narrowest tier overflow by
 * 24 px. `Sep 29, 12:27` is 13.
 *
 * The MONTH stays a word on purpose. This column is the reader's own zone while the card beside it
 * carries UTC, and a numeric `2026-09-29 12:27` reads like the canonical clock that it is not.
 */
function startedAt(iso: string): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const sameYear = at.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(undefined, {
    ...(sameYear ? {} : { year: 'numeric' }),
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(at)
}

/**
 * What the row has no width for — and on this list that is most of the index row.
 *
 * `RunInfo` carries twenty-one fields and ten of them reach a column. The rest are what a reader
 * asks about ONE run: where its ticks came from, which configuration produced it, how much it
 * weighs on disk, which sections it wrote. A card is where a question about one row belongs, and
 * the operator's standing rule is that every table offers the extended information of the API line
 * it already has.
 *
 * Nothing is derived and nothing is fetched: every line below names a field of the index row that
 * is on screen anyway. Measured over the 46 stored runs on 2026-09-30, which is why several lines
 * are conditional — `reporting` reads `expected` on all 46 and `app_version` `1.4.0` on all 46,
 * while `ticks_from` is stated on 18 and `data_windows` on 18.
 */
function card(run: RunInfo): ListCard {
  const details: Figure[] = []
  // UTC beside the column's local rendering: the stamp in the column is in the reader's own zone,
  // and the canonical clock is the one the run itself was written in. Absent for a stamp that is
  // not a date — the same hole the column shows as "no date", never an empty pair.
  const started = utcInstant(run.start_time)
  if (started) details.push({ label: t('Started (UTC)'), value: started })
  // WHERE THE TICKS CAME FROM and WHERE THE ORDERS WENT — the two facts that separate the four
  // kinds of run. Null on a run recorded before contract 12, so stated or absent, never guessed.
  if (run.ticks_from) details.push({ label: t('Ticks from'), value: run.ticks_from })
  if (run.orders_to) details.push({ label: t('Orders to'), value: run.orders_to })
  if (run.parent_id) {
    details.push({ label: run.parent_kind ?? t('Parent'), value: run.parent_id })
  }
  details.push(
    { label: t('Configuration'), value: run.config_snapshot },
    { label: t('Config id'), value: shortHash(run.config_id), title: run.config_id },
    { label: t('Version'), value: `${run.app_version} · ${run.git_commit}` },
    { label: t('Reporting'), value: run.reporting },
    { label: t('Size'), value: bytes(run.size_bytes) },
  )
  // The sections the run WROTE. It says which panels can exist at all, and it varies by pipeline
  // rather than by a count that could be assumed — 16, 19 or 20 over the stored runs, and 0 on the
  // two that are logs only, where the row's own mark already says so.
  if (run.artifacts.length) {
    details.push({
      label: t('Artifacts'),
      value: plural(run.artifacts.length, t('section'), t('sections')),
      title: run.artifacts.join(', '),
    })
  }
  // the windows a run DECLARED, which is not the market time it went on to read — that figure is
  // its own column. Null is a run that never recorded the field, so an absence stays an absence.
  if (run.data_windows?.length) {
    details.push({
      label: t('Data windows'),
      value: plural(run.data_windows.length, t('window'), t('windows')),
      title: run.data_windows.map(window => window.unit_name).join(', '),
    })
  }
  // Tier 2, the one trouble count the row deliberately leaves off: WARNING records from the log
  // pot, ignorable by design. It reaches 547 on one stored run, so it is worth a line where it is
  // not zero — and a zero says nothing, so it gets none.
  if (run.log_warning_count) {
    details.push({
      label: t('Log warnings'),
      value: String(run.log_warning_count),
      title: t('Tier 2 — WARNING records in the log, ignorable by design. See the scenario logs.'),
    })
  }
  return { title: run.run_id, details }
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

      <RecordList
        v-else
        class="run-list"
        :rows="shown"
        :columns="columns"
        :row-key="run => run.run_id"
        :is-picked="run => run.run_id === selectedRunId"
        :row-card="card"
        @pick="run => runsStore.selectRun(run.run_id)"
      >
        <!-- A logs-only run is chosen like any other: the view says what it is, and the store asks
             for nothing. A row that cannot be clicked is the look of a broken control. -->
        <!-- the rank on every cell is the one its own column declares: the list owns the tracks and
             this template owns the cells, so a track given up under a cell that stayed would shift
             every later cell into the wrong column -->
        <template #default="{ row: run }">
          <span :data-rank="1" class="run-when">
            {{ startedAt(run.start_time) || t('no date') }}
          </span>
          <span :data-rank="5" class="run-group">{{ run.group }}</span>
          <span :data-rank="1" class="run-name" :title="run.name">{{ run.name }}</span>
          <!-- the stamp identifies it to a reader, the eight hex characters do not — and the whole
               id is one hover away. Same treatment the configuration id already gets. -->
          <span :data-rank="5" class="run-id" :title="run.run_id">{{ shortId(run.run_id) }}</span>
          <!-- What the run DID, from the index row itself — no request per run (contract 15). -->
          <span :data-rank="4" class="run-span">{{ marketSpan(run.tick_timespan_seconds) }}</span>
          <span :data-rank="1" class="run-outcome" :class="run.run_outcome ?? ''">
            <template v-if="run.run_outcome">
              {{ run.run_outcome === 'success' ? '✓' : '✖' }} {{ run.run_outcome }}
            </template>
          </span>
          <!-- one line per account currency, and the two cells iterate the same list, so the
               amount and its trade count stay on one line together -->
          <span :data-rank="1" class="run-pnl">
            <span
              v-for="result in earned(run)"
              :key="result.currency"
              :class="signOf(result.net_pnl)"
            >{{ amount(result.net_pnl, result.currency) }}</span>
          </span>
          <span :data-rank="3" class="run-trades">
            <span v-for="result in earned(run)" :key="result.currency">
              {{ plural(result.total_trades, t('trade'), t('trades')) }}
            </span>
          </span>
          <!-- one slot, present or not: a mark on some rows and not others moved the column -->
          <span :data-rank="2" class="run-counts">
            <span v-if="run.error_count" class="run-mark error">✖ {{ run.error_count }}</span>
            <span v-if="run.warning_count" class="run-mark warned">⚠ {{ run.warning_count }}</span>
          </span>
          <!-- one cell, however many marks: two spans of their own would push the id column to a
               different place on every row, which is what made the list look ragged -->
          <span :data-rank="2" class="run-marks">
            <span v-if="run.parent_kind" class="run-mark">{{ run.parent_kind }}</span>
            <span v-if="!run.has_reports" class="run-mark logs">{{ t('logs only') }}</span>
          </span>
        </template>
      </RecordList>
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
   panels it leads to are never on screen at the same time. Everything else about its shape —
   the tracks, the sticky headings, the row's four states — belongs to `base/RecordList.vue`. */
.run-list {
  max-height: 33vh;
  overflow-y: auto;
}

/* the chosen row is marked by a rule AND by colour, never by colour alone */
:deep(.record-row.picked) .run-name {
  color: var(--color-annotation);
}

/* one line, which is what lets the track be `auto`: an auto track is the widest cell in it, and a
   cell that may wrap has no single width to be measured by */
.run-when {
  white-space: nowrap;
  color: var(--color-text-primary);
}

.run-group {
  color: var(--color-text-secondary);
}

.run-name {
  color: var(--color-accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-id,
.run-mark {
  color: var(--color-text-secondary);
}

/* the marks sit together in one track, so an absent mark never moves the id */
.run-marks {
  display: flex;
  gap: var(--space-xs);
  justify-content: flex-end;
}

/* The badge fits INSIDE the text line rather than standing on it. Measured 2026-09-30: at the
   default line height its box was 20 px in a row of 16 px cells, so a row carrying one stood 29 px
   against 27 — and changing the sort or the filter visibly changed the rhythm of the list. A
   reader then sees the list move rather than the data change. */
.run-mark {
  padding: 0 var(--space-xs);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  line-height: 1;
}

/* What the run DID. The same roles the scenario roster uses for the same facts, so a reader who
   learns them in one list does not relearn them in the other — and every status glyph travels with
   its word, because a dark yellow and a dark red are inseparable under red-green colour blindness
   in the light theme. */
.run-outcome {
  white-space: nowrap;
}

/* a column of figures is read downwards, so it is right-aligned and its digits line up; several
   account currencies stack within the cell rather than widening it */
.run-pnl {
  /* a zero has no polarity and therefore no sign colour — but it is still a figure the backend
     stated, so it reads in plain ink rather than inheriting nothing */
  color: var(--color-text-primary);
}

.run-pnl,
/* read down the column against its neighbours, like every other figure here */
.run-span {
  text-align: right;
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.run-trades {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  white-space: nowrap;
}

.run-outcome.success { color: var(--color-positive); }
.run-outcome.failed,
.run-outcome.crashed { color: var(--color-error); }
.run-outcome.finished_with_errors { color: var(--color-warning); }

/* two currencies are two figures, never one */
.run-trades {
  color: var(--color-text-secondary);
}

.run-pnl .positive { color: var(--color-positive); }
.run-pnl .negative { color: var(--color-negative); }

/* reserved whether or not a mark is in it, so the trade count lines up down the list */
.run-counts {
  display: flex;
  gap: var(--space-xs);
  justify-content: flex-end;
  min-width: 4.5rem;
}

.run-mark.error {
  border-color: var(--color-error);
  color: var(--color-error);
}

.run-mark.warned {
  border-color: var(--color-warning);
  color: var(--color-warning);
}

.run-mark.logs {
  border-style: dashed;
  border-color: var(--color-annotation);
  color: var(--color-annotation);
}
</style>
