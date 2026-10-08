<script setup lang="ts">
import { computed } from 'vue'
import FigureBlock from '@/components/base/FigureBlock.vue'
import type { RunSummary, RunSummaryCurrency } from '@/types/api/report_types'
import type { Figure } from '@/types/figure_types'
import {
  amount, magnitude, marketSpan, numberOrNa, percent, percentFigure, percentOrNa, rValue,
  signClass,
} from '@/components/runs/report_format'
import { useScenarioSelection } from '@/composables/use_scenario_selection'
import { t } from '@/translate'

/**
 * What the run came to — as BLOCKS rather than as a table.
 *
 * It was a ten-column table with one row per currency, and a table with one row spends as much ink
 * on its headers as on its data while making the eye travel sideways to pair each label with its
 * value. Blocks also let this panel show what it always had and could not fit: the currency row
 * carries thirty fields and the table showed ten — the account's final equity, what is still open,
 * the gross halves behind the net, the longest streak.
 *
 * The grouping follows the backend's own console printout, so an operator who reads both meets one
 * arrangement rather than two.
 */
const props = defineProps<{
  model: RunSummary
}>()

/**
 * These figures are the RUN's, one row per CURRENCY, and there is no per-scenario version of them.
 * Under a narrowing they are labelled rather than filtered — and it matters most here of all the
 * panels, because this one sits at the TOP and a reader who has just narrowed meets it first.
 */
const narrowing = useScenarioSelection()
const narrowed = computed(() => narrowing.units.value.length > 0)

/** The result itself: what was earned, and how reliably. */
function result(row: RunSummaryCurrency): Figure[] {
  return [
    { label: t('Net P&L'), value: amount(row.net_pnl, row.currency), tone: signClass(row.net_pnl) },
    { label: t('Profit factor'), value: numberOrNa(row.profit_factor, row.total_trades) },
    { label: t('Win rate'), value: percentOrNa(row.win_rate, row.total_trades) },
    {
      label: t('Expectancy'),
      value: rValue(row.expectancy, row.r_trade_count),
      title: t('R-denominated, so it means nothing without a trade that carried a stop'),
    },
    { label: t('Avg win R'), value: rValue(row.avg_win_r, row.r_win_count) },
    { label: t('Avg loss R'), value: rValue(row.avg_loss_r, row.r_loss_count) },
  ]
}

/** How much trading it took to get there. */
function activity(row: RunSummaryCurrency): Figure[] {
  return [
    { label: t('Trades'), value: `${row.total_trades} (${row.winning_trades}W/${row.losing_trades}L)` },
    {
      label: t('Longest streak'),
      value: `${row.max_consecutive_wins}W / ${row.max_consecutive_losses}L`,
    },
    { label: t('Mean hold'), value: held(row.avg_trade_duration_s, row.total_trades) },
    { label: t('Gross profit'), value: amount(row.gross_profit, row.currency) },
    // a magnitude: the loss half is reported as a positive figure, and a minus sign here would
    // claim a direction the field does not carry
    { label: t('Gross loss'), value: magnitude(row.gross_loss, row.currency) },
    {
      label: t('Fees'),
      value: amount(row.total_fees, row.currency),
      title: t('The fees of the CLOSED trades — the same population the trade list and the booking periods sum, so all three agree.'),
    },
    /*
     * The second fee figure, and only where it differs: what the run CHARGED, open positions
     * included. The two are one number apart exactly when something is still open, and one file
     * read one while the next read the other under a single name until contract 18.
     */
    ...(row.fees_charged === row.total_fees ? [] : [{
      label: t('Charged'),
      value: amount(row.fees_charged, row.currency),
      title: t('What the run charged in all, open positions included. It exceeds the fees above by what the still-open positions cost.'),
    }]),
    /*
     * The two excursions. They have no other home on the page: the trade list's own summary block
     * was removed because `trade_history.analytics[]` repeats this response field for field — but
     * these two were among the repeats that this panel did not actually print, so removing that
     * block took them off the screen entirely.
     */
    {
      label: t('Worst against'),
      value: magnitude(row.largest_mae, row.currency),
      title: t('How far the worst trade ran against the position before it closed — a magnitude, since the direction is in the name.'),
    },
    { label: t('Best in favour'), value: amount(row.largest_mfe, row.currency) },
  ]
}

/**
 * The account, which the table could not fit at all — and the half that matters most on a run that
 * ended with positions still open, because then the booked figure and the account do not agree and
 * a reader without this block concludes something is broken.
 */
