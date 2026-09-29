<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunQuerySync } from '@/composables/use_run_query_sync'
import { provideScenarioSelection } from '@/composables/use_scenario_selection'
import { hasArtifact } from '@/api/report_artifacts'
import RunPicker from '@/components/runs/RunPicker.vue'
import AppBar from '@/components/panels/AppBar.vue'
import PanelColumn from '@/components/panels/PanelColumn.vue'
import AppButton from '@/components/base/AppButton.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import { t } from '@/translate'

const runsStore = useRunsStore()
const reportsStore = useRunReportsStore()
const {
  runs, selectedRunId, selectedRun, selectedUnits, summary, feedHealth, summaryAbsence,
  unknownRunId,
  loadingRuns, loadingSummary, error,
} = storeToRefs(runsStore)
const {
  warningsErrors, portfolio, bookingPeriods, config, tradeHistory, scenarios, absences,
  unreadable, error: sectionError,
} = storeToRefs(reportsStore)

// loads the run index and restores the cascade from the URL
useRunQuerySync()

// The narrowing is ambient for the same reason the display preferences are — see the composable.
// The view owns it rather than PanelColumn, which draws a deployment's panels too and has no
// scenario to narrow to.
provideScenarioSelection({
  units: selectedUnits,
  toggle: (unit: string) => runsStore.toggleUnit(unit),
  clear: () => runsStore.clearUnits(),
})

/**
 * Names in the narrowing this run does not have — an edited link, or one saved before the set was
 * changed. Claimed ONLY where the roster actually arrived: `scenario-details` is built from the
 * batch and is backtest-only by construction, so its absence on a session says nothing about a
 * name and must not be reported as a bad one.
 */
/**
 * The narrowing as a heading. Names while they still fit — a reader recognises the scenario they
 * clicked — and a count past that, because eleven names in one line is not something anyone reads.
 */
const narrowingLabel = computed(() => {
  const units = selectedUnits.value
  if (units.length <= 3) return units.join(' · ')
  return `${units.length} ${t('scenarios')}`
})

const unknownUnits = computed(() => {
  const roster = scenarios.value
  if (roster === null) return []
  return selectedUnits.value.filter(unit => !roster.units.some(row => row.name === unit))
})

// One request per section per run. Lazy loading on first expand is deferred until there are
// enough sections to justify the plumbing — see viewer#21.
watch(selectedRunId, runId => {
  reportsStore.clear()
  // a logs-only run is skipped here for the same reason the store skips the summary
  const run = selectedRun.value
  if (!runId || !run?.has_reports) return

  /**
   * Only the sections this run actually wrote. The index row lists them, and the two pipelines
   * write DIFFERENT sets — asking for the difference produced a 404 per session and a notice
   * claiming a section was missing, where the truth is that a session has no scenario grid
   * to report on. An absence is now only ever a section the run SHOULD have and does not.
   */
  const has = (section: string) => hasArtifact(run, section)

  if (has('warningsErrors')) reportsStore.loadWarningsErrors(runId)
  if (has('portfolio')) reportsStore.loadPortfolio(runId)
  if (has('bookingPeriods')) reportsStore.loadBookingPeriods(runId)
  if (has('tradeHistory')) reportsStore.loadTradeHistory(runId)
  if (has('scenarios')) reportsStore.loadScenarios(runId)
  // not an artifact of the run but its SOURCE configuration — ungated, with its own two 404s
  reportsStore.loadConfig(runId)
}, { immediate: true })

// the models the panels render, keyed by the source each descriptor declares
const sources = computed(() => ({
  runInfo: selectedRun.value,
  runSummary: summary.value,
  feedHealth: feedHealth.value,
  warningsErrors: warningsErrors.value,
  portfolio: portfolio.value,
  bookingPeriods: bookingPeriods.value,
  config: config.value,
  // composed rather than served: the roster says what was DECLARED, the portfolio what it EARNED
  // and warnings-errors what WENT WRONG — three responses, one question a reader scans forty rows
  // with. Joined on the unit name, which is one identity across all three.
  scenarioRoster: scenarios.value
    ? {
        scenarios: scenarios.value,
        portfolio: portfolio.value,
        warningsErrors: warningsErrors.value,
      }
    : null,
  // composed rather than served: the trade view needs the positions AND the order funnel, and
  // those live on two different routes
  tradeView: tradeHistory.value
    ? { history: tradeHistory.value, summary: summary.value }
    : null,
}))

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
  bookingPeriods: 'Booking Periods',
  config: 'Configuration',
  tradeHistory: 'Trade History',
  scenarios: 'Scenarios',
}

