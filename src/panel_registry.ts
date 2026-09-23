import RunHeaderPanel from '@/components/runs/RunHeaderPanel.vue'
import ExecutivePanel from '@/components/runs/ExecutivePanel.vue'
import WarningsErrorsPanel from '@/components/runs/WarningsErrorsPanel.vue'
import PortfolioPanel from '@/components/runs/PortfolioPanel.vue'
import BookingPeriodsPanel from '@/components/runs/BookingPeriodsPanel.vue'
import ConfigPanel from '@/components/runs/ConfigPanel.vue'
import TradeHistoryPanel from '@/components/runs/TradeHistoryPanel.vue'
import OrderCountsPanel from '@/components/runs/OrderCountsPanel.vue'
import FeedHealthPanel from '@/components/runs/FeedHealthPanel.vue'
import type { PanelDescriptor } from '@/types/panel_types'

/**
 * Every panel the workspace can show, in the backend's canonical report order.
 *
 * A plain declarative list rather than a register() call: with a static import graph the order is
 * then explicit and cannot depend on which module happened to load first. The app bar renders
 * from this list, so a new panel is an entry here, not a rebuild.
 */
const PANELS: PanelDescriptor[] = [
  {
    // Identity and provenance, from the run index row the store already holds — no request of
    // its own, and the one section that answers for a run carrying no report artifacts at all.
    id: 'run-header',
    title: 'Run Header',
    icon: '🏷',
    component: RunHeaderPanel,
    source: 'runInfo',
    groups: 'all',
    defaultOpen: true,
  },
  {
    // Provenance, beside the header: what the run was COMMISSIONED with, resolved from the
    // run-config store. Closed by default — reference material rather than a headline.
    id: 'config',
    title: 'Configuration',
    icon: '⚙',
    component: ConfigPanel,
    source: 'config',
    groups: 'all',
    defaultOpen: false,
  },
  {
    id: 'executive',
    title: 'Executive Summary',
    icon: '📊',
    component: ExecutivePanel,
    source: 'runSummary',
    groups: 'all',
    defaultOpen: true,
  },
  {
    // Deliberately second, ahead of the console's own late placement: "can this run be trusted"
    // gates reading the numbers below it, and a screen is not read top-to-bottom like a printout.
    id: 'warnings-errors',
    title: 'Warnings & Errors',
    icon: '⚠️',
    component: WarningsErrorsPanel,
    source: 'warningsErrors',
    groups: 'all',
    defaultOpen: true,
  },
  {
    // The breakdown run-summary cannot give: its currency rows are already summed over the units
    id: 'portfolio',
    title: 'Portfolio',
    icon: '💼',
    component: PortfolioPanel,
    source: 'portfolio',
    groups: 'all',
    defaultOpen: true,
  },
  {
    // The bookkeeping stretches the run was divided into, and the completeness check over them.
    // Absent on every run from before the journal existed, which PanelColumn handles by dropping
    // the panel rather than showing it empty.
    id: 'booking-periods',
    title: 'Booking Periods',
    icon: '📅',
    component: BookingPeriodsPanel,
    source: 'bookingPeriods',
    groups: 'all',
    defaultOpen: true,
  },
  {
    // The only place the individual trades exist — every other section is already summed over
    // them. Absent on a run that closed no position.
    id: 'trade-history',
    title: 'Trade History',
    icon: '📒',
    component: TradeHistoryPanel,
    source: 'tradeHistory',
    groups: 'all',
    defaultOpen: false,
  },
  {
    id: 'order-counts',
    title: 'Order Counts',
    icon: '🧾',
    component: OrderCountsPanel,
    source: 'runSummary',
    groups: 'all',
    defaultOpen: true,
  },
  {
    id: 'feed-health',
    title: 'Feed Health',
    icon: '📡',
    component: FeedHealthPanel,
    // its own source, not the shared summary: the store answers null where neither half of this
    // panel has anything to say, and PanelColumn then drops it like any absent section
    source: 'feedHealth',
    groups: 'all',
    defaultOpen: false,
  },
]

export function allPanels(): PanelDescriptor[] {
  return PANELS
}

export function panelById(id: string): PanelDescriptor | undefined {
  return PANELS.find(panel => panel.id === id)
}
