<script setup lang="ts" generic="T">
import { computed } from 'vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
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

/** Each facet with its options, dropped where it has none to offer. */
const drawn = computed(() =>
  props.facets
    .map(facet => ({ facet, options: facetOptions(input.value, facet.id) }))
    .filter(entry => entry.options.length > 0)
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
        <PopoverTrigger class="facet-trigger" :class="{ picked: pickedCount(entry.facet.id) > 0 }">
          {{ t(entry.facet.label) }}
          <span v-if="pickedCount(entry.facet.id)" class="facet-badge">
            {{ pickedCount(entry.facet.id) }}
          </span>
          <span class="facet-caret">▾</span>
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

      <button v-if="narrowed" class="facet-clear" @click="clear()">✕ {{ t('clear') }}</button>

      <span class="facet-spacer" />
      <!-- the count is the honest half of a filter: it says what is NOT being shown -->
      <span class="facet-count-label">
        {{ shownCount }} {{ t('of') }} {{ rows.length }}
      </span>
    </div>

    <div class="facet-row">
      <span class="facet-label">{{ t('Sort by') }}</span>
      <button
        v-for="option in sorts"
        :key="option.id"
        class="facet-sort"
        :class="{ active: option.id === sort }"
        @click="emit('update:sort', option.id)"
      >{{ t(option.label) }}</button>
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

.facet-trigger,
.facet-sort,
.facet-clear {
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

.facet-trigger.picked,
.facet-sort.active {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
}

.facet-trigger:focus-visible,
.facet-sort:focus-visible,
.facet-clear:focus-visible {
  outline: 1px solid var(--color-accent);
  outline-offset: 1px;
}

.facet-badge {
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
  z-index: 70;
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
