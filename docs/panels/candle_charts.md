# Candle Charts

The run chart stands beside the run bundle so that a trade in a list and the candle it happened on are one glance apart. Read this document before you change `run_chart_store`, `run_chart.ts` or `CandleChart.vue`: it explains how the chart picks its unit, timeframe and bars, and how the chart engine follows the theme and describes what is under the pointer.

## The run chart — one unit of a run on its candles

The chart beside the run (viewer#31, the item #21 left open): one unit of the chosen run on its
candles, its positions marked where they opened and its trades where they closed. A panel of the kind `run-chart` in the
area *Runs*, part of the first arrangement beside the run report (see [Docked Panels](panel_dock.md)), so a trade
in the list and its candle are one glance apart; hidden, it comes back from the Panels menu, and
the chart mark on a trade or an order brings it to the front on that position. With no run chosen
it says so and draws nothing.

```
[☰ Runs][▤ Run · 20261012_205715]          │ [◫ Run chart · EURGBP_refus…]   EURGBP_refusals_01 ▾ · M1 ▾
  Trade history                             │   ▲ entry: up below the bar (long), down above it (short)
  pos_eurgbp_1 ◫  long  +0.68 EUR ────────► │   ● exit: on the other side, + or − as a word,
                                            │     the colour its polarity
```

- **`src/stores/run_chart_store.ts`** holds the chart's unit, timeframe, bars and marks. It asks the
  archive only while a run chart is on show (`attach` / `detach` from the view): the units are read
  off what the run report already loaded, so a reader who never opens the panel pays nothing.
- **`src/components/runs/run_chart.ts`** — the pure half: `chartUnits`, `defaultUnit`,
  `autoTimeframe`, `unitTickSize`, `chartPriceFormat`.
- **`src/components/runs/run_chart_marks.ts`** — where the marks stand: `barOf`, `executedOpenings`,
  `openingMarks`, `exitMarks`, `focusTime`.
- **Every position that opened has a mark, closed or not — one source per mark** (FiniexTestingIDE,
  2026-10-16). An OPENING is the order history's executed `open` row, which every position has; an
  EXIT is a trade row, which carries its result. Until 2026-10-19 the entries came from the trade
  history, so a position the run ended with still open had none: on `20261012_131126_88b20443`,
  thirteen positions opened and the chart drew one arrow. The source moved without moving a mark — an
  opening's `event_time` and `executed_price` equal the trade row's `entry_time` and `entry_price` on
  1,969 of 1,969 rows. An opening's card says how the position opened and, where the run ended with
  it still open, what the portfolio's `open_positions` states of it then: the lots left, the last
  price and the unrealised P&L at it — in the backend's words a mark, not a result. A position the run
  inherited from an earlier session has no opening in its own run and gets no entry mark; its trade
  rows' `entry_time` is still where the chart centres on it.
- **The units come from what the run states.** A backtest names each unit's market in
  `scenario-details` (`symbol`, `data_broker_type`) and the span its ticks covered
  (`first_tick_time` … `last_tick_time`) — that span is drawn rather than the declared window, which
  a unit can run past. A session names one market for the run in its configuration
  (`broker_type`, `symbol`, an untyped record read at runtime) and only the start of its window
  (`data_windows`): it is drawn to the end of the coverage. A unit that processed no tick, or
  whose market nothing names, stays in the list, disabled, with the reason.
- **The unit is the scenario in focus** (operator, 2026-10-16) — one focus for the lists and the
  chart. A unit chosen in the chart's quick bar puts it in focus for every panel, and the focus
  cleared leaves the chart where it was. With no focus the chart shows its own choice, kept per run
  in the arrangement (`runChart`) and made by the chart mark on a trade or an order, else the first
  unit that opened a position. The chart mark moves a focus that stands on another unit, and sets none where
  there was none — the lists keep showing the whole run.
- **The timeframe is the finest the archive renders for the market that draws the window in at
  most 2,000 bars** — an hour of a backtest in M1, a session of weeks in hours — unless the reader
  chose one. The coverage lists its timeframes alphabetically, so they are ordered by the lengths
  `/timeframes` states.
- **The bars are asked from one period BEFORE the window.** The route answers the bars that open in
  the range, and the bar the first tick fell in opened before it — measured 2026-10-15:
  `from=05:00:00.274` answered from the 05:01 bar, and the trade at 05:00:40 had no candle. The
  length only widens the ask; a mark stands on a bar SERVED, the last one that opened at or before
  the event, never on one computed from a period's length — a trading day or a week does not start
  on a multiple of its length, and lightweight-charts snaps a mark between bars onto the next one.
  While the window holds more to the right than is loaded, an event past how far the bars are loaded
  gets no mark yet: it would stand on the last bar loaded, weeks from where it happened — measured
  2026-10-19, a unit cut at M1 piled fifteen marks onto its last candle. It is drawn once its bar
  arrives, and so are a level and a line; the levels of a position still open at the end wait for
  the window's end.
- **The bars arrive as the view moves** (viewer#9, `src/composables/use_bar_loader.ts`), one loader
  per chart. The run chart asks for 2,000 bars from half a batch before the position looked at, or
  from the window's start without one; at the automatic timeframe that is the whole window in one
  ask, as before. A finer timeframe is no longer cut: when the view comes within 20 bars of the first
  or the last bar loaded, `CandleChart` says so (`edge`) and the loader asks for more there — one
  batch at a time per edge, never past the window. The edges are read only after the library has
  painted a set it was handed: on the way it reports the ranges it passes through — a first batch
  framed in its middle reported its right end first (measured 2026-10-29) — and asked for more at once. The route keeps the OLDEST bars of a range past
  its limit (measured 2026-10-29), so to the right it is asked from the seam to the edge with
  `limit=2000` — the next bars, whatever gap lies between — and to the left in pieces of N periods,
  which hold at most N bars and are never cut. An empty piece is a gap, not an edge: the next is asked
  at once, twice as long, up to the route's 10,000. Bars that arrive before the ones on show move
  the view by as many, so the reader sees the same bars (`data-visible-from` on the element says
  which, `data-bars` how many are held). A small spinner stands halfway up that edge while a batch is on its way, and a batch that
  failed is said there, the bars loaded staying drawn — clear of the library's logo at the bottom
  left, its attribution, which a sign placed low covered. The free chart loads the same way: the last
  300 periods first, earlier ones as the reader pans left, down to the start of the coverage.
- **What it centres on is the link's marked position.** The chart mark on a row marks the position
  (`context.mark`), sets the chart's unit and opens the panel (`use_chart_link.ts`, provided at
  the root beside the other channels) — so the row in the list and the marks on the candles agree
  on what is being looked at, and that position's marks are drawn larger. A long window is centred
  on where the position opened; a short one is shown whole.
- **Prices are drawn at the instrument's tick size** (`priceFormat`). The run's broker report names
  the unit among a broker's scenarios, and that broker's symbol carries `tick_size`
  (`broker.units[].symbols[]`): its decimals are the chart's precision, the step its least move —
  EURUSD reads `1.15162` where it read `1.15`. The backend's rule for a price it COMPUTED, such as a
  quote-driven bar's midpoint, is to round it for display to that tick size (its `prices` document,
  contract 34). Without a report the library keeps its own format, two decimals for every
  instrument — which is where the free chart still stands: the symbols list names each symbol's
  `tick_size` since contract 35, and the free chart does not read it yet (viewer#47).
- **Marks that would cover each other are drawn as ONE, with a count** (viewer#41, decided
  2026-10-19). What a reader sees as density is overlap: measured over the archive, two events rarely
  share a candle at the timeframe drawn, but 2,000 bars on 600 px are 0.3 px each and the library
  draws no mark narrower than 12 px. So marks of one kind and one side of the bar gather when they
  stand within a mark's width of the group's first — one candle zoomed in, several zoomed out — and
  split again as the reader zooms in, the way TradingView groups its executions. The chart reports
  the width of a bar on every zoom (`spacing`), and `gatherMarks` regroups only when the bars a mark
  covers change. A gathered mark reads `×3`, an exit's sign before the count (`+×3`, `−×2`, `±×3`
  where the results point different ways, quiet like a flat one) — a bare `+3` beside the gain colour
  would read as an amount. Its card lists the members one line each, at most eight and then
  `+N more`, and sums nothing. The position the reader is looking at is never gathered.
