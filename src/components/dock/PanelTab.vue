<script setup lang="ts">
import { computed } from 'vue'
import type { DockviewPanelApi } from 'dockview-vue'
import AppIcon from '@/components/base/AppIcon.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { panelKind, sectionOfKind } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import type { Figure } from '@/types/figure_types'
import { t } from '@/translate'

/**
 * A panel's tab: the FORM it takes, its title, and one status where the status says something. The
 * icon is a list or a chart rather than the content, so two lists read alike and the title tells
 * them apart. Its card says what the panel is for, and the status in words.
 *
 * Its ✕ HIDES the panel, alike for every panel — the Panels menu shows it again where it stood. A
 * section of the run report opened as a panel also carries ⇲, which puts it back into the column.
 *
 * @param kindId The panel's kind.
 * @param api The panel's own handle in the dock, which also closes it.
 */
const props = defineProps<{ kindId: string, api: DockviewPanelApi }>()

const dock = useDockStore()
const kind = panelKind(props.kindId)
const title = kind?.title ?? props.api.title ?? props.kindId
/** The section this tab's panel shows, where it is one of the run report's. */
const section = sectionOfKind(props.kindId)

/**
 * What the tab adds to its title — the run a bundle shows, so two windows comparing two runs are
 * told apart at a glance. Cut short in the tab where it is long, whole in the card.
 */
const subtitle = computed(() => kind?.subtitle?.() ?? null)

/** Read where the tab is drawn, so a status that follows a store follows it here too. */
const status = computed(() => kind?.status?.() ?? null)

/** The panel stands with nothing of the chosen run to show — said by the title, never by hiding. */
const muted = computed(() => kind?.muted?.() ?? false)

const details = computed<Figure[]>(() => [
  ...(kind ? [{ label: t('Shows'), value: kind.description }] : []),
  ...(status.value ? [{ label: t('Status'), value: status.value.word, tone: status.value.role }] : []),
])
</script>

<template>
  <HoverCard :title="subtitle ? `${title} · ${subtitle}` : title" :details="details">
    <div class="panel-tab" :data-kind="kindId">
      <AppIcon v-if="kind" :name="kind.icon" class="panel-tab-icon" />
      <span class="panel-tab-title" :class="{ muted }">{{ title }}</span>
      <span v-if="subtitle" class="panel-tab-subtitle">· {{ subtitle }}</span>
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
        v-if="section"
        type="button"
        class="panel-tab-button panel-tab-back"
        :title="t('Back into the bundle')"
        :aria-label="t('Back into the bundle')"
        @click.stop="dock.backIntoColumn(section)"
      >
        <AppIcon name="action-back-into-column" />
      </button>
      <button
        type="button"
        class="panel-tab-button panel-tab-close"
        :title="t('Hide — the Panels menu shows it again')"
        :aria-label="t('Hide panel')"
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

.panel-tab-title.muted {
  color: var(--color-text-secondary);
}

/* a run id is 24 characters; the date and the time say which run, the card says the rest */
.panel-tab-subtitle {
  max-width: 19ch;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-tab-status.warning {
  color: var(--color-warning);
}

.panel-tab-status.error {
  color: var(--color-error);
}

.panel-tab-button {
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
.panel-tab-button:hover {
  opacity: 1;
  background-color: var(--color-bg-hover);
  border-color: var(--color-border);
}

.panel-tab-button:active {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

.panel-tab-button:focus-visible {
  opacity: 1;
  outline: 1px solid var(--color-accent);
}
</style>
