<script setup lang="ts">
interface Option {
  value: string
  label: string
  /** Shown but not selectable — an entry that exists and has nothing behind it. */
  disabled?: boolean
}

defineProps<{
  modelValue: string | null
  options: Option[]
  placeholder?: string
  disabled?: boolean
  /** The quick bar's form: as wide as its value, in the link ink, framed only under the pointer. */
  compact?: boolean
  /** Its name for a screen reader where no visible label stands beside it. */
  label?: string
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
    :class="{ compact }"
    :aria-label="label"
    :value="modelValue ?? ''"
    :disabled="disabled"
    @change="onChange"
  >
    <option v-if="placeholder" value="" disabled :selected="modelValue === null">
      {{ placeholder }}
    </option>
    <option v-for="opt in options" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
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
  color: var(--color-text-primary);
}

/* A control in the link ink, like the menu bar's: its value is what it shows, and the arrow and
   the frame under the pointer say that it opens — two channels, never the hue alone. */
.app-select.compact {
  width: auto;
  background-color: transparent;
  border-color: transparent;
  color: var(--color-accent);
  padding: 1px var(--space-lg) 1px var(--space-xs);
}

.app-select.compact:hover:not(:disabled) {
  background-color: var(--color-bg-hover);
  border-color: var(--color-border);
}

.app-select.compact:focus-visible {
  border-color: var(--color-accent);
}
</style>
