<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/base/AppIcon.vue'
import RecordList from '@/components/base/RecordList.vue'
import {
  amount, duration, figure, magnitude, numberOrNa, percentFigure, percentOrNa, rValue, shortHash, signClass, utcInstant,
} from '@/components/runs/report_format'
import { useOpenInContext } from '@/composables/use_open_in_context'
import { rowKey } from '@/api/list_key'
import { useRunsStore } from '@/stores/runs_store'
import type { SweepCombination, SweepDetail, SweepRow } from '@/types/api/sweep_types'
import type { Figure, FigureCard } from '@/types/figure_types'
import type { ListColumn } from '@/types/list_types'
import { plural, t } from '@/translate'

/**
 * One sweep's combinations IN THE ORDER THE ROUTE RANKED THEM, within each account currency —
 * nothing here re-sorts or re-ranks: the order is the answer. The first of each currency is marked
 * as the best; that is a position, not a figure. A row opens its run, and its card carries the
 * fields that say whether the ranking compares like with like.
 *
 * @param sweep The sweep's row in the list — what it declared, and how many of its runs failed.
 * @param detail The route's ranking of its usable combinations.
 */
const props = defineProps<{ sweep: SweepRow, detail: SweepDetail }>()

const { openRun, canOpen } = useOpenInContext()
const { selectedRunId } = storeToRefs(useRunsStore())

function keyOf(row: SweepCombination): string {
  return rowKey(row, props.detail.key)
}

/** The currencies in the order the route ranked them — each one ranking of its own. */
const currencies = computed(() => [...new Set(props.detail.combinations.map(row => row.currency))])

function rowsOf(currency: string): SweepCombination[] {
  return props.detail.combinations.filter(row => row.currency === currency)
}

/** A row's place in its currency's ranking: the route's order, numbered. */
const places = computed(() => {
  const numbered = new Map<string, number>()
  for (const currency of currencies.value) rowsOf(currency).forEach((row, index) => numbered.set(keyOf(row), index + 1))
  return numbered
})

/** The objective's label as the app's other lists print it; one this version does not know, as named. */
const OBJECTIVE_LABELS: Record<string, string> = {
  expectancy: t('Expectancy'),
  net_pnl: t('Net P&L'),
  win_rate: t('Win rate'),
  profit_factor: t('PF'),
  account_max_drawdown: t('Max DD'),
}

const objectiveLabel = computed(() => OBJECTIVE_LABELS[props.detail.objective] ?? props.detail.objective)

/** The objective's figure, formatted as the summary formats the same field; one unknown here, as a number. */
function objectiveFigure(row: SweepCombination): string {
  switch (props.detail.objective) {
    case 'expectancy': return rValue(row.expectancy, row.r_trade_count)
    case 'net_pnl': return amount(row.net_pnl, row.currency)
    case 'win_rate': return percentOrNa(row.win_rate, row.total_trades)
    case 'profit_factor': return numberOrNa(row.profit_factor, row.total_trades)
    case 'account_max_drawdown': return magnitude(row.account_max_drawdown, row.currency)
  }
  // their vocabulary may grow: the field the response names, read by that name
  const value = (row as unknown as Record<string, unknown>)[props.detail.objective]
  return typeof value === 'number' ? figure(value) : t('n/a')
}

interface Kpi {
  id: string
  column: ListColumn
  text: (row: SweepCombination) => string
  tone?: (row: SweepCombination) => string
}

/** What else a combination is judged on — its objective's own column left out, which stands first. */
const KPIS: Kpi[] = [
  {
    id: 'net_pnl',
    column: { label: t('Net P&L'), width: 'minmax(0, 14fr)', figure: true, rank: 1 },
    text: row => amount(row.net_pnl, row.currency),
    tone: row => signClass(row.net_pnl),
  },
  {
    id: 'total_trades',
    column: { label: t('Trades'), width: 'minmax(0, 7fr)', figure: true, rank: 2 },
    text: row => String(row.total_trades),
  },
  {
    // what a mean R rests on — "a small count beside a striking expectancy is the thing to show"
    id: 'r_trade_count',
    column: { label: t('R trades'), width: 'minmax(0, 7fr)', figure: true, rank: 2, hint: t('How many trades the R figures rest on') },
    text: row => String(row.r_trade_count),
  },
  {
    id: 'win_rate',
    column: { label: t('Win rate'), width: 'minmax(0, 8fr)', figure: true, rank: 3 },
    text: row => percentOrNa(row.win_rate, row.total_trades),
  },
  {
    id: 'profit_factor',
    column: { label: t('PF'), width: 'minmax(0, 6fr)', figure: true, rank: 3 },
    text: row => numberOrNa(row.profit_factor, row.total_trades),
  },
  {
    id: 'account_max_drawdown',
    column: { label: t('Max DD'), width: 'minmax(0, 11fr)', figure: true, rank: 4 },
    text: row => magnitude(row.account_max_drawdown, row.currency),
  },
]

