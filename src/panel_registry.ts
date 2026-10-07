import RunHeaderPanel from '@/components/runs/RunHeaderPanel.vue'
import ExecutivePanel from '@/components/runs/ExecutivePanel.vue'
import WarningsErrorsPanel from '@/components/runs/WarningsErrorsPanel.vue'
import BookingPeriodsPanel from '@/components/runs/BookingPeriodsPanel.vue'
import BrokerPanel from '@/components/runs/BrokerPanel.vue'
import AggregatedPortfolioPanel from '@/components/runs/AggregatedPortfolioPanel.vue'
import OrdersPanel from '@/components/runs/OrdersPanel.vue'
import ScenarioRosterPanel from '@/components/runs/ScenarioRosterPanel.vue'
import ConfigPanel from '@/components/runs/ConfigPanel.vue'
import TradeHistoryPanel from '@/components/runs/TradeHistoryPanel.vue'
import FeedHealthPanel from '@/components/runs/FeedHealthPanel.vue'
import type { PanelDescriptor } from '@/types/panel_types'

/**
 * Every panel the workspace can show, in the order a reader asks for them.
 *
 * **The verdict · the UNIT it is denominated in · what ran · when · the sum · the evidence ·
 * whether to trust it · the provenance.** That is the sequence a report is read in, and it
 * deliberately replaces the backend's canonical report order — which is right for a printout and
 * wrong for a screen, where nothing is read top to bottom.
 *
 * **The unit is a category the earlier principle did not have, and its absence misplaced Broker.**
 * It was filed as provenance and sat fifth among the breakdowns. It is not provenance: market type,
 * symbol, contract size, swap and margin mode decide what a figure MEANS. `Net P&L 42.93 EUR`
 * without knowing whether that is a 0.01-lot forex scalp or a spot crypto position is a number
 * without a unit, so Broker reads second — before anything it qualifies.
 *
 * **Warnings & Errors reads eighth, and that is deliberate.** An aborted scenario mistaken for a
 * result is the misreading this project most fears, but a broken run is the EXCEPTION: the daily
 * work is reading balance sheets, and a default serves the rule. The exception needs a SIGNAL
 * rather than a position — see viewer#31, which also makes the bar able to carry one.
 *
 * Changed 2026-10-07 after days of use rather than from the armchair, and the order was measured
 * against its own principle first: Broker sat fifth, Feed Health last although it is a trust
 * question, and Orders separated the breakdown from itself.
 *
 * A plain declarative list rather than a register() call: with a static import graph the order is
 * explicit and cannot depend on which module happened to load first. The app bar renders from this
 * list, so a new panel is an entry here, not a rebuild.
 *
 * A STORED layout keeps its own order — reconciliation appends what is new rather than reshuffling
 * what the user arranged — so this order reaches an existing workspace only through Reset layout.
 */
const PANELS: PanelDescriptor[] = [
  {
    id: 'executive',
    title: 'Executive Summary',
    icon: '📊',
    component: ExecutivePanel,
    source: 'runSummary',
    defaultOpen: true,
  },
  {
    /*
     * The CONDITIONS a run traded under, and it replaces the portfolio panel rather than renaming
     * it: what each account earned is the scenario roster's row and its card now, while what rules
     * it traded under had no home at all. Open by default, because a run using several brokers is
     * a caveat about every other panel in the column and a reader must not have to look for it.
     */
    id: 'broker',
    title: 'Broker',
    icon: '🏦',
    component: BrokerPanel,
    source: 'broker',
    defaultOpen: true,
  },
  {
    // Ahead of the breakdowns: it is the only COMPLETE list of what the run set out to do, and a
    // scenario that produced nothing appears in no other section. Backtests only — a session has
    // no scenario grid, so the source is absent and the panel is dropped.
    id: 'scenario-roster',
    title: 'Scenarios',
    icon: '🗂️',
    component: ScenarioRosterPanel,
    source: 'scenarioRoster',
    defaultOpen: false,
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
    defaultOpen: true,
  },
  {
    /*
     * What the run came to, folded over its scenarios — and only the figures no other panel on the
     * page states: the run-wide cost split, the highest equity ANY account reached, the realised
     * balance beside the equity, the averages behind the profit factor.
     *
     * CLOSED by default, and that is the disclosure it was asked for: the panel shell already
     * collapses, so the fold nests here rather than inside the Executive Summary, whose prop
     * contract would have had to be rebuilt to carry a second model.
     */
    id: 'aggregated-portfolio',
    title: 'Run Totals',
    icon: 'Σ',
    component: AggregatedPortfolioPanel,
    source: 'aggregated',
    defaultOpen: false,
  },
  {
    // The only place the individual trades exist — every other section is already summed over
    // them. Absent on a run that closed no position.
    id: 'trade-history',
    title: 'Trade History',
    icon: '📒',
    component: TradeHistoryPanel,
    source: 'tradeHistory',
    defaultOpen: false,
  },
  {
    /*
     * Why an order did not become what it was meant to be. Every other section answers what the run
     * DID; this one is the only place a rejection is traceable to the order that was refused —
     * measured, one unit resolved 527 orders and filled none while every other panel of that run
     * looked normal. Closed by default: it is evidence, and a reader opens it with a question.
     *
     * ONE entry where there were two. `pending-orders` and `order-history` describe the same orders
     * from two sides, and a reader who saw the funnel in one panel could reach no single order of
     * it from the other. The funnel is the group heading now; the orders are the rows.
     */
    id: 'orders',
    title: 'Orders',
    icon: '⏳',
    component: OrdersPanel,
    source: 'orders',
    defaultOpen: false,
  },
  {
    // Deliberately second, ahead of the console's own late placement: "can this run be trusted"
    // gates reading the numbers below it, and a screen is not read top-to-bottom like a printout.
    id: 'warnings-errors',
    title: 'Warnings & Errors',
    icon: '⚠️',
    component: WarningsErrorsPanel,
    source: 'warningsErrors',
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
    defaultOpen: false,
  },
  {
    // Provenance, beside the header: what the run was COMMISSIONED with, resolved from the
    // run-config store. Closed by default — reference material rather than a headline.
    id: 'config',
    title: 'Configuration',
    icon: '⚙',
    component: ConfigPanel,
    source: 'config',
    defaultOpen: false,
  },
  {
    // Identity and provenance, from the run index row the store already holds — no request of
    // its own, and the one section that answers for a run carrying no report artifacts at all.
    id: 'run-header',
    title: 'Run Header',
    icon: '🏷',
    component: RunHeaderPanel,
    source: 'runInfo',
    // Provenance rather than a headline: which artifact am I looking at. Folded by default —
    // the reader who needs it opens it, and the one who never does hides it from the bar.
    defaultOpen: false,
  },
]

export function allPanels(): PanelDescriptor[] {
  return PANELS
}

export function panelById(id: string): PanelDescriptor | undefined {
  return PANELS.find(panel => panel.id === id)
}
