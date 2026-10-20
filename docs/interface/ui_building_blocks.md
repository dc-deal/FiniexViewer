# UI Building Blocks

Every view in this app is drawn from the building blocks below, and from nothing else. Read this
before you add a control, a list, a card or a chart. What they share — the colour roles, the four
states of a control on two channels, form before word before colour — is the style guide,
[Theme, Buttons and Icons](theme_buttons_and_icons.md).

## The rule

- **Use the building block that exists.** A button is an `AppButton`, an on/off is an `AppSwitch`,
  a list is a `RecordList` under a `FacetBar` — never a second thing that looks like one of them.
  Two controls for one job drift apart, and the reader has to learn both.
- **Where none fits, look for a variant of the closest one first** — a size, a shape, a prop.
  `compact` on `AppButton` and `AppSelect` came that way.
- **Where no variant fits either, the new building block is proposed before it is built** — in the
  issue or the plan of the work that needs it: what it is for, its states, which channels carry
  them. It is built in `src/components/base/` with its unit test, its line in this map and its
  paragraph in the style guide, in the same change. `AppSwitch` and `AppSlider` came that way (#41).
- **Underneath are Reka UI's headless primitives and Lightweight Charts.** A new building block
  builds on them rather than on a hand-rolled overlay, focus trap or positioning.

## The map

Everything in `src/components/base/` unless the third column names another place.

**Controls**

| Building block | What it is for | Lives in | Described in |
|---|---|---|---|
| `AppButton` | every button, in three shapes (solid, quiet, link) and two sizes; a toggle shows its choice by the pressed look | base | [style guide](theme_buttons_and_icons.md) |
| `JumpLink` | a jump to another place in the app: the link shape, with the arrow that says it leaves the panel | base | [Panel Jumps](../panels/panel_jumps.md) |
| `AppSwitch` | every on/off outside a menu — a lever, its word part of the click; never a checkbox | base | [style guide](theme_buttons_and_icons.md) |
| `AppSlider` | a share along a scale, set by a vertical lever that opens from its handle | base | [style guide](theme_buttons_and_icons.md) |
| `AppSelect` | one choice from a list; `compact` in a quick bar, where the value is what shows | base | [Panel Relations and Menus](../panels/panel_relations_and_menus.md) |
| menu entries | a menu's entries — the word, an icon, and a tick where the entry is a switch | `TopMenu.vue` | [Panel Relations and Menus](../panels/panel_relations_and_menus.md) |

**Lists and their navigation**

| Building block | What it is for | Lives in | Described in |
|---|---|---|---|
| `RecordList` | a list read as a table and clicked as a list: aligned columns, sticky headings, groups, child records | base | [Record List](../lists/record_list.md) |
| `FacetBar` | the bar that narrows and orders any list — a search, a facet per enumerable field, a sort | base | [Facet Bar](../lists/facet_bar.md) |
| `OverflowRow` | one row that never wraps; what does not fit waits behind `+N ▾` | base | [Facet Bar](../lists/facet_bar.md) |

**Figures and cards**

| Building block | What it is for | Lives in | Described in |
|---|---|---|---|
| `FigureBlock` | a titled block of label/value pairs — the shape figures are shown in | base | [Run Header, Broker and Configuration](../runs/run_header_broker_and_configuration.md) |
| `HoverCard` | a card of figures beside the element it wraps, on hover or focus | base | [Candle Charts](../panels/candle_charts.md) |
| `ChartCard` | the card of a thing drawn on a chart, at the pointer — a mark is paint, not an element | base | [Candle Charts](../panels/candle_charts.md) |
| `FigureCardBody` | what a card of figures says, its heading and its pairs — both cards say it alike | base | [Candle Charts](../panels/candle_charts.md) |
| `PathLabel` | a path-shaped identifier, a worker type or a decision logic, held by a column | base | [Run Header, Broker and Configuration](../runs/run_header_broker_and_configuration.md) |
| `ScopeMark` | the mark that a figure is the whole run's, beside one a narrowing cannot split | base | [Scenario Roster and Focus](../runs/scenario_roster_and_focus.md) |
| `JsonTree` | any JSON value as a collapsible tree — the floor under every named view | base | [Run Header, Broker and Configuration](../runs/run_header_broker_and_configuration.md) |

**Explanations, waiting and dialogs**

| Building block | What it is for | Lives in | Described in |
|---|---|---|---|
| `HintLine` | one short explanation beside the control it is about, dismissible and bannable | base | [Figures and Words on Screen](figures_and_words_on_screen.md) |
| `LoadingLine` | a section on its way: a line that moves, and the word beside it | base | — |
| `AppSpinner` | a wait where no line fits — a panel whose content is not there yet | base | — |
| `AppDialog` | what is set or read and then closed: a title, the content, one way out | base | [State and Storage](../architecture/state_and_storage.md) |
| `AppIcon` | an icon by what it means, from one registry, in the colour and size of where it sits | base | [style guide](theme_buttons_and_icons.md) |

**Charts**

| Building block | What it is for | Lives in | Described in |
|---|---|---|---|
| `CandleChart` | candles over Lightweight Charts, with the chart's own drawings layer by layer and their cards at the pointer | `src/components/` | [Candle Charts](../panels/candle_charts.md), [Chart Drawings and Layers](../panels/chart_drawings_and_layers.md) |
| `TimelineChart` | spans on a shared horizontal scale, one lane per row, the axis on top | base | [Booking Periods](../runs/booking_periods.md) |

**Panels and the frame**

| Building block | What it is for | Lives in | Described in |
|---|---|---|---|
| the dock | every panel, its tab and the quick bar beside the tabs | `src/components/dock/` | [Panel Dock](../panels/panel_dock.md) |
| `AccordionPanel` | a section of the run bundle: its header, its fold, its own-panel button | `src/components/panels/` | [Run Bundle](../runs/run_bundle.md) |
