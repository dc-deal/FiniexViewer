<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useLayoutStore } from '@/stores/layout_store'
import { allPanels } from '@/panel_registry'
import { t } from '@/translate'

/**
 * The inventory of sections, and which of them this run HAS.
 *
 * Takes the same `sources` record `PanelColumn` renders from, so the bar and the column can never
 * disagree about what exists: both read one map, keyed by the `source` each descriptor declares.
 */
const props = defineProps<{
  sources: Record<string, unknown>
}>()

const layoutStore = useLayoutStore()
const { visiblePanels } = storeToRefs(layoutStore)

/**
 * The toggles, in the READER's order and not the registry's.
 *
 * The bar and the column have to agree: a reader who drags Broker to the top and then finds its
 * toggle still sixth in the bar has two orders to hold in their head, and the bar is the thing they
 * navigate by. So the arrangement decides — `visiblePanels` is exactly what `PanelColumn` renders,
 * pinned panels lifted and all.
 *
 * A panel that is switched OFF has no place in that arrangement (hiding removes it from the
 * column), so the hidden ones follow in the registry's order. That keeps them in one group at the
 * end, which is also where a reader looks for something they turned off.
 *
 * A new panel still needs no change here: it enters through the registry and the layout store
 * appends it.
 */
const toggles = computed(() => {
  const arranged = visiblePanels.value.map(panel => panel.id)
  const byId = new Map(allPanels().map(panel => [panel.id, panel]))
  const ordered = [
    ...arranged.map(id => byId.get(id)).filter(panel => panel !== undefined),
    ...allPanels().filter(panel => !arranged.includes(panel.id)),
  ]
  const shown = new Set(arranged)
  return ordered.map(panel => {
    const model = props.sources[panel.source]
    return {
      ...panel,
      shown: shown.has(panel.id),
      // the run carries no such section — a state of the RUN, not of the reader's arrangement
      absent: model === null || model === undefined,
    }
  })
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
    <!--
      Absent sections stay LISTED and are disabled rather than hidden. Hiding one raises the
      question where it went — the same argument the scenario roster makes for the scenarios that
      produced nothing. The bar is an inventory, and an inventory that silently shortens is not one.

      This is also why the toggles had to stop wearing muted ink at rest: that is the vocabulary of
      a disabled control, and with an actually-disabled state beside it the two would have been
      indistinguishable.
    -->
    <button
      v-for="panel in toggles"
      :key="panel.id"
      class="bar-toggle"
      :class="{ shown: panel.shown, absent: panel.absent }"
      :disabled="panel.absent"
      :title="panel.absent
        ? `${t(panel.title)} — ${t('this run carries no such section')}`
        : t(panel.title)"
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
  /* ink, not muted — muted is what DISABLED means here, and it is used below for exactly that */
  color: var(--color-text-primary);
  cursor: pointer;
  padding: 2px var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  transition: background-color 80ms ease, border-color 80ms ease;
}

.bar-toggle:hover:not(:disabled),
.bar-action:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-accent);
}

.bar-toggle:active:not(:disabled),
.bar-action:active {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

.bar-toggle:focus-visible,
.bar-action:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* the chosen one of the group wears the interactive colour, the same as a facet chip does */
.bar-toggle.shown {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background-color: var(--color-bg-active);
}

/* the icon recedes on a section the reader has put away — their doing, not the run's */
.bar-toggle:not(.shown):not(.absent) .bar-icon {
  filter: grayscale(1);
  opacity: 0.6;
}

/* and this is the run's doing: the section does not exist, so the control cannot be used */
.bar-toggle.absent {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.bar-toggle.absent .bar-icon {
  filter: grayscale(1);
  opacity: 0.35;
}

.bar-toggle.absent .bar-label {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.bar-spacer {
  flex: 1;
}

@media (prefers-reduced-motion: reduce) {
  .bar-toggle,
  .bar-action {
    transition: none;
  }
}
</style>
