<script setup lang="ts">
import { computed } from 'vue'
import HoverCard from '@/components/base/HoverCard.vue'
import JumpLink from '@/components/base/JumpLink.vue'
import RecordList from '@/components/base/RecordList.vue'
import { useOpenInContext } from '@/composables/use_open_in_context'
import { rowKey } from '@/api/list_key'
import { amount, magnitude, duration, signClass, utcInstant } from '@/components/runs/report_format'
import type { DeploymentSessionRow } from '@/types/api/deployment_types'
import type { Figure } from '@/types/figure_types'
import type { ListColumn } from '@/types/list_types'
import { t } from '@/translate'

/**
 * The sessions of one deployment in one account currency, oldest first — a life reads forwards.
 * The order arrives from the ledger and is not re-sorted here: the change marks name a boundary
 * BETWEEN two rows, so reversing the rows without moving the marks would misplace them.
 *
 * No ordinal column. `index` rides on the row but is NOT part of the identity the response
 * declares — `key` is (run_id, currency) — so presenting it as "the session number" invents a
 * counter the ledger does not keep, and it repeats once a deployment books in two currencies.
 * The run is the identity; the order is the sequence.
 */
const props = defineProps<{
  sessions: DeploymentSessionRow[]
  keyFields: string[]
}>()

const { openRun, canOpen } = useOpenInContext()

/**
 * The session before each one, by row. A change mark compares a session with THAT one (their
 * `deployments` document), so its configuration is the other half of what the reader compares.
 * The order is the ledger's and never re-sorted, so the row above is the predecessor.
 */
const previousRun = computed(() => new Map(props.sessions.map((session, i) => [
  rowKey(session, props.keyFields),
  props.sessions[i - 1]?.run_id ?? null,
])))

/** The run of the session before this one, or null on the first. */
function before(session: DeploymentSessionRow): string | null {
  return previousRun.value.get(rowKey(session, props.keyFields)) ?? null
}

/** A session's configuration — what it was commissioned with — as a panel of its own. */
function openConfiguration(runId: string | null): void {
  if (runId) openRun(runId, 'config')
}

/**
 * Six columns on the shared list stem. Ranked, because a deployment panel is narrow more often
 * than a run panel is: what survives is WHICH session and what it earned.
 */
const columns: ListColumn[] = [
  { label: t('Run'), width: 'minmax(9rem, 22fr)', rank: 1 },
  { label: t('Started'), width: 'minmax(0, 18fr)', rank: 2 },
  { label: t('Ran'), width: 'minmax(0, 12fr)', figure: true, rank: 3 },
  { label: t('Idle before'), width: 'minmax(0, 14fr)', figure: true, rank: 3 },
  { label: t('Net P&L'), width: 'minmax(0, 18fr)', figure: true, rank: 1 },
  { label: t('Max DD'), width: 'minmax(0, 16fr)', figure: true, rank: 2 },
]

/** Whether anything changed at the boundary before a session. */
function hasBoundary(session: DeploymentSessionRow): boolean {
  return session.strategy_changed || session.operation_changed || session.orders_to_changed
}

function configurationClause(session: DeploymentSessionRow): string {
  if (session.strategy_changed && session.operation_changed) {
    return t('Strategy and operation changed from here')
  }
  if (session.strategy_changed) return t('Strategy changed from here')
  if (session.operation_changed) return t('Operation changed from here')
  return ''
}

/**
 * What a configuration mark means, in the backend's words (their `deployments` and `config`
 * documents). It says WHERE and never WHAT: the parameters that moved, as key, before and after,
 * are planned on their side (testingide#527) and computed here never — until they are served, the
 * two configurations are a click away on the line, and the comparison is the reader's.
 */
function markCard(session: DeploymentSessionRow): Figure[] {
  const rows: Figure[] = []
  if (session.strategy_changed) {
    rows.push({ label: t('Strategy'), value: t('What the bot decided: its parameters differ from the session before') })
  }
  if (session.operation_changed) {
    rows.push({
      label: t('Operation'),
      value: t('What a session did without changing what it decided: a safety threshold, a guard, a timeout, the capital declaration'),
    })
  }
  rows.push({ label: t('Which'), value: t('Not served yet: compare the configuration before with the one after') })
  if (session.operation_changed) {
    // the operation mark is computed from the profile as the session LOADED it, so it also moves
    // with the defaults merged in under the file and with a start option — neither is served
    rows.push({
      label: t('Not in a file'),
      value: t('Two identical configurations mean the change lies in a default or a start option, which no route serves'),
    })
  }
  return rows
}

