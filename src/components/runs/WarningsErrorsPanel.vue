<script setup lang="ts">
import { computed } from 'vue'
import type { WarningsErrorsReport } from '@/types/api/report_types'
import { t } from '@/translate'

const props = defineProps<{
  model: WarningsErrorsReport
}>()

// Tier 1 is validator-produced and belongs in the report; tier 2 is the log pot and is only
// summarised, per the backend's own taxonomy.
const majorWarnings = computed(() => props.model.warnings.filter(row => row.tier === 'major'))
const minorWarnings = computed(() => props.model.warnings.filter(row => row.tier !== 'major'))

const isClean = computed(() => !props.model.errors.length && !props.model.warnings.length)

/** '' on artifacts written before the grading existed — an absence, never rendered as a state. */
const outcomeRecorded = computed(() => props.model.outcome.run_outcome !== '')

const outcomeMark = computed(() => {
  if (props.model.outcome.run_outcome === 'failed') return '✖'
  if (props.model.outcome.run_outcome === 'success') return '✓'
  return ''
})

function hasDetail(row: { traceback: string, validation_errors: string[], logged_errors: string[] }): boolean {
  return row.traceback !== '' || row.validation_errors.length > 0 || row.logged_errors.length > 0
}
</script>

<template>
  <div class="warnings-panel">
    <div class="outcome" :class="model.outcome.run_outcome">
      <span v-if="outcomeRecorded" class="outcome-verdict">
        {{ outcomeMark }} {{ model.outcome.run_outcome }}
      </span>
      <span v-else class="outcome-absent">{{ t('no outcome recorded') }}</span>
      <span class="outcome-units">
        {{ model.outcome.failed_count }} / {{ model.outcome.total_units }} {{ t('units failed') }}
      </span>
      <span v-if="model.outcome.first_failure_name" class="outcome-first">
        {{ t('first failure:') }} {{ model.outcome.first_failure_name }}
      </span>
    </div>

    <p v-if="model.outcome.emergency_reason" class="emergency">
      {{ t('Emergency:') }} {{ model.outcome.emergency_reason }}
    </p>

    <p v-if="isClean" class="hint">{{ t('No warnings or errors') }}</p>

    <section v-if="model.errors.length" class="block">
      <h3 class="block-title error-title">{{ t('Errors') }} ({{ model.errors.length }})</h3>
      <div v-for="row in model.errors" :key="row.name + row.symbol" class="entry">
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
          <p v-for="(line, i) in row.logged_errors" :key="'l' + i" class="detail-line">{{ line }}</p>
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
        {{ minorWarnings.length }} {{ t('minor warnings in the log') }}
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
  padding: var(--space-sm) var(--space-md);
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

.detail-line {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.detail-trace {
  white-space: pre-wrap;
  overflow-x: auto;
  font-size: var(--font-size-sm);
}

.hint {
  color: var(--color-text-secondary);
}
</style>
