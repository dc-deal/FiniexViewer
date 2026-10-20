# Browser Tests

Some properties exist only in a real browser: a reload from real storage, real layout, a grid nested inside another grid. Read this document before you add or change a spec in `e2e/`, or when one fails.

**Playwright, for the layer jsdom can only approximate** (viewer#23). The unit suite proves a
component does what it was written to do; it cannot prove that a real reload in a real browser
puts the reader back where they were. Specs live in `e2e/`, run with
`npm run test:e2e`, and are **hygiene rather than a gate** — browser tests are slow and flaky under
load, and a gate that is red on Monday morning gets switched off, taking the type-check beside it
out of use.

Two properties are deliberate. `retries: 0`, because a test that goes green on the third attempt
is flaky and we would never see it. And **the mocked responses come from the unit fixtures**
(`e2e/api_mock.ts` reads the same captures), never hand-written in a spec: a second mirror of the
HTTP contract goes stale in silence, which has already happened once here. For the same reason a spec
DERIVES what it needs from the capture rather than transcribing it: `api_mock.ts` exports
`FIXTURE_RUN` and `FIXTURE_DEPLOYMENT`, and keeps the family key it derives to itself — the last being the family line the run
list now folds the fixture run behind, with `revealFixtureRun(page)` to open it. A spec that
CLICKS a run calls that first; one that opens on a stored run does not.

**The selection is not in the URL, so a spec that needs a run open STORES it.**
`openWith(page, path, seed)` in `e2e/arrangement_seed.ts` writes `arrangement.v1` before the app
boots — ONCE per tab, guarded in `sessionStorage`, because a reload must find what the page stored
meanwhile rather than the seed again. `storedLink` and `storedBar` read back what the app stored,
which is what a spec asserts where it used to read the address bar. There are no routes: every spec
opens `/`, where Runs is the tab in front, and `showPanel(page, title)` brings another panel forward
by its tab, the way a reader does.

**What the browser tier is for, concretely.**

- `run_selection.spec.ts` holds the reload — a real `localStorage`, and a real boot from it — and
  two tabs side by side: each keeps its own run and column across a reload, and a new one starts
  from the last saved. The column is asserted first, because a storage shared between tabs fails it
  every time, where it lost the run only when the other tab's delayed save landed in between.
- `dock.spec.ts` holds the docked panels, which jsdom cannot lay out at all: the first arrangement
  in the suggested order, the run report beside the run list on a wide screen with the list keeping
  its rows and a pick there showing the run, a tab behind another drawn only once it is shown, an arrangement that
  survives a reload, the way back to the suggested order, a closed panel brought back from the
  Panels menu, About opening as a dialog rather than as a tab, the quick bar holding the chart's
  selection only while the chart is in front, the run bundle's tab carrying the grade of a run that
  did not succeed, and a page that never scrolls — also once the window is made smaller, which is
  what left a panel behind a tab reaching past the bottom; and a panel dropped at the dock's
  outermost edge spanning that whole edge — along the bottom, where the first arrangement's
  columns tell it apart from a drop on one group; and a pick in the run list that leaves a closed
  run report closed while the run is chosen all the same.
- `run_selection.spec.ts` also holds the rule that a selection never moves the layout — choosing a
  scenario leaves the executive panel's box and the row under the pointer exactly where they were —
  and a section still on its way keeping its panel standing with a loading line, the route held back
  on purpose.
- `settings_dialog.spec.ts` holds the settings dialog to ONE size whatever the tab, measured per
  tab, and to a frame that stays inside a small window with its content scrolling, and the account
  standing in the menu bar with no tab for it in the settings.
- `machine_status.spec.ts` holds the machine's state in the menu bar — both shares from the captured
  reading, on one line, its card naming where the limit was read — and that a new reading moves
  nothing beside it: the account keeps its place while a share goes from 100 to 9.
- `activities.spec.ts` holds what runs on the machine: the menu bar's card saying it in one line, the
  server left out and the panel named; and the Activities panel opened from the Panels menu, listing
  the captured server row marked as this server, and asking nothing more while another tab of its
  group stands in front of it — a panel kept in the page stays mounted behind its tab, which only a
  real dock shows; and every cell of a narrow panel on one line in a German locale, counted by the
  lines its text stands on, in a context of its own since the locale is the context's; and a
  backtest's label opening its run in the run bundle, the activity built from the server's row.
- `sweeps.spec.ts` holds the parameter searches: the Sweeps panel opened from the Panels menu, a
  sweep opened in its one list, its combinations beneath it in the order the route ranked them with
  the first marked ★, and a combination chosen as a run, its report coming forward in the run bundle.
- `open_as_panel.spec.ts` holds a section opened as a panel of its own: docked beside the column
  rather than over it, gone from the column, put back by ⇲ on its tab, still opened after a reload,
  and a jump from the orders landing in the trade history opened as a panel.
- `narrow_panels.spec.ts` holds what narrow room does to what stands beside it: the narrowing in the
  menu bar shortening its name before anything beside it moves, its button still whole and inside
  the bar, the Panels trigger on one line — at 760 px, where the bar fits its mark and button and
  not its whole text — and no figure of the executive summary breaking onto a second line or cut
  short, at the width where they broke; and the run list's facet bar on one line at 1400 and 700 px
  and on two at most at 420 px, measured against the height of one chip. All of them were red
  against the code before them.
- `show_in_list.spec.ts` holds the way back from the run bundle to the chosen run's row: the run
  list brought forward with the row in view and marked a moment, the row found again once the list
  was scrolled away with only the list scrolled and never its view, and the way not offered while
  the list docked beside the bundle shows the row — offered again once the list scrolls away.
- `booking_periods.spec.ts` holds the ledger's rows: a unit of two periods closed by its total line,
  whose card at the pointer names both declines, and a period row that is no control opening its
  card on a keyboard focus — the capture books one period per unit, so the spec serves it with its
  first unit booked twice and the rest of the body unchanged. And a unit booked daily for two
  hundred days: its lane drawn edge to edge without the ring, said beneath the lanes, on an axis of
  calendar marks — the ring is paint, which only a browser shows. And the period list, once opened,
  still open after a real reload and in the section opened as a panel of its own.
  And as a panel of its own the table reaches the bottom of it, the whole table scrolling with its
  headings sticky, while in the bundle's column its list keeps its cap — only a browser lays out.
- `run_chart.spec.ts` holds the run chart: the chart mark on a trade opening it BESIDE the run
  report, on the trade's unit, drawn on a canvas with its marks counted on the element and the
  position marked in the list; the Panels menu opening it on the first unit with trades; the opening
  of a position the run ended with still open marked, though it has no trade; marks that would cover
  each other drawn as one when zoomed out and split again when zoomed in, none lost; the hint above
  the chart leaving the whole chart inside its panel; the levels of the position looked at painted
  on a real canvas, from a position the mock hands a stop and a target; and ONE
  focus, from both sides — a scenario chosen in the list is the one the chart draws, a unit chosen
  in the chart narrows the lists to it.
- `layers_panel.spec.ts` holds the Layers panel: opened from the run chart's quick bar BESIDE the
  chart it arranges, the chart still on show; a layer switched off at its lever and no longer handed
  to the chart's drawing host (`data-drawings`); and the same layer still off after a real reload,
  in the panel and on the chart.
- `trade_groups.spec.ts` holds the open/closed regimes of the scenario groups, and two things only a
  browser can state: that the group heading resolves to the SAME grid as the rows beneath it — read
  from `getComputedStyle`, which also catches a track collapsed to zero — and that a trade opens its
  fills and they offer nothing to click. The test it replaced counted `<th>` against the group row's
  `colspan`; after the migration both are zero, so it would have passed for ever on a subject that
  no longer exists. And a unit closed by hand still closed after a real reload, the panel's own view
  kept for the run on show.
- `position_link.spec.ts` holds the jump between an order and its trade, and every part of it lives
  in the VIEW rather than in a panel: a CLOSED target panel being opened, a HIDDEN one coming back
  rather than the jump landing nowhere, the position reaching the address bar, a marked row still
  answering the pointer with its hover, a jump from far down the orders SCROLLING its trades into
  view, and the mark surviving a real reload without the page scrolling on its own. The scroll test
  jumps from the LAST link on purpose: the trades of the first one are on screen anyway, so a test
  on them stayed green with the scroll removed (2026-10-12). The fixtures make the trap concrete —
  `pos_ethusd_1` appears in five scenarios of the order history and two of them produced a trade, so
  the link is drawn twice and the mark lands in one scenario rather than in every row carrying that
  id.
- `open_in_context.spec.ts` holds the way from one VIEW into another — a deployment's session into
  its run, a run into the deployment it was a session of — because a unit test records where a panel
  asked to go, and only a browser shows the shell going there.
- `panel_boundary.spec.ts` holds the one claim the unit suite cannot reach, because it is about the
  WORKSPACE and not about a panel: a section that cannot be drawn takes ONLY itself off the screen.
  The fault is injected rather than waited for — `mockApi` takes an option to serve one named field
  of one section as a number, so the read throws exactly where the original defect did, and the body
  stays the real capture in every other respect. The healthy panel count is measured in the same
  test rather than written down, since which sections a run carries is a property of the captures.
  Two moments, because they fail differently: `warnings-errors` is open by default and throws at
  FIRST PAINT, which is the shape that cost eleven panels at once; the Orders panel is folded and
  throws when the reader opens it, so the mark also has to survive folding it again.
- `list_ranks.spec.ts` holds the ranks — and, since 2026-10-09, that **opening a group does not move
  the columns**, which is the `auto`-track hazard the architecture note describes: measured
  identical to the pixel on the captured index, and a test rather than a comment because that is a
  property of the DATA. It went red on 2026-10-15, when the re-captured index put a wider value into
  a closed family, and since then the run list measures its closed families (`measureClosed`), so
  the guarantee is the code's and the test checks it. A run of two account currencies states each
  figure on its own line beside its trade count — they stood inline as `3.74 EUR-22.95 USD` until
  2026-10-18, one figure minus another. It is the ONLY instrument for them: jsdom evaluates no
  container queries at all, so the unit suites can assert only that each list declares the same rank
  twice — on the column and on the cell. Whether the browser then acts on it needs a browser. FIVE
  widths — one on each side of every rung, because a rung nothing measures is a rung nobody knows is
  broken — every ranked list on the run view — `.order-list` joined on 2026-10-05, and its absence
  until then was a real gap, since the panel it replaced was never swept either — and the assertion
  is a RELATIONSHIP rather than a pixel number: the track count, the visible headings and the
  visible cells are all the count of columns whose rank survives the tier the shell measured. It
  also asserts that every ranked list actually gives something up when narrowed, that the run list
  keeps its card at the narrowest tier, and that neither the run list nor the trade list scrolls
  sideways there. It also holds the OTHER declaration that needs two halves: **every figure cell
  stands under its own heading**, compared as the right edge of the INK through a Range so padding
  does not enter into it. That assertion found three of the four lists misaligned by 11 to 172 px,
  ten columns of ten in the booking periods — every declaration correct, the geometry not.

Three traps it walked into while being written, all now in the spec's own comments. A stored run
draws NO run list, because the picker collapses once a run is chosen. The booking-period
table lives in a closed `<details>`, which is not laid out at all — its grid resolves to numbers
that mean nothing, and the first version of the spec duly reported a track count no declaration
could produce. And sweeping the panel bar by index looked equivalent to opening panels by NAME and
was not: three panels read `aria-expanded=false` after the sweep had clicked them, because the clicks
landed before the stored layout finished reconciling and it closed them again — so the spec measured
two lists of four and said nothing about the other two. It now names the lists it measured and fails
if one is missing, because a silent skip reads as coverage. `deployments.spec.ts` holds the LEDGER view, which had no browser coverage at all until 2026-10-01
— the mock served only the run plane, so the deployments page, its picker and its timeline had never
been opened by a test although their three captures existed. It holds the picker listing the ledger
and opening a history, each run opened from a deployment showing its own executive summary (every
session's summary answered with its own net P&L, so two runs cannot be mistaken for each other — the
spec went red against the jump that only changed the context), the selection surviving a reload as a link, a stale link saying so, the
open list standing alone in a low view while a tall one keeps it beside the history, the
figure cells right-aligned under their headings, and the timeline marking round moments rather than
the overlapping stamps an operator photographed. `panel_layout.spec.ts` also holds that **a narrow run bundle keeps its run line to one line**, that the Panels menu switches a section in the column off and on again, and that a narrow Deployments panel keeps its deployment line to one line. It holds that **no panel scrolls sideways**, at a wide
and at a narrow width: `.panel-content` carries `overflow-x: auto`, which is the right safety valve
and a poor everyday state, because the moment it engages the panel's leftmost column slides out of
view and nothing says so. Two defects of exactly that shape reached the screen in one week — a
56-character worker type pushing the configuration table past its column, and an axis label whose
transform pulled it back on screen but not in layout, so a panel offered 67 px of scrollbar for
nothing. Both are geometry, so jsdom cannot see either. `view_heights.spec.ts` holds that **a list
caps its height against its VIEW, not the window**: the run list ends inside a view given half the
window's height, keeps at least a row in a very short one, and reaches the bottom of its panel
with the hint dismissed — a fixed reserve for the hint once left 144 px empty below the last row. Its first version ran at full height
and stayed green with the size container removed — the budget around the list holds more slack
than the gap between window and view — so the view is now shrunk, and both tests were seen to fail
once with the container, and once with the floor, taken away. `performance.spec.ts` is excluded from the
ordinary run (`npm run test:perf`, one worker) because its budgets fail under contention. Its cold
figure also carries the test browser's own stall before it asks for the page, so it prints a second
one read on the page's clock, from the document's arrival to the first row: the app alone. And a
run's panels count as drawn only once the last loading line is gone — a panel keeps its place while
its section loads, so its header alone no longer says the panel can be read. Since the run chart
draws for itself (viewer#41) it measures that too, on the fixture's busiest unit: a unit chosen until
its marks stand on the candles, read on the page's own frames, and a zoom step until the frame after
it has painted, the mean of ten — a figure that carries two round trips to the browser per step, so
it is read against its own earlier column, never as the drawing's cost alone. And a sweep's ranking
at the size a real search reaches (viewer#32): 500 combinations built from the capture, timed from
the sweep opened until the 500th row stands — what says whether the ranking needs a row cap.

**`e2e/order_steps.spec.ts` says why a browser spec earns its place.** The
nested step list is a grid INSIDE a row of another grid, which is the arrangement behind two of the
overflow defects this project has shipped, and no jsdom assertion can see it. The capture is
NARROWED to one position the way the route is, so the mock answers for that one and an empty stream
for every other — and the spec narrows the list by the app's own `unit` param first, because
`pos_eurgbp_1` belongs to four scenarios here and the first row carrying it is in a different one.

**The browser is not in the container.** The image is Alpine on musl and Playwright's browsers are
glibc builds, so the runner connects over CDP to a browser on the developer's machine —
`e2e/cdp_fixture.ts` documents the one command that needs. `.npmrc` carries
`playwright_skip_browser_download=1` so a rebuild never spends a gigabyte on a Chromium that
cannot start. CI is a separate answer (a compose service on the official image) and shares the
same config.

**A geometry assertion used by more than one spec lives in `e2e/list_geometry.ts`, and it is shared
because it drifted.** `expectHeadingsReadable` was copied into two specs. When a column first
declared a `hint`, one copy was relaxed from *the title equals the label* to *the title begins with
it* and the other was not — and the stale copy failed months later, the moment a second column
declared one. The fix had to be made twice, which is the signal: one assertion, one home.
