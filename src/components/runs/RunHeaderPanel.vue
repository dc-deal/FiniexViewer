<script setup lang="ts">
import { computed } from 'vue'
import type { RunInfo } from '@/types/api/report_types'
import { utcInstant } from '@/components/runs/report_format'
import { t } from '@/translate'

const props = defineProps<{
  model: RunInfo
}>()

/**
 * What the run belongs to, named for what that membership MEANS. `parent_id` carries two kinds of
 * parent and `group` says which: a sweep's children are alternatives that get ranked, a live
 * session's are consecutive sealed slices of one run. Calling both "parent" on screen would
 * flatten the difference that decides how the siblings should be ordered.
 */
const belongsTo = computed(() => {
  if (props.model.parent_id === null) return null
  const label = props.model.group === 'live'
    ? t('Fragment of session')
    : t('Combination in sweep')
  return { label, id: props.model.parent_id }
})
</script>

<template>
  <dl class="meta">
    <dt>{{ t('Run') }}</dt>
    <dd class="mono">{{ model.run_id }}</dd>

    <dt>{{ t('Started') }}</dt>
    <dd class="mono">{{ utcInstant(model.start_time) }}</dd>

    <dt>{{ t('Category') }}</dt>
    <dd>{{ model.group }}</dd>

    <dt>{{ t('Name') }}</dt>
    <dd>{{ model.name }}</dd>

    <template v-if="belongsTo">
      <dt>{{ belongsTo.label }}</dt>
      <dd class="mono">{{ belongsTo.id }}</dd>
    </template>

    <dt>{{ t('Build') }}</dt>
    <dd class="mono">{{ model.app_version }} · {{ model.git_commit }}</dd>

    <template v-if="model.config_snapshot">
      <dt>{{ t('Config') }}</dt>
      <dd class="mono">{{ model.config_snapshot }}</dd>
    </template>
  </dl>
</template>

<style scoped>
.meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-xs) var(--space-md);
  margin: 0;
}

.meta dt {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.mono {
  font-family: monospace;
}
</style>
