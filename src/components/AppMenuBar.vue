<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from 'reka-ui'
import AccountStatus from '@/components/AccountStatus.vue'
import MachineStatus from '@/components/MachineStatus.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import TopMenu from '@/components/TopMenu.vue'
import { useSectionStates, type SectionState } from '@/composables/use_section_states'
import { PANEL_KINDS } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import type { PanelKind } from '@/types/panel_types'
import { t } from '@/translate'

/**
 * The frame above the dock: the name, the way to every panel the reader works in, whose access the
 * viewer works under, and the application menu. Frame rather than panel — it is never closed or
 * moved. The way back to the suggested order sits in the settings, beside everything else about
 * arrangement.
 *
 * **The Panels menu shows and hides every panel, the same way** (viewer#31, 2026-10-14): a tick is
 * a panel on show, a click hides it or shows it again where it last stood. The run report's
 * sections stand in the submenu of the Runs panel that holds their column, each with where it is —
 * in the column, open as a panel of its own (⇱), hidden, or struck where the chosen run has none.
 * It replaces the section bar that stood above the column.
 */
const dock = useDockStore()
const { openIds } = storeToRefs(dock)
const layoutStore = useLayoutStore()
const sectionStates = useSectionStates()

/** The kind whose submenu holds the run report's sections — the panel their column stands in. */
const COLUMN_KIND = 'runs'

/** In the suggested order, so the menu reads the way the first arrangement does. */
const kinds = [...PANEL_KINDS].sort((a, b) => a.order - b.order)
const columnKind = computed(() => kinds.find(kind => kind.id === COLUMN_KIND) ?? null)

function isOpen(kind: PanelKind): boolean {
  return openIds.value.includes(kind.id)
}

function toggleKind(kind: PanelKind): void {
  if (isOpen(kind)) dock.close(kind.id)
  else dock.open(kind.id)
}

/** On show: in the column or open as a panel — but not in the column of a run that lacks it. */
function sectionShown(state: SectionState): boolean {
  return state.place === 'panel' || (state.place === 'column' && !state.absent)
}

function toggleSection(state: SectionState): void {
  if (state.place === 'hidden') dock.showSection(state.section.id)
  else dock.hideSection(state.section.id)
}

function sectionTitle(state: SectionState): string {
  if (state.place === 'panel') return `${t(state.section.title)} — ${t('open as a panel of its own')}`
  if (state.absent) return `${t(state.section.title)} — ${t('this run carries no such section')}`
  return t(state.section.title)
}

/** Keeps the menu open, so several panels can be shown or hidden in one visit. */
function stayOpen(event: Event): void {
  event.preventDefault()
}
</script>

<template>
  <header class="menu-bar">
    <span class="menu-bar-title">FiniexViewer</span>

    <DropdownMenuRoot>
      <DropdownMenuTrigger class="menu-bar-trigger">{{ t('Panels') }} ▾</DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="menu-content" :side-offset="4" align="start">
          <template v-for="kind in kinds" :key="kind.id">
            <DropdownMenuSub v-if="kind.id === columnKind?.id">
              <DropdownMenuSubTrigger class="menu-item menu-sub-trigger" :data-area="kind.id">
                <span class="menu-check" aria-hidden="true" />
                <AppIcon :name="kind.icon" />
                <span class="menu-label">{{ kind.title }}</span>
                <span class="menu-sub-arrow" aria-hidden="true">▸</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent class="menu-content" :side-offset="2">
                  <DropdownMenuCheckboxItem
                    class="menu-item menu-toggle"
                    :data-kind="kind.id"
                    :model-value="isOpen(kind)"
                    @update:model-value="toggleKind(kind)"
                    @select="stayOpen"
                  >
                    <span class="menu-check" aria-hidden="true">{{ isOpen(kind) ? '✓' : '' }}</span>
                    <AppIcon :name="kind.icon" />
                    <span class="menu-label">{{ kind.title }}</span>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator class="menu-separator" />
                  <DropdownMenuCheckboxItem
                    v-for="state in sectionStates"
                    :key="state.section.id"
                    class="menu-item menu-toggle"
                    :class="{ absent: state.absent && state.place !== 'panel' }"
                    :data-section="state.section.id"
                    :data-place="state.place"
                    :title="sectionTitle(state)"
                    :model-value="sectionShown(state)"
                    :disabled="state.absent && state.place !== 'panel'"
                    @update:model-value="toggleSection(state)"
                    @select="stayOpen"
                  >
                    <span class="menu-check" aria-hidden="true">{{ sectionShown(state) ? '✓' : '' }}</span>
                    <AppIcon :name="state.section.icon" />
                    <span class="menu-label">{{ t(state.section.title) }}</span>
                    <AppIcon v-if="state.place === 'panel'" name="action-open-panel" class="menu-opened" />
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator class="menu-separator" />
                  <DropdownMenuItem class="menu-item" data-action="collapse-all" @select="layoutStore.collapseAll()">
                    <span class="menu-check" aria-hidden="true" />
                    {{ t('Collapse all') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem class="menu-item" data-action="reset-column" @select="layoutStore.reset()">
                    <span class="menu-check" aria-hidden="true" />
                    {{ t('Reset column') }}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuCheckboxItem
              v-else
              class="menu-item menu-toggle"
              :data-kind="kind.id"
              :model-value="isOpen(kind)"
              @update:model-value="toggleKind(kind)"
              @select="stayOpen"
            >
              <span class="menu-check" aria-hidden="true">{{ isOpen(kind) ? '✓' : '' }}</span>
              <AppIcon :name="kind.icon" />
              <span class="menu-label">{{ kind.title }}</span>
            </DropdownMenuCheckboxItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <div class="menu-bar-spacer" />
    <MachineStatus />
    <AccountStatus />
    <TopMenu />
  </header>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 0 var(--space-lg);
  height: 2.5rem;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* the panels' own size: the frame names the app, it does not outrank what the panels show */
.menu-bar-title {
  font-family: monospace;
  font-weight: bold;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.menu-bar-spacer {
  flex: 1;
}

/* a control in the link ink, with the two-channel states every control here carries */
.menu-bar-trigger {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-accent);
  cursor: pointer;
}

.menu-bar-trigger:hover,
.menu-bar-trigger[data-state='open'] {
  background-color: var(--color-bg-hover);
  border-color: var(--color-border);
}

.menu-bar-trigger:active {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

.menu-bar-trigger:focus-visible {
  outline: 1px solid var(--color-accent);
}

/* every entry in one grid of columns — tick, icon, word — whether or not the tick is drawn */
.menu-toggle,
.menu-sub-trigger,
.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.menu-check {
  display: inline-block;
  width: 1em;
  flex-shrink: 0;
  color: var(--color-accent);
}

.menu-label {
  flex: 1;
}

.menu-sub-arrow {
  margin-left: var(--space-md);
  color: var(--color-text-secondary);
}

.menu-sub-trigger[data-state='open'] {
  background-color: var(--color-bg-hover);
}

/* open as a panel of its own — the mark beside the word, in the entry's own ink */
.menu-opened {
  margin-left: var(--space-sm);
}

/* the run's doing: the section does not exist, so the entry cannot be switched */
.menu-toggle.absent .menu-label {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}
</style>
