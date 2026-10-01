<script setup lang="ts">
import { computed } from 'vue'
import JsonTree from '@/components/base/JsonTree.vue'
import PathLabel from '@/components/base/PathLabel.vue'
import RecordList from '@/components/base/RecordList.vue'
import { scenarioCount, scenarioOverrides, strategyOf, workersOf } from '@/components/runs/config_shape'
import type { ListColumn } from '@/types/list_types'
import type { RunConfigReport } from '@/types/api/report_types'
import { plural, t } from '@/translate'

const props = defineProps<{
  model: RunConfigReport
}>()

const strategy = computed(() => strategyOf(props.model.config))
const workers = computed(() => (strategy.value ? workersOf(strategy.value) : []))
const parameters = computed(() => Object.entries(strategy.value?.decision_logic_config ?? {}))
/**
 * Three columns, and no ranks: measured over the stored configurations a worker is 8–14 characters
 * of type and 19–37 of parameters, so all three fit at any width this panel is given. A rank that
 * never engages is a breakpoint that changes nothing.
 *
 * The one value that can outgrow its column is the TYPE — a worker type is a path, and one measured
 * 56 characters. `PathLabel` keeps the whole of it in a title, which is the accepted pattern here
 * for a value longer than the column it sits in.
 */
const workerColumns: ListColumn[] = [
  { label: t('Instance'), width: 'minmax(0, 10fr)' },
  { label: t('Type'), width: 'minmax(0, 16fr)' },
  { label: t('Parameters'), width: 'minmax(0, 20fr)' },
]

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
    <!-- Folded, and a native <details> rather than a custom toggle: the NOTICE above carries the
         finding — that some scenarios ran with something else — and the list is which ones. On a
         run of forty it pushed the configuration itself off the screen. `details` brings the
         keyboard and screen-reader semantics instead of us re-implementing them. -->
    <details v-if="overrides.length" class="overrides">
      <summary class="overrides-summary">
        {{ plural(overrides.length, t('scenario with its own configuration'),
                  t('scenarios with their own configuration')) }}
      </summary>
      <ul class="override-list">
        <li v-for="entry in overrides" :key="entry.name">
          <span class="scenario">{{ entry.name }}</span>
          <span class="keys">{{ entry.keys.join(' · ') }}</span>
        </li>
      </ul>
    </details>

    <!-- two columns where the panel is wide enough for them, one where it is not. auto-fit
         rather than a media query, because a panel's width is the user's arrangement and not
         the viewport's -->
    <div v-if="strategy" class="strategy">
      <section>
        <h3 class="section">{{ t('Decision logic') }}</h3>
        <p class="logic-type">
          <PathLabel v-if="strategy.decision_logic_type" :value="strategy.decision_logic_type" />
          <span v-else>{{ t('not declared') }}</span>
        </p>
        <dl v-if="parameters.length" class="params">
          <div v-for="[key, value] in parameters" :key="key" class="param">
            <dt>{{ key }}</dt>
            <dd>{{ scalar(value) }}</dd>
          </div>
        </dl>
      </section>

      <section class="workers">
      <h3 class="section">{{ t('Workers') }}</h3>
      <!-- the two maps joined: one says what an instance IS, the other how it was tuned, and a
           reader shown them apart has to do the join by hand. Read-only: a configuration is
           reference material, with nothing to choose and nothing to sort by. -->
      <RecordList
        v-if="workers.length"
        class="worker-list"
        :rows="workers"
        :columns="workerColumns"
        :row-key="worker => worker.instance"
        inert
      >
        <template #default="{ row: worker }">
          <span class="instance">{{ worker.instance }}</span>
          <span :title="worker.type">
            <PathLabel v-if="worker.type" :value="worker.type" />
            <template v-else>—</template>
          </span>
          <span class="parameters" :title="inline(worker.parameters)">
            {{ inline(worker.parameters) }}
          </span>
        </template>
      </RecordList>
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

/**
 * The workers take the whole width, however many columns the grid made.
 *
 * Measured 2026-09-29: a worker type is a path — `user_algos/touch_and_turn/…_worker.py`, 56
 * characters — and three monospace columns beside the decision logic left it 140 px. It broke
 * mid-word and the parameters column was pushed off the edge behind a scrollbar.
 */
.workers { grid-column: 1 / -1; }

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

/* the same disclosure the booking-period table uses, so the two read as one idiom */
.overrides {
  margin-bottom: var(--space-sm);
}

.overrides-summary {
  cursor: pointer;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.overrides-summary:hover {
  color: var(--color-text-primary);
}

.override-list {
  margin: var(--space-xs) 0 0;
  padding-left: var(--space-lg);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.scenario { color: var(--color-text-primary); margin-right: var(--space-sm); }
.keys { color: var(--color-warning); }

/* Every cell here is one line, so the rows stay the same height and the columns stay comparable
   down the page — the shared list owns the tracks, the headings and the read-only row. A value
   longer than its column is cut and kept whole in its title, the pattern every other list uses. */
.worker-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* the row's identity reads as the thing it names, not as secondary structure */
.instance { color: var(--color-text-primary); }

.parameters { color: var(--color-text-secondary); }

.hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
