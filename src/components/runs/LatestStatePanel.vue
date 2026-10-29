<script setup lang="ts">
import FigureBlock from '@/components/base/FigureBlock.vue'
import StateFramePlayer from '@/components/runs/StateFramePlayer.vue'
import { bytes, duration, utcInstant } from '@/components/runs/report_format'
import { t } from '@/translate'
import type { Figure } from '@/types/figure_types'
import type { ProcessMemory, StateFrameUnit, StateFramesLatest } from '@/types/api/state_frame_types'

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
 *
 * **The frames over time** play below the status (`StateFramePlayer`, contract 43): a session
 * records one a cadence, and every one of them can be stood on — the latest is where it opens.
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
        <summary v-if="closed(unit)">{{ t('Its frames over time — the last is the state its report sections describe') }}</summary>

        <StateFramePlayer :unit="unit.unit_name" :latest="unit.frame" />
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
.as-of {
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
</style>
