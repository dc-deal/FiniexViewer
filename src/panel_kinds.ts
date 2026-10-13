import { defineAsyncComponent } from 'vue'
import { useRunsStore } from '@/stores/runs_store'
import type { PanelKind, TabStatus } from '@/types/panel_types'
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
    id: 'runs',
    title: t('Runs'),
    description: t('A run and the reports it left behind'),
    icon: 'form-list',
    order: 2,
    opensByDefault: true,
    component: defineAsyncComponent(() => import('@/views/RunsView.vue')),
    quickBar: defineAsyncComponent(() => import('@/components/RunsQuickBar.vue')),
    status: () => outcomeStatus(useRunsStore().selectedRun?.run_outcome ?? null),
  },
  {
    id: 'chart',
    title: t('Chart'),
    description: t('Candles of the market data, by broker, symbol and timeframe'),
    icon: 'form-chart',
    order: 3,
    opensByDefault: true,
    component: defineAsyncComponent(() => import('@/views/ChartView.vue')),
    quickBar: defineAsyncComponent(() => import('@/components/ChartQuickBar.vue')),
  },
]

/** The tab a first arrangement opens on: where the work is, and where the speed is measured. */
export const FIRST_ACTIVE_KIND = 'runs'

/** A kind by its id, or null for one this version does not know — a stored panel can outlive it. */
export function panelKind(id: string): PanelKind | null {
  return PANEL_KINDS.find(kind => kind.id === id) ?? null
}
