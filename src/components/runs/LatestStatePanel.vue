<script setup lang="ts">
import FigureBlock from '@/components/base/FigureBlock.vue'
import {
  amount, bytes, duration, percentFigure, polarity, quantity, readingOf, utcInstant,
} from '@/components/runs/report_format'
import { t } from '@/translate'
import type { Figure } from '@/types/figure_types'
import type {
  ProcessMemory, StateFrame, StateFrameUnit, StateFramesLatest,
} from '@/types/api/state_frame_types'

/**
 * How a session stands while it runs — the check-in on its latest state frame, since every report
 * section is written only when it ends. One block per unit; a session is one.
 *
 * **Two clocks, never one axis** (testingide, 2026-10-22): `frame_time` is the session's own clock,
 * the market data it was processing, and is said as a time; `written_at` is the machine's and only
 * answers how long ago, which the route states as `age_s` — nothing here subtracts one from another.
 *
 * **A check that passes says nothing.** The circuit breaker, stale data and the reconciliation
 * speak only when they are off, or where a check that could have run did not.
 *
 * Once the session ended and its outcome is written, the frame is the state its report sections
 * describe, so it folds away behind its status and the memory, which no report states.
 */
defineProps<{
  model: StateFramesLatest
}>()

interface Status {
  glyph: string
  words: string
  role: string
}

/** Seconds as a reader holds them: `41 s`, `14 min`, `3.2 h`. */
function ago(seconds: number): string {
  return duration(seconds / 3600)
}

function writtenAgo(unit: StateFrameUnit): string {
  if (unit.age_s === null) return t('written at a time ahead of this server clock')
  return `${t('written')} ${ago(unit.age_s)} ${t('ago')}`
}

/** The recording verdict in a line — the route's own reading of the frame's age. */
function statusOf(unit: StateFrameUnit): Status {
  if (unit.recording === 'current') {
    return {
      glyph: '●',
      words: `${t('recording')} · ${writtenAgo(unit)} · ${t('cadence')} ${unit.cadence_timeframe}`,
      role: 'current',
    }
  }
  if (unit.recording === 'stopped') {
    return {
      glyph: '⚠',
      words: `${t('recording stopped')} · ${t('the last frame')} ${writtenAgo(unit)} — `
        + t('the session hangs or its process died; Panels ▸ Activities tells which'),
      role: 'stopped',
    }
  }
  if (unit.recording === 'ended') return { glyph: '■', words: endedWords(unit), role: 'ended' }
  if (unit.recording === null) {
    return {
      glyph: '◌',
      words: t('replaying recorded data — the age of a frame says nothing about whether it runs'),
      role: 'replay',
    }
  }
  return { glyph: '', words: unit.recording, role: '' }
}

/**
 * How it ended, as warnings-errors grades it. `operator_interrupted` is said here although the
 * scenario panels leave it out: there it defaults to false on artifacts older than the flag, while
 * a state frame exists only on a session recorded since contract 38, where it is written.
 */
function endedWords(unit: StateFrameUnit): string {
  const outcome = unit.outcome
  if (!outcome) return `${t('ended')} · ${t('its outcome follows with its report, unless the process died in between')}`
  const parts = [t('ended'), outcome.run_outcome]
  if (outcome.shutdown_mode) parts.push(`${t('shutdown')} ${outcome.shutdown_mode}`)
  if (outcome.operator_interrupted) parts.push(t('stopped by the operator'))
  if (outcome.emergency_reason) parts.push(outcome.emergency_reason)
  return parts.join(' · ')
}