function account(row: RunSummaryCurrency): Figure[] {
  const figures: Figure[] = []
  /*
   * How many accounts this block is about, said ONCE at its head rather than on each figure.
   *
   * It matters because two of the figures under it are SUMS on a run of several: a backtest of N
   * scenarios is N independent accounts with one balance each. Qualifying them line by line put
   * "Final equity · 8 accounts" in a label and wrapped the amount beside it over two lines; the
   * count belongs to the block, because every figure in it shares the same scope.
   */
  if (row.unit_count > 1) {
    figures.push({
      label: t('Accounts'),
      value: `${row.unit_count}`,
      title: t('Independent accounts, one balance each. The capital and the closing equity below are sums over them; no single account held either.'),
    })
  }
  figures.push(
    { label: t('Initial capital'), value: amount(row.total_initial_balance, row.currency) },
    {
      label: t('Max drawdown'),
      value: `${magnitude(row.account_max_drawdown, row.currency)} (${percentFigure(row.account_max_dd_pct)})`,
      title: t('A magnitude: the sign is not reliable across the archive. The percentage is already multiplied.'),
    },
    { label: t('Max equity'), value: amount(row.max_equity, row.currency) },
    /*
     * ONE account's closing equity, or the total over several — never the same word for both.
     * A backtest of N scenarios is N independent accounts, one balance each, and no account ever
     * held their sum: the backend therefore answers `final_equity: null` there and names the sum
     * `total_final_equity`. Printing the sum under "Final equity" claimed a balance that never
     * existed, which is the defect this line was changed for.
     */
    row.final_equity === null
      ? {
          label: t('Final equity'),
          value: amount(row.total_final_equity, row.currency),
          title: t('The SUM over the accounts named above: no single one held it. Where a currency has one account this is that account, and the word means what it says.'),
        }
      : { label: t('Final equity'), value: amount(row.final_equity, row.currency) },
  )
  /*
   * WHICH account the drawdown trio is about. It is one line of its own rather than a suffix on the
   * drawdown: a scenario name is not a figure, and appended there it wrapped the cell over two
   * lines. Only where there are several accounts — with one, the name adds nothing.
   */
  if (row.unit_count > 1) {
    figures.push({
      label: t('Deepest account'),
      value: row.account_max_drawdown_unit,
      title: t('The drawdown, the max equity and their percentage above all belong to this one account — taken together from it, because a trough and a peak from two accounts describe a decline that never happened.'),
    })
  }
  // shown only where something IS open — zero open positions needs no line, and an unrealised 0.00
  // beside it reads as a figure somebody measured
  if (row.open_position_count > 0) {
    figures.push(
      { label: t('Still open'), value: `${row.open_position_count}` },
      {
        label: t('Unrealized'),
        value: amount(row.unrealized_pnl, row.currency),
        tone: signClass(row.unrealized_pnl),
      },
    )
  }
  return figures
}

/** Seconds as the operator reads a holding period; n/a where nothing was held. */
function held(seconds: number, trades: number): string {
  if (!trades) return t('n/a')
  if (seconds < 90) return `${seconds.toFixed(0)} s`
  if (seconds < 5400) return `${(seconds / 60).toFixed(0)} min`
  if (seconds < 172_800) return `${(seconds / 3600).toFixed(1)} h`
  return `${(seconds / 86_400).toFixed(1)} d`
}

/**
 * How much MARKET the run read — the question the wall clock does not answer, and the one an
 * operator arrives with: *how long did it simulate, over how many days?*
 *
 * Two figures, because they are two different things and their difference is itself a finding.
 * `Covered` counts a stretch two scenarios share ONCE; `Summed` adds the units up. A run of eight
 * scenarios that is four pairs of identical windows reads 464 h covered against 928 h summed —
 * the backend's own printout showed only the second and called it the simulation's length, which
 * counted every market hour of it twice. The sum is shown only where it differs.
 */
const marketTime = computed<Figure[]>(() => {
  const covered = props.model.tick_timespan_seconds
  const summed = props.model.tick_timespan_total_seconds
  const figures: Figure[] = [
    {
      label: t('Covered'),
      value: marketSpan(covered),
      title: t('Market time the run\'s units processed, a shared stretch counted once. Not the wall-clock time the run took.'),
    },
  ]
  // rounded to the second before comparing: the two are floats of the same quantity and a run whose
  // units do not overlap answered 172691.472 against 172691.47199999998, so a strict comparison
  // printed a "sum" identical to the span beside it
  if (covered !== null && summed !== null && Math.round(summed) !== Math.round(covered)) {
    figures.push({
      label: t('Summed'),
      value: marketSpan(summed),
      title: t('The units added up. It exceeds the covered span by exactly the overlap between them.'),
    })
  }
  return figures
})