/**
 * Where the orders went from this session on — the session's own `orders_to`, the value it moved
 * TO. `venue` is the only value that means money moved (their `run-kinds` document), so it is the
 * one named by its meaning; any other is named as it came.
 */
function ordersClause(to: string | null): string {
  if (to === 'venue') return t('Orders to real money from here')
  if (to === 'simulated') return t('Orders simulated from here')
  return `${t('Orders went elsewhere from here')}: ${to ?? ''}`
}

/**
 * The idle stretch before a session. Null on the first one — an absence, never a zero. Where it
 * could only be measured start-to-start it contains the predecessor's whole runtime, so it is
 * labelled as the upper bound it is rather than shown as the same measure.
 */
function gap(session: DeploymentSessionRow): string {
  if (session.gap_hours === null) return '—'
  return session.gap_between_starts ? `≤ ${duration(session.gap_hours)}` : duration(session.gap_hours)
}
</script>

<template>
  <!-- no totals row: net_pnl would sum, max_drawdown is a MAXIMUM and adding it counts one decline
       once per session that was still inside it. The figures above the list are the ledger's own,
       already reduced correctly. -->
  <RecordList
    class="sessions-list"
    :rows="sessions"
    :columns="columns"
    :row-key="session => rowKey(session, keyFields)"
    :has-lead="hasBoundary"
    inert
  >
    <!-- the mark sits BETWEEN two sessions: everything above it was produced by a different
         configuration from everything below, which a badge on one row would misreport as a
         property of that row -->
    <template #lead="{ row: session }">
      <template v-if="configurationClause(session)">
        <!-- reachable by the keyboard, so the card is not the pointer's alone -->
        <HoverCard :details="markCard(session)">
          <span class="boundary-words" tabindex="0">{{ configurationClause(session) }}</span>
        </HoverCard>
        <!-- the two halves of the comparison, ON the line rather than in the card: the card holds
             no control, and a link the keyboard cannot reach is not one -->
        <span v-if="canOpen && before(session)" class="boundary-links">
          <span aria-hidden="true">·</span>
          {{ t('Configuration') }}
          <JumpLink
            :title="`${t('Open the configuration the session before ran with')}: ${before(session)}`"
            @click="openConfiguration(before(session))"
          >{{ t('before') }}</JumpLink>
          <JumpLink
            :title="`${t('Open the configuration this session ran with')}: ${session.run_id}`"
            @click="openConfiguration(session.run_id)"
          >{{ t('after') }}</JumpLink>
        </span>
      </template>
      <span v-if="configurationClause(session) && session.orders_to_changed" aria-hidden="true">·</span>
      <span v-if="session.orders_to_changed" class="boundary-words">{{ ordersClause(session.orders_to) }}</span>
    </template>

    <template #default="{ row: session }">
      <span :data-rank="1" class="session-run">
        <JumpLink
          v-if="canOpen"
          :title="t('Open this run')"
          @click="openRun(session.run_id)"
        >{{ session.run_id }}</JumpLink>
        <template v-else>{{ session.run_id }}</template>
      </span>
      <span :data-rank="2">{{ utcInstant(session.started) }}</span>
      <span :data-rank="3" class="figure-cell">{{ duration(session.ran_hours) }}</span>
      <span :data-rank="3" class="figure-cell">{{ gap(session) }}</span>
      <span :data-rank="1" class="figure-cell" :class="signClass(session.net_pnl)">
        {{ amount(session.net_pnl, session.currency) }}
      </span>
      <span :data-rank="2" class="figure-cell">{{ magnitude(session.max_drawdown, session.currency) }}</span>
    </template>
  </RecordList>
</template>

<style scoped>
/* A FIGURE CELL is right-aligned under its right-aligned heading: `figure: true` on a column aligns
   the HEADING, and the cells are this component's. Asserted as geometry in
   `e2e/list_ranks.spec.ts` — no unit test can see it. */
.sessions-list :deep(.figure-cell) {
  text-align: right;
}

/* only what the shared list does not own: it carries the tracks, the headings, the read-only rows
   and the dashed boundary line */
.sessions-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* On the boundary line the words give way before the links do: cut, they keep their card, and a
   cut link would leave nothing to click. */
.sessions-list :deep(.record-lead) > .boundary-words {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sessions-list :deep(.record-lead) > .boundary-links {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 1ch;
}

/* the run is the identity, and the only thing on the row that is read rather than compared */
.session-run {
  text-align: left;
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