/** The session ended and wrote its outcome: the frame is what its report sections describe. */
function closed(unit: StateFrameUnit): boolean {
  return unit.recording === 'ended' && unit.outcome !== null
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
    value: frame.last_price === null ? t('no price yet') : `${quantity(frame.last_price)} ${frame.symbol}`,
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

function memoryLine(memory: ProcessMemory | null): string {
  if (!memory) return t('not recorded on this frame')
  return `${t('private')} ${bytes(memory.private_bytes)} · ${t('resident')} ${bytes(memory.rss_bytes)}`
}

/**
 * What the process held at the latest frame and at the first — side by side and never subtracted:
 * two points are not a series, and a climb that fell back would read as flat.
 */
function memoryOf(unit: StateFrameUnit): Figure[] {
  const { frame: latest, first_frame: first } = unit
  return [
    { label: t('Latest frame'), value: memoryLine(latest.process_memory) },
    {
      label: t('First frame'),
      value: memoryLine(first.process_memory),
      title: `${t('written')} ${utcInstant(first.written_at)}`,
    },
  ]
}
</script>

<template>
  <div class="latest-state">
    <section
      v-for="unit in model.units"
      :key="unit.unit_name"
      class="unit"
      :data-unit="unit.unit_name"
    >
      <h4 v-if="model.units.length > 1" class="unit-name">{{ unit.unit_name }}</h4>

      <p class="status" :class="statusOf(unit).role">
        <span class="glyph">{{ statusOf(unit).glyph }}</span> {{ statusOf(unit).words }}
      </p>
      <!-- the session's OWN clock, said as a time and named as that clock; the machine's is the age above -->
      <p class="as-of">
        {{ t('As of') }} {{ utcInstant(unit.frame.frame_time) }} — {{ t('the session clock') }}
        · {{ t('written for') }} {{ unit.frame.written_for }}
        <template v-if="unit.truncated_tail">
          · {{ t('its last line was being written, so the frame before it is shown') }}
        </template>
      </p>

      <!-- no report states it, so it stays once the session closed; a value names two sizes, so a
           pair needs the width of both beside its label -->
      <FigureBlock class="memory" :title="t('Memory')" :figures="memoryOf(unit)" min-width="24rem" />

      <!-- folded only once the session closed: a disclosure with nothing to fold would draw the
           browser's own "Details" heading over a frame that is the whole point of the section -->
      <component :is="closed(unit) ? 'details' : 'div'" class="frame">
        <summary v-if="closed(unit)">{{ t('The last frame — the state its report sections describe') }}</summary>

        <p
          v-for="line in healthOf(unit.frame)"
          :key="line.words"
          class="health"
          :class="{ warning: line.warning }"
        >
          <span v-if="line.warning" class="glyph">⚠ </span>{{ line.words }}
        </p>

        <div class="blocks">
          <FigureBlock :title="t('Account')" :figures="accountOf(unit.frame)" min-width="13rem" />
          <FigureBlock :title="t('Decision')" :figures="decisionOf(unit.frame)" min-width="13rem" />
          <FigureBlock
            v-for="(outputs, worker) in unit.frame.worker_outputs"
            :key="worker"
            :title="`${t('Worker')} ${worker}`"
            :figures="outputsOf(outputs)"
            min-width="13rem"
          />
        </div>

        <div class="holdings">
          <p class="holding-line">
            <span class="holding-label">{{ t('Open positions') }}</span> {{ unit.frame.open_positions.length ? '' : t('none') }}
          </p>
          <p
            v-for="position in unit.frame.open_positions"
            :key="position.position_id"
            class="holding"
            :title="`${position.position_id} · ${t('opened')} ${utcInstant(position.entry_time)}`"
          >
            {{ position.direction }} {{ quantity(position.lots) }} {{ unit.frame.symbol }}
            @ {{ quantity(position.entry_price) }}
            · {{ amount(position.unrealized_pnl, unit.frame.account_currency) }}
            <template v-if="position.stop_loss !== null">· SL {{ quantity(position.stop_loss) }}</template>
            <template v-if="position.take_profit !== null">· TP {{ quantity(position.take_profit) }}</template>
          </p>
          <p class="holding-line">
            <span class="holding-label">{{ t('Resting orders') }}</span> {{ unit.frame.active_orders.length ? '' : t('none') }}
          </p>
          <p v-for="order in unit.frame.active_orders" :key="order.order_id" class="holding" :title="order.order_id">
            {{ order.order_type }} {{ order.direction }} {{ quantity(order.lots) }} {{ unit.frame.symbol }}
            @ {{ quantity(order.entry_price) }}
            <!-- `entry_price` is the limit on a limit, the trigger on a stop; a stop-limit's fill limit beside it -->
            <template v-if="order.limit_price">· {{ t('limit') }} {{ quantity(order.limit_price) }}</template>
          </p>
        </div>
      </component>
    </section>
  </div>
</template>

<style scoped>
.latest-state {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.unit {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.unit-name {
  margin: 0;
}

.status,
.as-of,
.health,
.holding-line,
.holding {
  margin: 0;
}

/* every status travels with its glyph and its word; the colour only reinforces */
.status.current { color: var(--color-positive); }
.status.stopped { color: var(--color-warning); }

.status.ended,
.status.replay,
.as-of {
  color: var(--color-text-secondary);
}

.holding-label {
  color: var(--color-text-secondary);
}

.frame {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}

.frame > summary {
  cursor: pointer;
  color: var(--color-accent);
}

.health {
  color: var(--color-text-secondary);
}

.health.warning {
  color: var(--color-warning);
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
