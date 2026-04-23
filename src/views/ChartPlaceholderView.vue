<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSelectionStore } from '@/stores/selection_store'

const { isReady, selectedLabel } = storeToRefs(useSelectionStore())
</script>

<template>
  <div class="placeholder">
    <span v-if="isReady" class="selection">{{ selectedLabel }}</span>
    <span v-else class="hint">Select broker, symbol and timeframe to continue</span>
  </div>
</template>

<style scoped>
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-family: monospace;
}

.selection {
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
}

.hint {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}
</style>
