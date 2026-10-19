<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/base/AppIcon.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { bytes, clockTime, largerFirst, percentFigure } from '@/components/runs/report_format'
import { useMachineStore } from '@/stores/machine_store'
import type { Figure } from '@/types/figure_types'
import type { IconName } from '@/types/icon_types'
import { t } from '@/translate'

/**
 * How full the machine is, in the menu bar beside the account — the machine the server, the
 * backtests and the live sessions share. The two figures stand there always: on a large host many
 * scenarios run in parallel and fill it, and nothing else on screen says so. The backend's GRADE
 * speaks only where it is not `ok`, as a mark and its word; everything else is on hover — and
 * there, what runs on the machine, in one line (viewer#49), with the panel that lists every
 * activity named beneath it.
 *
 * Nothing is computed here. The figures, the grade, its thresholds and its reasons are the answer's
 * own; what this side adds is only that a reading has stopped arriving.
 */
const machine = useMachineStore()
const { reading, failed, stale, activities, activitiesError } = storeToRefs(machine)

/** The list is asked only while the card is open: a closed card has nobody reading it. */
let stopReading: (() => void) | null = null

function cardOpened(open: boolean): void {
  if (open && !stopReading) stopReading = machine.watchActivities()
  if (!open && stopReading) {
    stopReading()
    stopReading = null
  }
}

onUnmounted(() => stopReading?.())

/** The longest label the card's one line names before cutting it — the panel shows it whole. */
const LABEL_CHARS = 28

function cut(text: string): string {
  return text.length > LABEL_CHARS ? `${text.slice(0, LABEL_CHARS - 1)}…` : text
}

/**
 * What runs, in one line: the server's own row left out — it is the one answering — every other
 * counted, the way a list says how many rows it shows, and the two that hold the most memory and
 * run on their own named in their own words: the card hangs under the machine's memory, and what
 * fills it is the question. One running inside another is part of it and holds its memory there:
 * named, a sweep's backtest hid a test suite that held gigabytes (browser pass, 2026-10-19).
 */
const running = computed(() => {
  const list = activities.value
  if (!list) return activitiesError.value ? t('could not be read') : t('asking the server …')
  const others = list.activities.filter(row => row.activity_id !== list.server_activity_id)
  if (!others.length) return t('only this server')
  const listed = new Set(list.activities.map(row => row.activity_id))
  const named = others
    .filter(row => !row.parent_activity_id || !listed.has(row.parent_activity_id))
    .sort((a, b) => largerFirst(a.rss_bytes, b.rss_bytes))
    .slice(0, 2)
    .map(row => `${row.activity_kind} ${cut(row.activity_label)}`)
  const more = others.length - named.length
  return [String(others.length), ...named, ...(more > 0 ? [`+${more} ${t('more')}`] : [])].join(' · ')
})

/**
 * A share in a slot three digits wide, so a figure going from 9 to 10 moves nothing beside it.
 * Whole numbers in the bar; the served decimals are on hover.
 */
function slot(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'.padStart(3, ' ')
  return Math.round(value).toString().padStart(3, ' ')
}

interface Mark {
  icon: IconName
  word: string
  role: 'warning' | 'error'
}

/** The backend's grade where it is not `ok`. A grade this version does not know shows as itself. */
const grade = computed<Mark | null>(() => {
  const level = reading.value?.pressure_level
  if (!level || level === 'ok') return null
  return level === 'critical'
    ? { icon: 'status-error', word: level, role: 'error' }
    : { icon: 'status-warning', word: level, role: 'warning' }
})

/** What only this side knows: the reading on screen is no longer current, or there is none. */
const age = computed<Mark | null>(() => {
  if (reading.value && (stale.value || failed.value)) {
    return { icon: 'status-warning', word: `${t('as of')} ${clockTime(reading.value.measured_at)}`, role: 'warning' }
  }
  if (!reading.value && failed.value) return { icon: 'status-warning', word: t('no reading'), role: 'warning' }
  return null
})

