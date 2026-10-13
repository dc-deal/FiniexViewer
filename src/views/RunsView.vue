<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useLayoutStore } from '@/stores/layout_store'
import { useRunBinding } from '@/composables/use_run_binding'
import { provideScenarioSelection } from '@/composables/use_scenario_selection'
import { providePositionLink } from '@/composables/use_position_link'
import type { PositionRef } from '@/types/context_types'
import { provideOrderSteps } from '@/composables/use_order_steps'
import { hasArtifact } from '@/api/report_artifacts'
import { panelById } from '@/panel_registry'
import RunPicker from '@/components/runs/RunPicker.vue'
import AppBar from '@/components/panels/AppBar.vue'
import PanelColumn from '@/components/panels/PanelColumn.vue'
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
  runHeader,
  warningsErrors, portfolio, broker, aggregated, pendingOrders, orderHistory, bookingPeriods,
  config,
  tradeHistory, scenarios,
  absences,
  unreadable, errors: sectionErrors,
  loadingWarningsErrors, loadingPortfolio, loadingBroker, loadingAggregated, loadingOrderHistory,
  loadingBookingPeriods, loadingConfig, loadingScenarios, loadingTradeHistory,
} = storeToRefs(reportsStore)

// loads the run index and brings back the run the reader had open
useRunBinding()

// The narrowing is ambient for the same reason the display preferences are — see the composable.
// The view owns it rather than PanelColumn, which draws a deployment's panels too and has no
// scenario to narrow to.
provideScenarioSelection({
  units: selectedUnits,
  toggle: (unit: string) => runsStore.toggleUnit(unit),
  clear: () => runsStore.clearUnits(),
})

/**
 * The position a reader asked to look at, and the jump that puts them in front of it.
 *
 * The VIEW owns it, not the panels: making a sibling panel visible and scrolling to a row is about
 * the WORKSPACE, which a panel must not know. Two panels act on it — the orders and the trades —
 * and both only read the mark and ask for the jump.
 *
 * The mark is part of the run's context, so a reload brings it back. The SCROLL is not: it happens
 * on the click, never on a restore, because a page that jumps on every reload is a page that moved
 * while the reader was not looking.
 */
const context = useContextStore()
const layoutStore = useLayoutStore()

providePositionLink({
  marked: computed(() => context.main.run.position),
  jumpTo: (panelId: string, ref: PositionRef) => {
    context.mark(ref)
    // a hidden panel is not in the column at all, and a folded one draws nothing — the jump has to
    // make the target reachable before it can scroll to it
    layoutStore.show(panelId)
    layoutStore.setOpen(panelId, true)
    void scrollToMark(panelId)
  },
  canJumpTo: (panelId: string) => {
    const descriptor = panelById(panelId)
    if (!descriptor) return false
    // the same record PanelColumn is handed, read by the source a descriptor declares
    const models = sources.value as Record<string, unknown>
    return models[descriptor.source] != null
  },
})

/**
 * The steps one position's orders went through, which the Orders panel asks for a position at a
 * time rather than for the run.
 *
 * The VIEW owns it for the same reason it owns the jump: which run is selected, and whether that
 * run wrote a stream at all, is the workspace's knowledge. **The gate is `stream_files`, not
 * `artifacts`** — the stream is not a report artifact and appears in no run's artifact list, and
 * the backend names it on the index row instead. Measured 2026-10-08: 51 of 52 runs carry
 * `["order_events.jsonl"]` there and one carries `[]`. Without the gate the panel would offer a
 * reader a disclosure that can only answer 404.
 */
provideOrderSteps({
  available: () => (selectedRun.value?.stream_files.length ?? 0) > 0,
  heldFor: (ref: PositionRef) => reportsStore.stepsFor(ref.scenario, ref.position),
  loadingFor: (ref: PositionRef) => reportsStore.stepsLoading(ref.scenario, ref.position),
  askFor: (ref: PositionRef) => {
    const runId = selectedRunId.value
    if (runId) void reportsStore.loadOrderEvents(runId, ref.scenario, ref.position)
  },
})

// the view's own root, so the jump below searches THIS view and never the whole document
const viewRoot = ref<HTMLElement | null>(null)

/** How long a jump waits for its marked row before it gives up. */
const MARK_WAIT_MS = 2000

