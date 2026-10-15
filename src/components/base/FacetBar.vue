<script setup lang="ts" generic="T">
import { computed, nextTick, ref } from 'vue'
import {
  DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuRoot, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
  PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger,
} from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import OverflowRow from '@/components/base/OverflowRow.vue'
import { applyFacets, facetOptions, isNarrowed, toggleValue } from '@/components/base/facet_filter'
import type { FacetDefinition, FacetOption, FacetSelection, SortDefinition } from '@/types/facet_types'
import { t } from '@/translate'

/**
 * One bar that narrows and orders any list: a search over one field, a facet per enumerable field,
 * and a sort. It owns no state — the caller holds the selection and applies the same pure functions
 * to its rows, so the bar and the list can never disagree about what is being shown.
 *
 * ONE line wherever it fits (viewer#31, 2026-10-14): in a narrow panel the bar took three and four
 * rows before a single row of the list showed. The search folds into ⌕, the facets that do not fit
 * wait behind `+N ▾` — each there as a submenu with its values and counts — and the sort is a menu.
 * At the narrowest the right-hand group (clear, the count, the sort) takes a second line.
 */
const props = defineProps<{
  rows: T[]
  facets: FacetDefinition<T>[]
  sorts: SortDefinition<T>[]
  selection: FacetSelection
  sort: string
  search?: string
  /** What the search box looks at. Without it the box is not drawn. */
  searchOf?: (row: T) => string
  searchPlaceholder?: string
}>()

const emit = defineEmits<{
  'update:selection': [FacetSelection]
  'update:sort': [string]
  'update:search': [string]
}>()

interface DrawnFacet {
  facet: FacetDefinition<T>
  options: FacetOption[]
  narrows: boolean
}

const input = computed(() => ({
  rows: props.rows,
  definitions: props.facets,
  selection: props.selection,
  search: props.search ?? '',
  searchOf: props.searchOf,
}))

const shownCount = computed(() => applyFacets(input.value).length)

/**
 * Every facet, always — and DISABLED where it cannot narrow anything.
 *
 * A facet that cannot narrow is still a control that does nothing: no options at all is an empty
 * dropdown, and ONE value that every row already carries changes nothing when picked. Measured
 * 2026-09-28 over the 40 runs then on this machine, `reporting` read `expected` on all forty and
 * `app_version` read `1.4.0` on all forty.
 *
 * **But dropping it was worse than showing it dead, and the reason is the SELECTION.** Whether a
 * facet can narrow depends on what is already picked, so the set of drawn chips changed on every
 * click: picking `clean` left 25 rows that disagree about `reporting` and `app_version`, so two
 * chips appeared IN THE MIDDLE of the bar and pushed the open dropdown out from under the pointer.
 * Measured on screen 2026-10-08 — the operator clicked a value and the menu they were reading
 * moved.
 *
 * So the bar keeps its shape and the dead facet wears the disabled look, which is the same decision
 * the Panels menu makes for a section this run does not have: *an inventory that silently shortens
 * is not one*.
 *
 * The count matters, and it is why this is not simply `options.length > 1`. One option that only
 * SOME rows carry still narrows — to exactly those rows — which is how `market_type` behaves while
 * older artifacts leave it empty. And a facet HOLDING a selection is never disabled, whatever its
 * options now say: the control that put a narrowing in place has to be able to take it back.
 */
const drawn = computed<DrawnFacet[]>(() =>
  props.facets.map(facet => {
    const options = facetOptions(input.value, facet.id)
    const narrows = options.length > 1
      || (options.length === 1 && options[0]!.count < props.rows.length)
    return { facet, options, narrows: narrows || pickedCount(facet.id) > 0 }
  })
)

const narrowed = computed(() => isNarrowed(props.selection, props.search))

/** How many facets wait behind `+N` — the last ones, as the row reports them. */
const hiddenCount = ref(0)

/** The values picked in the facets behind `+N`: a narrowing out of sight is said on the control. */
const hiddenPicked = computed(() => drawn.value
  .slice(drawn.value.length - hiddenCount.value)
  .reduce((sum, entry) => sum + pickedCount(entry.facet.id), 0))

const sortLabel = computed(() => props.sorts.find(option => option.id === props.sort)?.label ?? '')

/*
 * THE BAR DOES NOT MOVE WHEN IT IS USED — so everything that changes with a use keeps the room of
 * its widest state. The facets that fit are measured against what is left beside these, and a
 * `clear` that appeared, a count that lost a digit or a shorter sort name would hand the facets more
 * room or less, and a chip would go behind `+N` or come back out from under the pointer. The bar is
 * monospace, so a width in `ch` is a width in characters.
 */
const countWidth = computed(() => `${String(props.rows.length).length * 2 + 4}ch`)
const sortWidth = computed(() => `${Math.max(0, ...props.sorts.map(option => t(option.label).length))}ch`)

