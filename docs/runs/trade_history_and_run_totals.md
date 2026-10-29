# Trade History and Run Totals

Trade history answers which trade, and Run totals answers what the whole run came to in each account currency. Read this document before you change either panel: it says where each figure comes from and which figures are left out on purpose.

## Trade history — the only place a single trade exists

`runs/TradeHistoryPanel.vue`, rendered through `base/RecordList.vue` — the same list surface the run
picker uses. Every other section of a run is already summed over these rows, so this is the one that
answers *which* trade, not *how much*.

**Eight columns, and everything else in the card.** That split is what the card was built for: a
trade has thirty-eight fields and a row has width for eight, and truncating the row would decide for
the reader which of them matter. The eight are declared as a `ListColumn[]`, not as markup.

Ranked 8 → 6 → 4 → 3. What a narrow list keeps is which trade (`Symbol`, `Opened`) and what it came
to (`Net P&L`) — the symbol alone does not identify a row, since a scenario trades one symbol many
times and the moment is what tells two of them apart. The excursions go first, then the lots and the
holding period; all of them stay in the card at every width.

**What a narrow cell cuts is in a card, never on a browser tooltip** (operator, 2026-10-28). The
trade's card is titled by its position, which a narrow column cuts, and opens with *Closed in parts*
— what this trade took of the whole, the row saying only `of 3`. A fill carries a card of its own
with its id, price and fee. The group's name stands whole in the title of the group's card. What the
links to the orders and to the chart do is the `position-link` hint above the list.

**Three levels: the unit, the trade, the FILLS.** The trades are grouped under the unit that
produced them, and a click on a trade opens the executions that opened and closed it. The fill level
answers the one question the columns cannot: *why do four rows carry the same entry price?* Because
they are one position closed in pieces. Measured on a real run — 85 trades, 29 distinct entry fills,
61 trades whose entry fill is larger than their own lots.

The fill sub-list is read-only and draws no headings: the in-then-out ORDER is the content, so there
is nothing to sort it by, and a heading row over every two lines would label what each cell already
labels inline. Its presentation follows the backend's own printout. A fill row offers no click, but it
does carry its card.

**The group heading's figures are the API's served `scenario_totals`, looked up by name.** Nothing
is folded here — see [The list itself](../lists/record_list.md) for why, and for what a heading shows when no total was
served. One refinement belongs to this panel: totals are declared unique by
`(scenario_name, currency)`, so a scenario that traded in two currencies has TWO. The heading shows
one figure, so such a scenario gets NONE rather than an arbitrary half.

**The heading names what the unit COST, part by part, and only the parts that are not zero.**
`fees` is the served `total_fees`, `spread` the served `total_spread_cost` (contract 32) — measured
rather than charged, already inside the gross, so it stands beside the fees and never in them. On
forex the fees usually read 0.00 and the spread is the whole cost; on a spot market both stand. A
part of zero is left out, so `fees 0.00` no longer sits on every forex unit. The card beside the
heading (`groupCard` on the list) carries the whole split — gross, net, the fees with their swap, the
spread — and a spread of null reads `not recorded` there, the reason on its pair: the data the unit
read had no quote, or the run was recorded before contract 32. A null spread stays off the line,
because every older run has one. Where such data was given modelled quotes (contract 33) the line
says `modelled spread` with the unit's `total_modelled_spread_cost`, and the card carries it as a
figure of its own. Nothing is added up: the API serves no total cost.

**The tracks are proportional, and that is a fix rather than a taste.** They were eight percentage
widths under `table-layout: fixed`, and the reason is worth keeping: while every group is closed the
columns the heading spans hold no cells at all, so an automatic layout sized them from nothing and
then re-sized them the moment a group opened, sliding every heading sideways under the reader's
eyes. The `minmax(0, Nfr)` tracks carry the same eight proportions and prevent the same defect. They
also mean a rank costs nothing to lay out: the surviving `fr` shares simply redistribute.

**The group heading is counted from the END, and `Net P&L` is the last column because of it.** The
heading was three cells spanning `5 + 1 + 2`, an arithmetic fixed at eight columns — so a rank that
gave one up left it spanning tracks the grid no longer had. Two cells (`1 / -2` for the name, its
count and its costs; `-2 / -1` for the net) hold at every tier, and the net still lands under its own
heading, so a reader runs down the one column and meets both the trades and their totals. The
reading order gains by it besides: opened · held · worst · best · net is the life of the trade in
order, with the result closing the line instead of sitting in the middle.

**An adverse excursion is rendered as a magnitude.** Measured in one response: `mae_pnl` is signed
(−18,399.05) while the analytics block's `largest_mae` is the magnitude of that same number
(+18,399.05). The direction is already in the name, so rendering both as they arrive would put one
quantity on screen twice with opposite signs. `magnitude()` — the same formatter the drawdowns use,
renamed from `drawdown()` once a second quantity needed it.