/**
 * Scroll the marked row into view, once it exists — WAITED FOR, never guessed.
 *
 * The mark is set at the click, so one tick later every row already drawn carries it. A panel the
 * jump had to OPEN is not drawn by then, and no fixed number of ticks is right. Measured
 * 2026-10-13: one tick found no row once the mark stopped riding in the URL, whose write had been
 * slow enough to hide it. So the view is watched until the row appears.
 * A row that never does is one the target panel does not draw — beyond its visible cap, or in a
 * group it folded — and the jump then leaves the mark where it is rather than scrolling to nothing.
 *
 * Searched inside THIS view, never the whole document: once the views are panels that can stand
 * side by side, a second copy of a panel would otherwise answer first and the jump would scroll a
 * view the reader is not looking at.
 */
async function scrollToMark(panelId: string): Promise<void> {
  // one tick first, or a row still carrying the PREVIOUS mark would answer
  await nextTick()
  const root = viewRoot.value
  if (!root) return
  const scrolled = (): boolean => {
    const row = root.querySelector(`[data-panel="${panelId}"] .record-row.marked`)
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return row !== null
  }
  if (scrolled()) return
  const observer = new MutationObserver(() => { if (scrolled()) stop() })
  const timer = window.setTimeout(stop, MARK_WAIT_MS)
  function stop(): void {
    observer.disconnect()
    window.clearTimeout(timer)
  }
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
}

// One request per section per run. Lazy loading on first expand is deferred until there are
// enough sections to justify the plumbing — see viewer#21.
//
// Keyed on the RESOLVED run, not on the chosen id: after a reload the id is back before the index
// is, so a watch on the id fired once with no run to load and never again.
watch(() => selectedRun.value?.run_id ?? null, runId => {
  reportsStore.clear()
  const run = selectedRun.value
  if (!runId || !run) return

  /**
   * The HEADER first, and ungated. It is not in a run's `artifacts` and it answers even where that
   * list is empty — measured 2026-10-10 on all three logs-only runs here. It is the one section a
   * run without reports still has, which is exactly what the Run Header panel is for.
   */
  reportsStore.loadRunHeader(runId)

  // a logs-only run stops here, for the same reason the store skips the summary
  if (!run.has_reports) return

  /**
   * Only the sections this run actually wrote. The index row lists them, and the two pipelines
   * write DIFFERENT sets — asking for the difference produced a 404 per session and a notice
   * claiming a section was missing, where the truth is that a session has no scenario grid
   * to report on. An absence is now only ever a section the run SHOULD have and does not.
   */
  const has = (section: string) => hasArtifact(run, section)

  if (has('warningsErrors')) reportsStore.loadWarningsErrors(runId)
  if (has('portfolio')) reportsStore.loadPortfolio(runId)
  if (has('broker')) reportsStore.loadBroker(runId)
  if (has('aggregated')) reportsStore.loadAggregated(runId)
  if (has('pendingOrders')) reportsStore.loadPendingOrders(runId)
  if (has('orderHistory')) reportsStore.loadOrderHistory(runId)
  if (has('bookingPeriods')) reportsStore.loadBookingPeriods(runId)
  if (has('tradeHistory')) reportsStore.loadTradeHistory(runId)
  if (has('scenarios')) reportsStore.loadScenarios(runId)
  // not an artifact of the run but its SOURCE configuration — ungated, with its own two 404s
  reportsStore.loadConfig(runId)
}, { immediate: true })

/*
 * The three COMPOSED models, each its own computed. Built inside the one `sources` literal below,
 * every one of them was a new object whenever ANY section arrived, and a panel that watched its
 * model handed a reader's choices back: the roster cleared its narrowing as the trade history or
 * the configuration landed, neither of which it even reads. Apart, a composed model changes only
 * when one of its OWN parts does — and since those still arrive one by one, a panel that resets on
 * a new run watches the run's id, never the model (OrdersPanel, ScenarioRosterPanel,
 * TradeHistoryPanel).
 */

/**
 * TWO models in one, and both halves are needed. The index ROW is always there and answers for
 * a run with no artifacts at all; the served HEADER carries the two things the row cannot —
 * which code ran, and whether uncommitted code was explicitly allowed to place real orders. The
 * row is never absent, so the panel always draws; the header may be, and then it draws less.
 */
const headerModel = computed(() => selectedRun.value
  ? { info: selectedRun.value, served: runHeader.value }
  : null)

