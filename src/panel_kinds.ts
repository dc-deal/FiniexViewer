import { defineAsyncComponent } from 'vue'
import type { PanelKind } from '@/types/panel_types'
import { t } from '@/translate'

/**
 * Every kind of docked panel, in the SUGGESTED ORDER: from the general to the particular — a
 * deployment holds runs, a run has its chart (operator, 2026-10-13). The first arrangement and a
 * reset place them so; the reader re-orders freely after that.
 *
 * Each is loaded on demand into its own chunk, the way the routes before them were: a reader
 * opening the run list does not pay for the charting library they have not asked for.
 *
 * Everything the reader keeps open is a panel — `About` included, the way an editor opens its
 * settings as a tab rather than in a window of its own kind. Its way in is the application menu,
 * though, beside the settings: it is about the application, not something to work in.
 */
export const PANEL_KINDS: PanelKind[] = [
  {
    id: 'deployments',
    title: t('Deployments'),
    icon: 'form-list',
    order: 1,
    opensByDefault: true,
    entry: 'panels',
    component: defineAsyncComponent(() => import('@/views/DeploymentsView.vue')),
  },
  {
    id: 'runs',
    title: t('Runs'),
    icon: 'form-list',
    order: 2,
    opensByDefault: true,
    entry: 'panels',
    component: defineAsyncComponent(() => import('@/views/RunsView.vue')),
  },
  {
    id: 'chart',
    title: t('Chart'),
    icon: 'form-chart',
    order: 3,
    opensByDefault: true,
    entry: 'panels',
    component: defineAsyncComponent(() => import('@/views/ChartView.vue')),
  },
  {
    id: 'about',
    title: t('About'),
    icon: 'form-sheet',
    order: 4,
    opensByDefault: false,
    entry: 'application',
    component: defineAsyncComponent(() => import('@/views/AboutView.vue')),
  },
]

/** The tab a first arrangement opens on: where the work is, and where the speed is measured. */
export const FIRST_ACTIVE_KIND = 'runs'

/** A kind by its id, or null for one this version does not know — a stored panel can outlive it. */
export function panelKind(id: string): PanelKind | null {
  return PANEL_KINDS.find(kind => kind.id === id) ?? null
}
