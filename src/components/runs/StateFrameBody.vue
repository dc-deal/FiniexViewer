<script setup lang="ts">
import FigureBlock from '@/components/base/FigureBlock.vue'
import {
  amount, percentFigure, polarity, priceAt, quantity, readingOf, utcInstant,
} from '@/components/runs/report_format'
import { useTickSizes } from '@/composables/use_tick_sizes'
import { t } from '@/translate'
import type { Figure } from '@/types/figure_types'
import type { StateFrame } from '@/types/api/state_frame_types'

/**
 * What one state frame holds — its health where something is off, the account, the decision, every
 * worker's outputs, and what is open and resting. The same for the latest frame and for the frame a
 * player stands on, so a session reads one way whichever moment is on show.
 */
const props = defineProps<{
  frame: StateFrame
  /** The unit the frame is of, which says the instrument's tick size. */
  unit: string
}>()

const tickSizes = useTickSizes()

/** A price of the frame's instrument, at its tick size. */
function priceOf(value: number): string {
  return priceAt(value, tickSizes(props.unit, props.frame.symbol))
}

/**
 * What is off, and what could have been checked and was not. A check that passed is not here.
 * `feed_stale` null is not among them: it is null where the session reads no signal at all.
 */
function healthOf(frame: StateFrame): { words: string, warning: boolean }[] {
  const lines: { words: string, warning: boolean }[] = []
  if (frame.safety_blocked) lines.push({ words: t('The circuit breaker blocks new orders'), warning: true })
  if (frame.safety_blocked === null) lines.push({ words: t('The circuit breaker was not checked'), warning: false })
  if (frame.market_stale) lines.push({ words: t('The market data is stale'), warning: true })
  if (frame.market_stale === null) lines.push({ words: t('The market data was not checked'), warning: false })
  if (frame.feed_stale) lines.push({ words: t('A signal the session reads is stale'), warning: true })
  if (frame.reconcile_clean === false) {
    lines.push({ words: t('The latest reconciliation with the venue was not clean'), warning: true })
  }
  if (frame.reconcile_clean === null) {
    lines.push({ words: t('No reconciliation with the venue checked yet'), warning: false })
  }
  return lines
}

function accountOf(frame: StateFrame): Figure[] {
  const currency = frame.account_currency
  const figures: Figure[] = [{
    label: t('Equity'),
    value: frame.equity === null ? t('not valued yet') : amount(frame.equity, currency),
  }]
  for (const [held, value] of Object.entries(frame.balances)) {
    figures.push({
      label: `${t('Balance')} ${held}`,
      value: held === currency ? amount(value, held) : `${quantity(value)} ${held}`,
    })
  }
  const unrealized = polarity(frame.unrealized_pnl)
  figures.push({
    label: t('Unrealized P&L'),
    value: amount(frame.unrealized_pnl, currency),
    tone: unrealized === 'flat' ? undefined : unrealized,
  })
  figures.push({
    label: t('Last price'),
    value: frame.last_price === null ? t('no price yet') : `${priceOf(frame.last_price)} ${frame.symbol}`,
    title: t('The mid the account is valued at'),
  })
  if (frame.safety_drawdown_pct !== null) {
    figures.push({ label: t('Breaker drawdown'), value: percentFigure(frame.safety_drawdown_pct) })
  }
  figures.push({ label: t('Ticks processed'), value: frame.ticks_processed.toLocaleString('en-US') })
  return figures
}

function decisionOf(frame: StateFrame): Figure[] {
  const figures: Figure[] = [{ label: t('Action'), value: frame.decision_action ?? t('none') }]
  for (const [key, value] of Object.entries(frame.decision_outputs)) {
    figures.push({ label: key, value: readingOf(value) })
  }
  if (frame.order_id) figures.push({ label: t('Order id'), value: frame.order_id })
  return figures
}

function outputsOf(outputs: Record<string, unknown>): Figure[] {
  return Object.entries(outputs).map(([key, value]) => ({ label: key, value: readingOf(value) }))
}
</script>

<template>
  <p
    v-for="line in healthOf(frame)"
    :key="line.words"
    class="health"
    :class="{ warning: line.warning }"
  >
    <span v-if="line.warning" class="glyph">⚠ </span>{{ line.words }}
  </p>

  <div class="blocks">
    <FigureBlock :title="t('Account')" :figures="accountOf(frame)" min-width="13rem" />
    <FigureBlock :title="t('Decision')" :figures="decisionOf(frame)" min-width="13rem" />
    <FigureBlock
      v-for="(outputs, worker) in frame.worker_outputs"
      :key="worker"
      :title="`${t('Worker')} ${worker}`"
      :figures="outputsOf(outputs)"
      min-width="13rem"
    />
  </div>

  <div class="holdings">
    <p class="holding-line">
      <span class="holding-label">{{ t('Open positions') }}</span> {{ frame.open_positions.length ? '' : t('none') }}
    </p>
    <p
      v-for="position in frame.open_positions"
      :key="position.position_id"
      class="holding"
      :title="`${position.position_id} · ${t('opened')} ${utcInstant(position.entry_time)}`"
    >
      {{ position.direction }} {{ quantity(position.lots) }} {{ frame.symbol }}
      @ {{ priceOf(position.entry_price) }}
      · {{ amount(position.unrealized_pnl, frame.account_currency) }}
      <template v-if="position.stop_loss !== null">· SL {{ priceOf(position.stop_loss) }}</template>
      <template v-if="position.take_profit !== null">· TP {{ priceOf(position.take_profit) }}</template>
    </p>
    <p class="holding-line">
      <span class="holding-label">{{ t('Resting orders') }}</span> {{ frame.active_orders.length ? '' : t('none') }}
    </p>
    <p v-for="order in frame.active_orders" :key="order.order_id" class="holding" :title="order.order_id">
      {{ order.order_type }} {{ order.direction }} {{ quantity(order.lots) }} {{ frame.symbol }}
      @ {{ priceOf(order.entry_price) }}
      <!-- `entry_price` is the limit on a limit, the trigger on a stop; a stop-limit's fill limit beside it -->
      <template v-if="order.limit_price">· {{ t('limit') }} {{ priceOf(order.limit_price) }}</template>
    </p>
  </div>
</template>

<style scoped>
.health,
.holding-line,
.holding {
  margin: 0;
}

.health {
  color: var(--color-text-secondary);
}

.health.warning {
  color: var(--color-warning);
}

.holding-label {
  color: var(--color-text-secondary);
}

.blocks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.blocks > * {
  flex: 1 1 18rem;
  min-width: 0;
}

.holdings {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
}

.holding {
  padding-left: 2ch;
  font-variant-numeric: tabular-nums;
}
</style>
