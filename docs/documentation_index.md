# Documentation Index

How FiniexViewer runs beside the FiniexTestingIDE backend, how its screen is built and why the pieces
are split the way they are, and how it is tested. Each document answers one question; a newcomer
starts with the first group.

## Getting Started

| Document | Description |
|----------|-------------|
| [Container Topology and the Dev Proxy](architecture/container_topology.md) | The development containers, a request's path through the Vite proxy, CORS, and why the proxy holds the API token and the browser never does |
| [Panel Dock](panels/panel_dock.md) | The application as one dock of panels: panel kinds, the dock store, the one `reveal` every panel is shown through, Show in list, docking along an edge, hosts and tabs |
| [Glossary](glossary.md) | The words this viewer coins for its own display, each saying which of FiniexTestingIDE's words it is not |

## Architecture

| Document | Description |
|----------|-------------|
| [Consumed API Surface](architecture/consumed_api_surface.md) | Every route the viewer reads on the data, report and ledger planes, with the contract version, declared row keys, run identity and grouping, and which sections a run carries |
| [State and Storage](architecture/state_and_storage.md) | Where selection and preferences live: the context link and the cascades its actions apply, versioned keys per browser tab, the binders, and the settings store |

## Panels

| Document | Description |
|----------|-------------|
| [Panel Relations and Menus](panels/panel_relations_and_menus.md) | What each panel kind follows and chooses, a run section opened as a panel of its own, closing as hiding with the Panels menu, and the quick bar |
| [Jumps Between Panels](panels/panel_jumps.md) | How a panel sends the reader to another view without knowing the dock: into a run or a deployment, and between an order and the trades of its position |
| [Deployments Panel](panels/deployments_panel.md) | A bot read across its restarts: choosing a deployment from the ledger, one row per deployment and account currency, the change marks, and a refused grant |
| [Sweeps Panel](panels/sweeps_panel.md) | A parameter search read as one: every sweep a heading that opens to its combinations in the order the backend ranked them by the sweep's own objective — the first marked, a word only where the ranking compares unlike, a combination chosen as a run |
| [Candle Charts](panels/candle_charts.md) | The run chart with a unit's trades on its candles, and `CandleChart` over Lightweight Charts: first real size, theme repaint, and what the pointer is over |
| [Activities Panel](panels/activities_panel.md) | What runs on the machine — FiniexTestingIDE's activity list as a panel: each activity beneath the one it runs inside, its memory as served, asked only while someone reads it |
| [Chart Drawings and Layers](panels/chart_drawings_and_layers.md) | What a chart draws for itself — marks, levels, lines — through one drawing host, layer by layer: placed, painted and found under the pointer; and the Layers panel that shows, hides, dims and orders them |

## Runs

| Document | Description |
|----------|-------------|
| [Run List](runs/run_list.md) | Choosing a run: a facet bar over the flat run index, what a row says and from which field, ranked columns, and runs folded into families |
| [Run Bundle](runs/run_bundle.md) | The column of a run's report sections: the registry and its order, models handed in, absent, loading and failed sections, and the stored layout |
| [Scenario Roster and Focus](runs/scenario_roster_and_focus.md) | The only complete list of a run's scenarios, and the one scenario in focus: what narrows to it, what only marks it, and what stays run-wide |
| [Trade History and Run Totals](runs/trade_history_and_run_totals.md) | The one panel where a single trade exists, with its fills, unit costs and visible row cap, and the run's totals minus what is already on screen |
| [Orders and Order Steps](runs/orders_and_order_steps.md) | Why an order did not become what it was meant to be: the pending funnel, rows that are lifecycle records, and the steps opened under a position |
| [Booking Periods](runs/booking_periods.md) | The booking-period table and timeline shared by runs and deployments: the ledger reading, labels judged in pixels, stamps never rescaled across clocks, and the reconciliation |
| [Run Header, Broker and Configuration](runs/run_header_broker_and_configuration.md) | What a run was rather than what it earned: its artifact and code, the conditions its brokers set, and its configuration, shown and never resolved |

## Interface

| Document | Description |
|----------|-------------|
| [UI Building Blocks](interface/ui_building_blocks.md) | Every building block the screens are drawn from, one line each with where it lives and where it is described, and the rule: only these, and how a new one is added |
| [Theme, Buttons and Icons](interface/theme_buttons_and_icons.md) | Colour tokens and roles for both themes, `AppButton` and `JumpLink` with each state on two channels, `AppSwitch` and `AppSlider` — the one on/off and the one scale for the whole app — a change of state that moves nothing, and the registry that names an icon by its meaning |
| [Figures and Words on Screen](interface/figures_and_words_on_screen.md) | Units and `n/a` for what was never measured, why no figure is computed here, FiniexTestingIDE's vocabulary, the `t()` marker with `plural()`, and the hint registry |
| [Menu Bar Status](interface/menu_bar_status.md) | What the menu bar always states: the identity from `GET /api/v1/caller`, the machine's load from `GET /api/v1/machine-resources`, and the scenario in focus |

## Lists

| Document | Description |
|----------|-------------|
| [Facet Bar](lists/facet_bar.md) | The stateless facet bar that narrows every list, the rules a narrowing follows, and what a bar keeps across a reload |
| [Record List](lists/record_list.md) | `RecordList`, the shared stem under every table-shaped list: aligned columns, clipped headings, groups and child records, cards and lead lines |
| [List Geometry](lists/list_geometry.md) | How a list keeps its columns under their headings at any size: track sizing, columns given up by rank, bands over the headings, and a height capped by the view |

## Testing

| Document | Description |
|----------|-------------|
| [Test Tiers and Quality Gates](testing/test_tiers.md) | What each tier proves (type-check, unit suite, browser suite, a person's smoke sweep), which commands gate CI, and the deadline for long container runs |
| [Unit Tests](testing/unit_tests.md) | Setting up and writing Vitest tests: commands, configuration, captured fixtures, mocks and stubs, Pinia and async patterns, and the steps for adding a test |
| [Unit Test Catalogue](testing/unit_test_catalogue.md) | Every unit test file and what its suite asserts |
| [Browser Tests](testing/browser_tests.md) | The Playwright tier in `e2e/`: what each spec proves that jsdom cannot, how specs seed storage and replay fixtures, and how the runner reaches a browser |

## Releases

| Document | Description |
|----------|-------------|
| [Release Certificates](release_certificates/) | One certificate per release: the commit, every gate with its count, and the acceptance pass |