**MAE and MFE are given three ways** — as a price, as the unrealised P&L at that price, and as a
distance in `price_unit` — and the card shows all three, because which one answers a question
depends on the question.

**The slippage says what its exit was measured against where that is not the mid** (contract 44,
operator 2026-10-28). A trade's entry, and every exit but one, are measured against the mid when the
order was sent; a stop-loss or take-profit exit against the level that closed it
(`exit_slippage_measured_against: protective_level`), where a backtest reads 0 because it fills
there. Without a word the two halves read as one comparison, so that exit carries `vs SL/TP level`
and the others nothing. Live, the fill price is the venue's own answer, in a backtest the
simulation's; the rule is the same for both, and setting the two side by side is not this panel's
job. The `trade-slippage` hint says what the figure holds — for a market fill, half the spread.

**The row cap is visible, and the narrowing runs BEFORE it.** A thirty-day session produces
thousands of trades and drawing them all would stall the page, so the panel draws 500 and SAYS how
many of how many it drew. A silent truncation reads as "that was all", which for a trade list is the
most misleading thing it could say. Capping first would take the first 500 trades of the whole run
and filter what was left, so a unit that traded late would show nothing while the panel claimed it
had drawn everything — and the cap is counted against the NARROWED set for the same reason.
Virtualisation replaces the cap the day a run exceeds it — `@tanstack/vue-virtual` is already in the
tree through reka-ui, though it would have to become a direct dependency.

## Run totals — the fold, minus everything already on screen

`GET /reports/runs/{run_id}/aggregated-portfolio`, rendered by `runs/AggregatedPortfolioPanel.vue`
as `FigureBlock`s, one group of blocks per account currency. Registered with `defaultOpen: false`,
which IS the disclosure this was asked for — the panel shell already collapses, so nesting it inside
the Executive summary would have meant rebuilding that panel's prop contract to carry a second
model.

**The panel's discipline is what it leaves out.** The response carries 42 fields per currency on top
of a 21-field headline, and almost all of the headline is `run-summary` again. Measured field by
field on 2026-09-30 against what the Executive summary renders: **39 are new**, and four groups of
those are what a reader has no other way to reach — the run-wide cost split (the per-unit version is
in the roster's card and this total is nowhere else), `highest_equity` with the scenario that reached
it, the realised `final_balance` beside the equity, and the averages plus the spot holdings. Printing
the rest would be the same figure twice on one screen.

**A spread that was never measured reads `not recorded`, never `0`** (contract 32). A unit that read
data without a quote — every row bid = ask — has a null `total_spread_cost`, and the run's
`total_spread_cost` and `avg_spread` are null as soon as one unit's is, since a sum over a part
would read as the whole. `spreadFigure` in `report_format.ts` says so, and the figure's hover gives
the reason; the roster's card does the same per unit.

**Since contract 33 such data pays a MODELLED spread, and it stands beside the measured one.** A
backtest gives each tick without a quote the quote the spread estimated for the previous day
implies; what the fills crossed against it is `modelled_spread_cost` on a trade and a booking period,
`total_modelled_spread_cost` on a unit, a trade group and the aggregated fold — their glossary's
*modelled spread*. Measured and modelled add up to what the fills crossed, and each fill counts in
exactly one of the two. `modelledSpreadFigures` in `report_format.ts` builds the one figure every
place shares, and only where it is not zero: on recorded quotes it is 0, on a period recorded before
the contract null, and a line of either on every run would be noise. The scenario roster's card adds
how much of the scenario's data was priced that way (`modelled_spread` on scenario-details: the ticks
modelled of those without a quote, the median spread given), with the factor, the estimator and the
day digest — what identifies the charge across runs — a hover away.

**Three distinctions that a reader gets wrong without this panel**, and each carries its caveat where
the figure is rather than in a paragraph:

- `highest_equity` is the highest peak ANY account reached; `max_equity` in the summary belongs to
  the account that fell DEEPEST. Two numbers about two different accounts.
- `final_balance` is REALISED; `total_final_equity` values what is still open as well. They differ by
  exactly the unrealised movement, and a reader meeting only one concludes the other is broken.
- A SPOT account is an inventory, so its worth is an ESTIMATE — quote balance plus the base holding
  at a price. The backend says so by serving `last_price` beside `est_current`, and the word stays on
  screen.

**Two blocks are deliberately absent, and a test guards each.** The `pending_*` figures are the
the Orders panel's subject and showing them here would pre-empt a panel that can say more; and
`spot_scenarios[]` is a per-account inventory of eight rows by eleven fields — a list rather than a
figure, and the roster already names those scenarios.

**`margin` and `spot` are the two HALVES of a currency that holds both account models**, null where
it holds one. Null there means "not split", never "nothing traded" — and where `is_mixed` is true the
panel says so, because the figures then fold two kinds of account into one.
