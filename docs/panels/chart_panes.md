# Chart Panes

The run chart stacks PANES, one above the other on one time axis, the way TradingView and Kraken
Pro do (viewer#57): the pane of the candles on top, and below it the volume in a pane of its own,
with its own scale. A seam between two panes is dragged to make one taller, and the chart keeps the
heights the reader gave them. *Pane* is testingide#379's word for such a band of a chart — never the
docked *panel*, which holds the whole chart.

```
┌──────────────────────────────────────────────────────────────┐
│   ╷ ┃╷  ┃      ↑                                       0.8760 │
│   ┃ ┃┃ ╷┃╷   ┃┃     candles, the drawings, the marks   0.8740 │  ← the pane of the candles,
│     ╵  ┃ ╵   ╵                                        0.8720 │    on the price scale
│ ▐████ + ████▌   ✕                                           │  ← the time lane, at its bottom
├──────────────────────── seam: drag it ───────────────────────┤
│ ▂▅▃▇▂▁▃▅▂▁▃▆▂                                            1.2K │  ← the volume's own pane, a fifth
└──────────────────────────────────────────────────────────────┘
  10:00          11:00          12:00                               ← one time axis for every pane
```

## The volume — a layer the library draws (2026-10-27)

To the reader the volume is a layer like the others — shown, hidden, fainter — but the chart library
draws it, as a `HistogramSeries` of its own built BEFORE the candles, so it stands behind them where
it shares their pane. Its place in the Layers panel is fixed (`fixed` in the register): never moved,
and no other layer passes it.

- **In a pane of its own by default** — its option *own pane*, on (viewer#57). There it stands on
  that pane's right scale, which says what a bar counts; the candles' scale never sees it. A tenth
  of the pane stays free above the tallest bar.
- **Hidden, it gives its pane up** and the candles take the whole height (operator, on screen
  2026-11-12: an empty pane was room taken for nothing). Shown again, its pane comes back at the
  height kept. It comes back from the Layers panel — the eye on its pane goes with the pane.
- **Its option off, in the pane of the candles**: in the lowest fifth, behind them, on a price scale
  nothing shows. Where the time lane is drawn, that fifth stands above the lane, lifted by the share
  of the pane the lane takes ([The time lane](chart_drawings_and_layers.md#the-time-lane--booking-periods-and-orders-refused-2026-11-08)).
- **Which count**, from the bars' own answer (their `market-data` document): `v` is the traded
  volume, `0.0` on every bar of a feed that carries none, and then `tc` is the measure of how busy the
  market was. `X-Bar-Price-Basis: order_driven` names a venue that prints trades. So the traded
  volume there, the ticks otherwise (`volumeBasis` in `run_chart_store`), and the row says which —
  *traded volume* or *ticks per bar*. That reading of two sentences is put to FiniexTestingIDE.
- **Each bar faint in its candle's direction** — the polarity roles at 45 % of the layer's opacity.
- **The run chart only.** `CandleChart` builds the series only where it is handed a `volume`; the
  free chart, which draws no layers, builds none and stacks one pane.

## The heights — a weight, kept

- **A pane's height is a WEIGHT against the others', never pixels** — the library's stretch factor
  (`IPaneApi.setStretchFactor`). A window of another height, a dock seam dragged or a size of another
  layout keeps the proportion. The candles stand at 2, the library's own weight for its first pane,
  and the volume at 0.5 — a fifth of the height, where Kraken Pro stands it
  (`DEFAULT_PANE_WEIGHTS`).
- **A drag of the seam is read when the pointer is let go.** The library drags a seam by changing
  the weights of the two panes beside it and says nothing while it does, so `use_chart_panes` reads
  every pane's weight on the window's `pointerup` and tells the chart's store only where one moved: a
  click that dragged nothing, or a drag elsewhere on the page, writes nothing.
- **Kept with the chart's own view**, `panelViews['run-chart'].panes` — only a pane the reader
  dragged, read field by field: a pane this build does not know, or a weight that is no positive
  number, is never copied ([State and storage](../architecture/state_and_storage.md)). Bound to no
  run, so another unit, timeframe or run keeps them.
- **Part of a named layout, as the layers are**, and of each size of it: loading *Backtests* lays
  the panes out as that layout holds them, and a layout that holds none stands them at their
  defaults ([Named layouts](../interface/named_layouts.md)).
- **Applied when the panes change**: the chart built, the option switched, a layout loaded. The
  library makes a new pane at its own weight, so every pane is set to the kept weight or its default
  each time (`applyWeights`) — and only then: laid out again on every change of the volume, bars
  loaded at an edge or a layer switched, the weights undid a drag the reader still held.

## What moves nothing

- **The volume hidden in the pane of the candles moves no candle**: its scale is one nothing shows.
- **A change of the candles' form builds the new price series before the old one goes.** The library
  removes a pane left empty, and for that moment the pane of the candles was: the volume's pane moved
  up and took the candles (found while building, 2026-11-12).
- **The lane, the marks and their cards stay in the pane of the candles.** The drawing host is
  attached to the price series, so it draws and hit-tests in that pane alone; over the volume's pane
  the pointer finds nothing of them.
- **The seam reads as a seam**: in the rule colour at rest, and under the pointer the accent, faint,
  over its 9 px handle — the colour of what can be acted on (`chartColours`).

## The legend — each pane's figures at its top left (2026-11-12)

```
│ O 0.87972  H 0.87975  L 0.87970  C 0.87973                    ▦ … M1 │  ← the legend · a notice
│   candles …                                                           │
├───────────────────────────────────────────────────────────────────────┤
│ Ticks 36                                                              │  ← the volume's legend
```

- **The bar under the pointer, the last bar off the bars** — its open, high, low and close on the
  instrument's price step once the broker report is there (`priceAt`), and the volume's value in the
  form its own scale prints — `669.42`, `1.23K` — through the library's own format
  (`priceFormatter`), so legend and scale read alike: `669.41895978` as served stood beside `20K`
  (operator, 2026-11-12). Nothing is computed: no change from the bar before, no time, which the
  time axis already says. The labels stand quiet, the values in plain ink, in the one text size.
- **The volume says what it counts**: *Volume* where the bars carry the traded volume, *Ticks* where
  the venue prints no trade. In its own pane it has a legend of its own; in the pane of the candles
  its value stands behind the close. Hidden, it says nothing — it has given its pane up.
- **At the top of its own pane, whatever the seam does.** The library says nothing when a pane changes
  size, so each pane's element is watched (`track`, `boxes` in `use_chart_panes`) and the legend
  stands by what was measured.
- **It takes no pointer** — the chart under it keeps every move — and it takes the plot's width before
  it wraps: at 60 % of the chart beside the report, the close went to a line of its own.
- **The notices moved to the top right**, beside the price scale (`ChartNotices.vue`): the top left is
  the legend's, as in TradingView and Kraken Pro. The chart states the plot's width as
  `--chart-plot-width`, from the library's own report of it (`subscribeSizeChange`), so a notice keeps
  clear of a price scale that widens.
- **The free chart has it too** — the same `CandleChart`, its candles only.

## The controls — on the pane under the pointer (2026-11-12)

```
│ O 0.87972  H 0.87975  L 0.87970  C 0.87973                        ◉ ⤢ │0.8797
├────────────────────────────────────────────────────────────────────────┤  ← double click: first heights
│ Ticks 36                                                          ◉ ⤢ │60
```

- **At the top right of the pane's plot, beside the price scale** (`ChartPaneControls.vue`), never
  behind the legend: its figures change width with every bar, and the controls jumped with them
  (operator, on screen 2026-11-12). They show while the pointer is over the pane and take the
  pointer only then; a keyboard reaches them all the while, and one focused shows. The notices stand
  a row below them.
- **The eye is the layer's own lever** — the candles on the pane of the candles, the volume on its own
  (`PANE_LAYERS`): the Layers panel and the chart always show one state.
- **The arrows give a pane the whole height**, the others folded to nothing — the library keeps
  2 px of a pane, too little to draw in. At 22 px the candles, the lane and the legend stood on each
  other (operator, on screen 2026-11-12). A folded pane's legend stands as a line in the pane at the
  whole height — at its top for a pane folded above it, which pushes its own legend down a line, just
  over the seam at its bottom for one folded below (`legendTops`) — and keeps no controls: the arrows
  of the pane at the whole height give the heights back. Only where there are two panes.
- **Kept like the heights** (operator, 2026-11-12: TradingView keeps them, however odd): the pane
  given the whole height stands with the chart's view (`maximized`) and in a named layout, each
  size of it on its own — Mobile may give the volume the whole height while Full does not. A drag of
  the seam ends it: the heights drawn are the reader's from then on.
- **A double click on the seam brings the first heights back**, as VS Code's sashes do — what the
  reader arranges is resettable. A release is compared with the weights last laid out, so neither the
  double click nor a click beside a folded pane reads as a drag.
- **One hint says it all** (`chart-panes`), above the chart beside the one for the marks, until put away.

## Where it lives

- `src/types/chart_pane_types.ts` — the panes we stack, by name (`CHART_PANE_IDS`), and `PaneWeights`.
- `src/composables/use_chart_panes.ts` — the weights applied, and read back once a drag is let go;
  where each pane stands in the frame, measured whenever one changes size.
- `src/components/chart_legend.ts` — what each legend says, from one bar and the volume (`paneLegends`),
  and where each stands (`legendTops`).
- `src/components/ChartPaneLegend.vue` — the legend itself, shown where it is placed.
- `src/components/ChartPaneControls.vue` — the eye and the arrows at the pane's top right.
- `PANE_LAYERS` in `chart_pane_types.ts` — the layer each pane's eye switches.
- `CandleChart.placeVolume` — which pane the volume stands in, on which scale, and the count of panes
  on the element (`data-panes`), since a canvas cannot be read back.
- `run_chart_store` — `volume.ownPane` from the layer's option, `paneWeights` and `setPaneWeights`,
  `maximizedPane` and `setMaximizedPane`, `resetPanes`.

## Not built yet

- **A group for each source below a pane** in the Layers panel — ours, the algo's, a worker
  instance's — and the algo's several layers, named by the algo: asked of FiniexTestingIDE on
  2026-11-12 (the Layers panel groups by pane since then:
  [Chart Drawings and Layers](chart_drawings_and_layers.md)).
- **A worker's own pane** — an oscillator on a scale of its own, the way TradingView draws an RSI —
  once FiniexTestingIDE serves a worker's outputs with the pane they belong in (testingide#379). A pane
  joins `CHART_PANE_IDS` by name. The shape is agreed with them as a direction (2026-11-12), recorded
  in #379 as *Indicator series — one value per bar*, and becomes a contract once #379's types are
  fixed: one entry per worker instance with its `pane` (`"price"` on the candles), `plots` (Line,
  Histogram, Area, Baseline), `price_lines`, `filled_areas` between two plots or two price lines, and
  `times` beside `data`, one value per bar and `null` for a gap — read for a run as a stream through
  testingide#580, and for the free chart computed on request over a window of bars.

## How it is tested

- `use_chart_panes.test.ts` — the weights laid out, kept or default, or one pane at the whole height
  and the other folded to a line; a drag told once, never for a click that moved nothing or a chart of
  one pane; no longer heard once unmounted; each pane's place measured, and again when it changes size.
- `chart_legend.test.ts` — the figures of a bar as served, at the tick size; the volume's word and its
  value in the format handed in, its own legend or behind the close, and nothing while hidden; each
  legend at the top of its pane, a folded pane's as a line in the pane at the whole height.
- `candle_chart.test.ts` — the volume in its own pane at a fifth, or in the pane of the candles; moved
  between them as its option switches, never built anew, and its pane given up while hidden; the kept
  weights laid out and the dragged ones told; the new price series built before the old one goes;
  the legends at the top of their panes, following the bar under the pointer, and the plot's width;
  the controls of the pane under the pointer, the eye, the whole height and back, and a double click
  on the seam asking for the first heights.
- `arrangement_store.test.ts`, `named_layouts_store.test.ts`, `run_chart_store.test.ts` — the weights
  and the pane at the whole height read field by field, kept beside the layers, saved with a layout
  and laid out by it; a drag ending the whole height, a reset taking both.
- `run_chart_view.test.ts` — the eye handed to the layer's lever, the arrows and the reset to the store.
- `e2e/chart_panes.spec.ts` — in a real browser, the panes read off the library's table
  (`e2e/pane_rows.ts`): the volume at a fifth with the lane in the pane of the candles; a seam dragged
  and kept through another window height, another unit, a chart built anew and a reload; the volume
  hidden giving its pane up and coming back at the height dragged, and in the pane of the candles
  moving no candle; each legend at the top of its pane on one line, following a seam, and the bar
  under a real pointer; the controls at the pane's top right, the whole height kept across a reload
  and given back, the eye hiding the volume; a double click on the seam for the first heights.
