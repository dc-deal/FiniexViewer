<script setup lang="ts">
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui'
import { t } from '@/translate'

defineProps<{
  title: string
  icon: string
  open: boolean
  pinned: boolean
  locked: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'toggle-pin': []
  'toggle-lock': []
  hide: []
}>()
</script>

<template>
  <CollapsibleRoot
    class="panel"
    :open="open"
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <div class="panel-header">
      <CollapsibleTrigger class="panel-trigger">
        <span class="panel-chevron" :class="{ expanded: open }">▸</span>
        <span class="panel-icon">{{ icon }}</span>
        <span class="panel-title">{{ t(title) }}</span>
      </CollapsibleTrigger>
      <!-- controls appear on hover, and on focus so they stay keyboard-reachable -->
      <div class="panel-controls">
        <button
          class="panel-control"
          :class="{ active: pinned }"
          :title="t('Pin to top')"
          @click="emit('toggle-pin')"
        >📌</button>
        <button
          class="panel-control"
          :class="{ active: locked }"
          :title="t('Keep open')"
          @click="emit('toggle-lock')"
        >🔒</button>
        <button class="panel-control" :title="t('Hide panel')" @click="emit('hide')">✕</button>
      </div>
    </div>
    <CollapsibleContent class="panel-content">
      <slot />
    </CollapsibleContent>
  </CollapsibleRoot>
</template>

<style scoped>
.panel {
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-bg-surface);
  margin-bottom: var(--space-sm);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
}

.panel-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  text-align: left;
}

.panel-chevron {
  color: var(--color-text-secondary);
  transition: transform 0.12s ease;
  display: inline-block;
}

.panel-chevron.expanded {
  transform: rotate(90deg);
}

.panel-title {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
}

.panel-controls {
  display: flex;
  gap: var(--space-xs);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.panel-header:hover .panel-controls,
.panel-controls:focus-within {
  opacity: 1;
}

.panel-control {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  font-size: var(--font-size-sm);
  filter: grayscale(1);
  opacity: 0.6;
}

.panel-control:hover,
.panel-control.active {
  filter: none;
  opacity: 1;
}

.panel-content {
  padding: 0 var(--space-sm) var(--space-sm);
  overflow-x: auto;
}
</style>
