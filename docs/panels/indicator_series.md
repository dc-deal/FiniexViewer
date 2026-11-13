# Indicator Series

A strategy decides on what its workers compute — an RSI, a set of Bollinger bands — and a chart of
candles alone leaves the reader guessing what it saw. Since contract 55, a session records each
drawing worker's outputs as an **indicator series**: one value per closed bar of the worker's own
timeframe, on the candles or in a pane of its own under them. The worker declares how its outputs
are drawn, the run keeps that declaration when it starts, and the run chart draws what the run
recorded — never what the worker declares today.

*Indicator series* and *worker* are FiniexTestingIDE's words; their document `indicator-series`
(under `/api/v1/docs`) says what each field holds.

## Where they come from

```
run chart: run · unit · the stretch its bars cover
        │
        ▼
indicator_series_store.follow(target, span)
        │  1. GET …/units/{unit}/recorded-streams        the timeline: a row per drawing worker
        │  2. GET …/recorded-streams/window?from=&to=     page by page, along next_from
        ▼
series: one entry per layer, the pages merged, the frames left behind
```

- **Only a session asks.** A backtest records its series too, but its streams over time are not
  served yet, so `run_chart_store` follows only a run whose `group` is `autotrader`.
- **Only what the timeline lists is read.** Their document: *"Draw only the series the run's
  timeline lists."* A unit whose timeline has no `indicator_series` row reads no window, and one
  whose streams are not recorded at all is an absence in the backend's words, never an error.
- **The stretch whose bars are loaded, and no more.** The series follow the bar loader: when the
  reader moves toward an edge and earlier or later bars arrive, the series of that stretch are read
  as well — only the part not read yet.
- **At most four pages a read, 8,000 records.** The window cannot be asked for the series alone: it
  merges every stream of the unit by time, so a page holds the unit's state frames beside the
  series' bars, and a thirty-day session at a minute's cadence holds some 43,000 frames, about
  60 MB. Where a read stops at its pages, `cutAt` says the instant the series reach to.
- **A page grows a series, never repeats it.** Each entry is keyed by its `layer`; a later page's
  bars join it in order of time, each instant once. What the series means — its title, its pane,
  its plots — is the run's recorded copy and the same on every page.

## How it is drawn

```
┌───────────────────────────────────────────────────────────┐
│ O 88513.1  H 88513.1  L 88500.0  C 88500.1                 │  the candles' pane
│ Bollinger 20 2 sma · M30  upper 89360.3  middle …  lower … │  a line per series on them
│ MA 20 ema 0.05 · M30  88895.5                              │
├───────────────────────────────────────────────────────────┤
│ Volume 1.05                                                │  the volume's own pane
├───────────────────────────────────────────────────────────┤
│ MACD 35 12 26 9 · M5  histogram −4.9  macd −57.0  signal … │  one pane per name served,
├───────────────────────────────────────────────────────────┤  in the order served
│ RSI 14 · M5  31.82                       ┄ 70.00 ┄ 30.00 ┄ │
└───────────────────────────────────────────────────────────┘
```

- **Each plot is a series of the chart library** in the pane its series names: `line`, `histogram`,
  `area` or `baseline`, its `options` passed in the library's own codes. The first plot is drawn
  behind the others. `range` holds the scale fixed — an RSI's 0 to 100 — and `price_format` states
  its labels; a series without one is in price units and takes the symbol's own.
- **One pane per name**, in the order the series are served, below the candles and the volume's own
  pane. `use_indicator_series` builds them whole and takes them down whole: when the volume moves
  into a pane of its own it takes pane 1, so the workers' panes go first and come back below it. A
  series added later is drawn over the ones before, so they are built again over new candles too.
- **On its own timeframe and every finer one.** Their values belong to the bars of the series' own
  timeframe; on a finer chart each falls on a candle and the line joins them. On a coarser chart its
  times would stand between the candles and the library would part the candles to make room, so it
  is not drawn there (`drawsOn`).
- **The legend** says the series' title, its inputs and its timeframe — `RSI 14 · M5` — then each
  plot's value on the bar under the pointer, the last bar's otherwise, as its own scale prints it. A
  coarser series' bar spans several candles: the value of the bar the moment falls in. A plot is
  named only where the series has several; a gap says nothing. A series on the candles is a line of
  their legend; the others make their pane's legend.
