<script setup lang="ts">
import { onErrorCaptured, ref, watch } from 'vue'
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui'
import { t } from '@/translate'

const props = defineProps<{
  title: string
  icon: string
  open: boolean
  pinned: boolean
  locked: boolean
  /**
   * Whatever the panel is currently showing. Only its IDENTITY is used: when it changes, a panel
   * that failed is given another go, so a defect on one run does not follow the reader to the next.
   */
  resetOn?: unknown
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'toggle-pin': []
  'toggle-lock': []
  hide: []
}>()

/**
 * The boundary, and it exists because its absence emptied the whole workspace.
 *
 * Measured 2026-10-01: one field the backend serves as null on 17 of 45 runs was read as an array
 * inside a computed. That throw killed the render effect — and Vue unwinds to the nearest component
 * that handles it, so with nothing handling it the reader lost ELEVEN panels because one of them
 * could not draw. A section that cannot be drawn is a finding about that section, never a reason to
 * take the other ten away.
 *
 * `false` stops the error here. The stack goes to the console for whoever is debugging; the reader
 * gets a sentence, because a stack trace on screen is not an explanation (§10).
 */
const failed = ref(false)

onErrorCaptured((error) => {
  failed.value = true
  console.error(`[panel] ${props.title} could not be rendered`, error)
  return false
})

watch(() => props.resetOn, () => {
  failed.value = false
})
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
        <span v-if="failed" class="panel-failed-mark" :title="t('This section could not be drawn')">⚠</span>
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
      <!-- the slot is not rendered again after it threw: the same input produces the same throw,
           and a panel that re-enters its own failure loops -->
      <p v-if="failed" class="panel-failed">
        <span class="mark" aria-hidden="true">⚠</span>
        <span>{{ t('This section could not be drawn. The rest of the report is unaffected.') }}</span>
      </p>
      <slot v-else />
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

/* the mark rides on the TRIGGER so a folded panel still says it failed — the sentence inside is
   out of sight there, and a reader must not have to open a panel to learn it is broken */
.panel-failed-mark {
  color: var(--color-error);
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

.panel-failed {
  display: flex;
  gap: var(--space-sm);
  align-items: baseline;
  color: var(--color-error);
  font-family: monospace;
  font-size: var(--font-size-sm);
  margin: 0;
}
</style>