const searchOpen = ref(false)
const searchField = ref<HTMLInputElement | null>(null)

/** Open while asked for, and always while a search narrows the list — a narrowing is never folded away. */
const searchShown = computed(() => searchOpen.value || (props.search ?? '') !== '')

async function openSearch(): Promise<void> {
  searchOpen.value = true
  await nextTick()
  searchField.value?.focus()
}

/** Folds back into ⌕ when left empty. */
function leaveSearch(): void {
  if (!(props.search ?? '')) searchOpen.value = false
}

function dropSearch(): void {
  emit('update:search', '')
  searchOpen.value = false
}

function pickedCount(facetId: string): number {
  return props.selection[facetId]?.length ?? 0
}

function toggle(facetId: string, value: string): void {
  emit('update:selection', toggleValue(props.selection, facetId, value))
}

function clear(): void {
  emit('update:selection', {})
  emit('update:search', '')
}

/** Keeps the menu open, so several values can be picked in one visit — as in the chip's own panel. */
function stayOpen(event: Event): void {
  event.preventDefault()
}
</script>

<template>
  <div class="facet-bar">
    <div class="facet-lead">
      <template v-if="searchOf">
        <input
          v-if="searchShown"
          ref="searchField"
          class="facet-search"
          type="search"
          :value="search ?? ''"
          :placeholder="searchPlaceholder ?? t('Search')"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
          @blur="leaveSearch()"
          @keydown.escape="dropSearch()"
        >
        <AppButton
          v-else
          class="facet-search-toggle"
          size="compact"
          :title="searchPlaceholder ?? t('Search')"
          :aria-label="searchPlaceholder ?? t('Search')"
          @click="openSearch()"
        >
          <AppIcon name="action-search" />
        </AppButton>
      </template>

      <OverflowRow
        class="facet-chips"
        :items="drawn"
        :item-key="(entry: DrawnFacet) => entry.facet.id"
        :more-label="t('More filters')"
        :picked="hiddenPicked"
        @overflow="count => hiddenCount = count"
      >
        <template #item="{ item: entry }">
          <PopoverRoot>
            <!-- as-child: the primitive keeps the disclosure behaviour, AppButton carries the look.
                 `marked` rather than `active` — a facet holding values is a state worth showing, but
                 the control is a disclosure and `aria-pressed` beside its `aria-expanded` would claim
                 two roles. The badge says the same thing in words, which is what is read aloud. -->
            <PopoverTrigger as-child>
              <AppButton
                class="facet-trigger"
                size="compact"
                :marked="pickedCount(entry.facet.id) > 0"
                :disabled="!entry.narrows"
                :title="entry.narrows
                  ? undefined
                  : t('Every run shown agrees on this, so there is nothing to narrow by')"
              >
                {{ t(entry.facet.label) }}
                <!-- ALWAYS drawn, empty or not, because the slot has to be reserved. A badge that
                     only appears once something is picked makes its chip WIDER at that moment, and
                     every chip to its right slides along the bar. Measured on screen 2026-10-08: the
                     operator picked a value and the chips behind it moved. Same symptom as the facet
                     that used to be dropped, a second cause — the bar must not move when it is used. -->
                <span class="facet-badge">{{ pickedCount(entry.facet.id) || '' }}</span>
                <span class="facet-caret">▾</span>
              </AppButton>
            </PopoverTrigger>
            <PopoverPortal>
              <PopoverContent class="facet-panel" :side-offset="4" align="start">
                <button
                  v-for="option in entry.options"
                  :key="option.value"
                  class="facet-option"
                  :class="{ chosen: option.active }"
                  @click="toggle(entry.facet.id, option.value)"
                >
                  <span class="facet-mark">{{ option.active ? '☑' : '☐' }}</span>
                  <span class="facet-value">{{ option.value }}</span>
                  <span class="facet-count">{{ option.count }}</span>
                </button>
              </PopoverContent>
            </PopoverPortal>
          </PopoverRoot>
        </template>

        <!-- a facet behind the control is the same facet: its values, its counts, its picks -->
        <template #menu="{ hidden }">
          <DropdownMenuSub v-for="entry in hidden" :key="entry.facet.id">
            <DropdownMenuSubTrigger
              class="menu-item menu-sub-trigger facet-menu-facet"
              :data-facet="entry.facet.id"
              :disabled="!entry.narrows"
            >
              <span class="menu-label">{{ t(entry.facet.label) }}</span>
              <span class="facet-badge">{{ pickedCount(entry.facet.id) || '' }}</span>
              <span class="menu-sub-arrow" aria-hidden="true">▸</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent class="menu-content facet-menu-values" :side-offset="2">
                <DropdownMenuCheckboxItem
                  v-for="option in entry.options"
                  :key="option.value"
                  class="menu-item facet-menu-option"
                  :model-value="option.active"
                  @update:model-value="toggle(entry.facet.id, option.value)"
                  @select="stayOpen"
                >
                  <span class="menu-check" aria-hidden="true">{{ option.active ? '✓' : '' }}</span>
                  <span class="menu-label">{{ option.value }}</span>
                  <span class="facet-menu-count">{{ option.count }}</span>
                </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </template>
      </OverflowRow>
    </div>

    <div class="facet-tail">
      <!-- laid out while there is nothing to clear, unseen and out of reach: see the widths above -->
      <AppButton
        class="facet-clear"
        :class="{ 'facet-idle': !narrowed }"
        size="compact"
        :aria-hidden="!narrowed || undefined"
        :inert="!narrowed || undefined"
        @click="clear()"
      >
        ✕ {{ t('clear') }}
      </AppButton>

      <!-- the count is the honest half of a filter: it says what is NOT being shown -->
      <span class="facet-count-label" :style="{ minWidth: countWidth }">
        {{ shownCount }} {{ t('of') }} {{ rows.length }}
      </span>

      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <AppButton class="facet-sort-trigger" size="compact">
            {{ t('Sort') }}:
            <span class="facet-sort-value" :style="{ minWidth: sortWidth }">{{ t(sortLabel) }}</span>
            <span class="facet-caret">▾</span>
          </AppButton>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu-content" :side-offset="4" align="end">
            <DropdownMenuRadioGroup :model-value="sort" @update:model-value="value => emit('update:sort', String(value))">
              <DropdownMenuRadioItem
                v-for="option in sorts"
                :key="option.id"
                :value="option.id"
                class="menu-item facet-sort"
              >
                <span class="menu-check" aria-hidden="true">{{ option.id === sort ? '✓' : '' }}</span>
                <span class="menu-label">{{ t(option.label) }}</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
  </div>
