<script setup lang="ts">
defineProps<{
  disabled?: boolean
  variant?: 'primary' | 'ghost'
}>()
</script>

<template>
  <button class="app-button" :class="`app-button--${variant ?? 'primary'}`" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.app-button {
  font-family: monospace;
  font-size: var(--font-size-sm);
  padding: var(--space-xs) var(--space-md);
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: opacity 0.15s;
}

.app-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.app-button--primary {
  background-color: var(--color-accent);
  color: var(--color-bg-base);
  border-color: var(--color-accent);
}

.app-button--primary:not(:disabled):hover {
  opacity: 0.85;
}

.app-button--ghost {
  background-color: transparent;
  color: var(--color-text-primary);
  border-color: var(--color-border);
}

.app-button--ghost:not(:disabled):hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
</style>