// the R count stands beside an R objective only: under another one it explains nothing on screen
const kpis = computed(() => KPIS.filter(kpi =>
  kpi.id !== props.detail.objective && (kpi.id !== 'r_trade_count' || props.detail.objective === 'expectancy')))

const columns = computed<ListColumn[]>(() => [
  { label: '#', width: 'minmax(2.5rem, 4fr)', rank: 1 },
  { label: t('Parameters'), width: 'minmax(0, 24fr)', rank: 1 },
  {
    label: `${objectiveLabel.value} ${props.detail.maximize ? '▼' : '▲'}`,
    width: 'minmax(0, 11fr)',
    figure: true,
    rank: 1,
    hint: props.detail.maximize ? t('The ranking, highest first') : t('The ranking, lowest first'),
  },
  ...kpis.value.map(kpi => kpi.column),
  { label: t('Run'), width: 'minmax(0, 16fr)', rank: 2 },
])

/** A parameter by the last part of its configuration key; the whole key is on the title and the card. */
function parametersText(row: SweepCombination): string {
  return Object.entries(row.sweep_params).map(([key, value]) => `${key.split('.').pop()} ${value}`).join(' · ')
}

function parametersTitle(row: SweepCombination): string {
  return Object.entries(row.sweep_params).map(([key, value]) => `${key} ${value}`).join('\n')
}

/** How the ranking was ordered, said once above it — the sweep's own objective, or the route's stand-in. */
const rankedBy = computed(() => {
  const direction = props.detail.maximize ? t('highest first') : t('lowest first')
  const whose = props.sweep.objective
    ? t("the sweep's own objective")
    : t('the sweep declared none, so the backend ranked by this')
  const within = currencies.value.length > 1 ? ` · ${t('within each account currency')}` : ''
  return `${t('Ranked by')} ${objectiveLabel.value}, ${direction} — ${whose}${within}`
})

/**
 * The fields that make a ranking comparable, where the combinations disagree on them: they then
 * compare measures that changed underneath (their `sweeps` document). Equality of served values,
 * nothing more.
 */
const COMPARABLE: [keyof SweepCombination, string][] = [
  ['logic_version', t('logic version')],
  ['decision_version', t('strategy version')],
  ['git_commit', t('code')],
  ['profile_hash', t('simulator settings')],
]

const differing = computed(() => COMPARABLE
  .filter(([field]) => new Set(props.detail.combinations.map(row => row[field])).size > 1)
  .map(([, words]) => words))

const pruned = computed(() => props.detail.combinations.filter(row => row.records_pruned_at !== '').length)

function card(row: SweepCombination): FigureCard {
  const details: Figure[] = [
    ...Object.entries(row.sweep_params).map(([key, value]) => ({ label: key, value: String(value) })),
    { label: t('Net P&L'), value: amount(row.net_pnl, row.currency), tone: signClass(row.net_pnl) },
    {
      label: t('Expectancy'),
      value: rValue(row.expectancy, row.r_trade_count),
      title: t('The mean R. Read it beside the trades it rests on: R is the result over the loss the stop of the trade would have taken'),
    },
    { label: t('R trades'), value: `${row.r_trade_count} (${row.r_win_count}W/${row.r_loss_count}L)` },
    { label: t('Avg win R'), value: rValue(row.avg_win_r, row.r_win_count) },
    { label: t('Avg loss R'), value: rValue(row.avg_loss_r, row.r_loss_count) },
    { label: t('Trades'), value: `${row.total_trades} (${row.winning_trades}W/${row.losing_trades}L)` },
    { label: t('Win rate'), value: percentOrNa(row.win_rate, row.total_trades) },
    { label: t('Profit factor'), value: numberOrNa(row.profit_factor, row.total_trades) },
    {
      label: t('Max drawdown'),
      value: row.account_max_drawdown_pct === null
        ? magnitude(row.account_max_drawdown, row.currency)
        : `${magnitude(row.account_max_drawdown, row.currency)} (${percentFigure(row.account_max_drawdown_pct)})`,
    },
    { label: t('Fees'), value: amount(row.total_fees, row.currency) },
    {
      label: t('Mean hold'),
      value: row.avg_trade_duration_s === null ? t('n/a') : duration(row.avg_trade_duration_s / 3600),
    },
    { label: t('Run'), value: row.run_id },
    {
      label: t('Code'),
      value: [row.git_commit, row.git_branch, row.git_dirty ? t('dirty or not determined') : ''].filter(Boolean).join(' · '),
      title: t('Dirty covers every repository a part of the run came from, and also code whose state could not be determined'),
    },
    { label: t('Logic version'), value: row.logic_version === null ? t('unknown') : String(row.logic_version) },
    { label: t('Strategy'), value: `${row.decision_logic_type} ${row.decision_version}` },
    { label: t('Parameters hash'), value: shortHash(row.param_hash), title: row.param_hash },
    { label: t('Settings hash'), value: row.profile_hash ? shortHash(row.profile_hash) : t('not recorded'), title: row.profile_hash || undefined },
    {
      label: t('Candidates'),
      value: row.trial_count === null ? t('unknown') : String(row.trial_count),
      title: t('How many candidates this run was selected from'),
    },
  ]
  if (row.records_pruned_at) {
    details.push({
      label: t('Records pruned'),
      value: utcInstant(row.records_pruned_at),
      tone: 'warning',
      title: t('The run records behind these figures were removed: they can no longer be checked'),
    })
  }
  return { title: `${places.value.get(keyOf(row))}. ${parametersText(row)}`, details }
}

