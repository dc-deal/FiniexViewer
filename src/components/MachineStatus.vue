<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/base/AppIcon.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { bytes, percentFigure } from '@/components/runs/report_format'
import { useMachineStore } from '@/stores/machine_store'
import type { Figure } from '@/types/figure_types'
import type { IconName } from '@/types/icon_types'
import { t } from '@/translate'

/**
 * How full the machine is, in the menu bar beside the account — the machine the server, the
 * backtests and the live sessions share. The two figures stand there always: on a large host many
 * scenarios run in parallel and fill it, and nothing else on screen says so. The backend's GRADE
 * speaks only where it is not `ok`, as a mark and its word; everything else is on hover.
 *
 * Nothing is computed here. The figures, the grade, its thresholds and its reasons are the answer's
 * own; what this side adds is only that a reading has stopped arriving.
 */
const machine = useMachineStore()
const { reading, failed, stale } = storeToRefs(machine)

/**
 * A share in a slot three digits wide, so a figure going from 9 to 10 moves nothing beside it.
 * Whole numbers in the bar; the served decimals are on hover.
 */
function slot(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'.padStart(3, ' ')
  return Math.round(value).toString().padStart(3, ' ')
}

function clock(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(at)
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
    return { icon: 'status-warning', word: `${t('as of')} ${clock(reading.value.measured_at)}`, role: 'warning' }
  }
  if (!reading.value && failed.value) return { icon: 'status-warning', word: t('no reading'), role: 'warning' }
  return null
})

const title = computed(() => reading.value
  ? t('How full the machine is — the one this server, its backtests and its sessions share')
  : t('The machine could not be read'))

const details = computed<Figure[]>(() => {
  const answer = reading.value
  if (!answer) return []
  const { cpu, memory } = answer
  const rows: Figure[] = [
    {
      label: t('Pressure'),
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
      label: t('Graded'),
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
    { label: t('Measured'), value: clock(answer.measured_at) },
  ]
  if (age.value) rows.push({ label: t('Note'), value: t('The readings have stopped arriving'), tone: 'warning' })
  return rows
})
</script>

<template>
  <HoverCard :title="title" :details="details">
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
