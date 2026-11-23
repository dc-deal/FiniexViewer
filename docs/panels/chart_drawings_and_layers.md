# Chart Drawings and Layers

What a chart draws for itself beside its candles — the run chart's marks, the levels and the line of
the position in focus, the orders resting at their price — and how it is drawn, placed and found under
the pointer. Read this before you change `chart_drawing_host.ts`, `chart_geometry.ts`,
`run_chart_levels.ts` or `run_chart_orders.ts`. How the run chart
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
| `segment { from, to, price }` | a price held from one bar to another — a level dashed, a resting order dotted (`stroke`); `to` null: to the window's edge; `from` equal to `to`: known at that bar alone, a short stroke ending there | `run_chart_levels.ts`, `run_chart_orders.ts` |
| `line { from, to }` | two points joined: where a trade entered and where it left | `run_chart_levels.ts` |
| `time { time }` | a moment over the whole height, dashed: the state frame on show. Ours until testingide#379 names one | `run_chart_levels.ts` |
| `span { from, to, endsAtOpen }` | a stretch of time in the lane's strip: a booking period | `run_chart_lane.ts` |
| `lane-mark { time, shape }` | a moment with no price, in the lane's row: an order refused (cross) or expired (ring), single or gathered `×N` | `run_chart_lane.ts` |

A drawing's colour is a ROLE (`positive` · `negative` · `flat` · `mixed` · `entry` · `annotation` · `warning` · `order`), read from the
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
- **An exit the bot did not see is not drawn.** A holding sold outside the bot is booked with
  `close_reason: closed_externally` and `exit_observed: false` (contract 63), at its entry price: no
  candle and no price of that exit is in the bot's record. So it has no exit mark, no line and no
  levels at an exit; its opening still stands, and its card in the trade list says *outside the bot,
  exit not observed* where a price would stand.

## The Layers panel

How the reader shows, hides, dims and orders the layers — the panel, its rows, its groups and their
eyes, and how what it keeps is applied: [The Layers Panel](layers_panel.md).

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

## Resting orders (2026-11-15)

The orders of the unit on show that rested at the venue, each dotted on its price from where the
venue took it to the step that ended it (viewer#41, section D) — their glossary's *resting*: "a pending
order the venue (or the trade simulator) has accepted and that waits for its price". Read from the
unit's order-event stream, asked through the route's own narrowing (`order-events?scenario_name=`,
`chart_orders_store.ts`) only where the run wrote it (`stream_files`), once per run and unit.

```
 2642.28 ·····························              limit · open long      cancelled: the stroke ends
 2565.30 ······················▲                    limit · open long      filled: the trade's mark at its end
 2437.32 ···················                         stop · close long      a protective stop, released
```

- **Every value is a served field** (`run_chart_orders.ts`). The steps of one order are grouped by
  `submitted_seq`, their join key, and read in `seq` order, never by time. It rests from `accepted` —
  or `adopted`, taken over at a session's start — to `filled`, `cancelled`, `expired`, `rejected` or
  `undelivered`; with none of them, or `unaccounted`, it runs to the window's edge.
- **The price** is `limit_price`, or `trigger_price` where it has no limit or waits for its trigger.
  A stop-limit stands at its trigger until `triggered`, then at its limit; a plain stop rests no longer
  once triggered. `modified` starts a stretch at the new price, its words drawn once, at the first.
- **Not drawn:** a market order (no price to rest at), a `denied` one (never sent), one the venue
  never took. An order within one bar is a short stroke at that bar.
- **Its words** where it begins, as served — `order_type · action direction` — in the quiet ink, the
  dotted form telling it from a level's dashes. A word that would cover one already painted is left
  out; the stroke stays, and its card names it: the limit or trigger, the lots, when it was accepted,
  moved and ended, the end reason, the initiator and the position.
- **Measured 2026-11-15:** one unit of a backtest of 129 trades answered 57 KB in 0.34 s, the whole run
  404 KB. The backtests in the archive trade at the market; the field study placed limit orders.
- **An empty layer** says why in its hint: a market order fills at once, and a run without the stream
  has none. A read that failed says so over the chart, beside the other notices.

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
- `run_chart_orders.test.ts`, `chart_orders_store.test.ts` — the resting orders from an order's steps,
  against the field study and against steps written for a modification and a trigger; the steps read
  once per run and unit.
- `candle_chart.test.ts` — what the chart hands its host: the layers, every bar's range, the colours;
  and the volume's series, its scale and its colours, built only where a volume is handed — its pane
  in [Chart Panes](chart_panes.md).
- `e2e/run_chart.spec.ts` — the levels painted on a real canvas, from a capture whose position the
  mock hands a stop and a target (no trade of the fixture run set one); and the lane of the refusing
  unit, its period's card found at the bottom of the pane; and the field study's resting orders on its
  market's candles.
