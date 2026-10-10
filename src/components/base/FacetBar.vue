<script setup lang="ts" generic="T">
import { computed } from 'vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'
import { applyFacets, facetOptions, isNarrowed, toggleValue } from '@/components/base/facet_filter'
import type { FacetDefinition, FacetSelection, SortDefinition } from '@/types/facet_types'
import { t } from '@/translate'

/**
 * One bar that narrows and orders any list: a search over one field, a facet per enumerable field,
 * and a sort. It owns no state — the caller holds the selection and applies the same pure functions
 * to its rows, so the bar and the list can never disagree about what is being shown.
 *
 * A facet with nothing to offer is not drawn: an empty dropdown is a control that looks broken.
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
 * `AppBar.vue` already made for a section this run does not have: *an inventory that silently
 * shortens is not one*.
 *
 * The count matters, and it is why this is not simply `options.length > 1`. One option that only
 * SOME rows carry still narrows — to exactly those rows — which is how `market_type` behaves while
 * older artifacts leave it empty. And a facet HOLDING a selection is never disabled, whatever its
 * options now say: the control that put a narrowing in place has to be able to take it back.
 */
const drawn = computed(() =>
  props.facets.map(facet => {
    const options = facetOptions(input.value, facet.id)
    const narrows = options.length > 1
      || (options.length === 1 && options[0]!.count < props.rows.length)
    return { facet, options, narrows: narrows || pickedCount(facet.id) > 0 }
  })
)

const narrowed = computed(() => isNarrowed(props.selection, props.search))

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
</script>

<template>
  <div class="facet-bar">
    <div class="facet-row">
      <input
        v-if="searchOf"
        class="facet-search"
        type="search"
        :value="search ?? ''"
        :placeholder="searchPlaceholder ?? t('Search')"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      >

      <PopoverRoot v-for="entry in drawn" :key="entry.facet.id">
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

      <AppButton v-if="narrowed" class="facet-clear" size="compact" @click="clear()">
        ✕ {{ t('clear') }}
      </AppButton>

      <span class="facet-spacer" />
      <!-- the count is the honest half of a filter: it says what is NOT being shown -->
      <span class="facet-count-label">
        {{ shownCount }} {{ t('of') }} {{ rows.length }}
      </span>
    </div>

    <div class="facet-row">
      <span class="facet-label">{{ t('Sort by') }}</span>
      <!-- a group where one is chosen: `active` IS the right word here, and the announcement
           that comes with it is true -->
      <AppButton
        v-for="option in sorts"
        :key="option.id"
        class="facet-sort"
        size="compact"
        :active="option.id === sort"
        @click="emit('update:sort', option.id)"
      >{{ t(option.label) }}</AppButton>
    </div>
  </div>
</template>

<style scoped>
.facet-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-sm);
}

.facet-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.facet-search {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-primary);
  padding: 2px var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  min-width: 12rem;
  outline: none;
}

.facet-search:focus {
  border-color: var(--color-accent);
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

.facet-spacer {
  flex: 1;
}

.facet-label,
.facet-count-label {
  color: var(--color-text-secondary);
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
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
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
  background-color: var(--color-bg-elevated);
  outline: none;
}

.facet-option .facet-value {
  flex: 1;
}

.facet-option .facet-count {
  color: var(--color-text-secondary);
}

/* a value the other facets have emptied stays listed so it can be taken back off */
.facet-option .facet-count:empty::after {
  content: '0';
}
</style>
