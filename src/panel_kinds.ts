import { defineAsyncComponent, defineComponent, h } from 'vue'
import { allPanels } from '@/panel_registry'
import { useContextStore } from '@/stores/context_store'
import { useLayoutStore } from '@/stores/layout_store'
import { useRunChartStore } from '@/stores/run_chart_store'
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

/** The run bundle's kind: the panel whose column holds the run report's sections as its members. */
export const RUN_BUNDLE = 'run'

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
    // the deployment it follows is the one it chooses itself until a bundle shows it (#43)
    relations: { memberOf: null, follows: ['deployment'], chooses: ['deployment', 'run'] },
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
    // it marks the chosen run on a list that stays whole: a list does not follow the pick it shows
    relations: { memberOf: null, follows: [], chooses: ['run'] },
  },
  {
    /*
     * The BUNDLE a pick opens: the chosen run's report, its sections stacked one below the other as
     * its members, any of which opens as a panel of its own (viewer#31, 2026-10-14). The tab names
     * the run, so two windows comparing two runs can be told apart at a glance — and says *bundle*,
     * the word the glossary gives the container, so the tab, the menu and ⇲ name it alike (#42).
     */
    id: RUN_BUNDLE,
    title: t('Run bundle'),
    subtitle: () => useRunsStore().selectedRunId,
    description: t('The report of the chosen run, its sections one below the other — any of them opens as a panel of its own'),
    icon: 'form-sheet',
    order: 3,
    opensByDefault: true,
    area: 'runs',
    component: defineAsyncComponent(() => import('@/views/RunReportView.vue')),
    status: () => outcomeStatus(useRunsStore().selectedRun?.run_outcome ?? null),
    // what the bundle offers about its own column, on its tab's ⋯ rather than in the Panels menu,
    // which only shows and hides (#42)
    actions: [
      { id: 'collapse-all', title: t('Collapse all'), run: () => useLayoutStore().collapseAll() },
      { id: 'reset-bundle', title: t('Reset bundle'), run: () => useLayoutStore().reset() },
    ],
    // its own line follows the run; what its members follow and choose its card adds while they
    // stand in its column — a member open as a panel of its own takes its links with it
    relations: { memberOf: null, follows: ['run'], chooses: [] },
  },
  {
    /*
     * The RUN-BOUND chart (viewer#31, the item #21 left open): one unit of the chosen run on its
     * candles, its trades marked. Part of the first arrangement, beside the run report, so a trade
     * in the list and its candle are one glance apart (operator, 2026-10-15); with no run chosen it
     * says so and draws nothing.
     */
    id: 'run-chart',
    title: t('Run chart'),
    subtitle: () => useRunChartStore().unit?.name ?? null,
    description: t('One unit of the chosen run on its candles, its positions marked where they opened and its trades where they closed'),
    icon: 'form-chart',
    order: 4,
    opensByDefault: true,
    area: 'runs',
    component: defineAsyncComponent(() => import('@/views/RunChartView.vue')),
    quickBar: defineAsyncComponent(() => import('@/components/RunChartQuickBar.vue')),
    // the position chosen in a list moves what it shows — centred on it, its marks drawn larger —
    // where that position is of the unit on show, so it is followed like the rest
    relations: { memberOf: null, follows: ['run', 'units', 'position'], chooses: ['units'] },
  },
  {
    // the FREE chart: any market, no run — opened from the Panels menu
    id: 'chart',
    title: t('Free chart'),
    description: t('Candles of the market data, by broker, symbol and timeframe'),
    icon: 'form-chart',
    order: 5,
    opensByDefault: false,
    component: defineAsyncComponent(() => import('@/views/ChartView.vue')),
    quickBar: defineAsyncComponent(() => import('@/components/ChartQuickBar.vue')),
    relations: { memberOf: null, follows: ['market'], chooses: ['market'] },
  },
  {
    /*
     * The drawing LAYERS of the chart last in front (viewer#41): each shown or hidden, drawn quiet,
     * in front of or behind the others. Opened from the chart's quick bar, as a narrow split beside
     * the chart it arranges — never as a tab over it.
     */
    id: 'layers',
    title: t('Layers'),
    description: t('What the chart last in front draws beside its candles, layer by layer — shown or hidden, quiet, in front of or behind the others'),
    icon: 'form-list',
    order: 6,
    opensByDefault: false,
    component: defineAsyncComponent(() => import('@/views/LayersView.vue')),
    relations: { memberOf: null, follows: [], chooses: [], chartInFront: true },
  },
]

/**
 * The tab a first arrangement opens on: where the work is — the run report where a run is restored,
 * the run list where none is yet (viewer#31, decided 2026-10-14).
 */
export function firstActiveKind(): string {
  return useContextStore().main.run.id !== null ? RUN_BUNDLE : 'runs'
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
    description: t('This section as a panel of its own — “Back into the bundle” on its tab puts it back'),
    icon: LIST_SECTIONS.has(section.id) ? 'form-list' : 'form-sheet',
    order: PANEL_KINDS.length + 1 + index,
    opensByDefault: false,
    // the section's own id travels as a prop, so the one component serves every section
    component: defineAsyncComponent(async () => {
      const { default: ReportSection } = await import('@/components/dock/ReportSection.vue')
      return defineComponent({ name: 'ReportSectionPanel', setup: () => () => h(ReportSection, { sectionId: section.id }) })
    }),
    status: () => useRunSectionsStore().failuresOf(section.source).length
      ? { icon: 'status-error', word: t('could not be loaded'), role: 'error' }
      : null,
    muted: () => useRunSectionsStore().lacks(section.source),
    relations: { memberOf: RUN_BUNDLE, follows: section.follows, chooses: section.chooses },
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

/** Every kind there is: the top level and one per section of the run report. */
export function allPanelKinds(): PanelKind[] {
  return [...PANEL_KINDS, ...REPORT_KINDS]
}