- **A finer timeframe is offered where one draws the marks of a candle apart** — and only there.
  The automatic timeframe already is the finest within its 2,000 bars, so the offer looks at every
  covered timeframe finer than the one drawn that still draws the window within the route's 10,000,
  coarsest first. Two instants at least one period apart never share a bar, whatever the bars'
  alignment, so no bar is computed. Measured 2026-10-19: in 72 of 137 such candles the exits share
  one instant, and no timeframe parts those. Taken, the chart draws in it centred on the first such
  candle, until the reader chooses a timeframe or a position again.
- **Notices stand inside the plot, in its top-left corner** (`ChartNotices.vue`) — the offer. A
  line above the chart moved it each time one appeared, and a selection
  never moves the layout. A hint above it explains the shapes once, and the chart takes the room it
  leaves rather than overflowing the panel by it, which clipped its time axis.
- **Every state says what it is**: no run, the run's units on their way, no unit that can be drawn,
  a market the archive holds nothing for, a window without bars, and at an edge a batch on its way
  or one that failed — an empty chart says nothing about why it is empty.

## Chart Engine — Lightweight Charts (TradingView)

[Lightweight Charts](https://github.com/tradingview/lightweight-charts) is a purpose-built OHLCV charting library: small bundle, good performance, minimal API surface. It handles candle rendering, time axis, crosshair, and resize natively.

**Version 5 since 2026-10-19** (5.2.1; 4.2.3 was the last of version 4). A series is added as
`addSeries(CandlestickSeries, …)`, and the markers are a plugin of the series, `createSeriesMarkers`,
attached once when the chart is built. It came before the chart's first own drawing (viewer#41): version
5 renames the primitive types such a drawing is written against, and it answers the pointer for the
position it is at, where 4.2.3 ran the crosshair event before the hit test of the same move and so
reported the thing under the PREVIOUS position — harmless on a 12 px marker, wrong on a 1 px line. The
dev server bundles the library once and keeps it: after an upgrade it serves the old one until it is
started again (`docker restart finiex-viewer`).

**Alternatives considered:**
- **ECharts** — general-purpose, heavier, more configuration overhead for financial data.
- **Recharts / Chart.js** — not optimised for candlestick OHLCV; significant custom work needed.
- **Custom WebGL/Canvas** — full control but months of work with no financial primitives.

Lightweight Charts becomes limiting if we need complex multi-pane indicator layouts or a professional trading UI. For v0.1–v0.2 scope (read-only candle display), it is the right choice.

**A window is fitted whole, however narrow the chart** (`CandleChart.vue`). The library's least bar
width is 0.5 px, and fitting stops there: 2,000 bars then need 1,000 px, and on a narrower chart the
window's start was out of view — measured 2026-10-19, a unit of 1,217 H4 bars at the default split
showed from mid-February of a window that began in January. The chart sets it to 0.05 px, so the
route's 10,000 bars fit 500 px.

**The chart is built at its first REAL size, and a collapse to nothing is ignored** (`CandleChart.vue`).
A container of 0×0 is a panel not yet laid out or not in view; a chart created or fitted at that
size keeps a collapsed time scale, and resized to it, loses its place. So nothing is drawn until
the container has a size, bars that arrived earlier are handed over and fitted when it does, and a
later 0×0 leaves the chart as it was until the next real size.

**The chart paints with the theme tokens, and repaints when the theme changes** (`CandleChart.vue`).
Every other surface follows a theme switch on its own — `App.vue` sets `data-theme` on the document
and the tokens follow — but a canvas is painted with values. So the chart reads `--color-bg-base`,
`--color-text-secondary` and `--color-border` for its surface, text and rules, `--color-accent` for
the crosshair's lines (interactive focus) and `--color-positive` / `--color-negative` for the
candles (a candle's direction is a polarity), and a `MutationObserver` on `data-theme` repaints it
without building it again. The run chart's marks are painted the same way: an entry in
`--color-text-primary`, an exit in the polarity of its result and `--color-text-secondary` where
it is flat — the shape and the sign carry the meaning, the colour only reinforces it. Until 2026-10-12 the colours were written into the component as the
dark theme's values, so the light theme showed a dark chart; the dark theme is pixel-identical to
before, measured on the canvas. The crosshair's two axis labels keep the library's own dark label
(`#131722`, its text chosen for contrast) in both themes, deliberately: it reads on both surfaces,
and it is how TradingView draws it.

**Everything drawn says what it is, at the pointer — through ONE register** (`CandleChart.vue`).
What the chart draws for itself — the marks, the levels, the lines — comes through its drawing host,
layer by layer ([Chart Drawings and Layers](chart_drawings_and_layers.md)). The library reports the
id of the thing under the pointer as `hoveredInfo.objectId`, for a series primitive (the
`externalId` its `hitTest` answers) as it did for its own markers. The chart keeps a
register of id → `FigureCard` and shows the card of whatever is under the pointer in a `ChartCard`:
placed from the pointer, on the side with more room, inside the chart's frame, and taking no pointer
events so the chart keeps them. The marks are the register's first source — an exit's id is its
trade row's declared key, an opening's is the position's, and their cards come from
`runs/trade_card.ts`, the same builder as the card beside a row in the trade list, so the two cannot
come to say a trade differently. A level and a line bring theirs the same way, and so will the
algo's drawings (testingide#379), as one more layer.
Measured in the browser on 2026-10-16 with version 4: the library reported
`exit|EURGBP_refusals_01|pos_eurgbp_1|379` under the pointer and the card showed that trade; again on
2026-10-19 with 5.2.1, a real pointer on the one mark of `EURGBP_left_open` showed the card of
`pos_eurgbp_1`, still open. That half has no spec: the marks are paint on a canvas, the library
ignores synthetic pointer events, and finding a mark with real ones costs 36 ms a step over the whole
pane. Re-check it by hand when the library is upgraded.

The card's look is the app's, not one component's: `src/styles/card.css` holds it, and
`base/FigureCardBody.vue` says what a card says — its heading and its pairs, each pair carrying its
caveat — for `HoverCard` beside an element and `ChartCard` on a chart alike.
