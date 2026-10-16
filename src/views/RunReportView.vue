<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDockStore } from '@/stores/dock_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunSectionsStore } from '@/stores/run_sections_store'
import { reportKindId } from '@/panel_kinds'
import { startedAt } from '@/components/runs/report_format'
import PanelColumn from '@/components/panels/PanelColumn.vue'
import AppButton from '@/components/base/AppButton.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import HintLine from '@/components/base/HintLine.vue'
import { t } from '@/translate'

/*
 * The run report — the BUNDLE a pick in the run list opens (viewer#31, 2026-10-14): one line naming
 * the run, with the way back to the list, and then its sections, the bundle's members, stacked in
 * one column. Any member opens as a panel of its own beside it.
 *
 * What the sections render, how they load and the channels they read live at the app root
 * (`run_sections_store`, `use_run_reports_loading`, `use_run_report_channels`): a section opened as
 * a panel of its own needs them while this panel is closed or behind a tab.
 */
const runsStore = useRunsStore()
const {
  selectedRun, selectedUnits, summaryUnreadable, summaryError,
  unknownRunId, loadingRuns,
} = storeToRefs(runsStore)
const { unreadable, errors: sectionErrors } = storeToRefs(useRunReportsStore())
const sectionsStore = useRunSectionsStore()
const { sources, pending, absences } = storeToRefs(sectionsStore)
const dock = useDockStore()
const { openIds } = storeToRefs(dock)

/**
 * Whether a slot's line belongs above the column. Not where every section reading it is open as a
 * panel of its own: that panel says it, and a sentence printed twice teaches nobody.
 */
function saidHere(slot: string): boolean {
  const readers = sectionsStore.sectionsOfSlot(slot)
  return !readers.length || readers.some(id => !openIds.value.includes(reportKindId(id)))
}

/** The chosen run's pipeline, name and start — one line, cut short where the panel is narrow. */
const chosenMeta = computed(() => {
  const run = selectedRun.value
  if (!run) return ''
  return [run.group, run.name, startedAt(run.start_time)].filter(Boolean).join(' · ')
})

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

/**
 * EVERY section that failed says so — here, or in its own panel where it is open as one. The
 * summary's failure is one of them since 2026-10-14: it took the whole view down until then, list
 * included, because the index and the summary shared one error.
 */
const errorLines = computed<Record<string, string>>(() => Object.fromEntries(Object.entries({
  ...(summaryError.value ? { runSummary: summaryError.value } : {}),
  ...sectionErrors.value,
}).filter(([slot]) => saidHere(slot))))

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
  <div class="run-report-view">
    <!-- chosen: one line saying which, and the way back to the list -->
    <header v-if="selectedRun" class="run-report-header">
      <div class="picker-chosen">
        <span class="chosen-label">{{ t('Run') }}</span>
        <span class="chosen-id">{{ selectedRun.run_id }}</span>
        <!-- the whole line on hover: in a narrow panel it ends in an ellipsis instead of taking
             three lines above the sections -->
        <span class="chosen-meta" :title="chosenMeta">{{ chosenMeta }}</span>
        <AppButton variant="quiet" @click="dock.open('runs')">{{ t('Change run') }}</AppButton>
      </div>
    </header>

    <div class="run-report-body">
      <div v-if="loadingRuns" class="state-overlay">
        <AppSpinner />
      </div>
      <div v-else-if="unknownRunId" class="state-overlay">
        <span class="hint">
          {{ t('The run you had open is no longer in the index') }}: {{ unknownRunId }}
        </span>
      </div>
      <div v-else-if="!selectedRun" class="state-overlay state-none">
        <span class="hint">{{ t('No run is chosen — the Runs panel lists them') }}</span>
        <AppButton variant="quiet" @click="dock.open('runs')">{{ t('Show the run list') }}</AppButton>
      </div>
      <template v-else>
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
        <!-- how a section comes out of the column, and how it goes back; and how a panel docks
             along a whole edge of the dock, which nothing on screen shows until a tab is dragged -->
        <HintLine id="open-as-panel" />
        <HintLine id="dock-edges" />
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
   browser window. The view is sized by what holds it and never by its content, which is what size
   containment requires. */
.run-report-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  container-type: size;
}

.run-report-header {
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.run-report-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
}

.picker-chosen {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  min-width: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.chosen-label {
  color: var(--color-text-secondary);
}

.chosen-label,
.chosen-id {
  flex-shrink: 0;
  white-space: nowrap;
}

.chosen-id {
  color: var(--color-text-primary);
}

.chosen-meta {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-secondary);
}

/* a control whose name breaks over two lines reads as two controls */
.picker-chosen .app-button {
  margin-left: auto;
  flex-shrink: 0;
  white-space: nowrap;
}

.state-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
}

.state-none {
  flex-direction: column;
  gap: var(--space-sm);
}

.hint {
  color: var(--color-text-secondary);
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
