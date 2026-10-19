<script setup lang="ts">
import { computed } from 'vue'
import JumpLink from '@/components/base/JumpLink.vue'
import RecordList from '@/components/base/RecordList.vue'
import { useOpenInContext } from '@/composables/use_open_in_context'
import { rowKey } from '@/api/list_key'
import { feeSplit, periodCard, unitTotalCard, type PeriodRow } from '@/components/runs/booking_period_card'
import {
  amount, figure, numberOrNa, percentOrNa, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { BookingPeriodUnitTotal } from '@/types/api/report_types'
import type { FigureCard } from '@/types/figure_types'
import type { ListBand, ListColumn } from '@/types/list_types'
import { plural, t } from '@/translate'

/**
 * A line of the table: a period, or the total that closes its unit's periods. The served fields stay
 * on the line itself (`row.final_equity`), as a cell reads them everywhere else, rather than one
 * level down where the term register could not see which field a column shows.
 */
type TableRow = (PeriodRow & { kind: 'period' }) | (BookingPeriodUnitTotal & { kind: 'total' })

/**
 * The booking periods as rows. Shared by the run panel and the deployment view, so it takes the
 * periods and the key tuple the response declared rather than reaching for either itself.
 *
 * It carries EVERY field a period has — and every row carries the same card as its bar on the
 * timeline above (`booking_period_card.ts`), which holds what a narrow panel's columns gave up. The
 * two serve different questions: the card answers *what about this one*, the table answers *how do
 * they compare*, and comparison is why it stays a table. One column is one field, so the eye runs
 * down it; in a card-per-period layout the same field sits at a different height in every card.
 */
const props = defineProps<{
  periods: PeriodRow[]
  keyFields: string[]
  /** Set where the rows span several runs — off inside one run, where the column is constant. */
  showRun?: boolean
  /**
   * The totals the run-scoped route serves per unit, each drawn as a line after its unit's last
   * period, in the same columns. Absent on the deployment view, whose route serves none.
   */
  unitTotals?: BookingPeriodUnitTotal[]
}>()

/** The table unfolded; closed by default. The panel around it decides whether the choice is kept. */
const open = defineModel<boolean>('open', { default: false })

function onToggle(event: Event): void {
  // also fired when a kept value opens the table on mount: the value is the same then, and the
  // store writes nothing for it
  open.value = (event.target as HTMLDetailsElement).open
}

/**
 * The periods in the order they were handed — grouped by unit, `orderPeriods` — with each unit's
 * total after its LAST period. A total whose unit has no period on show is not drawn: the
 * narrowing left that unit out, and its line would stand under nothing. Nor is the total of a unit
 * of ONE period (`period_count`, served): it would repeat its row figure for figure, and its
 * account's decline is that period's own.
 */
const rows = computed<TableRow[]>(() => {
  const totals = new Map((props.unitTotals ?? [])
    .filter(total => total.period_count > 1)
    .map(total => [total.unit_name, total]))
  const last = new Map(props.periods.map((period, index) => [period.unit_name, index]))
  return props.periods.flatMap((period, index): TableRow[] => {
    const total = totals.get(period.unit_name)
    const line: TableRow = { ...period, kind: 'period' }
    return total && last.get(period.unit_name) === index ? [line, { ...total, kind: 'total' }] : [line]
  })
})

function keyOf(row: TableRow): string {
  return row.kind === 'period' ? rowKey(row, props.keyFields) : `total:${row.unit_name}`
}

/** A period's card, or the total's — which adds what the account carried across the periods. */
function cardOf(row: TableRow): FigureCard {
  return row.kind === 'period' ? periodCard(row) : unitTotalCard(row)
}

const { openRun, canOpen } = useOpenInContext()

function openRunOf(period: PeriodRow): void {
  if (period.run_id) openRun(period.run_id)
}

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
function money(value: number, currency: string): string {
  return sharedCurrency.value === null ? amount(value, currency) : figure(value)
}

/** A drawdown is a MAGNITUDE — the stored sign is not reliable across the archive. */
function drawdown(value: number, currency: string): string {
  return money(Math.abs(value), currency)
}

/**
 * The equity band, as one column. Two columns for `min_equity` and `max_equity` would be two
 * headers for one fact, and the band is only ever read as a pair.
 */
function band(min: number, max: number, currency: string): string {
  return `${money(min, currency)} … ${money(max, currency)}`
}

/**
 * What the account held when the period OPENED. Stamped at the source since contract 17, and
 * `null` on a period recorded before that — measured, absent on 4 of 8 deployment periods. Never
 * `final_equity - net_pnl`: that is derived, and wrong besides, since `net_pnl` is realised while
 * equity also values what is still open.
 */
function opening(value: number | null, currency: string): string {
  return value === null ? t('n/a') : money(value, currency)
}

/**
 * What a line PAID, one hover away rather than three more columns on a table that already carries
 * fourteen (`feeSplit`, shared with the card). Attributed as `net_pnl` is — the costs of the trades
 * this period CLOSED, never a swap still accruing on an open position. The SPREAD is named apart
 * from the sum, because it is not in it: reading the three as one total showed `0.00` beside a
 * stated spread of `2.96` on a period that really cost that much.
 */
function costs(line: Parameters<typeof feeSplit>[0], currency: string): string {
  return feeSplit(line, value => money(value, currency))
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
 * **Five of the fifteen carry a FLOOR, and a proportional share cannot express what they need.** A
 * timestamp is 20 fixed characters and a heading is as wide as its word: measured 2026-10-01, the
 * stamps lost their SECONDS to truncation — and two consecutive periods are told apart by exactly
 * those — while `No` rendered as `N…` and `Final equity` as `Final equi…`. The fr shares then
 * divide what is left, which is what they are good at.
 *
 * The four that go FIRST are the ratios and the two other views of the account movement, and the
 * data says why: over ten drawn periods, eight had no trades at all, so `Win rate` and `PF` read
 * `n/a` on eight of ten rows. `Opening` and `Equity band` describe the same movement that
 * `Final equity` closes, and that one is rank 1.
 */
const columns = computed<ListColumn[]>(() => [
  { label: t('Unit'), width: 'minmax(8rem, 16fr)', rank: 1 },
  ...(props.showRun ? [{ label: t('Run'), width: 'minmax(0, 16fr)', rank: 4 } as ListColumn] : []),
  {
    /*
     * Not renamed, explained. Under the `Period` group heading this reads as the period's number,
     * which is right — what their documentation warns against is reading it as a position in the
     * list, and that warning belongs in a hint rather than in a heading nobody has room for.
     */
    label: t('No'),
    hint: t('A per-bot counter that continues across restarts — not a position in this list.'),
    width: 'minmax(2.5rem, 3fr)',
    figure: true,
    rank: 4,
  },
  { label: t('Opened'), width: 'minmax(10.5rem, 17fr)', rank: 1 },
  { label: t('Closed'), width: 'minmax(10.5rem, 17fr)', rank: 2 },
  { label: t('Reason'), width: 'minmax(0, 9fr)', rank: 4 },
  { label: t('Trades'), width: 'minmax(0, 7fr)', figure: true, rank: 2 },
  { label: t('Net P&L'), width: 'minmax(0, 11fr)', figure: true, rank: 1 },
  // 9fr, not 7: measured at 1920 px on the DEPLOYMENT view, where `showRun` adds a fifteenth
  // column and takes share from the rest, the heading needed 68 px of a 66 px track and
  // overflowed into `PF` beside it
  { label: t('Win rate'), width: 'minmax(0, 9fr)', figure: true, rank: 5 },
  { label: t('PF'), width: 'minmax(0, 6fr)', figure: true, rank: 5 },
  { label: t('Fees'), width: 'minmax(0, 8fr)', figure: true, rank: 3 },
  { label: t('Max DD'), width: 'minmax(0, 8fr)', figure: true, rank: 3 },
  { label: t('Opening'), width: 'minmax(0, 11fr)', figure: true, rank: 5 },
  { label: t('Equity band'), width: 'minmax(0, 20fr)', figure: true, rank: 5 },
  // A FLOOR, alone among the figures here: where the account ENDED is why this list is rank 1
  // at all, and the heading is twelve characters. Measured at 620 px it had 90 px of the 98
  // it needs, so it truncated to `Final equi…` — legible, but this is the one it should not
  // have to be.
  { label: t('Final equity'), width: 'minmax(7.5rem, 11fr)', figure: true, rank: 1 },
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
       screen-reader semantics with it instead of us re-implementing them. Opened, it stays open
       across a run change and a reload — the panel keeps the choice as its own view. -->
  <details class="periods" :open="open" @toggle="onToggle">
    <summary class="periods-summary">
      {{ plural(periods.length, t('booking period'), t('booking periods')) }}
      <!-- the currency, stated ONCE for the whole table instead of in every amount -->
      <template v-if="sharedCurrency"> · {{ t('figures in') }} {{ sharedCurrency }}</template>
    </summary>
    <RecordList
      class="periods-list"
      :rows="rows"
      :columns="columns"
      :bands="bands"
      :row-key="keyOf"
      :row-class="row => row.kind === 'total' ? 'unit-total' : undefined"
      :row-card="cardOf"
      inert
    >
      <template #default="{ row }">
        <template v-if="row.kind === 'period'">
          <span :data-rank="1" class="text-cell">
            {{ row.unit_name }}
          </span>
          <span v-if="showRun" :data-rank="4" class="text-cell">
            <JumpLink
              v-if="row.run_id && canOpen"
              :title="t('Open this run')"
              @click="openRunOf(row)"
            >{{ row.run_id }}</JumpLink>
            <template v-else>{{ row.run_id }}</template>
          </span>
          <span :data-rank="4" class="figure-cell">{{ row.period_no }}</span>
          <span :data-rank="1">{{ utcInstant(row.opened_at) }}</span>
          <span :data-rank="2">{{ utcInstant(row.closed_at) }}</span>
          <span :data-rank="4" class="text-cell">{{ row.reason }}</span>
          <span :data-rank="2" class="figure-cell">{{ row.trade_count }}</span>
          <span :data-rank="1" class="figure-cell" :class="signClass(row.net_pnl)">
            {{ money(row.net_pnl, row.currency) }}
          </span>
          <span :data-rank="5" class="figure-cell">{{ percentOrNa(row.win_rate, row.trade_count) }}</span>
          <span :data-rank="5" class="figure-cell">{{ numberOrNa(row.profit_factor, row.trade_count) }}</span>
          <span :data-rank="3" class="figure-cell" :title="costs(row, row.currency)">
            {{ money(row.total_fees, row.currency) }}
          </span>
          <span :data-rank="3" class="figure-cell">{{ drawdown(row.max_drawdown, row.currency) }}</span>
          <span :data-rank="5" class="figure-cell">{{ opening(row.opening_equity, row.currency) }}</span>
          <span :data-rank="5" class="figure-cell band-cell">
            {{ band(row.min_equity, row.max_equity, row.currency) }}
          </span>
          <span :data-rank="1" class="figure-cell">{{ money(row.final_equity, row.currency) }}</span>
        </template>
        <!-- the unit's total, in the same columns: Max DD is the deepest SINGLE period, which is what
             the column shows (their booking-periods document); the account's own decline is in its
             card, beside it -->
        <template v-else>
          <span :data-rank="1" class="text-cell total-label">
            Σ {{ row.unit_name }}
          </span>
          <span v-if="showRun" :data-rank="4" class="text-cell" />
          <span :data-rank="4" class="figure-cell" />
          <span :data-rank="1">{{ utcInstant(row.opened_at) }}</span>
          <span :data-rank="2">{{ utcInstant(row.closed_at) }}</span>
          <span :data-rank="4" class="text-cell" />
          <span :data-rank="2" class="figure-cell">{{ row.trade_count }}</span>
          <span :data-rank="1" class="figure-cell" :class="signClass(row.net_pnl)">
            {{ money(row.net_pnl, row.currency) }}
          </span>
          <span :data-rank="5" class="figure-cell">{{ percentOrNa(row.win_rate, row.trade_count) }}</span>
          <span :data-rank="5" class="figure-cell">{{ numberOrNa(row.profit_factor, row.trade_count) }}</span>
          <span :data-rank="3" class="figure-cell" :title="costs(row, row.currency)">
            {{ money(row.total_fees, row.currency) }}
          </span>
          <span :data-rank="3" class="figure-cell">
            {{ drawdown(row.deepest_period_drawdown, row.currency) }}
          </span>
          <span :data-rank="5" class="figure-cell">{{ opening(row.opening_equity, row.currency) }}</span>
          <span :data-rank="5" class="figure-cell band-cell">
            {{ band(row.min_equity, row.max_equity, row.currency) }}
          </span>
          <span :data-rank="1" class="figure-cell">{{ money(row.final_equity, row.currency) }}</span>
        </template>
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
  /* of the view that holds the table, not of the browser window */
  max-height: 50cqh;
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

/* the total closes its unit's periods the way a ledger's sum line does: a rule above, the word Σ */
.periods-list :deep(.record-row.unit-total) {
  border-top: 1px solid var(--color-text-secondary);
  color: var(--color-text-primary);
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