// composed rather than served: `pending-orders` says what BECAME of a scenario's orders and
// `order-history` carries the orders themselves. Joined on the scenario name, which both sides
// write from the same run unit. The history is what the panel needs — a run with a funnel and no
// orders has nothing to show — so the pending half may be null and the panel says so.
const ordersModel = computed(() => orderHistory.value
  ? {
      pending: pendingOrders.value,
      history: orderHistory.value,
      // the TRADES too, and only so a link can be absent where it would lead nowhere: 55 of the
      // measured positions opened and never closed, so they produced no trade at all
      trades: tradeHistory.value,
    }
  : null)

// composed rather than served: the roster says what was DECLARED, the portfolio what it EARNED
// and warnings-errors what WENT WRONG — three responses, one question a reader scans forty rows
// with. Joined on the unit name, which is one identity across all three.
const rosterModel = computed(() => scenarios.value
  ? {
      scenarios: scenarios.value,
      portfolio: portfolio.value,
      warningsErrors: warningsErrors.value,
    }
  : null)

// the models the panels render, keyed by the source each descriptor declares
const sources = computed(() => ({
  header: headerModel.value,
  runSummary: summary.value,
  feedHealth: feedHealth.value,
  warningsErrors: warningsErrors.value,
  portfolio: portfolio.value,
  broker: broker.value,
  aggregated: aggregated.value,
  orders: ordersModel.value,
  bookingPeriods: bookingPeriods.value,
  config: config.value,
  scenarioRoster: rosterModel.value,
  tradeHistory: tradeHistory.value,
}))

/**
 * Which sections are on their way for the run on screen, keyed like `sources`. A panel whose
 * section is coming keeps its place and says so; it leaves the column only once the run is KNOWN
 * not to carry it. Until 2026-10-13 a run change emptied every section at once and each panel left
 * and came back on its own — the column collapsed and rebuilt itself piece by piece, and nothing
 * said it was loading (a selection never moves the layout).
 */
const pending = computed<Record<string, boolean>>(() => ({
  runSummary: loadingSummary.value,
  feedHealth: loadingSummary.value,
  warningsErrors: loadingWarningsErrors.value,
  portfolio: loadingPortfolio.value,
  broker: loadingBroker.value,
  aggregated: loadingAggregated.value,
  orders: loadingOrderHistory.value,
  bookingPeriods: loadingBookingPeriods.value,
  config: loadingConfig.value,
  scenarioRoster: loadingScenarios.value,
  tradeHistory: loadingTradeHistory.value,
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
  broker: 'Broker',
  aggregated: 'Run Totals',
  pendingOrders: 'Pending Orders',
  orderHistory: 'Order History',
  bookingPeriods: 'Booking Periods',
  config: 'Configuration',
  tradeHistory: 'Trade History',
  scenarios: 'Scenarios',
}

const missingSections = computed(() => {
  const all = { ...absences.value }
  if (summaryAbsence.value) all['runSummary'] = summaryAbsence.value
  // the CAUSE is carried, not only grouped by: it is what the list is keyed on below, and the
  // detail it was keyed on before is empty whenever the backend sends no sentence — so two
  // different causes collided on one empty key and Vue was free to reuse the wrong node
  const byCause = new Map<string, { cause: string, detail: string, sections: string[] }>()
  for (const [slot, absence] of Object.entries(all)) {
    const title = slot === 'runSummary' ? t('Executive Summary') : t(SECTION_TITLES[slot] ?? slot)
    const seen = byCause.get(absence.cause)
    if (seen) seen.sections.push(title)
    else byCause.set(absence.cause, { cause: absence.cause, detail: absence.detail, sections: [title] })
  }
  return [...byCause.values()]
})

// Once a run is chosen there is always something to show: the header panel reads the index row.
// PanelColumn drops every panel whose model is absent, so a run without artifacts simply renders
// fewer sections rather than nothing at all.
// The summary loading does not hide them: its panel keeps its place like every other section.
const showPanels = computed(() =>
  !loadingRuns.value && !error.value && !unknownRunId.value && selectedRun.value !== null
)
</script>

<template>
  <div ref="viewRoot" class="runs-view">
    <header class="runs-header">
      <RunPicker />
      <AppBar v-if="showPanels" :sources="sources" :pending="pending" />
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
        <!-- said ONCE above the column: every section below is narrowed, and a reader who forgot
             would otherwise read a single scenario's figures as the run's -->
        <p v-if="unreadable" class="notice">{{ unreadable }}</p>
        <!-- EVERY section that failed says so, and the sections that did load stay visible. One
             line per failure: the sections load concurrently, so a single slot showed whichever
             finished last and silently dropped the rest. -->
        <p v-for="(message, section) in sectionErrors" :key="section" class="notice failed">
          {{ message }}
        </p>
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
