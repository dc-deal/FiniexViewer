<script setup lang="ts">
import { computed } from 'vue'
import type { DockviewPanelApi } from 'dockview-vue'
import AppIcon from '@/components/base/AppIcon.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { panelKind } from '@/panel_kinds'
import type { Figure } from '@/types/figure_types'
import { t } from '@/translate'

/**
 * A panel's tab: the FORM it takes, its title, and one status where the status says something. The
 * icon is a list or a chart rather than the content, so two lists read alike and the title tells
 * them apart. Its card says what the panel is for, and the status in words.
 *
 * @param kindId The panel's kind.
 * @param api The panel's own handle in the dock, which also closes it.
 */
const props = defineProps<{ kindId: string, api: DockviewPanelApi }>()

const kind = panelKind(props.kindId)
const title = kind?.title ?? props.api.title ?? props.kindId

/** Read where the tab is drawn, so a status that follows a store follows it here too. */
const status = computed(() => kind?.status?.() ?? null)

const details = computed<Figure[]>(() => [
  ...(kind ? [{ label: t('Shows'), value: kind.description }] : []),
  ...(status.value ? [{ label: t('Status'), value: status.value.word, tone: status.value.role }] : []),
])
</script>

<template>
  <HoverCard :title="title" :details="details">
    <div class="panel-tab">
      <AppIcon v-if="kind" :name="kind.icon" class="panel-tab-icon" />
      <span class="panel-tab-title">{{ title }}</span>
      <!-- the mark never travels alone: its word is read out with it and written in the card -->
      <span
        v-if="status"
        class="panel-tab-status"
        :class="status.role"
        role="img"
        :aria-label="status.word"
        :data-status="status.word"
      >
        <AppIcon :name="status.icon" />
      </span>
      <button
        type="button"
        class="panel-tab-close"
        :title="t('Close panel')"
        :aria-label="t('Close panel')"
        @click.stop="api.close()"
      >
        <AppIcon name="action-close" />
      </button>
    </div>
  </HoverCard>
</template>

<style scoped>
.panel-tab {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  height: 100%;
  padding: 0 var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.panel-tab-status {
  display: inline-flex;
  align-items: center;
}

.panel-tab-status.warning {
  color: var(--color-warning);
}

.panel-tab-status.error {
  color: var(--color-error);
}

.panel-tab-close {
  display: inline-flex;
  align-items: center;
  padding: 1px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
}

/* the same two channels every control here has: the surface AND the border, then the press */
.panel-tab-close:hover {
  opacity: 1;
  background-color: var(--color-bg-hover);
  border-color: var(--color-border);
}

.panel-tab-close:active {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

.panel-tab-close:focus-visible {
  opacity: 1;
  outline: 1px solid var(--color-accent);
}
</style>
