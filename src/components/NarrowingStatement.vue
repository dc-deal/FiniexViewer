<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import AppButton from '@/components/base/AppButton.vue'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import { t } from '@/translate'

/**
 * The scenario narrowing, said ONCE, in the menu bar (viewer#42, decided 2026-10-16): the focus
 * belongs to the link, not to a panel, the way an editor shows a global state once in its status
 * bar. It stood beside the tabs of every group holding a narrowed panel before — four times on one
 * screen for one narrowing — and above the panel column until 2026-10-13, where it pushed the column
 * down a line on every choice (a selection never moves the layout). Each narrowed panel still wears
 * its dashed frame in the same annotation colour, so the statement and the edges read as one.
 */
const runsStore = useRunsStore()
const { selectedUnits } = storeToRefs(runsStore)
const { scenarios } = storeToRefs(useRunReportsStore())

/** The scenario in focus — one at most (operator, 2026-10-16). */
const focused = computed(() => selectedUnits.value[0] ?? null)

/**
 * Whether this run lacks the scenario in focus — one saved before the set was changed. Claimed ONLY
 * where the roster actually arrived: `scenario-details` is backtest-only by construction, so its
 * absence on a session says nothing about a name and must not be reported as a bad one.
 */
const missing = computed(() => {
  const roster = scenarios.value
  const name = focused.value
  return roster !== null && name !== null && !roster.units.some(row => row.name === name)
})

/**
 * The focus as words. `Only`, not `Showing only`: the text is what shortens when the panel is
 * narrow, and the prefix said nothing the mark, the annotation colour and *Show all* beside it do
 * not. The whole line stands in the title, for the panel too narrow to show the name.
 */
const statement = computed(() =>
  `${t('Only')} ${focused.value}${missing.value ? ` — ${t('not in this run')}` : ''}`)
</script>

<template>
  <p v-if="focused" class="narrowed-head">
    <span class="mark" aria-hidden="true">⌖</span>
    <span class="narrowed-text" :title="statement">{{ statement }}</span>
    <AppButton variant="quiet" @click="runsStore.clearUnits()">
      {{ t('Show all') }}
    </AppButton>
  </p>
</template>

<style scoped>
/*
 * A grid, because the text is the one part that may give way: its track shrinks to nothing while
 * the mark and the button keep their size. Its least width is therefore theirs alone, so in a
 * narrow window the name shortens before anything else in the menu bar moves.
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
