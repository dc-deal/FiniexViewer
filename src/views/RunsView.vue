<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDockStore } from '@/stores/dock_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunSectionsStore } from '@/stores/run_sections_store'
import { onPanelShownAgain } from '@/composables/use_panel_visibility'
import { reportKindId } from '@/panel_kinds'
import RunPicker from '@/components/runs/RunPicker.vue'
import PanelColumn from '@/components/panels/PanelColumn.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import HintLine from '@/components/base/HintLine.vue'
import { t } from '@/translate'

/*
 * The Runs panel: the run list above, the run report's column below. What the sections render, how
 * they load and the channels they read live at the app root (`run_sections_store`,
 * `use_run_reports_loading`, `use_run_report_channels`): a section opened as a panel of its own
 * needs them while this panel is closed or behind a tab.
 */
const runsStore = useRunsStore()
const {
  runs, selectedRun, selectedUnits, summaryUnreadable,
  unknownRunId,
  loadingRuns, error,
} = storeToRefs(runsStore)
const { unreadable, errors: sectionErrors } = storeToRefs(useRunReportsStore())
const sectionsStore = useRunSectionsStore()
const { sources, pending, absences } = storeToRefs(sectionsStore)
const { openIds } = storeToRefs(useDockStore())

/**
 * Whether a slot's line belongs above the column. Not where every section reading it is open as a
 * panel of its own: that panel says it, and a sentence printed twice teaches nobody.
 */
function saidHere(slot: string): boolean {
  const readers = sectionsStore.sectionsOfSlot(slot)
  return !readers.length || readers.some(id => !openIds.value.includes(reportKindId(id)))
}

// a docked panel stays mounted, so the index is fetched again whenever the panel comes back
onPanelShownAgain(() => { void runsStore.loadRuns(true) })

/**
 * What this run has no section for, said ONCE above the column instead of by eight silent gaps.
 *
 * Until the backend named the cause every missing section was the same blank space: a run still
 * going, a run started with reporting off, and a run whose pipeline never writes that section all
 * rendered identically. The sentence is the backend's own — written for a reader, and held on
 * their side by a test — so it is shown as it arrives rather than replaced.
 *
 * Grouped by cause, because a run that ended early is missing several sections for ONE reason and
 * naming it once is the whole point.
 */
const SECTION_TITLES: Record<string, string> = {
  warningsErrors: 'Warnings & Errors',
  portfolio: 'Portfolio',
  broker: 'Broker',
  aggregated: 'Run Totals',
  pendingOrders: 'Pending Orders',
  orderHistory: 'Order History',
  bookingPeriods: 'Booking Periods',
  config: 'Configuration',
  tradeHistory: 'Trade History',
  scenarios: 'Scenarios',
}

/** One line per section whose artifact predates the current schema, the summary's among them. */
const unreadableLines = computed<Record<string, string>>(() => Object.fromEntries(Object.entries({
  ...(summaryUnreadable.value ? { runSummary: summaryUnreadable.value } : {}),
  ...unreadable.value,
}).filter(([slot]) => saidHere(slot))))

/** EVERY section that failed says so — here, or in its own panel where it is open as one. */
const errorLines = computed<Record<string, string>>(() =>
  Object.fromEntries(Object.entries(sectionErrors.value).filter(([slot]) => saidHere(slot))))

const missingSections = computed(() => {
  // the CAUSE is carried, not only grouped by: it is what the list is keyed on below, and the
  // detail it was keyed on before is empty whenever the backend sends no sentence — so two
  // different causes collided on one empty key and Vue was free to reuse the wrong node
  const byCause = new Map<string, { cause: string, detail: string, sections: string[] }>()
  for (const [slot, absence] of Object.entries(absences.value).filter(([key]) => saidHere(key))) {
    const title = slot === 'runSummary' ? t('Executive Summary') : t(SECTION_TITLES[slot] ?? slot)
    const seen = byCause.get(absence.cause)
    if (seen) seen.sections.push(title)
    else byCause.set(absence.cause, { cause: absence.cause, detail: absence.detail, sections: [title] })
  }
  return [...byCause.values()]
})
</script>

