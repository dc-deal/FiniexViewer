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
CandleChart :layers ──► ChartDrawingHost (series primitive, stage `normal`, in front of the candles)
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

The layers by default, from back to front: `levels` · `entry-exit` · `trades`.

## Drawings — in testingide#379's vocabulary

`src/types/chart_drawing_types.ts`. Every drawing carries the id the chart reports under the pointer
and the card it shows there; a time is the open of a bar drawn.

| kind | what | from |
|---|---|---|
| marker (`ChartMark`) | an opening ↑↓ or an exit ●, single or gathered `×N` | [Candle Charts](candle_charts.md) |
| `segment { from, to, price }` | a level held from one bar to another — `to` null: to the window's edge; `from` equal to `to`: known at that bar alone, a short stroke ending there | `run_chart_levels.ts` |
| `line { from, to }` | two points joined: where a trade entered and where it left | `run_chart_levels.ts` |

A drawing's colour is a ROLE (`positive` · `negative` · `flat` · `mixed` · `entry`), read from the
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
(━●) ▸ Trades              no signs   ◐
(━●) ▾ Entry–exit line                ◐ 40%
         ↑ front  ↓ back
(●━) ▸ Levels                         ◐        ← switched off: the row grey
      ▣ Candles              at the back
```

- **The register** is `src/layer_registry.ts`: each layer's title, what it draws and its one option,
  and which chart draws which layers, back to front (`chartLayers`). The free chart draws none today.
- **One row a layer, front first,** drawn as the app's lists are. The lever (`AppSwitch`) shows or
  hides it, and a hidden row goes grey; ◐ opens the lever of its opacity (`AppSlider`, 10–100 %);
  the row opens the rest — its option (the trades' signs; the levels, or the lines, of every
  position rather than of the one looked at) and its place, one step at a time. The closed row says what differs — and,
  for a shown layer with nothing to draw, *nothing to draw*: the levels and the line draw for the
  position looked at alone, so with none chosen their levers changed nothing on screen and looked
  broken (2026-10-19). Why stands below the list, each such layer named with its reason — a narrow
  panel cut the row's word to a letter and kept the reason on hover, and the levers still looked
  broken (2026-10-27); below the list its coming and going moves no row.
- **Kept with the chart's own view**, `panelViews[<chart id>].layers`: only what differs from the
  chart's own arrangement, reconciled whenever it is read — a layer the chart no longer draws is
  left out, one it draws since stands where its own order puts it (`arrangeLayers`, `keptLayers`).
- **The run chart's store applies it.** A hidden layer is handed over marked `hidden`: the host
  neither paints nor hits it and puts nothing of it on the axis, and only the room its marks take is
  kept. A fainter one carries its `opacity`, and the host paints that layer whole at it.

## How it is tested

- `layer_registry.test.ts`, `use_chart_layers.test.ts`, `layers_view.test.ts` — the register and the
  reconciling, the arrangement written as only what differs, and the panel at its controls.
- `chart_geometry.test.ts` — placing and the hit test over a scale of plain numbers.
- `chart_drawing_host.test.ts` — the host against the few library calls it makes, and its painting
  against a canvas context that records what it was told to draw (jsdom has no canvas).
- `run_chart_levels.test.ts` — the levels and the line from served fields.
- `candle_chart.test.ts` — what the chart hands its host: the layers, every bar's range, the colours.
- `e2e/run_chart.spec.ts` — the levels painted on a real canvas, from a capture whose position the
  mock hands a stop and a target (no trade of the fixture run set one).
