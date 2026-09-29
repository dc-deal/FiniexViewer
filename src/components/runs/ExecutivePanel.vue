<script setup lang="ts">
import { computed } from 'vue'
import FigureBlock from '@/components/base/FigureBlock.vue'
import type { RunSummary, RunSummaryCurrency } from '@/types/api/report_types'
import type { Figure } from '@/types/figure_types'
import {
  amount, magnitude, numberOrNa, percent, percentFigure, percentOrNa, rValue, signClass,
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
    { label: t('Fees'), value: amount(row.total_fees, row.currency) },
  ]
}

/**
 * The account, which the table could not fit at all — and the half that matters most on a run that
 * ended with positions still open, because then the booked figure and the account do not agree and
 * a reader without this block concludes something is broken.
 */
function account(row: RunSummaryCurrency): Figure[] {
  const figures: Figure[] = [
    {
      label: t('Max drawdown'),
      value: `${magnitude(row.account_max_drawdown, row.currency)} (${percentFigure(row.account_max_dd_pct)})`,
      title: t('A magnitude: the sign is not reliable across the archive. The percentage is already multiplied.'),
    },
    { label: t('Max equity'), value: amount(row.max_equity, row.currency) },
    { label: t('Final equity'), value: amount(row.final_equity, row.currency) },
  ]
  // shown only where something IS open — zero open positions needs no line, and an unrealised 0.00
  // beside it reads as a figure somebody measured
  if (row.open_position_count > 0) {
    figures.push(
      { label: t('Still open'), value: `${row.open_position_count}` },
      {
        label: t('Unrealised'),
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
 * run somebody configured. `units_declared` is null on an artifact written before the field
 * existed, and a null is left out rather than shown as a zero nobody reported.
 */
const scope = computed<Figure[]>(() => {
  const summary = props.model
  const figures: Figure[] = [{ label: t('Units with results'), value: `${summary.unit_count}` }]
  if (summary.units_declared !== null) {
    figures.push({ label: t('Declared'), value: `${summary.units_declared}` })
  }
  if (summary.units_disabled !== null) {
    figures.push({ label: t('Disabled'), value: `${summary.units_disabled}` })
  }
  if (summary.units_absent.length) {
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