<template>
  <div class="runs-view">
    <header class="runs-header">
      <RunPicker />
    </header>

    <div class="runs-body">
      <div v-if="loadingRuns" class="state-overlay">
        <AppSpinner />
      </div>
      <div v-else-if="error" class="state-overlay">
        <span class="error-msg">{{ error }}</span>
      </div>
      <div v-else-if="!runs.length" class="state-overlay">
        <span class="hint">{{ t('The backend reports no runs — its run index is empty') }}</span>
      </div>
      <div v-else-if="unknownRunId" class="state-overlay">
        <span class="hint">
          {{ t('The run you had open is no longer in the index') }}: {{ unknownRunId }}
        </span>
      </div>
      <!-- No sentence where no run is chosen. It read "Select group, scenario and run" — the
           vocabulary of the cascade this view has not had since 2026-09-27 — and it stood in a
           half-empty page beneath the list it was describing. The list is the instruction. -->
      <!-- named rather than `v-else`: the branch that used to stand between them was a sentence,
           and its removal left the compiler no way to know a run had been chosen -->
      <template v-else-if="selectedRun">
        <!-- a missing or unreadable section does not hide the ones that are there -->
        <p v-if="!selectedRun.has_reports" class="notice">
          {{ t('This run exists as logs only — it carries no report artifacts') }}
        </p>
        <!-- one line per REASON, never one per absent section -->
        <p v-for="missing in missingSections" :key="missing.cause" class="notice absent">
          <span class="mark">ⓘ</span>
          <span>
            <strong>{{ missing.sections.join(' · ') }}</strong>
            <template v-if="missing.detail"> — {{ missing.detail }}</template>
          </span>
        </p>
        <!-- a section whose artifact predates the current schema — a state of the run, one line
             per section, and not a failure -->
        <p v-for="(message, section) in unreadableLines" :key="section" class="notice">{{ message }}</p>
        <!-- EVERY section that failed says so, and the sections that did load stay visible. One
             line per failure: the sections load concurrently, so a single slot showed whichever
             finished last and silently dropped the rest. -->
        <p v-for="(message, section) in errorLines" :key="section" class="notice failed">
          {{ message }}
        </p>
        <!-- how a section comes out of the column, and how it goes back -->
        <HintLine id="open-as-panel" />
        <!-- the whole manipulated area is framed, so it can never be mistaken for the whole run.
             The frame is the second channel beside the colour: a reader who cannot separate the
             hues still sees an edge that was not there before. What is narrowed is said in the
             quick bar beside the tab, where saying it moves nothing. -->
        <div class="panels" :class="{ narrowed: selectedUnits.length > 0 }">
          <PanelColumn :sources="sources" :pending="pending" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* A SIZE container, so the lists inside measure their caps against this view and not against the
   browser window. With `vh` a view given half the screen still sized its run list for the whole
   of it, and the rows past the view's own hidden overflow could not be reached. The view is sized
   by what holds it and never by its content, which is what size containment requires. */
.runs-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  container-type: size;
}

.runs-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.runs-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
}

.state-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
}

.hint {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.error-msg {
  color: var(--color-error);
  font-size: var(--font-size-sm);
}

.notice.failed {
  border-left-color: var(--color-error);
  color: var(--color-error);
}

/* an absence is not a warning and not an error — it is structure, so it stays in the plain role */
.notice.absent {
  display: flex;
  gap: var(--space-xs);
}

/* a narrowed column is FRAMED, not merely announced: the edge says how far the manipulation
   reaches, which a sentence above it cannot. The colour is the annotation role — a marked
   division — and the frame itself is the channel that survives without it. Its ROOM is always
   there, transparent until a narrowing colours it: drawn only on a choice, its border and padding
   indented every panel inside (a selection never moves the layout). */
.panels {
  border: 1px dashed transparent;
  border-radius: 4px;
  padding: var(--space-sm);
}

.panels.narrowed {
  border-color: var(--color-annotation);
}

.notice.absent strong {
  color: var(--color-text-primary);
  font-weight: normal;
}

.notice .mark {
  flex-shrink: 0;
}

.notice {
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-text-secondary);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
