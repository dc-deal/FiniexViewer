# Chart Drawings and Layers

What a chart draws for itself beside its candles — the run chart's marks, the levels and the line of
the position in focus — and how it is drawn, placed and found under the pointer. Read this before
you change `chart_drawing_host.ts`, `chart_geometry.ts` or `run_chart_levels.ts`. How the run chart
picks its unit, timeframe and bars is in [Candle Charts](candle_charts.md).

## One host, layers in a list (viewer#41)

The chart draws through ONE series primitive of its candles, `ChartDrawingHost`, attached when the
chart is built. It is handed LAYERS — `ChartLayer { id, drawings }` — and paints them in list order,
each in front of the one before; a hit is searched the other way round, front first, so what is seen
on top is what is found.

```
CandleChart :layers ──► ChartDrawingHost (series primitive, stage `top`, in front of every series of its pane)

A worker's series are layers too, served rather than ours: [Indicator Series](indicator_series.md)
says how they are drawn and how the Layers panel lists them.
                          ├─ updateAllViews   placeLayer() per layer, on every move of the view
                          ├─ paneViews        one renderer: paintLayer() per layer, in order
                          ├─ hitTest          hitDrawing() → its id → hoveredInfo.objectId → the card
                          ├─ priceAxisViews   each level's price on the axis, in its role's colour
                          └─ autoscaleInfo    room for the marks, the levels looked at inside the scale
```

**One host, not a primitive per layer.** The library paints primitives in the order they were
attached and hit-tests them by its own ranking, so an order of layers built from several primitives
would mean detaching and attaching them again on every reorder, and the one painted on top need not
be the one found. In a list the order is just the list — what the Layers panel rearranges (below).

**The trades' marks moved here from the library's markers.** Those stood fixed directly behind the
candles' own drawing and could take no place in an order of layers, and no marker was ever narrower
than 12 px, so on a long window they covered their neighbours. Drawn here, a mark is as wide as its
bar, between 5 and 12 px, and the mark of the position looked at half as large again.

The run chart's layers stand back to front as the register orders them (`chartLayers` in
`layer_registry.ts`): the volume and the candles behind, the time lane, then the state frame, the
levels, the line and the trades in front.

## Drawings — in testingide#379's vocabulary

`src/types/chart_drawing_types.ts`. Every drawing carries the id the chart reports under the pointer
and the card it shows there; a time is the open of a bar drawn.

| kind | what | from |
|---|---|---|
| marker (`ChartMark`) | an opening ↑↓ or an exit ●, single or gathered `×N` | [Candle Charts](candle_charts.md) |
| `segment { from, to, price }` | a level held from one bar to another — `to` null: to the window's edge; `from` equal to `to`: known at that bar alone, a short stroke ending there | `run_chart_levels.ts` |
| `line { from, to }` | two points joined: where a trade entered and where it left | `run_chart_levels.ts` |
| `time { time }` | a moment over the whole height, dashed: the state frame on show. Ours until testingide#379 names one | `run_chart_levels.ts` |
| `span { from, to, endsAtOpen }` | a stretch of time in the lane's strip: a booking period | `run_chart_lane.ts` |
| `lane-mark { time, shape }` | a moment with no price, in the lane's row: an order refused (cross) or expired (ring), single or gathered `×N` | `run_chart_lane.ts` |

A drawing's colour is a ROLE (`positive` · `negative` · `flat` · `mixed` · `entry` · `annotation` · `warning`), read from the
theme tokens by the chart and handed to the host — a canvas cannot read CSS. The shape and the word
come first: a level carries `SL` or `TP`, a mark its sign or its count, so the colour only reinforces.

## Placing — `chart_geometry.ts`

Plain functions over a `ChartScale` (time → x, price → y, the width of a bar, the pane's width), so
they are tested without a canvas.

- **A mark stands beyond its bar** — above its high, below its low — and the next mark of the same
  bar and side beyond it, its text beyond its shape. The reach of the stack is what `autoscaleInfo`
  asks the price scale to leave free, so the outermost mark is not cut off — and it is asked for a
  HIDDEN layer's marks too, so switching the trades off rescales nothing (operator, on screen
  2026-10-27: without the marks the candles stretched into the room they had left).
