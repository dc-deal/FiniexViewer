# The Layers Panel

How the reader arranges a chart's drawing layers — shows, hides, dims and orders them. What each
layer draws, and the one host that draws them, is in [Chart Drawings and Layers](chart_drawings_and_layers.md).

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
⠿ (━●) ▾ Entry–exit line     pick a position ⓘ ◐ 40%   ← what it draws: behind its ⓘ
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
- **The workers apart from the framework, folded and hidden whole** (operator, 2026-11-13:
  *"kann ich gruppe ausblenden komplett?"*). Where a pane holds the framework's layers and workers'
  too, the workers stand under a heading of their own, *Workers*, and the framework's under theirs.
  **A line of its own only for a group** (operator, 2026-11-14): a worker gets a heading only where
  it draws more than one layer in the pane; a worker of one layer stands as its row.
- **Every group has its eye: a visibility of its own, above its layers' switches** (operator,
  2026-11-14: *"übergeordnete separate Sichtbarkeitsebene, ähnlich wie der Mute-Schalter in einer
  DAW"* — the way a group's eye works in Figma, Photoshop or QGIS). A pane's, the framework's, the
  workers', a worker's group's: hidden, it hides everything in it and changes no switch; shown again,
  each layer stands as it was set. A row its group hides is faint, its switch as set. The chart draws
  a layer where its own switch and every group of it are shown (`layer_groups.ts`); the hidden groups
  are kept with the chart's view (`layers.groupsHidden`), bound to no run. The eye of a pane is the one
  on the chart's pane, where a pane of its own closes at a ✕ (`chart_panes.md`).
- **Every group folds, and its state is kept** — the framework's layers fold away under their
  heading as the workers' do (operator, 2026-11-14).
- **Each level one step in, along a guide** (operator, 2026-11-14: the second level was not told
  from the first): a group's members stand a step in, with a fine rule along their left from under
  the heading's marker down to the last of them, as VS Code's tree draws it — which level a heading
  stands on and where its group ends are seen at once, and no line is spent. Each level costs the
  names about ten pixels in a narrow panel.
  The framework's and the workers' of our panes are the same in every run and kept for all (`layers-framework-price`, `layers-workers-price`, and the volume's); a worker's
  group is kept for its run, which names its workers (`sources-folded`: `pane|worker:<instance>`).
- **A worker's row says the timeframe its worker was served** — `M15`, `H1` — in a column of its
  own, three characters wide whatever it says, before the series' name and in the ink of structure:
  head information, never cut by a long name (operator, 2026-11-14). The series' `timeframe`, as
  served.
- **The opened row names the worker and shows its plots.** *Worker*: the instance and its type, as
  the run's configuration names them (`tunnel · CORE/bollinger`). *Plots* — FiniexTestingIDE's word:
  each plot by its own name beside its look in a few pixels, in the ink, the dash and the strength
  the chart draws it with (`plotSample`) — a legend, so a reader sees which line is whose (operator,
  on screen 2026-11-13: *"was ist denn nun von was gezeichnet worden"*; before the name, the sample
  said nothing on its own). The ink is the theme's token of its role, else the neutral ink of its
  place among every series served for its pane — counted over hidden ones too, so hiding one
  repaints no other, on the chart or here.
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