const missingSections = computed(() => {
  const all = { ...absences.value }
  if (summaryAbsence.value) all['runSummary'] = summaryAbsence.value
  const byCause = new Map<string, { detail: string, sections: string[] }>()
  for (const [slot, absence] of Object.entries(all)) {
    const title = slot === 'runSummary' ? t('Executive Summary') : t(SECTION_TITLES[slot] ?? slot)
    const seen = byCause.get(absence.cause)
    if (seen) seen.sections.push(title)
    else byCause.set(absence.cause, { detail: absence.detail, sections: [title] })
  }
  return [...byCause.values()]
})

// Once a run is chosen there is always something to show: the header panel reads the index row.
// PanelColumn drops every panel whose model is absent, so a run without artifacts simply renders
// fewer sections rather than nothing at all.
const showPanels = computed(() =>
  !loadingRuns.value && !loadingSummary.value && !error.value
  && !unknownRunId.value && selectedRun.value !== null
)
</script>

<template>
  <div class="runs-view">
    <header class="runs-header">
      <RunPicker />
      <AppBar v-if="showPanels" :sources="sources" />
    </header>

    <div class="runs-body">
      <div v-if="loadingRuns || loadingSummary" class="state-overlay">
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
          {{ t('This link names a run that is no longer in the index') }}: {{ unknownRunId }}
        </span>
      </div>
      <div v-else-if="!selectedRun" class="state-overlay">
        <span class="hint">{{ t('Select group, scenario and run to continue') }}</span>
      </div>
      <template v-else>
        <!-- a missing or unreadable section does not hide the ones that are there -->
        <p v-if="!selectedRun.has_reports" class="notice">
          {{ t('This run exists as logs only — it carries no report artifacts') }}
        </p>
        <!-- one line per REASON, never one per absent section -->
        <p v-for="missing in missingSections" :key="missing.detail" class="notice absent">
          <span class="mark">ⓘ</span>
          <span>
            <strong>{{ missing.sections.join(' · ') }}</strong>
            <template v-if="missing.detail"> — {{ missing.detail }}</template>
          </span>
        </p>
        <!-- said ONCE above the column: every section below is narrowed, and a reader who forgot
             would otherwise read a single scenario's figures as the run's -->
        <p v-if="unreadable" class="notice">{{ unreadable }}</p>
        <!-- a section that failed to load says so; the sections that did load stay visible -->
        <p v-if="sectionError" class="notice failed">{{ sectionError }}</p>
        <!-- the whole manipulated area is framed, so it can never be mistaken for the whole run.
             The frame is the second channel beside the colour: a reader who cannot separate the
             hues still sees an edge that was not there before. -->
        <div class="panels" :class="{ narrowed: selectedUnits.length > 0 }">
          <p v-if="selectedUnits.length" class="narrowed-head">
            <span class="mark" aria-hidden="true">⌖</span>
            <span>
              {{ t('Showing only') }} <strong>{{ narrowingLabel }}</strong>
              <template v-if="unknownUnits.length">
                — {{ t('not in this run:') }} {{ unknownUnits.join(', ') }}
              </template>
            </span>
            <AppButton variant="quiet" @click="runsStore.clearUnits()">
              {{ t('Show all') }}
            </AppButton>
          </p>
          <PanelColumn :sources="sources" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.runs-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
   division — and the frame itself is the channel that survives without it. */
.panels.narrowed {
  border: 1px solid var(--color-annotation);
  border-radius: 4px;
  padding: var(--space-sm);
}

.narrowed-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  margin: 0 0 var(--space-sm);
  color: var(--color-annotation);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.narrowed-head strong {
  font-weight: normal;
}

.narrowed-head .mark {
  flex-shrink: 0;
}

.narrowed-head .app-button {
  margin-left: auto;
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