- **A segment runs from its first bar to its last**, or to the pane's edge where it is open.
- **What falls off the scale is left out**, never drawn at a guessed place — the library places only
  times that stand on its scale.
- **The hit test** searches the layer in front first; within a layer a mark — a point — wins over a
  line or a level, which are found within 4 px of their stroke.

## The levels and the line of the position looked at — `run_chart_levels.ts`

For that position alone, unless the Layers panel asks for every position's levels or lines — each
layer has its own switch, kept under its own id (`every-position`, `every-position-line`; operator,
2026-10-27). Drawn for every position they are a lot to read, and then only the position looked at
puts its prices on the axis, or every position's would bury it in tags.

**The price scale holds the levels of the position looked at** (`autoscaleInfo`). A stop or a target
usually stands beyond the candles on screen, and before this it was drawn off the scale where nobody
saw it — found by the element shots of #41's browser pass, 2026-10-19. Every position's levels do not
stretch it, or the candles would shrink to a line; a reader who wants the candles' full height
switches the levels off in the Layers panel.

- **A level** is the trade row's `stop_loss` / `take_profit` — *"the levels in force when this row's
  close was booked — after any move, not the levels at entry"* (their trade-history document). It is
  known at the exit alone, so it is drawn there alone: a short dashed stroke ending at the exit's
  bar, its card saying when it was in force. Drawn flat back to the entry it showed a trailed stop
  where it never stood — 100 of the 108 positions with two rows in the sweeps of a trailing logic
  moved theirs (FiniexTestingIDE, 2026-10-20). A position still open at the end has the levels its
  entry in the portfolio's `open_positions` states at the end of the record, drawn at the last bar.
  `SL` is drawn in the loss's role, `TP` in the profit's — the polarity of the outcome at that
  price — dashed, with the word at its start.
- **An own level** — one the strategy keeps itself, in their glossary — stands on no position. A trade
  row names only the one that fired, in `exit_level`, with `close_reason` (`sl_triggered` ·
  `tp_triggered`) saying which of the two it was (contract 45). It is drawn like any level, and its
  card says *own level* and when the trade *Closed*: the close fills at the next price, and no field
  says when the level was reached. A close with no level firing shows none, a position still open at
  the end only what its closed parts fired at, and a level the position carried is not drawn a second
  time from `exit_level`. Read in one place, `trade_card.ts` `ownLevel`, for the chart and the cards
  alike.
- **The line** joins each trade row's entry price and time to its exit's, in the polarity of its
  result; none where both fall in one candle.
- **Where a level stood before the exit is not served.** A backtest records no moved stop, and a
  session only where the venue holds it; the levels at entry and every move are testingide#618's
  (contract 37 or a later one). Until then nothing is drawn for the time before the exit.
- **Past the last bar of a window the route cut** nothing is drawn: a level known only past it has
  no candle to stand at.

## The Layers panel — arranging the layers

A panel of its own (kind `layers`), opened from the chart's quick bar (`≡ Layers`) as a narrow split
to the right of the chart it arranges, at any width of the dock: as a tab it would hide that chart.
It works on the chart LAST IN FRONT (`dock.lastChart`) — focus, not a selection, so no link key
carries it, the way VS Code's Outline follows the editor in front; its tab card says *Follows — the
chart last in front*. Another panel coming to the front, the Layers panel itself among them, leaves
it on the same chart. *Layers panel* is FiniexTestingIDE's own name for it; each row is a *drawing
layer* in their glossary.

```
Run chart · ETHUSD_aug_sep
▾ PRICE PANE                                       ← a pane's group, folded or open
⠿ (━●) ▸ Trades                                ◐
⠿ (━●) ▾ Entry–exit line     pick a position   ◐ 40%
           💡 what it draws and what its option does      ← a hint, dismissible
           (━●) every position                            ← the option, plain
⠿ (●━) ▸ Levels                                ◐   ← switched off: the row grey
  (━●) ▸ Candles                               ◐   ← fixed: no grip, never moved
▾ VOLUME PANE
  (━●) ▸ Volume                  ticks per bar ◐
```

- **The register** is `src/layer_registry.ts`: each layer's title, its hint and its one option, and
  which chart draws which layers, back to front (`chartLayers`). The free chart draws none today.
