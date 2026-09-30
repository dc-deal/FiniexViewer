<script setup lang="ts">
import { computed } from 'vue'
import FigureBlock from '@/components/base/FigureBlock.vue'
import RecordList from '@/components/base/RecordList.vue'
import { percentFigure } from '@/components/runs/report_format'
import type { Figure } from '@/types/figure_types'
import type { ListColumn } from '@/types/list_types'
import type { BrokerReport, BrokerSymbol, BrokerUnit } from '@/types/api/report_types'
import { plural, t } from '@/translate'

/**
 * The CONDITIONS a run traded under — one block per broker, with its symbols beneath it.
 *
 * This is the panel that replaced Portfolio, and the replacement was not a rename: the portfolio
 * answered *what did each account earn*, which is now the scenario roster's row and its card. What
 * nothing answered was *under what rules* — and that question has a wrong answer by default, which
 * is the whole reason this panel exists.
 *
 * **The sentence at the top is the point.** Two stored runs put forex at 1:500 with hedging beside
 * crypto at 1:1 with none (`20260930_080501_5a37660b`, `20260927_092959_cd1d9b1e`): four scenarios
 * under margin calls, one under none. A drawdown reached on 500:1 leverage and a drawdown reached
 * on a spot account are not the same kind of number — one of them could have been liquidated and
 * the other could not — and every other panel in this view puts them in one column and sorts them
 * against each other. Nothing on screen said so until here.
 *
 * Nothing is derived. Every figure names a field of the broker response, and the only judgement in
 * the component is WHICH fields to print, which is rendering.
 */
const props = defineProps<{
  model: BrokerReport
}>()

/**
 * More than one broker means the scenarios were not run on comparable terms. Stated as the COUNT
 * the response served rather than as a flag of ours — and silent at one, because where everything
 * is fine nothing is printed and a run on one broker has nothing to warn about.
 */
const several = computed(() => props.model.units.length > 1)

/**
 * What differs between the brokers, in the reader's words, built from the fields that differ rather
 * than from a fixed sentence. A run whose two brokers happen to share their leverage should not be
 * told that their leverage differs.
 */
const differences = computed<string[]>(() => {
  const units = props.model.units
  if (units.length < 2) return []
  const said: string[] = []
  const varies = <T>(pick: (unit: BrokerUnit) => T) => new Set(units.map(pick)).size > 1

  if (varies(unit => unit.leverage)) {
    said.push(`${t('leverage')} ${units.map(unit => `1:${unit.leverage}`).join(' / ')}`)
  }
  /*
   * The margin half is said in WORDS where the brokers differ in whether they have a regime at all,
   * and by mode only where they all do. Comparing the mode strings would print the defaulted
   * `none` of a leverage-1 broker as though it were a stated one — see `hasMargin` — and "margin
   * retail_hedging / none" then reads as two configured modes rather than as one account that
   * cannot be called at all. That difference is the whole comparability point, so it gets a
   * sentence.
   */
  const margined = units.filter(hasMargin)
  if (margined.length && margined.length < units.length) {
    said.push(t('margin calls on some and not on others'))
  } else if (margined.length === units.length && varies(unit => unit.margin_mode)) {
    said.push(`${t('margin')} ${units.map(unit => unit.margin_mode).join(' / ')}`)
  }
  if (varies(unit => unit.hedging_allowed)) {
    said.push(t('hedging on some and not on others'))
  }
  if (varies(unit => unit.market_type)) {
    said.push(units.map(unit => unit.market_type).join(' / '))
  }
  return said
})

/**
 * Whether this broker has a margin regime at all — **their condition, not one of ours**.
 *
 * `ide_docs/broker_config_guide.md` marks `margin_mode`, `margin_call_level` and `stopout_level`
 * as required *"If leverage > 1"*, and the adapter guide repeats it: a broker at leverage 1 is not
 * obliged to state any of the three, so what arrives there is a default and not a measurement. The
 * captured spot broker shows exactly that — `margin_mode: 'none'` with both levels at `0.0`, and
 * rendering "margin call at 0.00%" would say the OPPOSITE of what is true: that the account is
 * called immediately, rather than that it can never be called.
 *
 * Gating on the mode would have worked on this data and been the wrong rule; their documented
 * condition is the leverage.
 */
function hasMargin(unit: BrokerUnit): boolean {
  return unit.leverage > 1
}

/** The identity and the rules, as one block per broker. */
function conditions(unit: BrokerUnit): Figure[] {
  const figures: Figure[] = [
    { label: t('Market'), value: unit.market_type },
    { label: t('Company'), value: unit.company },
    { label: t('Server'), value: unit.server },
    {
      label: t('Account'),
      value: unit.trade_mode,
      title: t("The venue's own word for the account, not whether money moved: a backtest against a live-server definition is still a simulation."),
    },
    { label: t('Leverage'), value: `1:${unit.leverage}` },
  ]
  // all three margin fields together, and only where the backend requires them to be stated
  if (hasMargin(unit)) {
    figures.push(
      { label: t('Margin mode'), value: unit.margin_mode },
      { label: t('Margin call'), value: percentFigure(unit.margin_call_level) },
      { label: t('Stop out'), value: percentFigure(unit.stopout_level) },
    )
  }
  figures.push(
    {
      label: t('Hedging'),
      value: unit.hedging_allowed ? t('allowed') : t('not allowed'),
      title: unit.hedging_allowed
        ? t('Opposing positions in one symbol can be held at the same time.')
        : t('An opposing order nets against the position instead of opening a second one.'),
    },
    { label: t('Config hash'), value: unit.config_hash },
    // the count is the VALUE, so the label is the bare noun: `plural` puts the number in front of
    // the word, and a label of "2 Scenarios" beside a value of "2" says it twice
    {
      label: t('Scenarios'),
      value: String(unit.scenarios.length),
      title: unit.scenarios.join(', '),
    },
  )
  return figures
}

