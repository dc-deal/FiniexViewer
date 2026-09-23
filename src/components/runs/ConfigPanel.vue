<script setup lang="ts">
import { computed } from 'vue'
import JsonTree from '@/components/base/JsonTree.vue'
import { scenarioCount, scenarioOverrides, strategyOf, workersOf } from '@/components/runs/config_shape'
import type { RunConfigReport } from '@/types/api/report_types'
import { t } from '@/translate'

const props = defineProps<{
  model: RunConfigReport
}>()

const strategy = computed(() => strategyOf(props.model.config))
const workers = computed(() => (strategy.value ? workersOf(strategy.value) : []))
const parameters = computed(() => Object.entries(strategy.value?.decision_logic_config ?? {}))
const overrides = computed(() => scenarioOverrides(props.model.config))
const scenarios = computed(() => scenarioCount(props.model.config))

/**
 * A worker's parameters on one line. ONE level of nesting is spelled out — `periods: {"M30":20}`
 * reads as `periods M30 20` — because that one level is where these actually live and raw JSON
 * makes a reader parse punctuation. Anything deeper, longer or holding a list stays JSON: it is
 * better to look unfriendly than to flatten a structure into something it is not.
 */
function inline(parameters: Record<string, unknown>): string {
  const entries = Object.entries(parameters)
  if (!entries.length) return '—'
  return entries.map(([key, value]) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const inner = Object.entries(value as Record<string, unknown>)
      const flat = inner.length > 0 && inner.length <= 4
        && inner.every(([, entry]) => entry === null || typeof entry !== 'object')
      if (flat) return `${key} ${inner.map(([name, entry]) => `${name} ${entry}`).join(' ')}`
    }
    return `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`
  }).join(' · ')
}

/** A scalar for the parameter table; anything structured is left to the tree below. */
function scalar(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
}
</script>

<template>
  <div class="config-panel">
    <p class="source">
      {{ model.config_snapshot }}
      <span class="config-id" :title="model.config_id">{{ model.config_id.slice(0, 8) }}…</span>
    </p>

    <!-- Presence only. Which blocks a scenario carries is readable here; what an override RESOLVES
         to is the backend's cascade, and computing it would be a second implementation of a rule
         we do not own — one of whose three layers is not even in this document. -->
    <p v-if="overrides.length" class="notice moved">
      <span class="mark">⚠</span>
      {{ overrides.length }} {{ t('of') }} {{ scenarios }}
      {{ t('scenarios carry their own configuration — the block below is the base they start from, not what those scenarios ran with') }}
    </p>
    <ul v-if="overrides.length" class="override-list">
      <li v-for="entry in overrides" :key="entry.name">
        <span class="scenario">{{ entry.name }}</span>
        <span class="keys">{{ entry.keys.join(' · ') }}</span>
      </li>
    </ul>

    <!-- two columns where the panel is wide enough for them, one where it is not. auto-fit
         rather than a media query, because a panel's width is the user's arrangement and not
         the viewport's -->
    <div v-if="strategy" class="strategy">
      <section>
        <h3 class="section">{{ t('Decision logic') }}</h3>
        <p class="logic-type">{{ strategy.decision_logic_type || t('not declared') }}</p>
        <dl v-if="parameters.length" class="params">
          <div v-for="[key, value] in parameters" :key="key" class="param">
            <dt>{{ key }}</dt>
            <dd>{{ scalar(value) }}</dd>
          </div>
        </dl>
      </section>

      <section>
      <h3 class="section">{{ t('Workers') }}</h3>
      <div v-if="workers.length" class="table-scroll">
        <table class="kpi-table">
          <thead>
            <tr>
              <th>{{ t('Instance') }}</th>
              <th>{{ t('Type') }}</th>
              <th>{{ t('Parameters') }}</th>
            </tr>
          </thead>
          <tbody>
            <!-- the two maps joined: one says what an instance IS, the other how it was tuned, and
                 a reader shown them apart has to do the join by hand -->
            <tr v-for="worker in workers" :key="worker.instance">
              <td class="text-cell">{{ worker.instance }}</td>
              <td class="text-cell">{{ worker.type || '—' }}</td>
              <td class="text-cell">{{ inline(worker.parameters) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="hint">{{ t('This strategy declares no workers') }}</p>
      </section>
    </div>
    <p v-else class="hint">
      {{ t('No strategy block in this configuration — everything it holds is in the tree below') }}
    </p>

    <!-- the floor: whatever is not named above is still reachable, including a key added tomorrow -->
    <h3 class="section">{{ t('Everything in the configuration') }}</h3>
    <JsonTree :value="model.config" :open-to="0" />
  </div>
</template>

<style scoped>
.source {
  margin: 0 0 var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.config-id {
  margin-left: var(--space-sm);
  color: var(--color-text-secondary);
}

.section {
  margin: var(--space-md) 0 var(--space-xs);
  font-size: var(--font-size-sm);
  font-weight: normal;
  color: var(--color-text-secondary);
  text-transform: uppercase;
}

.logic-type {
  margin: 0 0 var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.strategy {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(26rem, 1fr));
  gap: 0 var(--space-xl);
  align-items: start;
}

/* the parameters fill the width they are given rather than stacking down one edge: ten of them in
   a single column left nine tenths of the panel empty */
.params {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0 var(--space-lg);
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.param {
  display: flex;
  justify-content: space-between;
  gap: var(--space-md);
}

.param dt { color: var(--color-text-secondary); }
.param dd { margin: 0; color: var(--color-text-primary); }

.notice {
  margin: 0 0 var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-text-secondary);
  border-radius: 4px;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.notice.moved {
  border-left-color: var(--color-warning);
  color: var(--color-warning);
}

.mark { margin-right: var(--space-xs); }

.override-list {
  margin: 0 0 var(--space-sm);
  padding-left: var(--space-lg);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.scenario { color: var(--color-text-primary); margin-right: var(--space-sm); }
.keys { color: var(--color-warning); }

.table-scroll { overflow-x: auto; }

.kpi-table {
  border-collapse: collapse;
  width: 100%;
}

.kpi-table th,
.kpi-table td {
  text-align: left;
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--color-border);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.kpi-table th {
  color: var(--color-text-secondary);
  font-weight: normal;
}

.hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
