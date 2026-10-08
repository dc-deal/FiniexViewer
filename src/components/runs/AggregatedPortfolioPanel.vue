<script setup lang="ts">
import FigureBlock from '@/components/base/FigureBlock.vue'
import {
  amount, figure, numberOrNa, percentFigure, signClass,
} from '@/components/runs/report_format'
import type { Figure } from '@/types/figure_types'
import type { AggregatedCurrency, AggregatedPortfolioReport } from '@/types/api/report_types'
import { plural, t } from '@/translate'

/**
 * What the run came to, folded over its scenarios — and ONLY what is nowhere else on the page.
 *
 * The response carries 42 fields per currency on top of a 21-field headline, and almost all of the
 * headline is `run-summary` again, which the Executive Summary already shows. Measured 2026-09-30,
 * field by field against what that panel renders: **39 are new, and of those the four groups below
 * are the ones a reader has no other way to reach.** Printing the rest would be the same figure
 * twice on one screen, which costs a line and teaches nobody.
 *
 * Closed by default, which IS the disclosure this was asked for: the panel shell already collapses,
 * so nesting a second one inside the Executive Summary would have meant rebuilding that panel's
 * prop contract for a fold the workspace provides.
 *
 * Two blocks are deliberately NOT here. The `pending_*` figures — latency, resolved, filled, timed
 * out — are the subject of the `pending-orders` route, and showing them here would pre-empt a panel
 * that can say more. And `spot_scenarios[]` is a per-account inventory of eight rows by eleven
 * fields: a list, not a figure, and the roster already names those scenarios.
 */
defineProps<{
  model: AggregatedPortfolioReport
}>()

/**
 * What the run PAID, run-wide. The per-unit split is in the scenario roster's card; there is no
 * other place this total exists, and it is the half of the result a net figure hides.
 */
function costs(row: AggregatedCurrency): Figure[] {
  const fold = row.combined
  const money = (value: number) => amount(value, row.currency)
  const figures: Figure[] = [
    { label: t('Spread'), value: money(fold.total_spread_cost) },
    { label: t('Commission'), value: money(fold.total_commission) },
    { label: t('Swap'), value: money(fold.total_swap) },
    /*
     * The ONE figure the Executive Summary has to give up, and it lands here because this is where
     * its model lives: `execution_rate_pct` is served on `aggregated-portfolio` and on no other
     * route — `run-summary` carries not a single `rate` or `pct` field. Computing it over there
     * would be a second source of truth for a number the API already states.
     *
     * Their definition, not ours: executed over submitted PLUS adopted. `adopted` in the
     * denominator is not something we would have guessed.
     */
    {
      label: t('Execution rate'),
      value: percentFigure(fold.execution_rate_pct),
      title: t('Executed orders over submitted plus adopted — the backend\'s own definition. The Executive Summary shows the counts and leaves the rate here, because this is the only route that serves it.'),
    },
  ]
  // the maker/taker halves only where a fee of that kind was charged — two zeroes on every forex
  // run are noise, and on a spot run they are the whole cost
  if (fold.maker_fee || fold.taker_fee) {
    figures.push({
      label: t('Maker / taker'),
      value: `${money(fold.maker_fee)} / ${money(fold.taker_fee)}`,
    })
  }
  figures.push({
    label: t('Avg spread'),
    value: figure(fold.avg_spread),
    title: t('In price units, not in the account currency.'),
  })
  return figures
}

/**
 * The peak, the balance and the averages — three things the summary states differently or not at
 * all, and each one is a distinction a reader gets wrong without it.
 */
function account(row: AggregatedCurrency): Figure[] {
  const fold = row.combined
  const money = (value: number) => amount(value, row.currency)
  return [
    {
      label: t('Highest equity'),
      value: money(fold.highest_equity),
      title: t('The highest peak ANY account reached. The max equity in the summary belongs to the account that fell deepest, which is a different account.'),
    },
    { label: t('Reached by'), value: fold.highest_equity_scenario },
    {
      label: t('Final balance'),
      value: money(fold.final_balance),
      title: t('Realised only. The final equity in the summary values what is still open as well, and the two differ by exactly that.'),
    },
    {
      label: t('Balance change'),
      value: `${money(fold.balance_pnl)} (${percentFigure(fold.balance_pnl_pct)})`,
      tone: signClass(fold.balance_pnl),
    },
    {
      label: t('Avg opening'),
      value: money(fold.avg_initial),
      title: t('The average balance an account started with, over the accounts of this currency.'),
    },
    { label: t('Avg win / loss'), value: `${money(fold.avg_win)} / ${money(fold.avg_loss)}` },
    {
      label: t('Recovery factor'),
      // null where it is undefined rather than zero — a run with no decline has nothing to recover
      value: numberOrNa(fold.recovery_factor),
      title: t('Net result against the deepest decline. Undefined where there was no decline.'),
    },
    {
      label: t('Long / short'),
      value: `${fold.total_long_trades} / ${fold.total_short_trades}`,
    },
  ]
}

/**
 * A SPOT account holds an inventory rather than a balance, so its worth is an ESTIMATE: the quote
 * balance plus the base holding valued at the last price. The backend says so by serving
 * `est_current` beside `last_price`, and the word stays on screen.
 */
function holdings(row: AggregatedCurrency): Figure[] {
  const fold = row.combined
  const money = (value: number) => amount(value, row.currency)
  return [
    { label: t('Estimated now'), value: money(fold.spot_total_est_current) },
    { label: t('At the start'), value: money(fold.spot_total_est_initial) },
    {
      label: t('Base asset held'),
      value: fold.spot_has_base_holdings ? t('yes') : t('no'),
      title: t('Whether any account still holds the base asset. What it is worth depends on a price, which is why the figures above are estimates.'),
    },
  ]
}
</script>

<template>
  <div class="aggregated-panel">
    <section v-for="row in model.currencies" :key="row.currency" class="aggregate">
      <p class="scope">
        {{ row.currency }} ·
        {{ plural(row.scenario_count, t('scenario'), t('scenarios')) }}
      </p>

      <!-- A currency holding BOTH account models is a fold across two different kinds of account,
           and the backend says so with `is_mixed`. Silent otherwise, because one model is the
           ordinary case and has nothing to caveat. -->
      <p v-if="row.is_mixed" class="notice">
        <span class="mark">⚠</span>
        {{ t('This currency holds margin and spot accounts together — the figures below fold two account models into one') }}
      </p>

      <FigureBlock :title="t('What it paid')" :figures="costs(row)" min-width="12rem" />
      <FigureBlock :title="t('The account')" :figures="account(row)" min-width="15rem" />
      <FigureBlock
        v-if="row.is_spot"
        :title="t('Spot holdings')"
        :figures="holdings(row)"
        min-width="15rem"
      />
    </section>
  </div>
</template>

<style scoped>
.aggregated-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.aggregate {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* which currency and over how many scenarios — the scope of everything beneath it */
.scope {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.notice {
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-warning);
  border-radius: 4px;
  color: var(--color-warning);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.mark { margin-right: var(--space-xs); }
</style>
