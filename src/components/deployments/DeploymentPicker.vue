<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeploymentsStore } from '@/stores/deployments_store'
import AppButton from '@/components/base/AppButton.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import FacetBar from '@/components/base/FacetBar.vue'
import RecordList from '@/components/base/RecordList.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import { useFacetQuery } from '@/composables/use_facet_query'
import { rowKey } from '@/api/list_key'
import {
  amount, duration, magnitude, percentFigure, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { FacetDefinition, SortDefinition } from '@/types/facet_types'
import type { Figure } from '@/types/figure_types'
import type { ListCard, ListColumn } from '@/types/list_types'
import type { DeploymentRow } from '@/types/api/deployment_types'
import { plural, t } from '@/translate'

/**
 * Which deployment to look at — the same facet bar over a flat list that the run picker and the
 * scenario roster use, in place of the select box this replaces.
 *
 * The select showed `bot · deployment_id`: **two of the twelve fields a ledger row carries**. The
 * other ten — how many sessions, when the first and last started, what it earned, how deep it fell,
 * the longest idle stretch, whether its configuration moved — were invisible until something had
 * been chosen, which is the same defect the run cascade had, one level shallower. A reader choosing
 * a deployment is choosing between its HISTORIES, and none of that was on offer.
 *
 * **One row per LEDGER ROW, not per deployment**, and that is the change the select could not make.
 * The response declares its key as (deployment_id, currency), so a bot that booked in two account
 * currencies has two rows with different money in them. A select had to fold them — two options
 * reading `demo_bot · deploy_2026…` twice is two things to a reader — and folding meant either
 * hiding a currency or summing across them, which is not arithmetic. A list can show both and say
 * WHY: the id repeats, the amounts carry their own currency, and clicking either opens the one
 * deployment they are both part of.
 *
 * No stored deployment books in two currencies today (measured over the three on this machine, all
 * USD), so this is the declared key being honoured rather than a case being served.
 */
const store = useDeploymentsStore()
const {
  deployments, deploymentsKey, selectedDeploymentId, loadingList,
} = storeToRefs(store)

// the narrowing rides in the URL under `depf` / `depq` / `depsort`, so a filtered ledger is a link
const { selection, search, sort } = useFacetQuery('dep', 'newest')

/** A value the row does not state is not offered — an empty option reads as a category. */
function stated(value: string | null): string[] {
  return value ? [value] : []
}

const facets: FacetDefinition<DeploymentRow>[] = [
  { id: 'bot', label: 'Bot', valuesOf: row => stated(row.bot) },
  { id: 'currency', label: 'Currency', valuesOf: row => stated(row.currency) },
  /*
   * Built rather than read, like the run list's `artifacts` facet: `changed` is a boolean, and a
   * facet offering `true` / `false` asks the reader to translate. It is also the one property of a
   * deployment that changes how its own figures must be read, which is what earns it a facet at
   * all — the sessions below a moved configuration were produced by a different stand.
   */
  {
    id: 'stand',
    label: 'Configuration',
    valuesOf: row => [row.changed ? 'moved' : 'one stand'],
  },
]

/**
 * Nine columns, ranked 9 → 7 → 5 → 3. What a narrow list keeps is WHICH deployment, what it is
 * called and what it earned; the stamps and the ratios go first.
 *
 * `Bot` is rank 1 beside the id deliberately: the id is minted per deployment and says nothing a
 * reader recognises, while `bot` is what the profile is CALLED. Neither alone answers "is this the
 * one I mean" — the id because it is a stamp, the name because an operator improves it and two
 * deployments can share it.
 *
 * The last track carries the configuration mark and has no heading: it is a mark, not a measured
 * field, the same treatment the run list gives its origin marks.
 */
const columns: ListColumn[] = [
  { label: t('Deployment'), width: 'minmax(9rem, 20fr)', rank: 1 },
  { label: t('Bot'), width: 'minmax(0, 14fr)', rank: 1 },
  { label: t('Sessions'), width: 'minmax(0, 10fr)', figure: true, rank: 2 },
  { label: t('First started'), width: 'minmax(0, 16fr)', rank: 4 },
  { label: t('Last started'), width: 'minmax(0, 16fr)', rank: 3 },
  { label: t('Net P&L'), width: 'minmax(0, 16fr)', figure: true, rank: 1 },
  { label: t('Max DD'), width: 'minmax(0, 15fr)', figure: true, rank: 2 },
  { label: t('Longest gap'), width: 'minmax(0, 12fr)', figure: true, rank: 4 },
  { label: '', width: 'minmax(0, 10fr)', rank: 3 },
]

function instant(iso: string): number {
  const at = Date.parse(iso)
  return Number.isNaN(at) ? 0 : at
}

const sorts: SortDefinition<DeploymentRow>[] = [
  {
    id: 'newest',
    label: 'newest',
    compare: (a, b) => instant(b.last_started) - instant(a.last_started),
  },
  {
    id: 'oldest',
    label: 'oldest',
    compare: (a, b) => instant(a.first_started) - instant(b.first_started),
  },
  {
    id: 'sessions',
    label: 'sessions',
    compare: (a, b) => b.sessions - a.sessions || instant(b.last_started) - instant(a.last_started),
  },
  {
    id: 'name',
    label: 'name',
    // within one bot the newest first, or several deployments of it sit in arbitrary order
    compare: (a, b) =>
      a.bot.localeCompare(b.bot) || instant(b.last_started) - instant(a.last_started),
  },
]

const shown = computed(() => sortRows(
  applyFacets({
    rows: deployments.value,
    definitions: facets,
    selection: selection.value,
    search: search.value,
    searchOf: row => `${row.deployment_id} ${row.bot}`,
  }),
  sorts,
  sort.value
))

/**
 * The stamp a reader scans by, in their own zone — the same treatment and the same reasoning as the
 * run list's: the year is dropped inside the current year and kept outside it, the seconds are
 * gone, and the month stays a WORD because the card beside it carries UTC.
 */
function startedAt(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return t('no date')
  const sameYear = at.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(undefined, {
    ...(sameYear ? {} : { year: 'numeric' }),
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(at)
}

/**
 * The longest idle stretch between two sessions. `null` where no such stretch EXISTS — a deployment
 * of one session has nothing between its sessions — which is an absence and not a zero.
 */
function gap(row: DeploymentRow): string {
  return row.longest_gap_hours === null ? t('n/a') : duration(row.longest_gap_hours)
}

/**
 * What the row has no width for. Nothing is derived: every line names a field of the ledger row
 * that is on screen anyway, and the two stamps appear here on the CANONICAL clock beside the
 * column's rendering in the reader's own zone.
 */
function card(row: DeploymentRow): ListCard {
  const details: Figure[] = [
    { label: t('First started'), value: utcInstant(row.first_started) },
    { label: t('Last started'), value: utcInstant(row.last_started) },
    { label: t('Sessions'), value: plural(row.sessions, t('session'), t('sessions')) },
    {
      label: t('Net P&L'),
      value: amount(row.net_pnl, row.currency),
      tone: signClass(row.net_pnl),
      title: t('A sum over the sessions. The drawdown beside it is NOT — see its own caveat.'),
    },
    {
      label: t('Max drawdown'),
      value: `${magnitude(row.max_drawdown, row.currency)} (${percentFigure(row.max_drawdown_pct)})`,
      title: t('The deepest of the sessions, never their sum: each carries the running decline against the peak the deployment had reached, so adding them counts one decline once per session it spanned.'),
    },
    { label: t('Longest idle'), value: gap(row) },
  ]
  // the identity that does not move, and the only join that answers "is this the same bot as the
  // row above". Empty on a profile that declares none, so it is stated or it is absent.
  if (row.bot_id) details.push({ label: t('Bot id'), value: row.bot_id })
  // and where everything is fine, nothing is printed: one stand throughout is the ordinary case
  if (row.changed) {
    details.push({
      label: t('Configuration'),
      value: t('moved between sessions'),
      tone: 'warning',
      title: t('The sessions were not all produced by one configuration. Where the boundary falls is in the sessions table.'),
    })
  }
  return { title: `${row.deployment_id} · ${row.currency}`, details }
}

/**
 * The list is the way in, so it is open until there is something to look at — and it collapses once
 * a deployment is chosen, the same as the run picker, because the history below it is what the
 * reader came for.
 */
const open = ref(true)

watch(selectedDeploymentId, id => { open.value = id === null })

/** The chosen deployment's own row, for the one line the collapsed form shows. */
const chosen = computed(() =>
  deployments.value.find(row => row.deployment_id === selectedDeploymentId.value) ?? null
)
</script>

<template>
  <div class="deployment-picker">
    <div v-if="loadingList" class="picker-state">
      <AppSpinner />
    </div>

    <!-- chosen: one line saying which, and the way back to the list -->
    <div v-else-if="!open" class="picker-chosen">
      <span class="chosen-label">{{ t('Deployment') }}</span>
      <span class="chosen-id">{{ selectedDeploymentId }}</span>
      <span v-if="chosen" class="chosen-meta">
        {{ chosen.bot }} · {{ plural(chosen.sessions, t('session'), t('sessions')) }}
        · {{ startedAt(chosen.last_started) }}
      </span>
      <AppButton variant="quiet" @click="open = true">{{ t('Change deployment') }}</AppButton>
    </div>

    <template v-else>
      <FacetBar
        v-model:selection="selection"
        v-model:search="search"
        v-model:sort="sort"
        :rows="deployments"
        :facets="facets"
        :sorts="sorts"
        :search-of="row => `${row.deployment_id} ${row.bot}`"
        :search-placeholder="t('Search deployments by id or bot')"
      />

      <p v-if="!deployments.length" class="picker-hint">
        {{ t('The ledger reports no deployments') }}
      </p>
      <p v-else-if="!shown.length" class="picker-hint">{{ t('No deployment matches') }}</p>

      <RecordList
        v-else
        class="deployment-list"
        :rows="shown"
        :columns="columns"
        :row-key="row => rowKey(row, deploymentsKey)"
        :is-picked="row => row.deployment_id === selectedDeploymentId"
        :row-card="card"
        @pick="row => store.selectDeployment(row.deployment_id)"
      >
        <!-- the rank on every cell is the one its own column declares: the list owns the tracks and
             this template owns the cells -->
        <template #default="{ row }">
          <span :data-rank="1" class="deployment-id" :title="row.deployment_id">
            {{ row.deployment_id }}
          </span>
          <span :data-rank="1" class="deployment-bot" :title="row.bot">{{ row.bot }}</span>
          <span :data-rank="2" class="figure-cell">{{ row.sessions }}</span>
          <span :data-rank="4">{{ startedAt(row.first_started) }}</span>
          <span :data-rank="3">{{ startedAt(row.last_started) }}</span>
          <span :data-rank="1" class="figure-cell" :class="signClass(row.net_pnl)">
            {{ amount(row.net_pnl, row.currency) }}
          </span>
          <!-- the percentage one hover away rather than a tenth column: the magnitude is what
               compares two deployments, the ratio is what a single one is read against -->
          <span :data-rank="2" class="figure-cell" :title="percentFigure(row.max_drawdown_pct)">
            {{ magnitude(row.max_drawdown, row.currency) }}
          </span>
          <span :data-rank="4" class="figure-cell">{{ gap(row) }}</span>
          <!-- one cell whether or not a mark is in it, so the gap column never moves -->
          <span :data-rank="3" class="deployment-marks">
            <span v-if="row.changed" class="deployment-mark">{{ t('changed') }}</span>
          </span>
        </template>
      </RecordList>
    </template>
  </div>
</template>

<style scoped>
.deployment-picker {
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

.chosen-label,
.chosen-meta {
  color: var(--color-text-secondary);
}

.chosen-id {
  color: var(--color-text-primary);
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

/* never more than a third of the window: the history the list leads to has to fit beside it.
   Everything else about its shape belongs to `base/RecordList.vue`. */
.deployment-list {
  max-height: 33vh;
  overflow-y: auto;
}

.deployment-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* the chosen row is marked by a rule AND by colour, never by colour alone */
:deep(.record-row.picked) .deployment-id {
  color: var(--color-annotation);
}

.deployment-id {
  color: var(--color-accent);
}

.deployment-bot {
  color: var(--color-text-primary);
}

/* A FIGURE CELL is right-aligned under its right-aligned heading: `figure: true` on a column aligns
   the HEADING, and the cells are this component's. Asserted as geometry in
   `e2e/list_ranks.spec.ts` — no unit test can see it. */
.deployment-list :deep(.figure-cell) {
  text-align: right;
}

.deployment-marks {
  display: flex;
  justify-content: flex-end;
}

/* the mark fits INSIDE the text line rather than standing on it, or a row carrying one is taller
   than its neighbours and changing the sort changes the rhythm of the list */
.deployment-mark {
  padding: 0 var(--space-xs);
  border: 1px solid var(--color-annotation);
  border-radius: 4px;
  border-style: dashed;
  color: var(--color-annotation);
  line-height: 1;
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
