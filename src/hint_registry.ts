import type { HintDefinition } from '@/types/hint_types'
import { t } from '@/translate'

/**
 * Every explanation the app gives, in ONE list (viewer#24).
 *
 * Central rather than a string inside each component: the texts are the only place the app
 * explains itself, and they are worth reading as a set — an explanation that contradicts another is
 * invisible while they sit in twenty files. Each is shown in one of three forms (operator,
 * 2026-11-19): a help card — its name and its first sentence — while the pointer rests on its ⓘ, the
 * whole text at a click, or the fixed sentence of an empty area. Nothing stands in the layout and
 * nothing is put away. Which panel offers which is `panel_help.ts`.
 */
const HINTS: HintDefinition[] = [
  {
    id: 'scenario-pick',
    name: t('Scenario roster'),
    text: t('Click a scenario to focus on it: the lists show only its trades and booking periods, and the run chart shows it. Click it again to show the whole run.'),
  },
  {
    id: 'quick-bar',
    name: t('Quick bar'),
    text: t('The bar beside the tabs holds what the panel in front shows — for the free chart its broker, symbol and timeframe, for the run chart its unit and timeframe, Layers, which opens beside it what it draws, and, where the bar has room, the link button, which copies a link to the view on show: opened, it chooses the same run, scenario, position and stretch as a click would, the layout by run switching as set.'),
  },
  {
    id: 'open-as-panel',
    name: t('A section as a panel'),
    text: t('Hover the header of a section for the button that opens it as a panel of its own, beside the bundle. On the tab of that panel, “Back into the bundle” puts it back and its cross hides it — the Panels menu lists every section and shows a hidden one again.'),
  },
  {
    id: 'beyond-the-venue',
    name: t('Beyond the venue'),
    text: t("This backtest was allowed order features its venue's API does not hold, as its scenario set declared. Its results do not predict a session on that venue."),
  },
  {
    id: 'first-start',
    name: t('First start'),
    text: t('A declared first start is the one way a session trading real money starts without a carry-over to continue.'),
  },
  {
    id: 'run-membership',
    name: t('Deployment or sweep'),
    text: t("The id of the deployment or the sweep this run belongs to opens it: the deployment's history, or the sweep's ranking."),
  },
  {
    id: 'servers',
    name: t('Servers'),
    text: t('A server is one installation of the API, as an address and a token. Each browser window shows one, and switching reloads the page: the arrangement stays, and the selection comes back as you left it on that server. A token can be set here and never read back. A tunnel needs its key files in the folder user_configs/credentials.'),
  },
  {
    id: 'bundle-places',
    name: t('Sections of a bundle'),
    text: t('A bundle holds its sections one below the other, and any of them can stand apart as a panel of its own. Each row here says where it stands. A section in a closed bundle is on show nowhere: a click opens it.'),
  },
  {
    id: 'bundle-commands',
    name: t('Bundle commands'),
    text: t('The dots on the tab of the bundle fold every section at once, or resets the bundle — its sections back in their first order, none of them hidden.'),
  },
  {
    id: 'panel-maximize',
    name: t('The whole window'),
    text: t('A double-click on a tab gives its panel the whole window; again, or Esc, or the arrows on its tab give the panels their places back. A pick inside it keeps it large, and the layout is stored without it.'),
  },
  {
    id: 'dock-edges',
    name: t('Docking along an edge'),
    text: t('Drag a tab to the outermost edge of the panels to dock it along that whole edge — a column over the full height, a row over the full width.'),
  },
  {
    id: 'facet-bar',
    name: t('Filters and search'),
    text: t('The magnifier opens the search. Where the panel is narrow, the filters that do not fit wait behind +N, each with its values and counts.'),
  },
  {
    id: 'run-families',
    name: t('Runs folded by family'),
    text: t('A set or a deployment stands as its newest run: a click on its line chooses that run, and the triangle with a number in the first column opens that many runs before it. A sweep keeps a line of its own, its triangle opening all its runs. Parent says what a run belongs to.'),
  },
  {
    id: 'activities',
    name: t('Activities'),
    text: t("What runs on the machine right now, read every few seconds while this panel is on show. An activity that runs inside another stands beneath it, and its memory is that one's. Its label opens its run, or its sweep. Rest the pointer on a row for its command line, its code and who started it."),
  },
  {
    id: 'venue-account',
    name: t('Venue account'),
    text: t('What the venue itself held, beside the books the session keeps, in the asset codes of the venue and never rounded. Not read means the venue could not be read; not listed means it did not name the asset. Every read opens what the venue answered, in the order it came.'),
  },
  {
    id: 'layouts',
    name: t('Layouts'),
    text: t('A layout holds where the panels stand and nothing they show: loading one from the Layouts menu moves the panels and leaves the run, the deployment and every filter as they are. Changes go into the layout you loaded, and into the size you loaded it in: Full, Medium and Mobile are each a placement of their own, chosen in the submenu of the layout. A shipped layout keeps its name, and Reset brings every size back as shipped.'),
  },
  {
    id: 'layout-by-run',
    name: t('Layout by run'),
    text: t('Picking a run chooses its layout: a backtest the first, an AutoTrader session or a deployment the second. Offer it puts the layout beside the Layouts menu, as its name, where another one is loaded; Switch to it loads it at the pick, never when the page is opened again; Off leaves the layout to you.'),
  },
  {
    id: 'size-by-window',
    name: t('Size by window'),
    text: t('When on, the width of the window chooses the size of the loaded layout: Mobile below the first width, Medium below the second, Full from there. It changes once the window rests after crossing a width; a size chosen in the menu holds until then.'),
  },
  {
    id: 'suggested-order',
    name: t('Suggested order'),
    text: t('Deployments, Runs and the run bundle as tabs in one group, the run chart beside them in a wide window and among them in a narrow one — in front, the bundle where a run is chosen and the run list where none is. No layout is loaded after it.'),
  },
  {
    id: 'deployment-sessions',
    name: t('Deployment sessions'),
    text: t('The dot opens what a recording session is doing now. A run id opens that run. Where a session changed its configuration, before and after open the configuration of the session above the mark and of the one carrying it, each compared with the other. Unfinished counts the runs that never reached their close, a session running now among them — they stand among the sessions too, so the two counts overlap and are never added. A session without booked figures stands under that heading: one that has sealed no trading day yet with dashes, one that failed before it measured anything marked ✖ failed. Where its code moved, the line says which repository, how far and the message of the commit, and its card names the commits.'),
  },
  {
    id: 'sweeps',
    name: t('Sweeps'),
    text: t("Every parameter search on record. Open one to see its combinations in the order the backend ranked them, by the objective the sweep declared — a star marks the first, and any tied with it, where it states a figure. A click on a combination chooses its run, as the run list does. The card on a sweep's line says what it searched and what each warning word on it means."),
  },
  {
    id: 'layers',
    name: t('Layers'),
    text: t('Front layer first: drag a layer by its grip to put it in front of or behind the others. The lever shows or hides it, the level sets how strongly it is drawn, and a click on it opens its options. The candles stay behind them all, and the volume behind the candles.'),
  },
  // what a layer draws and what its option does — at the top of its opened row, so the options below
  // stand plain (operator, 2026-10-28)
  {
    id: 'layer-trades',
    name: t('Trades'),
    text: t('Where each position opened and each trade closed. With signs, each exit carries its sign and each gathered mark its count, beside its shape.'),
  },
  {
    id: 'layer-entry-exit',
    name: t('Entry and exit'),
    text: t('Where each trade of the position looked at entered, and where it left. With every position, the lines of every position of the unit.'),
  },
  {
    id: 'layer-levels',
    name: t('Levels'),
    text: t('The stop loss and take profit in force when a trade closed, drawn at its exit — where they stood before is not recorded. A level the strategy keeps itself is known only where it fired. With every position, the levels of every position of the unit.'),
  },
  {
    id: 'layer-candles',
    name: t('Candles'),
    text: t('The price of each bar, behind the drawings — as candles, OHLC bars, a line or an area of the close. Frame and Background set the pane of the candles apart from the panes below it.'),
  },
  {
    id: 'layer-volume',
    name: t('Volume'),
    text: t('What traded in each bar — or how many ticks it held, where the venue prints no trades. In a pane of its own below the candles, on its own scale: drag the line between them to share the height differently, and the chart keeps it. Frame and Background set its pane apart. Its option off, it stands in the lowest fifth of the pane of the candles, behind them.'),
  },
  // why a layer that is shown draws nothing — on the layer's name in the Layers panel, and behind its ⓘ,
  // only while it does
  {
    id: 'layer-empty-levels',
    name: t('Levels'),
    text: t('The levels are drawn for the position looked at — choose one in the trade history or the orders — or for every position where that is switched on. A position that set no stop and no target has none to draw, and a level its strategy keeps itself is known only where it fired.'),
  },
  {
    id: 'layer-empty-entry-exit',
    name: t('Entry and exit'),
    text: t('The entry–exit line is drawn for the position looked at — choose one in the trade history or the orders — or for every position where that is switched on. A trade that entered and left in one candle draws no line.'),
  },
  {
    id: 'layer-empty-trades',
    name: t('Trades'),
    text: t('The trades are marked where the unit on show opened a position in the window drawn — this one opened none.'),
  },
  {
    id: 'layer-state-frame',
    name: t('State frame'),
    text: t('The state frame on show in the player of the Latest state frame section: a dashed line where it stands on the session clock. It moves with each step.'),
  },
  {
    id: 'layer-empty-state-frame',
    name: t('State frame'),
    text: t('The frame on show in the Latest state frame section stands here as a dashed line, where a session records its frames.'),
  },
  {
    id: 'layer-periods',
    name: t('Booking periods'),
    text: t('The booking periods of the unit on show, in a strip along the bottom of the chart: each from the bar it opened in to the bar it closed in, quiet in the colour of its result, its sign inside where it fits. Rest the pointer on one for its card; its bounds then run through the candles.'),
  },
  {
    id: 'layer-empty-periods',
    name: t('Booking periods'),
    text: t('The unit on show has no booking period on the bars loaded: a run books a period when it seals one, and a period of another unit is drawn on that unit.'),
  },
  {
    id: 'layer-refusals',
    name: t('Refused orders'),
    text: t('Orders of the unit on show that were refused — denied before anything was sent, rejected by the venue, or any other refusal the Orders panel marks — as a cross, and orders that ran out without filling as a ring, in a row above the booking periods. They have no price, so they stand at the time they ended. Several close together are drawn as one with a count; zoom in to draw them apart.'),
  },
  {
    id: 'symbol-filter',
    name: t('Symbol filter'),
    text: t("Symbol narrows the rows to the instruments picked, within the scenario in focus, and is kept for the run. Where it leaves out some of a unit's rows, the unit's heading still shows the total the run served for the whole unit, marked so — nothing is added up from the rows on show."),
  },
  {
    id: 'layer-resting-orders',
    name: t('Resting orders'),
    text: t('Orders of the unit on show that rested at the venue, each dotted on its price from where the venue took it to the step that ended it — filled, cancelled, expired — with its words where it begins. A moved price continues the same order. Rest the pointer on one to see how it ended.'),
  },
  {
    id: 'layer-empty-resting-orders',
    name: t('Resting orders'),
    text: t('No order of the unit on show rested at a price on the bars loaded: a market order fills at once, and a run without an order-event stream has none to show.'),
  },
  {
    id: 'chart-marks',
    name: t('Marks on the chart'),
    text: t('↑↓ a position opened · ● a trade closed, + − 0 its result · ×3 several drawn as one — rest the pointer on one to see which'),
  },
  {
    id: 'layer-workers',
    name: t('Workers’ layers'),
    text: t("The eye beside a group hides everything in it and keeps each layer's own switch: shown again, every layer stands as it was set. A row its group hides is faint. The letters before a series are the timeframe its worker was served, and its opened row names the worker and shows each of its lines as the chart draws it."),
  },
  {
    id: 'layer-indicator',
    name: t('Indicator series'),
    text: t('What a worker of the strategy computed, one value per bar of its own timeframe — on the candles or in a pane of its own. Drawn as the run recorded it when it started, and on its own timeframe and every finer one. In a pane of its own, the first of its series sets the pane apart with a frame and a background.'),
  },
  {
    id: 'layer-empty-indicator',
    name: t('Indicator series'),
    text: t('A worker\'s series stands on its own timeframe and every finer one: on a coarser chart its values would fall between the candles. Choose its timeframe or a finer one in the chart\'s bar.'),
  },
  {
    id: 'chart-panes',
    name: t('Panes'),
    text: t("Drag the line between two panes to share the height, and double-click it for the first heights. Over a pane, its controls show behind its figures: the eye shows or hides what the candles' pane draws, the cross closes a pane of its own, and the arrows give it the whole height, the others folded to their line of figures — and the heights back. ▾ under the figures folds the series' lines away."),
  },
  {
    id: 'trade-slippage',
    name: t('Slippage'),
    text: t("A trade's card gives its slippage: how far the fills landed from the mid when the order was sent — half the spread for a market fill — or, marked vs SL/TP level, from the level that closed it."),
  },
  {
    id: 'position-link',
    name: t('Position links'),
    text: t('A position id goes to the other list — from an order to the trades it produced, and back; the chart mark beside it opens the run chart on that position. A partial close books several trades of one position, so all of them are marked.'),
  },
]

/** The hint with this id, or null where none is registered — an unknown id renders nothing. */
export function hintById(id: string): HintDefinition | null {
  return HINTS.find(hint => hint.id === id) ?? null
}

/** Every registered id. */
export function hintIds(): string[] {
  return HINTS.map(hint => hint.id)
}

/**
 * The first sentence of an explanation, for its help card: up to the first full stop that ends a
 * sentence; a text without one is a sentence whole.
 *
 * @param text The explanation.
 */
export function firstSentence(text: string): string {
  return /^.+?[.!?](?=\s|$)/s.exec(text)?.[0] ?? text
}