</template>

<style scoped>
/*
 * Two groups that wrap as WHOLES: the search and the facets take what is left, and the right-hand
 * group keeps its width. Where both do not fit on one line the right-hand group goes to a second —
 * which depends on the panel's width alone, never on what was picked.
 */
.facet-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-sm);
  row-gap: var(--space-xs);
  margin-bottom: var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.facet-lead {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex: 1 1 16rem;
  min-width: 0;
}

.facet-chips {
  flex: 1 1 auto;
}

.facet-tail {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex: 0 0 auto;
  margin-left: auto;
}

.facet-search {
  flex: 0 1 12rem;
  min-width: 6rem;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-primary);
  padding: 2px var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  outline: none;
}

.facet-search:focus {
  border-color: var(--color-accent);
}

.facet-search-toggle {
  flex-shrink: 0;
}

/* The chips ARE buttons and come from `AppButton` — the four states, the tokens and the two
   channels each state carries live there and nowhere else. Sixty lines that restated them stood
   here until the two popover triggers could be wrapped with `as-child`; a second copy of a button
   contract drifts the moment the first one changes. */

.facet-badge {
  /* two digits wide whatever it holds, so a count from 1 to 99 never resizes the chip */
  min-width: 2ch;
  text-align: center;
  color: var(--color-text-primary);
}

.facet-caret {
  color: var(--color-text-secondary);
}

.facet-idle {
  visibility: hidden;
}

.facet-count-label {
  text-align: right;
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.facet-sort-value {
  display: inline-block;
  text-align: left;
}
</style>

<style>
/* portalled out of the component, so a scoped rule cannot reach it */
.facet-panel {
  z-index: var(--z-popover);
  display: flex;
  flex-direction: column;
  min-width: 11rem;
  max-height: 18rem;
  overflow-y: auto;
  padding: var(--space-xs);
  background-color: var(--color-bg-overlay);
  border: 1px solid var(--color-border-overlay);
  border-radius: 4px;
  box-shadow: var(--shadow-overlay);
}

.facet-option {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background: none;
  border: none;
  border-radius: 3px;
  color: var(--color-text-primary);
  cursor: pointer;
  padding: var(--space-xs) var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  text-align: left;
}

.facet-option:hover,
.facet-option:focus-visible {
  background-color: var(--color-bg-hover);
  outline: none;
}

.facet-option .facet-value {
  flex: 1;
}

.facet-option .facet-count,
.facet-menu-count {
  color: var(--color-text-secondary);
}

/* a value the other facets have emptied stays listed so it can be taken back off */
.facet-option .facet-count:empty::after {
  content: '0';
}

/* the facet's values behind `+N`: as long as the chip's own panel lets them be, and no longer */
.facet-menu-values {
  max-height: 18rem;
  overflow-y: auto;
}
</style>