- **A reference line** is drawn on the series' scale in the quiet ink, its price on the scale. A
  title that only repeats the price is left out (on screen 2026-11-13: `70` beside `70.00`).
- **A filled area** is painted by one series primitive on the series' first plot, behind the lines
  and the candles (the library's `bottom` stage): between two price lines a band across the pane,
  between two plots the stretch between their values bar by bar, broken where either has a gap.
  Their document allows no pair of one edge of each kind, so such a pair fills nothing. Its role's
  ink at a share its emphasis gives — their default for an area is the annotation's, quiet.
- **The framework's own drawings stand in front** — the marks, the levels, the line, the time lane:
  the drawing host paints in the library's `top` stage, over the candles and every worker's series
  on them. What the run did stands over what its workers computed.
- **Roles, never colours.** `positive`, `negative`, `warning` and `annotation` are our roles of the
  same names. `neutral` takes plain ink for the first series of a pane and the quiet ink for the
  next: measured 2026-11-13 with the dataviz validator, every hue left over collides with a role this
  chart draws — an orange stood 6.1 from the falling candles to full colour vision, a violet 3.4 from
  the annotation under protan. The second series of one role is dashed and the third dotted, so
  the FORM tells a macd line from its signal. `emphasis` widens a strong line and fades a quiet one;
  an explicit `color` is not taken, as their document allows.
- **The pane's lever** on the chart hides every series drawn in it, and the pane gives its room up,
  like the volume's. Its height is a weight kept by the pane's name, in a layout like the others.
- **What the reader set** — a worker's layer hidden or fainter — is kept with the chart's view by the
  layer's id (`layers.served`), bound to no run: the same worker instance stands hidden in every run
  that draws it.

## What a series holds

| Field | What the chart does with it |
|---|---|
| `layer` | the row in the Layers panel: `worker:<instance>`, or `worker:<instance>:<name>` for a further series of one worker |
| `pane` | `price` draws on the candles; any other name is a pane of its own, shared by every series naming it |
| `title`, `inputs` | the legend and the row's name: `RSI 14` |
| `timeframe` | the bars the values belong to — the series' own, which need not be the chart's |
| `plots` | the outputs drawn, each a line, histogram, area or baseline |
| `price_lines`, `filled_areas` | reference lines on the series' scale, and an area between two edges |
| `times`, `data` | each bar's opening instant, and per plot one value per bar — a null is a gap |

## Where it lives

- `src/stores/indicator_series_store.ts` — what is read, for which unit and stretch.
- `src/components/indicator_drawing.ts` — pure: a plot's options and ink, its points, where a series
  can be drawn, its name and its legend line.
- `src/composables/use_indicator_series.ts` — the series on the chart, in their panes, and how each
  layer's values print.
- `src/components/indicator_fill.ts` — a series' filled areas: their shapes in the pane's pixels
  (`fillShapes`, pure), and the primitive that paints them.
- `run_chart_store.indicators` — the series drawn: shown, at their opacity, on the timeframe on show.

## How it is tested

- `indicator_series_store.test.ts` — the reading, against a route cut as documented.
- `indicator_drawing.test.ts` — every pure piece, against the session FiniexTestingIDE produced.
- `indicator_fill.test.ts` — a band between two price lines, the stretch between two plots, broken at
  a gap and no lone bar filled, and nothing for a mixed pair, an unknown edge or one off the scale.
- `candle_chart.test.ts` — each plot in the pane its series names, below the volume's own; built again
  when the volume moves; the fixed range and the reference lines; the areas on the first plot,
  taken off before it goes; a line per series in its pane's legend; every series and its pane taken
  down once none is handed.
- `chart_legend.test.ts`, `use_chart_layers.test.ts`, `arrangement_store.test.ts`,
  `run_chart_store.test.ts` — the lines a legend takes and how the folded ones stack, the workers'
  layers kept beside the chart's own, read back by their form, and the series a timeframe draws.
- `e2e/indicator_series.spec.ts` — in a real browser on the captured session: every series in the
  pane it names with its legend line; a pane's lever giving its room up, kept across a reload; a
  coarser timeframe drawing only its own; a seam above a worker's pane kept by the pane's name; and a
  worker's pane at the whole height stacking the folded legends without one standing on another.
