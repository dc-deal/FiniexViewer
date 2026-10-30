<script setup lang="ts">
import { computed, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from 'reka-ui'
import AccountStatus from '@/components/AccountStatus.vue'
import ContractStatus from '@/components/ContractStatus.vue'
import MachineStatus from '@/components/MachineStatus.vue'
import NarrowingStatement from '@/components/NarrowingStatement.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import HintLine from '@/components/base/HintLine.vue'
import TopMenu from '@/components/TopMenu.vue'
import { useSectionStates, type SectionState } from '@/composables/use_section_states'
import { PANEL_KINDS } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { BUNDLE_IDS } from '@/types/panel_types'
import type { BundleId, PanelKind } from '@/types/panel_types'
import { t } from '@/translate'

/**
 * The frame above the dock: the name, the way to every panel the reader works in, whose access the
 * viewer works under, and the application menu. Frame rather than panel — it is never closed or
 * moved. The way back to the suggested order sits in the settings, beside everything else about
 * arrangement.
 *
 * **The Panels menu shows and hides every panel, the same way** (viewer#31, 2026-10-14): a tick is
 * a panel on show, a click hides it or shows it again where it last stood. Kinds that share an
 * AREA stand together in its submenu — the run list and the run report under Runs, with the
 * report's sections after them, each with where it is: in the column, open as a panel of its own
 * (⇱), hidden, or struck where the chosen run has none. It replaces the section bar that stood
 * above the column. What the run bundle offers about itself — folding its sections, resetting
 * them — is on the bundle's tab, behind ⋯ (viewer#42), so this menu does nothing but show and hide.
 */
const dock = useDockStore()
const { openIds } = storeToRefs(dock)
/** Every bundle's members, where each stands — what its area's submenu lists after its kinds. */
const memberStates = Object.fromEntries(BUNDLE_IDS.map(bundle => [bundle, useSectionStates(bundle)])) as
  Record<BundleId, ComputedRef<SectionState[]>>

/**
 * The areas whose submenu also lists a bundle's members — read off the register, where a bundle's kind
 * names its area, so a new bundle brings its members here with no list to remember.
 */
const AREA_BUNDLES = Object.fromEntries(PANEL_KINDS.flatMap(kind =>
  kind.area && (BUNDLE_IDS as readonly string[]).includes(kind.id) ? [[kind.area, kind.id]] : [])) as Record<string, BundleId>

/** The members an area's submenu lists — its bundle's, where it has one. */
function membersOf(area: string): { bundle: BundleId, states: SectionState[] } | null {
  const bundle = AREA_BUNDLES[area]
  return bundle ? { bundle, states: memberStates[bundle].value } : null
}

/** A kind of its own at the menu's top, or an area: a submenu of the kinds that share it. */
type MenuEntry =
  | { type: 'kind', kind: PanelKind }
  | { type: 'area', id: string, title: string, icon: PanelKind['icon'], kinds: PanelKind[] }

/**
 * In the suggested order, so the menu reads the way the first arrangement does. An area stands
 * where its first kind does, and takes that kind's title and form for its own.
 */
const entries = computed<MenuEntry[]>(() => {
  const kinds = [...PANEL_KINDS].sort((a, b) => a.order - b.order)
  const result: MenuEntry[] = []
  for (const kind of kinds) {
    if (!kind.area) {
      result.push({ type: 'kind', kind })
      continue
    }
    const area = result.find((entry): entry is Extract<MenuEntry, { type: 'area' }> =>
      entry.type === 'area' && entry.id === kind.area)
    if (area) area.kinds.push(kind)
    else result.push({ type: 'area', id: kind.area, title: kind.title, icon: kind.icon, kinds: [kind] })
  }
  return result
})

function isOpen(kind: PanelKind): boolean {
  return openIds.value.includes(kind.id)
}

function toggleKind(kind: PanelKind): void {
  if (isOpen(kind)) dock.close(kind.id)
  else dock.reveal(kind.id, 'command')
}

/**
 * Where a section stands, as the reader meets it: `closed` is in the column of a bundle that is shut.
 * It is not hidden, and it is on show nowhere (operator, on screen 2026-10-30: a tick on such a row
 * read as shown, and the section could not be found).
 */
function whereOf(state: SectionState, bundle: BundleId): 'panel' | 'column' | 'closed' | 'hidden' {
  return state.place === 'column' && !openIds.value.includes(bundle) ? 'closed' : state.place
}

/** On show: in the column of an open bundle or as a panel — but not in the column of a run that lacks it. */
function sectionShown(state: SectionState, bundle: BundleId): boolean {
  const where = whereOf(state, bundle)
  return where === 'panel' || (where === 'column' && !state.absent)
}

/** A click brings what is not on show to the screen: a section in a closed bundle opens at once. */
function toggleSection(state: SectionState, bundle: BundleId): void {
  const where = whereOf(state, bundle)
  if (where === 'hidden' || where === 'closed') dock.showSection(state.section.id, bundle)
  else dock.hideSection(state.section.id, bundle)
}

/** The words at the end of a row: where the section stands, or that the run has none. */
function placeWord(state: SectionState, bundle: BundleId): string {
  const where = whereOf(state, bundle)
  if (where === 'panel') return t('panel')
  if (state.absent) return bundle === 'deployment' ? t('not in this deployment') : t('not in this run')
  if (where === 'column') return t('in bundle')
  return where === 'closed' ? t('in closed bundle') : ''
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
          <template v-for="entry in entries" :key="entry.type === 'kind' ? entry.kind.id : entry.id">
            <DropdownMenuSub v-if="entry.type === 'area'">
              <DropdownMenuSubTrigger class="menu-item menu-sub-trigger" :data-area="entry.id">
                <span class="menu-check" aria-hidden="true" />
                <AppIcon :name="entry.icon" />
                <span class="menu-label">{{ entry.title }}</span>
                <span class="menu-sub-arrow" aria-hidden="true">▸</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent class="menu-content" :side-offset="2">
                  <DropdownMenuCheckboxItem
                    v-for="kind in entry.kinds"
                    :key="kind.id"
                    class="menu-item menu-toggle"
                    :data-kind="kind.id"
                    :model-value="isOpen(kind)"
                    @update:model-value="toggleKind(kind)"
                    @select="stayOpen"
                  >
                    <span class="menu-check" aria-hidden="true">{{ isOpen(kind) ? '✓' : '' }}</span>
                    <AppIcon :name="kind.icon" />
                    <span class="menu-label">{{ kind.menuTitle ?? kind.title }}</span>
                  </DropdownMenuCheckboxItem>
                  <template v-if="membersOf(entry.id)">
                    <DropdownMenuSeparator class="menu-separator" />
                    <DropdownMenuCheckboxItem
                      v-for="state in membersOf(entry.id)!.states"
                      :key="state.section.id"
                      class="menu-item menu-toggle"
                      :class="{ absent: state.absent && state.place !== 'panel' }"
                      :data-section="state.section.id"
                      :data-place="whereOf(state, membersOf(entry.id)!.bundle)"
                      :model-value="sectionShown(state, membersOf(entry.id)!.bundle)"
                      :disabled="state.absent && state.place !== 'panel'"
                      @update:model-value="toggleSection(state, membersOf(entry.id)!.bundle)"
                      @select="stayOpen"
                    >
                      <span class="menu-check" aria-hidden="true">{{ sectionShown(state, membersOf(entry.id)!.bundle) ? '✓' : '' }}</span>
                      <AppIcon :name="state.section.icon" />
                      <span class="menu-label">{{ t(state.section.title) }}</span>
                      <span class="menu-place">
                        {{ placeWord(state, membersOf(entry.id)!.bundle) }}
                        <AppIcon v-if="state.place === 'panel'" name="action-open-panel" />
                      </span>
                    </DropdownMenuCheckboxItem>
                    <HintLine id="bundle-places" class="menu-hint" />
                  </template>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuCheckboxItem
              v-else
              class="menu-item menu-toggle"
              :data-kind="entry.kind.id"
              :model-value="isOpen(entry.kind)"
              @update:model-value="toggleKind(entry.kind)"
              @select="stayOpen"
            >
              <span class="menu-check" aria-hidden="true">{{ isOpen(entry.kind) ? '✓' : '' }}</span>
              <AppIcon :name="entry.kind.icon" />
              <span class="menu-label">{{ entry.kind.menuTitle ?? entry.kind.title }}</span>
            </DropdownMenuCheckboxItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <!-- the scenario in focus, said once for every panel it narrows; it gives way before anything
         beside it moves -->
    <NarrowingStatement class="menu-bar-narrowing" />
    <div class="menu-bar-spacer" />
    <ContractStatus />
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

/* the statement shortens its name and nothing more: its least width is the grid's own — the mark
   and the button whole, the name's track down to nothing. `min-width: 0` let it shrink past them */
.menu-bar-narrowing {
  flex: 0 1 auto;
}

/* a control in the link ink, with the two-channel states every control here carries. It never
   gives way: it shared the bar's shortfall with the narrowing and wrapped its ▾ onto a second line */
.menu-bar-trigger {
  flex-shrink: 0;
  white-space: nowrap;
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

/* the entries' grid — tick, icon, word — is every menu's, beside `.menu-item` in TopMenu.vue */

/* where the section stands, in words at the end of its row: a mark alone said nothing of the rest */
.menu-place {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin-left: var(--space-md);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

/* as wide as the rows it explains, never wider: a line of its length would stretch the whole menu */
.menu-hint {
  width: 0;
  min-width: 100%;
  margin-top: var(--space-xs);
}

/* the run's doing: the section does not exist, so the entry cannot be switched */
.menu-toggle.absent .menu-label {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}
</style>
