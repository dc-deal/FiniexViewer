<script setup lang="ts">
import { computed } from 'vue'
import type { UnitErrorRow, WarningsErrorsReport } from '@/types/api/report_types'
import { utcInstant } from '@/components/runs/report_format'
import { rowKey } from '@/api/list_key'
import { useScenarioSelection, showsUnit } from '@/composables/use_scenario_selection'
import { plural, t } from '@/translate'

const props = defineProps<{
  model: WarningsErrorsReport
}>()

const narrowing = useScenarioSelection()
const narrowed = computed(() => narrowing.units.value.length > 0)

/** Read from the response rather than assumed — `name` alone, the symbol is not part of it. */
const errorKey = computed(() => props.model.keys.errors)

/** An error row IS a unit, so the narrowing reaches it directly. */
const errors = computed(() =>
  props.model.errors.filter(row => showsUnit(narrowing.units.value, row.name))
)

/**
 * A warning is either the RUN's or a unit's — `scope` carries which. Under a narrowing the
 * run-scoped ones stay, because they are still true of what is on show; only warnings belonging
 * to a unit nobody chose drop out. Filtering those out too would hide a stress-test notice that
 * changes how every figure below it reads.
 */
const warnings = computed(() =>
  props.model.warnings.filter(row =>
    row.scope === 'run' || showsUnit(narrowing.units.value, row.scope)
  )
)

// Tier 1 is validator-produced and belongs in the report; tier 2 is the log pot and is only
// summarised, per the backend's own taxonomy.
const majorWarnings = computed(() => warnings.value.filter(row => row.tier === 'major'))
const minorWarnings = computed(() => warnings.value.filter(row => row.tier !== 'major'))

const isClean = computed(() => !errors.value.length && !warnings.value.length)

/** '' on artifacts written before the grading existed — an absence, never rendered as a state. */
const outcomeRecorded = computed(() => props.model.outcome.run_outcome !== '')

/**
 * What the unit counts SAY, rather than a fraction beside a verb. `0 / 8 units failed` was read as
 * "8 units failed" — the two numbers and the word sat in one line and the eye took the nearest
 * pair.
 */
const unitLine = computed(() => {
  const { failed_count: failed, total_units: total } = props.model.outcome
  return `${failed} ${t('of')} ${plural(total, t('unit'), t('units'))} ${t('failed')}`
})

/**
 * Nothing wrong, so nothing to frame.
 *
 * A box is a device for forcing attention, and a healthy run has no claim on any. What survives is
 * the GRADE, in one quiet line: `run_outcome` is the backend's own verdict and is not readable off
 * the screen — a run can be graded `finished_with_errors` while this panel shows only warnings,
 * because the errors may sit in a section nobody rendered. That no UNIT failed, by contrast, is
 * visible already: there is no error row. So the count appears only when it is not zero.
 */
const quiet = computed(() =>
  props.model.outcome.run_outcome === 'success' && props.model.outcome.failed_count === 0
)

const outcomeMark = computed(() => {
  if (props.model.outcome.run_outcome === 'failed') return '✖'
  if (props.model.outcome.run_outcome === 'success') return '✓'
  return ''
})

/**
 * The shutdown mode, which is DETAIL and never a verdict. An operator stopping a healthy
 * session with Ctrl+C produces the same 'emergency' as a crash, so it is only alarming where the
 * run was graded failed. Absent on a simulation run, where it means not applicable.
 */
const shutdown = computed(() => {
  const mode = props.model.outcome.shutdown_mode
  if (!mode) return null
  return { mode, alarming: props.model.outcome.run_outcome === 'failed' }
})

function hasDetail(row: UnitErrorRow): boolean {
  return row.traceback !== '' || row.validation_errors.length > 0 || row.logged_errors.length > 0
}
</script>

