# Candle Charts

The run chart stands beside the run bundle so that a trade in a list and the candle it happened on are one glance apart. Read this document before you change `run_chart_store`, `run_chart.ts` or `CandleChart.vue`: it explains how the chart picks its unit, timeframe and bars, and how the chart engine follows the theme and describes what is under the pointer.

## The run chart — one unit of a run on its candles

The chart beside the run (viewer#31, the item #21 left open): one unit of the chosen run on its
candles, its trades marked where they opened and closed. A panel of the kind `run-chart` in the
area *Runs*, part of the first arrangement beside the run report (see [Docked Panels](panel_dock.md)), so a trade
in the list and its candle are one glance apart; hidden, it comes back from the Panels menu, and
the chart mark on a trade or an order brings it to the front on that position. With no run chosen
it says so and draws nothing.

```
[☰ Runs][▤ Run · 20261012_205715]          │ [◫ Run chart · EURGBP_refus…]   EURGBP_refusals_01 ▾ · M1 ▾
  Trade history                             │   ▲ entry: up below the bar (long), down above it (short)
  pos_eurgbp_1 ↗ ◫  long  +0.68 EUR ──────► │   ● exit: on the other side, + or − as a word,
                                            │     the colour its polarity
```

- **`src/stores/run_chart_store.ts`** holds the chart's unit, timeframe, bars and marks. It asks the
  archive only while a run chart is on show (`attach` / `detach` from the view): the units are read
  off what the run report already loaded, so a reader who never opens the panel pays nothing.
- **`src/components/runs/run_chart.ts`** — the pure half: `chartUnits`, `defaultUnit`,
  `autoTimeframe`, `barOf`, `tradeMarks`, `focusTime`, `unitTickSize`, `chartPriceFormat`.
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
  unit with trades. The chart mark moves a focus that stands on another unit, and sets none where
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
  instrument — which is where the free chart still stands: the market-data routes name no tick size.
- **Every state says what it is**: no run, the run's units on their way, no unit that can be drawn,
  a market the archive holds nothing for, a window without bars, and a notice where the route cut
  the window — an empty chart says nothing about why it is empty.

## Chart Engine — Lightweight Charts (TradingView)

[Lightweight Charts](https://github.com/tradingview/lightweight-charts) is a purpose-built OHLCV charting library: small bundle, good performance, minimal API surface. It handles candle rendering, time axis, crosshair, and resize natively.

**Alternatives considered:**
- **ECharts** — general-purpose, heavier, more configuration overhead for financial data.
- **Recharts / Chart.js** — not optimised for candlestick OHLCV; significant custom work needed.
- **Custom WebGL/Canvas** — full control but months of work with no financial primitives.

Lightweight Charts becomes limiting if we need complex multi-pane indicator layouts or a professional trading UI. For v0.1–v0.2 scope (read-only candle display), it is the right choice.

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
The library reports the id of the thing under the pointer as `hoveredObjectId`, for a marker (its
`id`) and for a series primitive (the `externalId` its `hitTest` answers) alike. The chart keeps a
register of id → `FigureCard` and shows the card of whatever is under the pointer in a `ChartCard`:
placed from the pointer, on the side with more room, inside the chart's frame, and taking no pointer
events so the chart keeps them. The trade marks are the register's first source — an exit's id is
its trade row's declared key, an entry's is the position's, and their cards come from
`runs/trade_card.ts`, the same builder as the card beside a row in the trade list, so the two cannot
come to say a trade differently. The algo's drawings (testingide#379) are planned as primitives, and
a primitive brings its id and its card to the same register; nothing else changes.
Measured in the browser on 2026-10-16: the library reported `exit|EURGBP_refusals_01|pos_eurgbp_1|379`
under the pointer and the card showed that trade. That half has no spec: the marks are paint on a
canvas, the library ignores synthetic pointer events, and finding a mark with real ones costs 36 ms a
step over the whole pane. Re-check it by hand when the library is upgraded — version 5 moves the
markers into a plugin.

The card's look is the app's, not one component's: `src/styles/card.css` holds it, and
`base/FigureCardBody.vue` says what a card says — its heading and its pairs, each pair carrying its
caveat — for `HoverCard` beside an element and `ChartCard` on a chart alike.
