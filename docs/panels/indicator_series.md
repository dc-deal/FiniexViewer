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
- **At most four pages a follow, 8,000 records.** The window cannot be asked for the series alone: it
  merges every stream of the unit by time, so a page holds the unit's state frames beside the
  series' bars, and a thirty-day session at a minute's cadence holds some 43,000 frames, about
  60 MB. Only what a page covered counts as read: where the pages run out, `cutAt` says the instant
  the series reach to, and the next follow reads on from there — never past a stretch it skipped.
- **A read that fails is said, and asked again.** Its stretch stays unread, the chart says why
  (`seriesError`), and the next follow reads it; the words go once a read succeeds.
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
  series added later is drawn over the ones before, so they are built again over new candles too —
  and only where what they draw changed: a new list with the same series, which every panel's view
  written anywhere hands down, builds nothing, so a pane the reader scaled by hand keeps its scale.
- **A worker's own pane sets its own margins**, a tenth above and below: the library hands a pane
  made later the margins last set on any pane's right scale, and the same RSI stood differently by
  what the chart had shown before. A series in price units takes the symbol's format, also where it
  arrives after the series were built.
- **On its own timeframe and every finer one.** Their values belong to the bars of the series' own
  timeframe; on a finer chart each falls on a candle and the line joins them. On a coarser chart its
  times would stand between the candles and the library would part the candles to make room, so it
  is not drawn there (`drawsOn`).
- **The legend** says the series' title, its inputs and its timeframe — `RSI 14 · M5` — then each
  plot's value on the bar under the pointer, the last bar's otherwise, as its own scale prints it. A
  coarser series' bar spans several candles: the value of the bar the moment falls in, and nothing
  past the last bar's end. A plot is named only where the series has several. A bar with no value —
  a gap, before the series, past its end — says so with a dash (`entry_price —`), as TradingView's
  `∅` does: a name with nothing beside it read as a legend that failed to draw. A series on the
  candles is a line of their legend; the others make their pane's legend.
- **A reference line** is drawn on the series' scale in the quiet ink, its price on the scale. A
  title that only repeats the price is left out (on screen 2026-11-13: `70` beside `70.00`).
