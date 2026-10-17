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
 * rather than a position — see viewer#31, whose tabs carry one.
 *
 * Changed 2026-10-07 after days of use rather than from the armchair, and the order was measured
 * against its own principle first: Broker sat fifth, Feed Health last although it is a trust
 * question, and Orders separated the breakdown from itself.
 *
 * A plain declarative list rather than a register() call: with a static import graph the order is
 * explicit and cannot depend on which module happened to load first. The column and the Panels menu
 * render from this list, so a new panel is an entry here, not a rebuild.
 *
 * A STORED layout keeps its own order — reconciliation appends what is new rather than reshuffling
 * what the user arranged — so this order reaches an existing workspace only through Reset bundle.
 */
const PANELS: PanelDescriptor[] = [
  {
    id: 'executive',
    title: 'Executive Summary',
    icon: 'kind-executive',
    component: ExecutivePanel,
    source: 'runSummary',
    defaultOpen: true,
    // it READS the narrowing and still narrows nothing: its figures are the whole run's, and its
    // own scope line says so where a narrowing is set — a note or a frame beside it would contradict
    narrowing: null,
    follows: ['run'],
    chooses: [],
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
    icon: 'kind-broker',
    component: BrokerPanel,
    source: 'broker',
    defaultOpen: true,
    narrowing: null,
    follows: ['run'],
    chooses: [],
  },
  {
    // Ahead of the breakdowns: it is the only COMPLETE list of what the run set out to do, and a
    // scenario that produced nothing appears in no other section. Backtests only — a session has
    // no scenario grid, so the source is absent and the panel is dropped.
    id: 'scenario-roster',
    title: 'Scenarios',
    icon: 'kind-scenario-roster',
    component: ScenarioRosterPanel,
    source: 'scenarioRoster',
    defaultOpen: false,
    narrowing: 'marks',
    // it MARKS the scenario in focus on a list that stays whole, so it does not follow it — it chooses it
    follows: ['run'],
    chooses: ['units'],
  },
  {
    // The bookkeeping stretches the run was divided into, and the completeness check over them.
    // Absent on every run from before the journal existed, which PanelColumn handles by dropping
    // the panel rather than showing it empty.
    id: 'booking-periods',
    title: 'Booking Periods',
    icon: 'kind-booking-periods',
    component: BookingPeriodsPanel,
    source: 'bookingPeriods',
    defaultOpen: true,
    narrowing: 'filters',
    follows: ['run', 'units'],
    chooses: [],
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
    icon: 'kind-aggregated-portfolio',
    component: AggregatedPortfolioPanel,
    source: 'aggregated',
    defaultOpen: false,
    narrowing: null,
    follows: ['run'],
    chooses: [],
  },
  {
    // The only place the individual trades exist — every other section is already summed over
    // them. Absent on a run that closed no position.
    id: 'trade-history',
    title: 'Trade History',
    icon: 'kind-trade-history',
    component: TradeHistoryPanel,
    source: 'tradeHistory',
    defaultOpen: false,
    narrowing: 'filters',
    // the position it chooses only marks its rows, so it is not followed here; the run chart centres on it
    follows: ['run', 'units'],
    chooses: ['position'],
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
    icon: 'kind-orders',
    component: OrdersPanel,
    source: 'orders',
    defaultOpen: false,
    narrowing: 'filters',
    follows: ['run', 'units'],
    chooses: ['position'],
  },
  {
    // Deliberately second, ahead of the console's own late placement: "can this run be trusted"
    // gates reading the numbers below it, and a screen is not read top-to-bottom like a printout.
    id: 'warnings-errors',
    title: 'Warnings & Errors',
    icon: 'kind-warnings-errors',
    component: WarningsErrorsPanel,
    source: 'warningsErrors',
    defaultOpen: true,
    narrowing: 'filters',
    follows: ['run', 'units'],
    chooses: [],
  },
  {
    id: 'feed-health',
    title: 'Feed Health',
    icon: 'kind-feed-health',
    component: FeedHealthPanel,
    // its own source, not the shared summary: the store answers null where neither half of this
    // panel has anything to say, and PanelColumn then drops it like any absent section
    source: 'feedHealth',
    defaultOpen: false,
    narrowing: null,
    follows: ['run'],
    chooses: [],
  },
  {
    // Provenance, beside the header: what the run was COMMISSIONED with, resolved from the
    // run-config store. Closed by default — reference material rather than a headline.
    id: 'config',
    title: 'Configuration',
    icon: 'kind-config',
    component: ConfigPanel,
    source: 'config',
    defaultOpen: false,
    narrowing: null,
    follows: ['run'],
    chooses: [],
  },
  {
    /*
     * Identity and provenance, from TWO sources that answer different questions. The index row is
     * always there. The served header (contract 26) adds the two things the row cannot carry:
     * which code ran — every repository's commit and dirtiness, every worker's version — and
     * whether uncommitted code was explicitly allowed to place real orders.
     *
     * It remains the one section that answers for a run carrying no report artifacts at all, and
     * that is now true of the ROUTE as well: measured 2026-10-10 on all three logs-only runs here,
     * the header answers 200 while `artifacts` is empty.
     */
    id: 'run-header',
    title: 'Run Header',
    icon: 'kind-run-header',
    component: RunHeaderPanel,
    source: 'header',
    // Provenance rather than a headline: which artifact am I looking at. Folded by default —
    // the reader who needs it opens it, and the one who never does hides it.
    defaultOpen: false,
    narrowing: null,
    // its link to a deployment exists on a deployment's session only, so it is not claimed for every run
    follows: ['run'],
    chooses: [],
  },
]

export function allPanels(): PanelDescriptor[] {
  return PANELS
}

export function panelById(id: string): PanelDescriptor | undefined {
  return PANELS.find(panel => panel.id === id)
}
