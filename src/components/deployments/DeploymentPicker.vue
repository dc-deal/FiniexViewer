<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeploymentsStore } from '@/stores/deployments_store'
import AppSpinner from '@/components/base/AppSpinner.vue'
import FacetBar from '@/components/base/FacetBar.vue'
import HintLine from '@/components/base/HintLine.vue'
import RecordList from '@/components/base/RecordList.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import { deploymentCard, idleGap } from '@/components/deployments/deployment_card'
import { useFacetState } from '@/composables/use_facet_state'
import { rowKey } from '@/api/list_key'
import {
  amount, magnitude, orDash, percentFigure, signClass, sortInstant, startedAt,
} from '@/components/runs/report_format'
import type { FacetDefinition, SortDefinition } from '@/types/facet_types'
import type { ListColumn } from '@/types/list_types'
import type { DeploymentRow } from '@/types/api/deployment_types'
import { t } from '@/translate'

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

const { selection, search, sort } = useFacetState('deployment-picker', 'newest')

/** A value the row does not state is not offered — an empty option reads as a category. */
function stated(value: string | null): string[] {
  return value ? [value] : []
}

const facets: FacetDefinition<DeploymentRow>[] = [
  { id: 'bot', label: 'Bot', valuesOf: row => stated(row.bot) },
  { id: 'currency', label: 'Currency', valuesOf: row => stated(row.currency) },
  /*
   * Built rather than read, like the run list's `artifacts` facet: `configuration_changed` is a boolean,
   * and a facet offering `true` / `false` asks the reader to translate. It is also the one property of a
   * deployment that changes how its own figures must be read, which is what earns it a facet at
   * all — the sessions below a moved configuration were produced by a different stand.
   */
  {
    id: 'stand',
    label: 'Configuration',
    valuesOf: row => [row.configuration_changed ? 'moved' : 'one stand'],
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
 * The last track carries the marks of what moved and has no heading: they are marks, not a measured
 * field, the same treatment the run list gives its origin marks. How long ago the code moved stands in
 * the row's card.
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
  { label: '', width: 'minmax(0, 14fr)', rank: 3 },
]

const sorts: SortDefinition<DeploymentRow>[] = [
  {
    id: 'newest',
    label: 'newest',
    compare: (a, b) => sortInstant(b.last_started) - sortInstant(a.last_started),
  },
  {
    id: 'oldest',
    label: 'oldest',
    compare: (a, b) => sortInstant(a.first_started) - sortInstant(b.first_started),
  },
  {
    id: 'sessions',
    label: 'sessions',
    compare: (a, b) => b.sessions - a.sessions || sortInstant(b.last_started) - sortInstant(a.last_started),
  },
  {
    id: 'name',
    label: 'name',
    // within one bot the newest first, or several deployments of it sit in arbitrary order
    compare: (a, b) =>
      a.bot.localeCompare(b.bot) || sortInstant(b.last_started) - sortInstant(a.last_started),
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
 * A pick chooses the deployment; the list stays whole and marks it, as the run list does, and the
 * deployment's bundle shows it (viewer#43).
 */
const emit = defineEmits<{ chosen: [] }>()

function pick(row: DeploymentRow): void {
  void store.selectDeployment(row.deployment_id)
  emit('chosen')
}
</script>

<template>
  <div class="deployment-picker">
    <div v-if="loadingList" class="picker-state">
      <AppSpinner />
    </div>

    <template v-else>
      <HintLine id="facet-bar" />
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
        :row-card="deploymentCard"
        @pick="pick"
      >
        <!-- the rank on every cell is the one its own column declares: the list owns the tracks and
             this template owns the cells -->
        <template #default="{ row }">
          <span :data-rank="1" class="deployment-id" :title="row.deployment_id">
            {{ row.deployment_id }}
          </span>
          <span :data-rank="1" class="deployment-bot" :title="row.bot">{{ row.bot }}</span>
          <span :data-rank="2" class="figure-cell">{{ row.sessions }}</span>
          <span :data-rank="4">{{ startedAt(row.first_started) || t('no date') }}</span>
          <span :data-rank="3">{{ startedAt(row.last_started) || t('no date') }}</span>
          <span :data-rank="1" class="figure-cell" :class="signClass(row.net_pnl)">
            {{ amount(row.net_pnl, row.currency) }}
          </span>
          <!-- the percentage one hover away rather than a tenth column: the magnitude is what
               compares two deployments, the ratio is what a single one is read against -->
          <span :data-rank="2" class="figure-cell" :title="orDash(row.max_drawdown_pct, percentFigure)">
            {{ orDash(row.max_drawdown, value => magnitude(value, row.currency)) }}
          </span>
          <span :data-rank="4" class="figure-cell">{{ idleGap(row) }}</span>
          <!-- one cell whether or not a mark is in it, so the gap column never moves -->
          <span :data-rank="3" class="deployment-marks">
            <!-- `changed` says only that one of the two moved; the reason is read from these -->
            <span v-if="row.configuration_changed" class="deployment-mark">{{ t('config') }}</span>
            <span v-if="row.code_summary" class="deployment-mark">{{ t('code') }}</span>
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

.picker-hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/* the list is the panel now: it takes the height its panel has, the history standing in the
   deployment bundle beside it (viewer#43). Everything else about its shape belongs to
   `base/RecordList.vue`. */
.deployment-picker {
  flex: 1;
  min-height: 0;
}

.deployment-list {
  flex: 1;
  min-height: 0;
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
  gap: var(--space-xs);
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