/**
 * The trading rules per symbol — a table, because there are rows to compare down a column, which is
 * the test that decides between this and a block of figures.
 *
 * Ranked 8 → 6 → 4 → 3. What a narrow panel keeps is the symbol, what the smallest legal order is
 * and what holding it overnight costs; the maxima and the step go first, because a maximum volume
 * of 100 lots constrains nobody reading a report after the fact.
 */
const symbolColumns: ListColumn[] = [
  { label: t('Symbol'), width: 'minmax(5rem, 12fr)', rank: 1 },
  { label: t('Pair'), width: 'minmax(0, 10fr)', rank: 3 },
  { label: t('Min'), width: 'minmax(0, 9fr)', figure: true, rank: 1 },
  { label: t('Max'), width: 'minmax(0, 9fr)', figure: true, rank: 4 },
  { label: t('Step'), width: 'minmax(0, 9fr)', figure: true, rank: 4 },
  { label: t('Contract'), width: 'minmax(0, 9fr)', figure: true, rank: 3 },
  { label: t('Tick'), width: 'minmax(0, 9fr)', figure: true, rank: 2 },
  { label: t('Swap L / S'), width: 'minmax(0, 12fr)', figure: true, rank: 1 },
]

/**
 * A size at the precision the backend stated it, and never in exponential notation.
 *
 * No fixed number of places: the minimum order is 0.01 lots at one broker and 0.001 ETH at another,
 * and any fixed precision makes one of the two wrong — 0.00 for the second, or trailing zeroes for
 * the first. But a bare `String()` is not the answer either, because JavaScript switches to
 * exponential below 1e-7 and the captured spot symbol steps in units of 1e-8: that put `1e-8` in a
 * column of plain decimals, one notation for the same kind of quantity on one row and another on
 * the next. Eight places is the floor the smallest stored step needs and costs nothing above it,
 * since trailing zeroes are dropped.
 */
const sizeFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })

function quantity(value: number): string {
  return sizeFormat.format(value)
}

/** Both directions in one cell, because they are one fact: what the position costs to hold. */
function swap(symbol: BrokerSymbol): string {
  return `${symbol.swap_long} / ${symbol.swap_short}`
}
</script>

<template>
  <div class="broker-panel">
    <!-- the advisory, and ONLY where there is something to advise: one broker is the ordinary case
         and has nothing to say about comparability -->
    <p v-if="several" class="notice">
      <span class="mark">⚠</span>
      {{ plural(model.units.length, t('broker'), t('brokers')) }}
      {{ t('in one run — the scenarios did not trade on comparable terms') }}
      <template v-if="differences.length">: {{ differences.join(' · ') }}</template>
    </p>

    <section v-for="unit in model.units" :key="unit.broker_type" class="broker-unit">
      <FigureBlock :title="unit.broker_type" :figures="conditions(unit)" min-width="11rem" />

      <RecordList
        v-if="unit.symbols.length"
        class="symbol-list"
        :rows="unit.symbols"
        :columns="symbolColumns"
        :row-key="symbol => symbol.symbol"
        inert
      >
        <template #default="{ row: symbol }">
          <span :data-rank="1" class="symbol-name">{{ symbol.symbol }}</span>
          <span :data-rank="3">{{ symbol.base_currency }}/{{ symbol.quote_currency }}</span>
          <span :data-rank="1" class="figure-cell">{{ quantity(symbol.volume_min) }}</span>
          <span :data-rank="4" class="figure-cell">{{ quantity(symbol.volume_max) }}</span>
          <span :data-rank="4" class="figure-cell">{{ quantity(symbol.volume_step) }}</span>
          <span :data-rank="3" class="figure-cell">{{ quantity(symbol.contract_size) }}</span>
          <span :data-rank="2" class="figure-cell">{{ quantity(symbol.tick_size) }}</span>
          <span :data-rank="1" class="figure-cell">{{ swap(symbol) }}</span>
        </template>
      </RecordList>
      <!-- a broker the run named but whose instruments the section did not carry: stated, because
           an empty table and an absent one are different things -->
      <p v-else class="hint">{{ t('The section carries no symbol definitions for this broker') }}</p>
    </section>
  </div>
</template>

<style scoped>
.broker-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.broker-unit {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* Several brokers in one run is a caveat about every other panel in this view, so it reads as one —
   in the warning role, with its glyph and its word, because a colour alone does not separate a
   warning from an error under red-green colour blindness. */
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

/* every cell here is a short figure or a symbol name, so none of them wraps and the columns stay
   comparable down the page */
.symbol-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* A FIGURE CELL is right-aligned under its right-aligned heading: `figure: true` on a column aligns
   the HEADING, and the cells are this component's. Asserted as geometry in
   `e2e/list_ranks.spec.ts` — no unit test can see it. */
.symbol-list :deep(.figure-cell) {
  text-align: right;
}

.symbol-name {
  color: var(--color-text-primary);
}

.hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
