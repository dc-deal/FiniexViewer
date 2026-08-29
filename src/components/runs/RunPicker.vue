<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import AppSelect from '@/components/base/AppSelect.vue'
import { t } from '@/translate'

const runsStore = useRunsStore()
const { groups, names, runsInSelection, selectedGroup, selectedName, selectedRunId, loadingRuns } =
  storeToRefs(runsStore)

// group, name and run_id all ride on the index row, so no level needs a follow-up request
const groupOptions = computed(() =>
  groups.value.map(group => ({ value: group, label: group }))
)

const nameOptions = computed(() =>
  names.value.map(name => ({ value: name, label: name }))
)

const runOptions = computed(() =>
  runsInSelection.value.map(run => ({ value: run.run_id, label: run.run_id }))
)
</script>

<template>
  <div class="run-picker">
    <div class="picker-field">
      <label class="picker-label">{{ t('Group') }}</label>
      <AppSelect
        :model-value="selectedGroup"
        :options="groupOptions"
        :placeholder="groups.length ? t('Select group') : t('No runs available')"
        :disabled="loadingRuns || groups.length === 0"
        @update:model-value="runsStore.setGroup"
      />
    </div>
    <div class="picker-field wide">
      <label class="picker-label">{{ t('Scenario / Profile') }}</label>
      <AppSelect
        :model-value="selectedName"
        :options="nameOptions"
        :placeholder="t('Select scenario')"
        :disabled="selectedGroup === null"
        @update:model-value="runsStore.setName"
      />
    </div>
    <div class="picker-field">
      <label class="picker-label">{{ t('Run') }}</label>
      <AppSelect
        :model-value="selectedRunId"
        :options="runOptions"
        :placeholder="t('Select run')"
        :disabled="selectedName === null"
        @update:model-value="runsStore.selectRun"
      />
    </div>
  </div>
</template>

<style scoped>
.run-picker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: flex-end;
}

.picker-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 12rem;
}

.picker-field.wide {
  min-width: 20rem;
  flex: 1;
}

.picker-label {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