<template>
  <div class="warnings-panel">
    <!-- the outcome counts every unit the run attempted, so it stays the RUN's under a narrowing -->
    <div class="outcome" :class="[model.outcome.run_outcome, { quiet }]">
      <span v-if="narrowed" class="scope">{{ t('whole run') }}</span>
      <span v-if="outcomeRecorded" class="outcome-verdict">
        {{ outcomeMark }} {{ model.outcome.run_outcome }}
      </span>
      <span v-else class="outcome-absent">{{ t('no outcome recorded') }}</span>
      <!-- `0 / 8 units failed` put "8 units failed" side by side and read as exactly that. The
           sentence now says which of the two cases it is instead of leaving the reader to parse a
           fraction. -->
      <span v-if="model.outcome.failed_count > 0" class="outcome-units has-failures">
        {{ unitLine }}
      </span>
      <span v-if="model.outcome.first_failure_name" class="outcome-first">
        {{ t('first failure:') }} {{ model.outcome.first_failure_name }}
      </span>
      <span v-if="shutdown" class="outcome-shutdown" :class="{ alarming: shutdown.alarming }">
        {{ t('shutdown:') }} {{ shutdown.mode }}
      </span>
    </div>

    <p v-if="model.outcome.emergency_reason" class="emergency">
      {{ t('Emergency:') }} {{ model.outcome.emergency_reason }}
    </p>

    <p v-if="isClean" class="hint">{{ t('No warnings or errors') }}</p>

    <section v-if="errors.length" class="block">
      <h3 class="block-title error-title">{{ t('Errors') }} ({{ errors.length }})</h3>
      <div v-for="row in errors" :key="rowKey(row, errorKey)" class="entry">
        <div class="entry-head">
          <span class="entry-unit">{{ row.name }}</span>
          <span v-if="row.symbol" class="entry-symbol">{{ row.symbol }}</span>
          <span v-if="row.error_type" class="entry-type">{{ row.error_type }}</span>
        </div>
        <p class="entry-message">{{ row.error_message }}</p>
        <!-- only offered when there is something behind it — most rows carry none -->
        <details v-if="hasDetail(row)" class="entry-detail">
          <summary>{{ t('details') }}</summary>
          <p v-for="(line, i) in row.validation_errors" :key="'v' + i" class="detail-line">{{ line }}</p>
          <!-- the log pot arrives as records, so level and scope are shown rather than discarded;
               the time is the run's own clock and is simply absent for a startup entry -->
          <p v-for="(entry, i) in row.logged_errors" :key="'l' + i" class="detail-line">
            <span class="log-level">{{ entry.level }}</span>
            <span v-if="entry.event_time" class="log-time">{{ utcInstant(entry.event_time) }}</span>
            <span v-if="entry.scope" class="log-scope">{{ entry.scope }}</span>
            <span class="log-message">{{ entry.message }}</span>
          </p>
          <pre v-if="row.traceback" class="detail-trace">{{ row.traceback }}</pre>
        </details>
      </div>
    </section>

    <section v-if="majorWarnings.length" class="block">
      <h3 class="block-title warn-title">{{ t('Major warnings') }} ({{ majorWarnings.length }})</h3>
      <div v-for="(row, i) in majorWarnings" :key="'m' + i" class="entry">
        <span class="entry-scope">{{ row.scope }}</span>
        <span class="entry-message inline">{{ row.message }}</span>
      </div>
    </section>

    <details v-if="minorWarnings.length" class="minor">
      <summary>
        {{ plural(minorWarnings.length, t('minor warning in the log'), t('minor warnings in the log')) }}
      </summary>
      <div v-for="(row, i) in minorWarnings" :key="'n' + i" class="entry">
        <span class="entry-scope">{{ row.scope }}</span>
        <span class="entry-message inline">{{ row.message }}</span>
      </div>
    </details>
  </div>
</template>

<style scoped>
.warnings-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.outcome {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: baseline;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  /* see `quiet` in the script: a healthy run keeps the grade and loses the frame */
  padding: var(--space-sm) var(--space-md);
}

/* the scope of a count that cannot be split — marked, never filtered */
.scope {
  padding: 0 var(--space-xs);
  border: 1px dashed var(--color-annotation);
  border-radius: 4px;
  color: var(--color-annotation);
  font-size: var(--font-size-sm);
}

.outcome.failed {
  border-color: var(--color-error);
}

.outcome-verdict {
  font-size: var(--font-size-md);
}

.outcome.failed .outcome-verdict {
  color: var(--color-error);
}

.outcome.success .outcome-verdict {
  color: var(--color-positive);
}

.outcome-absent,
.outcome-units,
.outcome-first {
  color: var(--color-text-secondary);
}

/* nothing wrong, nothing framed */
.outcome.quiet {
  background: none;
  border-color: transparent;
  padding-left: 0;
  padding-right: 0;
}

/* a unit that failed is not plain structure — it is the reason somebody opened this panel */
.outcome-units.has-failures {
  color: var(--color-error);
}

.emergency {
  color: var(--color-error);
}

.block-title {
  font-size: var(--font-size-sm);
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-sm);
}

.error-title {
  color: var(--color-error);
}

.warn-title {
  color: var(--color-text-secondary);
}

.entry {
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--color-border);
}

.entry:last-child {
  border-bottom: none;
}

.entry-head {
  display: flex;
  gap: var(--space-sm);
  align-items: baseline;
}

.entry-symbol,
.entry-type,
.entry-scope {
  color: var(--color-text-secondary);
}

.entry-scope {
  margin-right: var(--space-sm);
}

.entry-message {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.entry-message.inline {
  display: inline;
}

.entry-detail,
.minor {
  color: var(--color-text-secondary);
}

.entry-detail summary,
.minor summary {
  cursor: pointer;
}

.log-level,
.log-time,
.log-scope {
  color: var(--color-text-secondary);
  margin-right: var(--space-sm);
}

.log-level {
  font-weight: bold;
}

.detail-line {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.detail-trace {
  white-space: pre-wrap;
  overflow-x: auto;
  font-size: var(--font-size-sm);
}

.outcome-shutdown {
  color: var(--color-text-secondary);
}

.outcome-shutdown.alarming {
  color: var(--color-error);
}

.hint {
  color: var(--color-text-secondary);
}
</style>
