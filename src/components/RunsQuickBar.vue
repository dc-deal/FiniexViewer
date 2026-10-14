<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import AppButton from '@/components/base/AppButton.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import type { Figure } from '@/types/figure_types'
import { t } from '@/translate'

/**
 * The scenario narrowing, said beside the Runs tab — where it is seen whatever is scrolled, and
 * where saying it moves nothing. It stood above the panel column until 2026-10-13 and pushed the
 * column down a line on every choice (a selection never moves the layout). The column's frame is
 * still drawn in the same annotation colour, so the bar and the edge read as one statement.
 */
const runsStore = useRunsStore()
const { selectedUnits } = storeToRefs(runsStore)
const { scenarios } = storeToRefs(useRunReportsStore())

/**
 * Names in the narrowing this run does not have — one saved before the set was changed. Claimed
 * ONLY where the roster actually arrived: `scenario-details` is backtest-only by construction, so
 * its absence on a session says nothing about a name and must not be reported as a bad one.
 */
const unknownUnits = computed(() => {
  const roster = scenarios.value
  if (roster === null) return []
  return selectedUnits.value.filter(unit => !roster.units.some(row => row.name === unit))
})

/**
 * The narrowing as words: the one name where there is one — the scenario the reader clicked — and
 * a count from two on, with the names in the card behind it. Three names fitted beside a wide
 * panel's tabs and pushed a narrow panel's tabs into their overflow menu.
 */
const statement = computed(() => {
  const units = selectedUnits.value
  const shown = units.length === 1 ? units[0]! : `${units.length} ${t('scenarios')}`
  const unknown = unknownUnits.value
  if (!unknown.length) return `${t('Showing only')} ${shown}`
  // the one name is already in the line, so it is only said to be missing; several are counted
  const missing = units.length === 1 ? t('not in this run') : `${unknown.length} ${t('not in this run')}`
  return `${t('Showing only')} ${shown} — ${missing}`
})

/** What the line cannot say: every name it counted, and which of them this run lacks. */
const cardRows = computed<Figure[]>(() => {
  if (selectedUnits.value.length < 2) return []
  const rows: Figure[] = [{ label: t('Showing only'), value: selectedUnits.value.join(', ') }]
  if (unknownUnits.value.length) rows.push({ label: t('Not in this run'), value: unknownUnits.value.join(', ') })
  return rows
})
</script>

<template>
  <p v-if="selectedUnits.length" class="narrowed-head">
    <span class="mark" aria-hidden="true">⌖</span>
    <HoverCard v-if="cardRows.length" :details="cardRows">
      <span class="narrowed-text" tabindex="0">{{ statement }}</span>
    </HoverCard>
    <span v-else class="narrowed-text">{{ statement }}</span>
    <AppButton variant="quiet" @click="runsStore.clearUnits()">
      {{ t('Show all') }}
    </AppButton>
  </p>
</template>

<style scoped>
/*
 * A grid, because the text is the one part that may give way: its track shrinks to nothing while
 * the mark and the button keep their size. The bar's least width is therefore theirs alone, and
 * the dock hands the bar the shortfall first, so a tab goes into the overflow menu only once the
 * text has given up its room.
 */
.narrowed-head {
  display: grid;
  grid-template-columns: auto minmax(0, max-content) auto;
  align-items: center;
  column-gap: var(--space-xs);
  height: 100%;
  margin: 0;
  padding: 0 var(--space-sm);
  color: var(--color-annotation);
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.narrowed-text {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