- **Grouped by the pane each layer is drawn in** (operator, 2026-11-12), the way TradingView's
  object tree is: the pane of the candles, and the volume's own while its option *own pane* is on —
  off, the volume stands in the group of the candles, behind them. A group's heading is an uppercase
  label that folds it away; the fold is kept with the panel's view (`layers-pane-price`,
  `layers-pane-volume`). Each group is a list of its own, so a layer is dragged within its pane only.
  Below the pane, a group for each source of a layer waits for testingide#379's layers. The tree is
  agreed with FiniexTestingIDE as a direction (2026-11-12, #379's section *Grouping the layers*):
  pane, then source — *framework* (ours, from the record routes), the algo, a worker instance — then
  layer; a source's heading only where a pane holds layers of more than one. A layer is one string:
  `algo` for the algo's default layer, `algo:<name>` for every further one, `worker:<instance>` and
  `worker:<instance>:<name>` alike — the name a constant in the algo's code, so a reader's on/off,
  order and opacity are kept by it; no `:` in a name, a `title` beside it for the words on screen. One
  level of names for now: a `/` is kept for a group level later (`entries/long`). An *Indicator series*
  entry is one layer, its plots switched together.
- **The workers apart from the framework, each hidden whole by an eye** (operator, 2026-11-13:
  *"kann ich gruppe ausblenden komplett? wobei es aber keinen sinn macht die standardgruppe
  auszublenden"*). Where a pane holds the framework's layers and workers' too, the workers stand
  under a heading of their own, *Workers*, whose eye hides or shows every worker's series of that
  pane; each worker's heading has an eye for all of its series. The framework's heading has none.
  An eye switches the layers and keeps nothing of its own: it reads them, hiding where any is shown.
- **A worker's row shows its line before its name** — its first plot in a few pixels, in the ink,
  the dash and the strength the chart draws it with (`plotSample`), so a reader sees which line is
  whose (operator, on screen 2026-11-13: *"was ist denn nun von was gezeichnet worden"*). The ink is
  the theme's token of its role, else the neutral ink of its place among every series served for
  its pane — counted over hidden ones too, so hiding one repaints no other, on the chart or here.
- **One row a layer, front first,** drawn as the app's lists are. The lever (`AppSwitch`) shows or
  hides it, and a hidden row goes grey; ◐ opens the lever of its opacity (`AppSlider`, 10–100 %);
  the row opens its options.
- **The opened row holds plain options beneath one hint** (operator, 2026-10-28), the way an
  editor's panels do: what the layer draws and what its option does is the layer's hint
  (`layer-trades`, `layer-levels` …, named on each layer as `hintId`), and a reader who knows it
  dismisses it. The option is its switch alone (the trades' signs; the levels, or the lines, of
  every position rather than of the one looked at; the volume's own pane); the candles add their
  forms. A row opens only onto something: a layer with no option and no forms — the booking periods
  — shows no marker once its hint is put away, and a click opens nothing (operator, on screen
  2026-10-29).
- **The closed row's words say only what the screen cannot**: what an empty layer waits for —
  *pick a position* for the levels and the line, which draw for the position looked at alone, *none
  for this position* where one is looked at, *none in view* for the trades or where every position
  is asked for — and what the volume counts. A switched option, the candles' form or a fixed layer's
  place is seen elsewhere, so it is not repeated (operator, 2026-10-28). The words stand only where
  they fit whole: the title comes first, and the words wrap onto a line the head's height cuts away
  the moment they would not fit. With no position chosen the levers of the line and the levels
  changed nothing on screen and looked broken (2026-10-19); *nothing to draw* said so, and not what
  to do.
- **Why a shown layer draws nothing stands below the list** as hints, one box for every such layer
  — a narrow panel cut the row's word to a letter and kept the reason on hover, and the levers still
  looked broken (2026-10-27). Hints of the shared register (`layer-empty-*`, named on each layer as
  `emptyHintId`). Below the list their coming and going moves no row, and the panel holds its
  scrollbar's track free (`scrollbar-gutter: stable`), so one appearing moves none either.
- **Compact as the app's lists** (operator, 2026-10-28): a row is as tall as a list row (25 px), the
  surface under the pointer spans the whole row, and the lever is the compact one (`AppSwitch`
  `compact`), so it does not outweigh ◐ beside it.
- **Moved by dragging its grip ⠿, and only so** (operator, 2026-10-28), through `vue-draggable-plus`
  — the package the run bundle's column already sorts its sections with — and written back whole
  (`reorder`). The candles and the volume have no grip, and a drag that would pass them is refused
  (`onMove`). The arrows that moved a layer one step went with it: a reorder is the pointer's alone.
- **The trades' signs switched off keep their room.** The marks are handed over `textHidden`: the
  host places their text and paints none of it, so the switch rescales nothing — emptied, the text
  gave its room up and the price axis moved at the switch (operator, on screen 2026-10-28).
- **Kept with the chart's own view**, `panelViews[<chart id>].layers`: only what differs from the
  chart's own arrangement, reconciled whenever it is read — a layer the chart no longer draws is
  left out, one it draws since stands where its own order puts it (`arrangeLayers`, `keptLayers`).
- **The run chart's store applies it.** A hidden layer is handed over marked `hidden`: the host
  neither paints nor hits it and puts nothing of it on the axis, and only the room its marks take is
  kept. A fainter one carries its `opacity`, and the host paints that layer whole at it.

## The state frame on show (2026-10-30)

Where a session records its frames, the frame on show in the player of [Latest state
frame](../runs/latest_state_frame.md) stands on the chart as a dashed line over the whole height, in
the `annotation` role, at the bar its `frame_time` falls in — the session's own clock, the one the bars
stand on. It moves with each step, and with each frame a running session writes. Under the pointer its
card says which frame it is and when.

- **The player of the unit on show and of the run on show**, matched by name: a unit is called the same
  in `data_windows` and on its streams. Any other player draws nothing, and a backtest records no stream
  over time yet (their `recorded-streams` document).
- **It stands as soon as the player has a frame**, the newest at first (decided 2026-10-30): on a running
  session it is also where the record has got to. The layer's lever takes it away.
- **The view does not follow it** (decided 2026-10-30). At the automatic timeframe the whole window is in
  view, so the line is too; zoomed in, it can leave the view while the reader looks elsewhere.
- **Past the bars loaded there is no line yet**: it is drawn once its bar arrives.
- **A step rebuilds no other layer.** Each layer's drawings are a `computed` of their own, since a player
  moves them several times a second. The card under the pointer stays through a step while its drawing
  stands, and says what it says now.

## The time lane — booking periods and orders refused (2026-11-08)

What has a time and no price stands in a lane along the bottom of the pane (viewer#41, section D),
read from what the run's reports already hold — `booking-periods` and `order-history`, for the unit
on show (`run_chart_lane.ts`).

```
│   candles …                                                     │
│     ×3        ✕                    ○                            │  ← orders refused ✕ · expired ○
│ ▐████ + ████▌  ▐█ − █▌     ▐██████████ + ██████████▌            │  ← booking periods
└─────────────────────────────────────────────────────────────────┘
```

- **Only the rows something is drawn in** (`laneBox`): the strip, 12 px at the bottom, and the marks'
  row above it. The price scale leaves the lane free (`autoscaleInfo`), counted from every layer's
  drawings, hidden ones too, so a lever switches nothing in the candles' height.
- **The volume stands above the lane** where it shares the pane of the candles — in its own pane,
  the default since viewer#57, the two never meet ([Chart Panes](chart_panes.md)). Its scale is its
  own, which the room asked of the candles' does not reach, so the host tells the chart the lane's
  share of the pane whenever it changes (`onLaneShare`) and the volume's fifth is lifted by it — the strip and the crosses were drawn over
  its bars (on screen 2026-11-08). Only the host knows the pane's height in time: after a resize the
  library lays the pane out at its next frame. With every layer of the lane switched off the volume
  sinks into the lane's room, while the candles' scale keeps it free, so nothing of the candles moves
  (on screen 2026-11-12: it floated over an empty band).
- **A period** runs from the left edge of the bar it opened in to the right edge of the bar it closed
  in — to that bar's left edge where it closed at its open (`endsAtOpen`), so a period that ended on
  the hour does not reach into the next one. Its fill is quiet, in the polarity of its `net_pnl`,
  its sign (`+` or `−`) inside in plain ink where it fits, and none on a period that booked nothing —
  a row of `0` only filled the lane (operator, on screen 2026-11-12); its card is the one the period table shows (`periodCard`). Under the
  pointer its bounds run through the candles as dashed lines, so its stretch can be read against them.
- **An order refused** — the statuses the Orders panel marks as refusals, read from one place
  (`ORDER_REFUSALS`) — is a cross in the `warning` role; an `expired` one a ring, quiet. Each stands
  at the bar its `event_time` falls in. Several within a mark's width are gathered into one with a
  count, the way the trades' marks gather, and split as the reader zooms in; the card of a gathered
  mark lists the first eight, each under its status, then how many more. The lane is ONE row, so
  crosses and rings gather together — a group with a refusal among it is a cross — and a group with
  a count reaches three marks wide, the count's room beside it (on screen 2026-11-08: the next cross
  covered it).
- **Before the first bar and past the bars loaded** nothing is drawn; a period that opened before
  the first bar starts at it.
- **An empty layer**: the periods say *none in view* and why below the list; the refusals say *none
  in view* and give no hint box, since a unit nothing was refused to is where everything is fine.
- **Not drawn yet:** the orders RESTING at a price over time — the limit or stop of a pending order —
  which needs the order events placed by time and a word from FiniexTestingIDE on how a pending order
  is spanned; and the kinds testingide#379 will name.

## The volume — a layer the library draws (2026-10-27)

A layer like the others to the reader, drawn by the chart library as a series of its own — in a pane
of its own below the candles since viewer#57, or with its option off in the lowest fifth of theirs.
What it counts, where it stands and how tall: [Chart Panes](chart_panes.md).

## The candles — a layer too (2026-10-27)

The candles stood as a fixed row nobody could switch; since the operator's word of 2026-10-27 they
are a layer like the volume: fixed in place (`fixed`, never moved, no layer passes them), shown,
hidden and fainter, and drawn in the form picked in their opened row — **candles · OHLC bars ·
line · area** (`forms` in the register, kept under `forms` only where it is not the first).

- **Each form is the library's own series over the served bars** (`CandleChart.buildPriceSeries`).
  A change of form builds the series anew and moves the drawing host to it; a line and an area take
  the close alone. Nothing is computed from the bars, so a Heikin-Ashi candle — a sum over them —
  is not offered.
- **Hidden is transparent, never removed.** The drawing host is attached to the price series and the
  price scale rests on it, so the series stays, every colour at no strength and the last price off
  the axis; the marks, the levels and the scale stay where they were.
- **The strength is the colours' alpha**, the polarity roles for candles and bars, plain ink for a
  line and an area. At full strength the token goes as it is.
- **Every row opens**, the fixed ones too: what a layer draws stands in its opened row, not on a
  browser tooltip, and the controls are explained by the panel's hint — the one pattern an
  explanation takes (operator, 2026-10-27). With no bars at all no layer is said to draw nothing:
  the chart says so for every layer at once.

## How it is tested

- `layer_registry.test.ts`, `use_chart_layers.test.ts`, `layers_view.test.ts` — the register and the
  reconciling, the arrangement written as only what differs, and the panel at its controls.
- `chart_geometry.test.ts` — placing and the hit test over a scale of plain numbers.
- `chart_drawing_host.test.ts` — the host against the few library calls it makes, and its painting
  against a canvas context that records what it was told to draw (jsdom has no canvas).
- `run_chart_levels.test.ts` — the levels and the line from served fields.
- `run_chart_lane.test.ts` — the periods' spans and the refusals' marks from the run's reports, gathered and cut.
- `candle_chart.test.ts` — what the chart hands its host: the layers, every bar's range, the colours;
  and the volume's series, its scale and its colours, built only where a volume is handed — its pane
  in [Chart Panes](chart_panes.md).
- `e2e/run_chart.spec.ts` — the levels painted on a real canvas, from a capture whose position the
  mock hands a stop and a target (no trade of the fixture run set one); and the lane of the refusing
  unit, its period's card found at the bottom of the pane.