/**
 * What was ATTEMPTED. Kept here as well as above the trade rows on purpose: there it says what the
 * rows beneath it were drawn from, here it is a property of the run — and a low execution rate
 * changes how every figure on this panel reads.
 */
const orders = computed<Figure[]>(() => {
  const summary = props.model
  const rate = summary.orders_sent > 0 ? summary.orders_executed / summary.orders_sent : null
  return [
    {
      label: t('Executed'),
      value: rate === null
        ? `${summary.orders_executed}/${summary.orders_sent}`
        : `${summary.orders_executed}/${summary.orders_sent} (${percent(rate)})`,
    },
    {
      label: t('Rejected'),
      value: `${summary.orders_rejected}`,
      tone: summary.orders_rejected > 0 ? 'warning' : '',
    },
    { label: t('Closed by SL/TP'), value: `${summary.sl_tp_triggered}` },
  ]
})

/**
 * Declared · ran · disabled · absent — the four counts that say whether this summary is about the
 * run somebody configured. All FOUR are null on an artifact written before the field existed, the
 * list included, and a null is left out rather than shown as a zero nobody reported.
 */
const scope = computed<Figure[]>(() => {
  const summary = props.model
  // THEIR word for `unit_count` — their own executive printout says `Scenarios` for this field, and
  // it reads with the two beside it rather than against them: Scenarios · Declared · Disabled. It
  // also ends a double labelling, because the ACCOUNT block above names the same field `Accounts`,
  // which is a deliberate reframing there: that block is about balances, and a backtest of N
  // scenarios is N independent accounts with one balance each.
  const figures: Figure[] = [{ label: t('Scenarios'), value: `${summary.unit_count}` }]
  if (summary.units_declared !== null) {
    figures.push({ label: t('Declared'), value: `${summary.units_declared}` })
  }
  if (summary.units_disabled !== null) {
    figures.push({ label: t('Disabled'), value: `${summary.units_disabled}` })
  }
  if (summary.units_absent?.length) {
    figures.push({
      label: t('Produced nothing'),
      value: `${summary.units_absent.length}`,
      tone: 'warning',
      title: summary.units_absent.map(unit => `${unit.name}: ${unit.reason_code}`).join('\n'),
    })
  }
  return figures
})
</script>

<template>
  <div v-if="!model.currencies.length" class="hint">{{ t('No currency KPIs in this run') }}</div>
  <div v-else class="executive">
    <p v-if="narrowed" class="scope-line">
      <span class="scope">{{ t('whole run') }}</span>
      {{ t('These figures cover every scenario, not the ones you narrowed to') }}
    </p>

    <!-- one column of blocks per currency, side by side where there is room for them -->
    <div v-for="row in model.currencies" :key="row.currency" class="currency">
      <h3 class="currency-title">{{ row.currency }}</h3>
      <div class="blocks">
        <FigureBlock :title="t('Result')" :figures="result(row)" />
        <FigureBlock :title="t('Activity')" :figures="activity(row)" />
        <FigureBlock :title="t('Account')" :figures="account(row)" />
      </div>
    </div>

    <div class="blocks">
      <FigureBlock :title="t('Orders')" :figures="orders" min-width="11rem" />
      <FigureBlock :title="t('Scope')" :figures="scope" min-width="11rem" />
      <FigureBlock :title="t('Market time')" :figures="marketTime" min-width="11rem" />
    </div>
  </div>
</template>

<style scoped>
/**
 * auto-fit rather than a media query: a panel's width here is the reader's own arrangement — they
 * drag the seams and collapse the sidebar — so the viewport is the wrong thing to measure.
 */
.blocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
  gap: 0 var(--space-xl);
  align-items: start;
}

.currency-title {
  margin: var(--space-sm) 0 0;
  font-family: monospace;
  font-size: var(--font-size-md);
  font-weight: normal;
  color: var(--color-text-primary);
}

/* a second currency is a second account, not more rows of the first */
.currency + .currency {
  margin-top: var(--space-md);
  border-top: 1px solid var(--color-border);
}

/* the scope of a figure that cannot be split — marked, never filtered */
.scope-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  margin: 0 0 var(--space-xs);
  color: var(--color-annotation);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.scope {
  flex-shrink: 0;
  padding: 0 var(--space-xs);
  border: 1px dashed var(--color-annotation);
  border-radius: 4px;
}

.hint {
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