/** No heading where there is a reading — the rows say it all; a sentence only where there is none. */
const title = computed(() => {
  if (reading.value) return undefined
  return failed.value ? t('The machine could not be read') : t('Asking the server how full the machine is')
})

const details = computed<Figure[]>(() => {
  const answer = reading.value
  if (!answer) return []
  const { cpu, memory } = answer
  const rows: Figure[] = [
    {
      // the backend's grade, and it grades memory ALONE — the label says which, the word is theirs
      label: t('Memory pressure'),
      value: answer.pressure_level,
      ...(grade.value ? { tone: grade.value.role } : {}),
    },
    ...answer.pressure_reasons.map(reason => ({ label: t('Reason'), value: reason })),
    {
      label: t('Memory'),
      value: `${bytes(memory.used_bytes)} ${t('of')} ${bytes(memory.limit_bytes)} · ${percentFigure(memory.used_pct)}`,
    },
    { label: t('Limit read from'), value: memory.limit_source },
    {
      label: t('Thresholds'),
      value: `warn ${t('from')} ${percentFigure(memory.warn_at_pct)} · critical ${t('from')} ${percentFigure(memory.critical_at_pct)}`,
    },
    { label: t('Processors'), value: `${cpu.count} · ${t('read from')} ${cpu.count_source}` },
    {
      label: t('Busy'),
      // null on the first reading after a restart of the server: there is no window yet
      value: cpu.used_pct === null || cpu.window_s === null
        ? t('no window yet')
        : `${percentFigure(cpu.used_pct)} ${t('over')} ${cpu.window_s.toFixed(1)} s`,
    },
    { label: t('Measured'), value: clockTime(answer.measured_at) },
    { label: t('Running'), value: running.value },
  ]
  if (age.value) rows.push({ label: t('Note'), value: t('The readings have stopped arriving'), tone: 'warning' })
  rows.push({ label: t('Every activity'), value: t('Panels ▸ Activities') })
  return rows
})
</script>

<template>
  <HoverCard :title="title" :details="details" @update:open="cardOpened">
    <span
      class="machine-status"
      tabindex="0"
      :data-level="reading?.pressure_level ?? 'none'"
      :data-old="age ? 'true' : undefined"
    >
      <!-- a mark never travels alone: its word is beside it, and read out with it -->
      <template v-if="grade">
        <span class="machine-mark" :class="grade.role" :data-status="grade.word">
          <AppIcon :name="grade.icon" /> {{ grade.word }}
        </span>
        <span class="machine-separator" aria-hidden="true">·</span>
      </template>
      <span class="machine-figure">
        {{ t('CPU') }} <span class="machine-value">{{ slot(reading?.cpu.used_pct) }}</span>%
      </span>
      <span class="machine-separator" aria-hidden="true">·</span>
      <span class="machine-figure">
        {{ t('Memory') }} <span class="machine-value">{{ slot(reading?.memory.used_pct) }}</span>%
      </span>
      <template v-if="age">
        <span class="machine-separator" aria-hidden="true">·</span>
        <span class="machine-mark" :class="age.role">
          <AppIcon :name="age.icon" /> {{ age.word }}
        </span>
      </template>
    </span>
  </HoverCard>
</template>

<style scoped>
/* no control: a click opening the Activities panel was tried on 2026-10-19 and taken back — as a
   button the status wore the link colour and a frame on hover, too loud for the menu bar's quiet
   figures (operator, on screen). The card names the panel instead. */
.machine-status {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: 4px;
  font-family: monospace;
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--color-text-primary);
  cursor: default;
}

.machine-status:focus-visible {
  outline: 1px solid var(--color-accent);
}

/* the padding inside the slot is spaces, and only `pre` keeps them */
.machine-value {
  white-space: pre;
}

.machine-separator {
  color: var(--color-text-secondary);
}

.machine-mark {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.machine-mark.warning {
  color: var(--color-warning);
}

.machine-mark.error {
  color: var(--color-error);
}
</style>