function open(row: SweepCombination): void {
  if (canOpen) openRun(row.run_id)
}
</script>

<template>
  <div class="sweep-ranking">
    <p class="ranked-by">{{ rankedBy }}</p>

    <!-- only where something is off; a ranking whose rows compare alike says nothing more -->
    <p v-if="sweep.error_count" class="notice warning-msg">
      <AppIcon name="status-warning" class="notice-mark" />
      {{ plural(sweep.error_count, t('combination'), t('combinations')) }}
      {{ t('produced no usable data and are not ranked') }}
    </p>
    <p v-if="differing.length" class="notice warning-msg">
      <AppIcon name="status-warning" class="notice-mark" />
      {{ t('The combinations differ in') }} {{ differing.join(', ') }} —
      {{ t('the ranking compares measures that may have changed underneath') }}
    </p>
    <p v-if="pruned" class="notice warning-msg">
      <AppIcon name="status-warning" class="notice-mark" />
      {{ plural(pruned, t('combination'), t('combinations')) }}
      {{ t('lost their run records to a prune — their figures can no longer be checked') }}
    </p>

    <p v-if="!detail.combinations.length" class="hint">{{ t('No combination produced usable data') }}</p>

    <section v-for="currency in currencies" :key="currency" class="ranking-block">
      <h3 v-if="currencies.length > 1" class="currency-heading">{{ currency }}</h3>
      <RecordList
        class="ranking-list"
        :rows="rowsOf(currency)"
        :columns="columns"
        :row-key="keyOf"
        :is-picked="row => row.run_id === selectedRunId"
        :row-card="card"
        @pick="open"
      >
        <template #default="{ row }">
          <span
            :data-rank="1"
            class="figure-cell place"
            :class="{ best: places.get(keyOf(row)) === 1 }"
            :title="places.get(keyOf(row)) === 1 ? t('First in the ranking — the best by its objective') : undefined"
          >
            {{ places.get(keyOf(row)) }}<template v-if="places.get(keyOf(row)) === 1"> ★</template>
          </span>
          <span :data-rank="1" :title="parametersTitle(row)">{{ parametersText(row) }}</span>
          <span :data-rank="1" class="figure-cell objective">{{ objectiveFigure(row) }}</span>
          <span
            v-for="kpi in kpis"
            :key="kpi.id"
            :data-rank="kpi.column.rank"
            class="figure-cell"
            :class="kpi.tone?.(row)"
          >{{ kpi.text(row) }}</span>
          <span :data-rank="2" class="run-id" :title="row.run_id">{{ row.run_id }}</span>
        </template>
      </RecordList>
    </section>
  </div>
</template>

<style scoped>
.sweep-ranking {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.ranked-by,
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

/* held on the FIRST line of a notice that wraps, where the words it belongs to begin */
.notice > .notice-mark {
  flex-shrink: 0;
  margin-top: 0.15em;
}

.warning-msg {
  color: var(--color-warning);
}

.currency-heading {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.ranking-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-list :deep(.figure-cell) {
  text-align: right;
}

/* the column the ranking is ordered by, set apart by weight — the heading's arrow says which way */
.objective {
  font-weight: 600;
}

/* the first of a ranking: a mark AND a word-like glyph, never colour alone */
.place.best {
  font-weight: 600;
}

.run-id {
  color: var(--color-text-secondary);
}
</style>