- **A filled area** is painted by one series primitive on the series' first plot, behind the lines
  and the candles (the library's `bottom` stage): between two price lines a band across the pane,
  between two plots the stretch between their values bar by bar, broken where either has a gap.
  Their document allows no pair of one edge of each kind, so such a pair fills nothing. Its role's
  ink at a share its emphasis gives — 12 % quiet, 18 % normal, 28 % strong; at 8 % a quiet one
  vanished on the light theme — their default for an area is the annotation's, quiet.
- **Points without a line** take a radius by their emphasis — 1 px quiet, 1.5 normal, 2 strong — not
  the library's own, which grew with the line's width until a strong plot's points stood as one band
  of blots on a chart zoomed out.
- **The framework's own drawings stand in front** — the marks, the levels, the line, the time lane:
  the drawing host paints in the library's `top` stage, over the candles and every worker's series
  on them. What the run did stands over what its workers computed.
- **Roles, never colours.** `positive`, `negative`, `warning` and `annotation` are our roles of the
  same names. `neutral` takes plain ink for the first series of a pane and the quiet ink for the
  next, counted over every series served for the pane, shown or hidden — so hiding one repaints no
  other (counted over the shown ones, hiding the EMA turned the Bollinger bands bright, seen on
  screen 2026-11-13). Measured 2026-11-13 with the dataviz validator, every hue left over collides with a role this
  chart draws — an orange stood 6.1 from the falling candles to full colour vision, a violet 3.4 from
  the annotation under protan. The second series of one role is dashed and the third dotted, so
  the FORM tells a macd line from its signal. `emphasis` widens a strong line and fades a quiet one;
  an explicit `color` is not taken, as their document allows.
- **The pane's lever** on the chart hides every series drawn in it, and the pane gives its room up,
  like the volume's. Its height is a weight kept by the pane's name, in a layout like the others.
- **What the reader set** — a worker's layer hidden or fainter — is kept with the chart's view by the
  layer's id (`layers.served`), bound to no run: the same worker instance stands hidden in every run
  that draws it.
- **A pane at the whole height that goes** — a worker's on a timeframe that cannot draw it, the volume
  hidden — folds nothing while it is gone: every pane keeps its controls. The choice is kept and holds
  again once the pane is back (on the way to this page 2026-11-13: every pane lost its controls).
- **A legend stays inside its pane.** It wraps between entries on a narrow chart, never inside a
  series' name, and where its pane is shorter than its lines the last ones are cut rather than laid
  over the panes below (a small window, 2026-11-13). Folded, each legend is one line, cut at the plot.
- **The chart says what it cannot draw.** Where shown series need a finer timeframe than the one on
  show, a notice counts them and offers the coarsest timeframe that draws them all — theirs, where the
  market is rendered in it. Where a read stopped at its pages, a notice says the instant the series
  are read up to, with its ⚠: what is drawn beyond it is the candles alone.

## In the Layers panel

```
▾ PRICE PANE
   FRAMEWORK
     ⠿ ● Trades · Entry-exit line · Levels · … · Candles
   BOLLINGER_MAIN
       ● Bollinger 20 2 sma · M30
   TREND_EMA
       ● MA 20 ema 0.05 · M30
▾ VOLUME PANE
       ● Volume
▾ RSI PANE
       ● RSI 14 · M5                         M5 and finer   ← where the chart's timeframe is coarser
```

- **Pane, source, layer** — the tree agreed with FiniexTestingIDE: a worker's own pane is a group
  like ours, named by its first series; a source is named only where a pane holds two — the
  framework's layers and a worker's, or two workers' — the framework by our word, a worker by its
  instance as served.
- **A worker's row** shows, hides and fades its layer like ours and is never moved: it stands where
  the run recorded it. It opens onto the hint that says what a worker's series is. Where the chart's
  timeframe cannot draw it, its row says which can, and a hint below the list says why; where its
  series holds no value at all in the stretch read — a setup that never formed — it says
  `no values in view`.
- **A worker's pane folds** like ours; the fold is kept with the panel's view for the run, since
  another run names other panes (`panes-folded`).

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

## Measured on the sessions that challenge it (2026-11-13)

FiniexTestingIDE produced three sessions under contract 55 to challenge the chart, beside the
fixture that draws every kind of pane: a strategy that trades with two moving averages on the
candles, an oscillator as a `baseline` on a fixed range and a volatility `area`; three workers, one
drawing a bar's high and low as dotted step lines with the area between them and its close as points
without a line; and an entry zone that is null outside a setup, a histogram against a dotted
threshold in the warning role, a bias on a fixed −1 to +1 with titled lines, and one layer on D1
beside three on M15. Each was drawn in both themes, its legends read, its panes given the whole
height, dragged small and large, hidden and shown, the volume moved, a coarser timeframe taken and
its offer accepted, and the window made small. What they found is in the rules above: the points'
radius, the share of a quiet fill, a legend inside its pane, the notices — and a frame whose
`balances` are null on an account that is not spot, which stopped the Latest state section from
drawing at all ([Latest State Frame](../runs/latest_state_frame.md)).

The window cannot be asked for the series alone: for the twenty-five daily values of the first
session the chart read four pages of 2,000 frames, about 11 MB, and the frame player reads the same
frames again. A read that serves only the series would end that; it is FiniexTestingIDE's to decide.

## Where it lives

- `src/stores/indicator_series_store.ts` — what is read, for which unit and stretch.
- `src/components/indicator_drawing.ts` — pure: a plot's options and ink, its points, where a series
  can be drawn, its name and its legend line.
- `src/composables/use_indicator_series.ts` — the series on the chart, in their panes, and how each
  layer's values print.
- `src/components/indicator_fill.ts` — a series' filled areas: their shapes in the pane's pixels
  (`fillShapes`, pure), and the primitive that paints them.
- `run_chart_store.indicators` — the series drawn: shown, at their opacity, on the timeframe on show;
  `indicatorLayers` every worker's layer of the unit, drawn or not, for the Layers panel.
- `src/views/LayersView.vue` — the workers' panes, sources and rows beside ours.

## How it is tested

- `indicator_series_store.test.ts` — the reading, against a route cut as documented.
- `chart_notices.test.ts` — the timeframe offered for the series and handed back, and where the
  series stop.
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
- `layers_view.test.ts` — the workers' layers in the pane each names, a source named only where a pane
  holds two; shown, hidden and faded by id; the timeframes that can draw one; the opening onto the
  hint; a worker's pane folded for the run.
- `e2e/indicator_series.spec.ts` — in a real browser on the captured session: every series in the
  pane it names with its legend line; a pane's lever giving its room up, kept across a reload; a
  coarser timeframe drawing only its own; a seam above a worker's pane kept by the pane's name; a
  worker's pane at the whole height stacking the folded legends without one standing on another;
  the Layers panel's rows in their panes, a switch hiding one; a pane at the whole height that goes
  leaving every pane its controls; the volume moved into the candles' pane and back with the
  workers' panes below it in order; a worker's pane dragged small and large, hidden at its lever and
  shown from the Layers panel, back at the height dragged.
- `e2e/performance.spec.ts` — the captured session's series from the run chosen until every one
  stands in its pane, and a zoom step over its seven panes, each until the frame after it painted.
