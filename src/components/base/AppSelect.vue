<script setup lang="ts">
interface Option {
  value: string
  label: string
}

defineProps<{
  modelValue: string | null
  options: Option[]
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <select
    class="app-select"
    :value="modelValue ?? ''"
    :disabled="disabled"
    @change="onChange"
  >
    <option v-if="placeholder" value="" disabled :selected="modelValue === null">
      {{ placeholder }}
    </option>
    <option v-for="opt in options" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </option>
  </select>
</template>

<style scoped>
.app-select {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: var(--space-xs) var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  width: 100%;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23888' d='M5 7L0 2h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--space-sm) center;
  padding-right: var(--space-lg);
}

.app-select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.app-select:focus {
  border-color: var(--color-accent);
}

option {
  background-color: var(--color-bg-elevated);
}
</style>
