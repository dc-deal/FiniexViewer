import { defineAsyncComponent, defineComponent, h } from 'vue'
import { allPanels } from '@/panel_registry'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunSectionsStore } from '@/stores/run_sections_store'
import type { PanelDescriptor, PanelKind, TabStatus } from '@/types/panel_types'
import { t } from '@/translate'

/**
 * The backend's grade of the open run where it is not a success — `run_outcome` as it is served,
 * marked by the weight of its word. Where everything went well, the tab says nothing; a grade this
 * version does not know is shown as itself, beside the warning mark.
 */
function outcomeStatus(outcome: string | null): TabStatus | null {
  if (!outcome || outcome === 'success') return null
  const failed = outcome === 'failed' || outcome === 'crashed'
  return { icon: failed ? 'status-error' : 'status-warning', word: outcome, role: failed ? 'error' : 'warning' }
}

/**
 * Every kind of docked panel, in the SUGGESTED ORDER: from the general to the particular — a
 * deployment holds runs, a run has its chart (operator, 2026-10-13). The first arrangement and a
 * reset place them so; the reader re-orders freely after that.
 *
 * Each is loaded on demand into its own chunk, the way the routes before them were: a reader
 * opening the run list does not pay for the charting library they have not asked for.
 *
 * Everything the reader keeps open is a panel. What is set or read and then closed — the settings,
 * About — is a dialog instead, and has no kind here.
 */
export const PANEL_KINDS: PanelKind[] = [
  {
    id: 'deployments',
    title: t('Deployments'),
    description: t('The sessions of a deployment, across its restarts'),
    icon: 'form-list',
    order: 1,
    opensByDefault: true,
    component: defineAsyncComponent(() => import('@/views/DeploymentsView.vue')),
  },
  {
    // the LIST: a pick here chooses the run and brings its report to the front
    id: 'runs',
    title: t('Runs'),
    menuTitle: t('Run list'),
    description: t('The runs the backend has stored — pick one to read its report'),
    icon: 'form-list',
    order: 2,
    opensByDefault: true,
    area: 'runs',
    component: defineAsyncComponent(() => import('@/views/RunsView.vue')),
  },
  {
    /*
     * The BUNDLE a pick opens: the chosen run's report, its sections stacked one below the other as
     * its members, any of which opens as a panel of its own (viewer#31, 2026-10-14). The tab names
     * the run, so two windows comparing two runs can be told apart at a glance.
     */
    id: 'run',
    title: t('Run'),
    menuTitle: t('Run report'),
    subtitle: () => useRunsStore().selectedRunId,
    description: t('A run and the reports it left behind'),
    icon: 'form-sheet',
    order: 3,
    opensByDefault: true,
    area: 'runs',
    component: defineAsyncComponent(() => import('@/views/RunReportView.vue')),
    quickBar: defineAsyncComponent(() => import('@/components/RunsQuickBar.vue')),
    status: () => outcomeStatus(useRunsStore().selectedRun?.run_outcome ?? null),
  },
  {
    id: 'chart',
    title: t('Chart'),
    description: t('Candles of the market data, by broker, symbol and timeframe'),
    icon: 'form-chart',
    order: 4,
    opensByDefault: true,
    component: defineAsyncComponent(() => import('@/views/ChartView.vue')),
    quickBar: defineAsyncComponent(() => import('@/components/ChartQuickBar.vue')),
  },
]

/**
 * The tab a first arrangement opens on: where the work is — the run report where a run is restored,
 * the run list where none is yet (viewer#31, decided 2026-10-14).
 */
export function firstActiveKind(): string {
  return useContextStore().main.run.id !== null ? 'run' : 'runs'
}

/** The sections whose panel is a LIST; every other section reads as a sheet of figures. */
const LIST_SECTIONS = new Set(['scenario-roster', 'trade-history', 'orders', 'booking-periods'])

const REPORT_PREFIX = 'report-'

/** A section's panel kind — one id scheme, so the column, the Panels menu and the dock agree on it. */
export function reportKindId(sectionId: string): string {
  return `${REPORT_PREFIX}${sectionId}`
}

/** The section a kind shows, or null for a kind that is not a section of the run report. */
export function sectionOfKind(kindId: string): string | null {
  return kindId.startsWith(REPORT_PREFIX) ? kindId.slice(REPORT_PREFIX.length) : null
}

function reportKind(section: PanelDescriptor, index: number): PanelKind {
  return {
    id: reportKindId(section.id),
    title: t(section.title),
    description: t('A section of the run report as a panel of its own — ⇲ puts it back in the column'),
    icon: LIST_SECTIONS.has(section.id) ? 'form-list' : 'form-sheet',
    order: PANEL_KINDS.length + 1 + index,
    opensByDefault: false,
    // the section's own id travels as a prop, so the one component serves every section
    component: defineAsyncComponent(async () => {
      const { default: ReportSection } = await import('@/components/dock/ReportSection.vue')
      return defineComponent({ name: 'ReportSectionPanel', setup: () => () => h(ReportSection, { sectionId: section.id }) })
    }),
    // the narrowing is said beside every section it reaches, and only there: a section it does not
    // change would carry a statement about something else
    ...(section.narrowing ? { quickBar: defineAsyncComponent(() => import('@/components/RunsQuickBar.vue')) } : {}),
    status: () => useRunSectionsStore().failuresOf(section.source).length
      ? { icon: 'status-error', word: t('could not be loaded'), role: 'error' }
      : null,
    muted: () => useRunSectionsStore().lacks(section.source),
  }
}

/**
 * The run report's sections, each of which opens as a panel of its own beside the column — the
 * run report stays one column, and a section the reader wants beside another is pulled out
 * (viewer#31, decided 2026-10-14). Not kinds of the menu's top level: the Panels menu lists them in
 * the submenu of the panel their column stands in, with where each one is. A section is in one
 * place at a time.
 */
const REPORT_KINDS: PanelKind[] = allPanels().map(reportKind)

/** A kind by its id, or null for one this version does not know — a stored panel can outlive it. */
export function panelKind(id: string): PanelKind | null {
  return PANEL_KINDS.find(kind => kind.id === id) ?? REPORT_KINDS.find(kind => kind.id === id) ?? null
}
