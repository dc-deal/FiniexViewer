<script setup lang="ts">
import { computed } from 'vue'
import RecordList from '@/components/base/RecordList.vue'
import { rowKey } from '@/api/list_key'
import {
  amount, figure, numberOrNa, percentOrNa, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { BookingPeriodRow } from '@/types/api/report_types'
import type { ListBand, ListColumn } from '@/types/list_types'
import { plural, t } from '@/translate'

/**
 * A period row from either scope. The run-scoped route omits `run_id` because the whole response
 * is one run; the deployment-scoped route carries it, and there it is part of the row's identity.
 */
type PeriodRow = BookingPeriodRow & { run_id?: string }

/**
 * The booking periods as rows. Shared by the run panel and the deployment view, so it takes the
 * periods and the key tuple the response declared rather than reaching for either itself.
 *
 * It carries EVERY field a period has — the same fifteen the hover card shows. The two serve
 * different questions: the card answers *what about this one*, the table answers *how do they
 * compare*, and comparison is why it stays a table. One column is one field, so the eye runs down
 * it; in a card-per-period layout the same field sits at a different height in every card.
 */
const props = defineProps<{
  periods: PeriodRow[]
  keyFields: string[]
  /** Set where the rows span several runs — off inside one run, where the column is constant. */
  showRun?: boolean
}>()

/**
 * The currency for the whole table, or null where the rows disagree.
 *
 * Stated once in the headers it costs one line; repeated in every cell it is four codes per row,
 * which is what pushed this table past the width of its panel. A response is one currency by
 * construction — the route serves them one at a time and names the others in `currencies` — but
 * that is the BACKEND's guarantee, not ours to assume, so a disagreement falls back to per-cell.
 */
const sharedCurrency = computed(() => {
  const first = props.periods[0]?.currency ?? null
  if (first === null) return null
  return props.periods.every(period => period.currency === first) ? first : null
})

/** The amount as the header allows: bare where the code is stated above, complete where it is not. */
function money(value: number, period: PeriodRow): string {
  return sharedCurrency.value === null ? amount(value, period.currency) : figure(value)
}

/** A drawdown is a MAGNITUDE — the stored sign is not reliable across the archive. */
function drawdown(period: PeriodRow): string {
  return money(Math.abs(period.max_drawdown), period)
}

/**
 * The equity band, as one column. Two columns for `min_equity` and `max_equity` would be two
 * headers for one fact, and the band is only ever read as a pair.
 */
function band(period: PeriodRow): string {
  return `${money(period.min_equity, period)} … ${money(period.max_equity, period)}`
}

/**
 * What the account held when the period OPENED. Stamped at the source since contract 17, and
 * `null` on a period recorded before that — measured, absent on 4 of 8 deployment periods. Never
 * `final_equity - net_pnl`: that is derived, and wrong besides, since `net_pnl` is realised while
 * equity also values what is still open.
 */
function opening(period: PeriodRow): string {
  return period.opening_equity === null ? t('n/a') : money(period.opening_equity, period)
}

/**
 * The three parts `total_fees` adds up to, one hover away rather than three more columns on a
 * table that already carries fourteen. Attributed as `net_pnl` is — the costs of the trades this
 * period CLOSED, never a swap still accruing on an open position.
 */
function feeSplit(period: PeriodRow): string {
  return `${t('commission')} ${money(period.commission_cost, period)}`
    + ` · ${t('swap')} ${money(period.swap_cost, period)}`
    + ` · ${t('spread')} ${money(period.spread_cost, period)}`
}

/** Columns under the identity group, which has no heading of its own. */
/**
 * Fifteen fields, and the BANDS are what make them read as three things rather than as one row of
 * equal words. The run column appears only where the rows span several runs, so both the columns
 * and the identity band are built rather than listed.
 *
 * Ranked so a narrow panel keeps the question a period answers — when, what it earned, where the
 * account ended — and gives up the ratios and the cost split first.
 *
 * **Five rungs over fourteen fields: 14 → 10 → 8 → 6 → 4.** Measured 2026-09-30, this is the list
 * that needed the fifth: at 69 rem it drew all fourteen columns in tracks of **22 px** — three
 * monospace characters — and overflowed by 18 px, and 69 rem is the ordinary width of a maximised
 * window here, not a narrow one.
 *
 * The four that go FIRST are the ratios and the two other views of the account movement, and the
 * data says why: over ten drawn periods, eight had no trades at all, so `Win Rate` and `PF` read
 * `n/a` on eight of ten rows. `Opening` and `Equity band` describe the same movement that
 * `Final equity` closes, and that one is rank 1.
 */
const columns = computed<ListColumn[]>(() => [
  { label: t('Unit'), width: 'minmax(8rem, 16fr)', rank: 1 },
  ...(props.showRun ? [{ label: t('Run'), width: 'minmax(0, 16fr)', rank: 4 } as ListColumn] : []),
  { label: t('No'), width: 'minmax(0, 3fr)', figure: true, rank: 4 },
  { label: t('Opened'), width: 'minmax(0, 17fr)', rank: 1 },
  { label: t('Closed'), width: 'minmax(0, 17fr)', rank: 2 },
  { label: t('Reason'), width: 'minmax(0, 9fr)', rank: 4 },
  { label: t('Trades'), width: 'minmax(0, 7fr)', figure: true, rank: 2 },
  { label: t('Net P&L'), width: 'minmax(0, 11fr)', figure: true, rank: 1 },
  { label: t('Win Rate'), width: 'minmax(0, 7fr)', figure: true, rank: 5 },
  { label: t('PF'), width: 'minmax(0, 6fr)', figure: true, rank: 5 },
  { label: t('Fees'), width: 'minmax(0, 8fr)', figure: true, rank: 3 },
  { label: t('Max DD'), width: 'minmax(0, 8fr)', figure: true, rank: 3 },
  { label: t('Opening'), width: 'minmax(0, 11fr)', figure: true, rank: 5 },
  { label: t('Equity band'), width: 'minmax(0, 20fr)', figure: true, rank: 5 },
  { label: t('Final equity'), width: 'minmax(0, 11fr)', figure: true, rank: 1 },
])

/**
 * The spans must cover the columns exactly — the stem checks it and draws nothing where they do
 * not, because a band off by one sits over the wrong column and says nothing about it.
 */
const bands = computed<ListBand[]>(() => [
  { label: '', span: props.showRun ? 3 : 2 },
  { label: t('Period'), span: 3 },
  { label: t('Result'), span: 5 },
  { label: t('Account'), span: 4 },
])
</script>

<template>
  <!-- Closed by default, and a native <details> rather than a custom toggle: the chart above is
       what a reader comes for, the rows are the backup. `details` brings the keyboard and
       screen-reader semantics with it instead of us re-implementing them. -->
  <details class="periods">
    <summary class="periods-summary">
      {{ plural(periods.length, t('booking period'), t('booking periods')) }}
      <!-- the currency, stated ONCE for the whole table instead of in every amount -->
      <template v-if="sharedCurrency"> · {{ t('figures in') }} {{ sharedCurrency }}</template>
    </summary>
    <RecordList
      class="periods-list"
      :rows="periods"
      :columns="columns"
      :bands="bands"
      :row-key="period => rowKey(period, keyFields)"
      inert
    >
      <template #default="{ row: period }">
        <span :data-rank="1" class="text-cell" :title="period.unit_name">
          {{ period.unit_name }}
        </span>
        <span v-if="showRun" :data-rank="4" class="text-cell">
          <RouterLink
            v-if="period.run_id"
            class="run-link"
            :to="{ name: 'runs', query: { run: period.run_id } }"
            :title="t('Open this run')"
          >{{ period.run_id }} ↗</RouterLink>
        </span>
        <span :data-rank="4" class="figure-cell">{{ period.period_no }}</span>
        <span :data-rank="1" :title="utcInstant(period.opened_at)">
          {{ utcInstant(period.opened_at) }}
        </span>
        <span :data-rank="2" :title="utcInstant(period.closed_at)">
          {{ utcInstant(period.closed_at) }}
        </span>
        <span :data-rank="4" class="text-cell">{{ period.reason }}</span>
        <span :data-rank="2" class="figure-cell">{{ period.trade_count }}</span>
        <span :data-rank="1" class="figure-cell" :class="signClass(period.net_pnl)">
          {{ money(period.net_pnl, period) }}
        </span>
        <span :data-rank="5" class="figure-cell">{{ percentOrNa(period.win_rate, period.trade_count) }}</span>
        <span :data-rank="5" class="figure-cell">{{ numberOrNa(period.profit_factor, period.trade_count) }}</span>
        <span :data-rank="3" class="figure-cell" :title="feeSplit(period)">{{ money(period.total_fees, period) }}</span>
        <span :data-rank="3" class="figure-cell">{{ drawdown(period) }}</span>
        <span :data-rank="5" class="figure-cell">{{ opening(period) }}</span>
        <span :data-rank="5" class="figure-cell band-cell" :title="band(period)">{{ band(period) }}</span>
        <span :data-rank="1" class="figure-cell">{{ money(period.final_equity, period) }}</span>
      </template>
    </RecordList>
  </details>
</template>

<style scoped>
/* A FIGURE CELL is right-aligned under its right-aligned heading. `figure: true` on a column aligns
   the HEADING; the cells are this component's, so the second half lives here. Measured 2026-09-30:
   all ten figure columns of this table sat left of their headings. The geometry is asserted in
   `e2e/list_ranks.spec.ts` — no unit test can see it. */
.periods-list :deep(.figure-cell) {
  text-align: right;
}

.periods-summary {
  cursor: pointer;
  padding: var(--space-xs) 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* only what the shared list does not own: it carries the tracks, the bands, the headings and the
   read-only rows */
.periods-list {
  max-height: 50vh;
  overflow-y: auto;
}

.periods-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* an equity band is two amounts and an ellipsis, read as one value rather than compared */
.band-cell {
  color: var(--color-text-secondary);
}

.text-cell {
  text-align: left;
}

.run-link {
  color: var(--color-accent);
  text-decoration: none;
}

.run-link:hover {
  text-decoration: underline;
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
