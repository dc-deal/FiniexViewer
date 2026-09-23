<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { RunInfo } from '@/types/api/report_types'
import { utcInstant } from '@/components/runs/report_format'
import { t } from '@/translate'

const props = defineProps<{
  model: RunInfo
}>()

interface Membership {
  label: string
  id: string
  /** Where the family can be opened, or null where nothing addresses it yet. */
  target: RouteLocationRaw | null
}

/**
 * What the run belongs to, named for what that membership MEANS. `parent_id` carries two kinds of
 * parent — a sweep's children are alternatives that get ranked, a deployment's are consecutive
 * sessions of one bot's life — and `parent_kind` now SAYS which, so nothing here infers it from
 * `group` any more. A deployment id addresses a route, which turns the membership into a way in.
 */
const belongsTo = computed<Membership | null>(() => {
  const parentId = props.model.parent_id
  if (parentId === null) return null
  if (props.model.parent_kind === 'deployment') {
    return {
      label: t('Session of deployment'),
      id: parentId,
      target: { name: 'deployments', query: { deployment: parentId } },
    }
  }
  if (props.model.parent_kind === 'sweep') {
    return { label: t('Combination in sweep'), id: parentId, target: null }
  }
  // a kind we do not know is still a membership — shown without claiming what it means
  return { label: t('Belongs to'), id: parentId, target: null }
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
      <dd class="mono">
        <RouterLink
          v-if="belongsTo.target"
          class="parent-link"
          :to="belongsTo.target"
          :title="t('Open the deployment history')"
        >{{ belongsTo.id }} ↗</RouterLink>
        <template v-else>{{ belongsTo.id }}</template>
      </dd>
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
.parent-link {
  color: var(--color-accent);
  text-decoration: none;
}

.parent-link:hover {
  text-decoration: underline;
}

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
