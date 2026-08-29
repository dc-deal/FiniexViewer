<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useLayoutStore } from '@/stores/layout_store'
import { allPanels } from '@/panel_registry'
import { t } from '@/translate'

const layoutStore = useLayoutStore()
const { visiblePanels } = storeToRefs(layoutStore)

// The bar renders from the registry, so a new panel gets its toggle without touching this file.
const toggles = computed(() => {
  const shown = new Set(visiblePanels.value.map(panel => panel.id))
  return allPanels().map(panel => ({ ...panel, shown: shown.has(panel.id) }))
})

function toggle(id: string, shown: boolean): void {
  if (shown) {
    layoutStore.hide(id)
    return
  }
  layoutStore.show(id)
}
</script>

<template>
  <div class="app-bar">
    <button
      v-for="panel in toggles"
      :key="panel.id"
      class="bar-toggle"
      :class="{ shown: panel.shown }"
      :title="t(panel.title)"
      @click="toggle(panel.id, panel.shown)"
    >
      <span class="bar-icon">{{ panel.icon }}</span>
      <span class="bar-label">{{ t(panel.title) }}</span>
    </button>
    <div class="bar-spacer" />
    <button class="bar-action" @click="layoutStore.collapseAll()">{{ t('Collapse all') }}</button>
    <button class="bar-action" @click="layoutStore.reset()">{{ t('Reset layout') }}</button>
  </div>
</template>

<style scoped>
.app-bar {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
  padding: var(--space-xs) 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.bar-toggle,
.bar-action {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 2px var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.bar-toggle.shown {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
}

.bar-toggle:not(.shown) .bar-icon {
  filter: grayscale(1);
  opacity: 0.5;
}

.bar-spacer {
  flex: 1;
}
</style>
