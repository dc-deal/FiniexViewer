# Testing Architecture

Unit test setup for FiniexViewer. No API server required — all HTTP calls are mocked.

---

## Tools

| Tool | Role |
|---|---|
| **Vitest** | Test runner — shares the Vite context, no separate configuration overhead |
| **Vue Test Utils** | Store and component mounting in isolation |
| **jsdom** | DOM environment for Node.js (localStorage, window, routing) |
| **@vitest/coverage-v8** | V8-native coverage reporting, no instrumentation step |

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

**What the browser tier is for, concretely.** `run_selection.spec.ts` holds the reload — a real
`localStorage`, and a real boot from it — and two tabs side by side: each keeps its own run and
column across a reload, and a new one starts from the last saved. The column is asserted first,
because a storage shared between tabs fails it every time, where it lost the run only when the other
tab's delayed save landed in between. `dock.spec.ts` holds the docked panels, which jsdom cannot
lay out at all: the first arrangement in the suggested order, a tab behind another drawn only once
it is shown, an arrangement that survives a reload, the way back to the suggested order, a closed
panel brought back from the Panels menu, About opening as a dialog rather than as a tab, the quick
bar holding the chart's selection only while the chart is in front, the Runs tab carrying the
grade of a run that did not succeed, and a page that never scrolls — also once the window is made
smaller, which is what left a panel behind a tab reaching past the bottom; and a panel dropped at the dock's outermost edge spanning that whole edge — along the bottom, where the first arrangement's two columns tell it apart from a drop on one group. `run_selection.spec.ts` also holds the rule that a selection
never moves the layout — choosing a scenario leaves the executive panel's box and the row under the
pointer exactly where they were — and a section still on its way keeping its panel standing with a
loading line, the route held back on purpose.
`settings_dialog.spec.ts` holds the settings dialog to ONE size whatever the tab, measured per tab,
and to a frame that stays inside a small window with its content scrolling, and the account standing
in the menu bar with no tab for it in the settings. `machine_status.spec.ts` holds the machine's
state in the menu bar — both shares from the captured reading, on one line, its card naming where
the limit was read — and that a new reading moves nothing beside it: the account keeps its place
while a share goes from 100 to 9. `open_as_panel.spec.ts` holds a section opened as a panel of its
own: docked beside the column rather than over it, gone from the column, put back by its tab's
close, still opened after a reload, and a jump from the orders landing in the trade history opened
as a panel. `narrow_panels.spec.ts` holds what a narrow panel does to what stands beside it: the
narrowing's text in the quick bar shortening before any tab goes into the overflow menu, its button
still whole — at a width where the tabs fit beside the bar's mark and button and not beside its whole
text — and no figure of the executive summary breaking onto a second line or cut short, at the
width where they broke; and the run list's facet bar on one line at 1400 and 700 px and on two at
most at 420 px, measured against the height of one chip. All of them were red against the code
before them. `run_chart.spec.ts` holds the run chart: the chart mark on a trade opening it BESIDE the
run report, on the trade's unit, drawn on a canvas with its marks counted on the element and the
position marked in the list; the Panels menu opening it on the first unit with trades; and ONE focus, from both sides — a scenario chosen in the list is the one the chart draws, a unit chosen in the chart narrows the lists to it. `trade_groups.spec.ts` holds the open/closed regimes
of the scenario groups, and two things only a browser can state: that the group heading resolves to
the SAME grid as the rows beneath it — read from `getComputedStyle`, which also catches a track
collapsed to zero — and that a trade opens its fills and they offer nothing to click. The test it
replaced counted `<th>` against the group row's `colspan`; after the migration both are zero, so it
would have passed for ever on a subject that no longer exists. `position_link.spec.ts` holds the jump between an
order and its trade, and every part of it lives in the VIEW rather than in a panel: a CLOSED target
panel being opened, a HIDDEN one coming back rather than the jump landing nowhere, the position
reaching the address bar, a jump from far down the orders SCROLLING its trades into view, and the
mark surviving a real reload without the page scrolling on its own. The scroll test jumps from the
LAST link on purpose: the trades of the first one are on screen anyway, so a test on them stayed
green with the scroll removed (2026-10-12). The fixtures make the trap concrete — `pos_ethusd_1` appears in five scenarios of the order
history and two of them produced a trade, so the link is drawn twice and the mark lands in one
scenario rather than in every row carrying that id. `open_in_context.spec.ts` holds the way from
one VIEW into another — a deployment's session into its run, a run into the deployment it was a
session of — because a unit test records where a panel asked to go, and only a browser shows the
shell going there. `panel_boundary.spec.ts` holds the one claim the
unit suite cannot reach, because it is about the WORKSPACE and not about a panel: a section that
cannot be drawn takes ONLY itself off the screen. The fault is injected rather than waited for —
`mockApi` takes an option to serve one named field of one section as a number, so the read throws
exactly where the original defect did, and the body stays the real capture in every other respect.
The healthy panel count is measured in the same test rather than written down, since which sections
a run carries is a property of the captures. Two moments, because they fail differently:
`warnings-errors` is open by default and throws at FIRST PAINT, which is the shape that cost eleven
panels at once; the Orders panel is folded and throws when the reader opens it, so the mark also has
to survive folding it again. `list_ranks.spec.ts` holds the ranks — and, since
2026-10-09, that **opening a group does not move the columns**, which is the `auto`-track hazard
the architecture note describes: measured identical to the pixel on the captured index, and a test
rather than a comment because that is a property of the DATA. It went red on 2026-10-15, when the
re-captured index put a wider value into a closed family, and since then the run list measures its
closed families (`measureClosed`), so the guarantee is the code's and the test checks it. It is the ONLY instrument for them: jsdom evaluates no
container queries at all, so the unit suites can assert only that each list declares the same rank
twice — on the column and on the cell. Whether the browser then acts on it needs a browser. FIVE
widths — one on each side of every rung, because a rung nothing measures is a rung nobody knows is
broken — every ranked list on the run view — `.order-list` joined on 2026-10-05, and its absence until then was a real gap, since the panel it replaced was never swept either — and the assertion is a RELATIONSHIP rather than a pixel
number: the track count, the visible headings and the visible cells are all the count of columns
whose rank survives the tier the shell measured. It also asserts that every ranked list actually
gives something up when narrowed, that the run list keeps its card at the narrowest tier, and that
neither the run list nor the trade list scrolls sideways there. It also holds the OTHER declaration
that needs two halves: **every figure cell stands under its own heading**, compared as the right edge
of the INK through a Range so padding does not enter into it. That assertion found three of the four
lists misaligned by 11 to 172 px, ten columns of ten in the booking periods — every declaration
correct, the geometry not.

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
figure cells right-aligned under their headings, and the timeline marking round moments rather than
the overlapping stamps an operator photographed. `panel_layout.spec.ts` also holds that **a narrow Runs panel keeps its run line to one line**, that the Panels menu switches a section in the column off and on again, and that a narrow Deployments panel keeps its deployment line to one line. It holds that **no panel scrolls sideways**, at a wide
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
its section loads, so its header alone no longer says the panel can be read.

**A long run inside the container gets a DEADLINE, and `scripts/run.sh` is how.** A `docker exec`
that times out is not stopped — only the host side of it is: the process inside keeps its CPU and
its heap, and nothing reports that it is still there. That is how the container reached 27.28 GB at
1300 % CPU on 2026-09-29 and starved the Docker API into answering 500, with a `knip` call
abandoned at a 300 s timeout still running an hour later. The script puts the deadline INSIDE
(`timeout -k 10 N`), and a trap kills whatever the deadline left, the same way `e2e.sh` kills the
browser:

```bash
bash scripts/run.sh test        # the unit suite, 420 s
bash scripts/run.sh lint        # 300 s
bash scripts/run.sh build       # 600 s
bash scripts/run.sh knip        # 600 s
bash scripts/run.sh -- <cmd>    # anything, at the default deadline
```

A deadline reads as exit **143**, not as a failing test — BusyBox `timeout` lets the signal kill the
child rather than returning GNU's 124. The script says so in words and then prints the container's
largest and oldest processes, because `etime` is the column that names an orphan.

Two traps it was built around, both measured 2026-10-10 and both self-inflicted: a matcher whose
own command line contains the word it searches for finds ITSELF (`pkill -f vitest` killed its own
parent), and a ZOMBIE answers a `pkill` with success although nothing happens — the container has
no init to reap, so it carried 33 of them and the trap announced a cleanup after every single run.
Every pattern therefore carries a bracket, and the probe ignores anything in state `Z`.

**The browser is not in the container.** The image is Alpine on musl and Playwright's browsers are
glibc builds, so the runner connects over CDP to a browser on the developer's machine —
**`e2e/order_steps.spec.ts` is the newest, and it says why a browser spec earns its place.** The
nested step list is a grid INSIDE a row of another grid, which is the arrangement behind two of the
overflow defects this project has shipped, and no jsdom assertion can see it. The capture is
NARROWED to one position the way the route is, so the mock answers for that one and an empty stream
for every other — and the spec narrows the list by the app's own `unit` param first, because
`pos_eurgbp_1` belongs to four scenarios here and the first row carrying it is in a different one.

`e2e/cdp_fixture.ts` documents the one command that needs. `.npmrc` carries
`playwright_skip_browser_download=1` so a rebuild never spends a gigabyte on a Chromium that
cannot start. CI is a separate answer (a compose service on the official image) and shares the
same config.

**A geometry assertion used by more than one spec lives in `e2e/list_geometry.ts`, and it is shared
because it drifted.** `expectHeadingsReadable` was copied into two specs. When a column first
declared a `hint`, one copy was relaxed from *the title equals the label* to *the title begins with
it* and the other was not — and the stale copy failed months later, the moment a second column
declared one. The fix had to be made twice, which is the signal: one assertion, one home.

---

## Running Tests

```bash
# Run all tests once
npm run test

# Run with coverage report
npm run test:coverage

# Run in watch mode (during development)
npx vitest
```

---

## Configuration

**`vitest.config.ts`** — extends `vite.config.ts` via `mergeConfig` so that the `@/` path alias, Vue plugin, and other Vite settings are inherited automatically. Only the `test.environment` key is added.

---

## Test Files

```
tests/
  selection_store.test.ts   — the facade over the main link's market and the chart's timeframe: brought back from the arrangement, a new broker clearing the symbol and keeping the timeframe, resetTimeframe, isReady
  timeframe_store.test.ts   — load-once cache, minutesFor lookup, error handling, loading flag
  bars_store.test.ts        — coverage validation, window calculation, a timeframe outside the coverage REPORTED and the selection left alone, error handling
  context_store.test.ts     — the main link always there, the cascades (a new run takes the narrowing and the mark with it, a narrowing keeps the mark and drops duplicates, a new broker clears the symbol), one scenario in focus — a click moves it, a second on the same one clears it, and a restore that applies stored links without cascading
  arrangement_store.test.ts — the stored selection restored into the context on creation and every change written back, a damaged entry reconciled rather than trusted, another schema removed rather than converted, an unreadable entry the same as none, the retired chart keys removed, a cleared bar kept apart from an untouched one across a reload, and where each panel stood kept across a reload — a place naming nothing to stand beside, or a side that does not exist, dropped; the run chart's unit and timeframe written back with the run they were chosen for, and reconciled field by field; and a stored narrowing of several reconciled to one scenario in focus
  tab_storage.test.ts       — what a browser tab keeps for itself: its own entry read before the one any tab saved last, a NEW tab starting from the last one saved and keeping it as its own — starting with nothing kept too — so another tab's later write never reaches it, every write to both and a removal from both, the shared entry still read where the tab's own storage is blocked, and blocked storage the same as none, never a throw
  use_run_binding.test.ts   — the run the reader had open brought back with its narrowing and its mark, a run gone from the index named, the index alone where nothing was open, and a run picked while the stored one is still loading kept — its late answer discarded
  use_deployment_binding.test.ts — the deployment brought back, and one the ledger no longer lists named
  use_chart_binding.test.ts — a timeframe the symbol has no coverage for cleared, a covered one kept
  use_facet_state.test.ts   — an untouched bar on its defaults and storing nothing, narrowing, search and sort brought back, a CLEARED bar kept cleared rather than given its default back, and the scope: a narrowing stored for another run dropped with its sort kept, the same run restored, and a run change under a mounted bar dropping the narrowing and storing the new scope
  runs_store.test.ts        — run index loading, the flat index, missing-artifact flag, error handling (a summary in an older schema kept as a state, not as an error; a summary that failed said as the summary's, the index and its runs left alone), and the scenario narrowing: one scenario in focus, moved by each click and cleared on the same one, no duplicates, dropped whenever the run below it changes; and a refresh that fetches again without a spinner in place of the list; and an id the index does not know asked for once more before it is called gone, loading a run that arrived since
  translate.test.ts         — the marker returns its input; the count agrees with its noun, zero reads as plural, a large count stays grouped
  run_panels.test.ts        — KPI rendering (units, n/a, per-subset and per-trade-count gating, SIGNAL absence), the warnings/errors tiers, the shutdown mode as detail rather than verdict, a refusal at the first tick marked as something to weigh while a crash's reason stays an error, the narrowing (a unit's errors, a run-wide warning kept while another unit's drops, the outcome counts marked as the run's), the executive figures marked as the run's, and the run header incl. the two kinds of parent (a deployment's history opened through the channel and named as plain text where nothing can open it, a sweep named and not offered as a way in), MARKET TIME (covered in days past two, the summed span only where the units overlap, n/a where the run never recorded it), the two excursions, what the account started from, and a run of several accounts saying how many and which one fell deepest
  overflow_fit.test.ts      — how many items fit before the control: all of them without the control where the whole row fits, the first that no longer fits beside it, the order kept rather than a smaller item jumping ahead, none, and an empty row
  overflow_row.test.ts      — every item and no control where there is room, what does not fit put behind the control from the end and in order, a hidden item inert and hidden from a screen reader, the menu handed exactly what waits, an end group standing at the end until it has gone and the control takes its place, and the picks behind the control counted on it, which is marked, in a room kept for the count. Its harness, `overflow_harness.ts`, hands the row its widths by class, since jsdom lays nothing out
  facet_bar.test.ts         — the bar on one line: the search folded into ⌕ and opened in place with the focus in it, kept open while it holds a term and folded when left empty, dropped with Escape; a facet that does not fit behind `+N` as a submenu with its values, counts and picks — a pick keeping the menu open, the picks behind the control said on it — and a facet that cannot narrow offered there disabled; the room of clear, of the widest count and of the longest sort name kept whatever is picked; and the sort in force named, changed from its menu. `facet_harness.ts` holds `searchFor` and `sortBy`, which every list test uses to search and sort through the bar the way a reader does
  panel_column.test.ts      — a panel whose section the run does not carry left out, one still on its way kept in its place with a loading line saying so, and the room its content last took held while it loads; a section open as a panel of its own left out and taken back once closed, and the button in its header asking the dock to open it
  layout_store.test.ts      — reconciliation against the registry, pin/lock semantics, hide/show, reorder, export-import
  settings_store.test.ts    — per-field reconciliation (unknown key dropped, missing key defaulted, out-of-range refused), the schema-version discard, setters that ignore rather than clamp, and the display subset handed to panels
  settings_menu.test.ts     — the two dialog tabs (display against the store, layout export/import incl. a bad file reported rather than swallowed), and the menu: the theme entry naming what it switches TO, and About opened from there as a dialog; the docked panels taken back to the suggested order from the layout tab
  caller_store.test.ts      — the four states of GET /api/v1/caller, the display-name fallback, a refused token told apart from an unreachable server, the first read shown as loading while a re-read keeps the last answer on show, and that nothing is cached
  run_sections_store.test.ts — what the sections render, composed once: the roster from the declared, the earned and the failed, a composed model keeping its identity while an unrelated section arrives, what is on its way (the summary standing for two), and every absence with its reason, the summary's among them; what a section reads — its absence from the slot it cannot do without, every failure among its slots, the summary in an older schema for both sections it feeds, the readers of a slot, and a chosen run lacking a section only once it is known not to come
  use_run_reports_loading.test.ts — the sections a run lists and nothing else, its header and configuration whatever it lists, a logs-only run asked for its header alone, nothing asked before the index is back, and the run chosen next asked again
  use_panel_jump.test.ts    — the mark set and a hidden or folded section made reachable, the marked row scrolled to once it is there or once the section draws it, and a marked row outside the Runs panel ignored; the jump landing in the own panel of a section open as one, and the Runs panel brought to the front for a section in the column
  report_section.test.ts    — a section as a panel of its own: drawn with the model the column would hand it, carrying the address the column gives the section, standing while it loads, saying why in the backend's words where the run has no such section and neutrally where the run never wrote it, saying that no run is chosen, saying every failure among its slots without drawing the section, and framed while the run is narrowed — but only where the narrowing filters the section: not on the roster, which marks, nor on the Executive Summary, which it does not change
  machine_store.test.ts     — a read at once, then every few seconds; the last reading held through a failure and called old once three polls brought nothing new; no second request while one is on its way; nothing asked while the page is hidden and a read at once on its return, without calling the held reading old meanwhile; nothing after stop
  machine_status.test.ts    — both shares in slots of one width, silence about the grade at ok, a grade that is not ok as a mark and its word (one this version does not know shown as itself), the reasons passed on as they come, a reading that stopped arriving saying since when, dashes before the first reading and "no reading" after a failure, the card carrying the limit, where it was read, the thresholds and the window, and "no window yet" where the server has none
  account_status.test.ts    — every state of the caller as a mark and a word in its role (connecting, no sign-in, token refused, server unreachable), the account named quietly once the server reports one, its card carrying the account, the client, the grants, the note and when it was read, and a server that verifies no token saying why there is no identity rather than showing one
  record_list.test.ts         — the shared list stem: the flat list unchanged (one row per record under one set of headings, the TRACKS owned by the list rather than by a row), groups (partitioned in the order the rows arrive and never alphabetically, a closed group's heading drawn without its rows, the click reported as a key so the component holds no state, the first cell indented and never the row, the heading a native button carrying aria-expanded), the card beside a row (wrapped by the list, absent where the caller answers null, and NO tooltip machinery mounted at all where no card was offered), nested read-only use (no headings, and a row that is a div rather than a button that ignores its click), a chosen row announced as chosen and only where rows can be chosen, and BANDS: their spans must cover the columns exactly or none are drawn, each band carries the span it KEEPS at every rank tier (the declared span counts the widest tier only), and a band that would lose every column when narrow is reported rather than patched to one; and what a heading says on hover — the label alone, or the label THEN the column's hint, never the hint in place of it; and one class the CALLER puts on a row, kept beside the list's own states rather than replacing them; a card beside a group heading, only where the caller offers one and only on a heading that is a control; and the rows of a closed group measured where the caller asks — drawn unseen and out of reach, and not at all where it does not
  facet_filter.test.ts      — OR within a facet and AND across facets, a facet counting against the OTHERS and not itself, a picked value kept listed at zero, a row that states no value never claimed by one, and that nothing is mutated
  run_picker.test.ts        — the flat list on the shared stem (every run whatever its group), newest first, sorting on the INSTANT rather than the text of the stamp, a damaged stamp shown as no date rather than Invalid Date, the stamp read from its OWN cell since the id beside it also begins with the year, the year dropped inside the current one and kept outside it, a logs-only run marked but still selectable, narrowing by facet, every row kept on show once a run is chosen with the chosen one marked — one chosen before it mounted too — and a pick choosing the run and saying which, the list staying as it is, what the row says the run DID (one figure per account currency and never folded, an outcome shown only where the run recorded one, the trouble count silent at zero, the id shortened with the whole value in its title, how much market time it covered), and the RANKS with the card that makes them defensible: every cell carrying the rank its own column declares, a card on every row, the configuration and provenance and weight, `ticks_from` stated only where the run recorded it, the artifacts counted with their names in the title, the Tier-2 log count present only where it is not zero, and a run whose stamp is not a date still drawn. Rows on screen are counted as `.record-row:not(.record-unseen)`, because the list also draws the rows of its closed families, unseen, for their widths
  scenario_roster.test.ts   — the complete roster incl. the scenarios that produced nothing and their reason, the notice above the filter, narrowing by facet and by search, the honest count, a facet dropped where no row states a value, and CHOOSING a scenario (a click puts it in focus, a second click takes it back out, a click on another moves the focus and never collects several, a failed scenario choosable like any other, inert without a host, the hint that says what a click does, kept after a pick so the list does not move, with the choice marked on its rows only). Its figures are read CELL BY CELL against the column headings since the twelve-column migration — as running text, a probe for the currency an amount is IN matched the currency a scenario merely declares. A narrowing survives a section of the SAME run that arrives late and is forgotten for a different run — told apart by the run id, never by the identity of the composed model
  run_reports_store.test.ts — section loading (warnings/errors, portfolio, broker, aggregated), error text KEYED BY SECTION so a concurrent load cannot drop a sibling's failure, clearing on run change, and the ABSENCE as a value — the cause kept beside the empty slot, two sections missing for different reasons, an absence that is not an error, and every reason forgotten on a selection change; an answer for a run no longer chosen dropped whether it succeeds or fails, the next run's loading flag left alone by the previous run's request, the steps of a position likewise, and the unreadable state kept per section and on every section
  api_client.test.ts        — request construction, endpoint paths, query params, response mapping, 404 / 409 / 403 mapping, and a 409 read as a stale artifact with the backend's sentence on every report route; the bars route's `X-Bar-Truncated` carried on with the rows
  api_contract.test.ts      — the captured fixtures against the contract they were taken under, each list's declared row key, and the machine reading stating its own thresholds, with reasons exactly where it is not ok
  deployments_store.test.ts — ledger listing, the row identity the ledger DECLARED kept rather than dropped, the authority guard on an unknown id, sessions and periods loaded together, the two-currency case, a forbidden surface as its own state, and a refresh with no spinner in place of the ledger, and an id the ledger does not list asked for once more before it is called gone
  deployment_picker.test.ts — the select box replaced by a facet bar over a flat list: what a deployment DID on the row rather than behind the choice, ONE ROW PER LEDGER ROW (a bot booking in two account currencies has two, and the identity is read from the declared key rather than hardcoded), the deployment a clicked row belongs to, the list collapsing once one is chosen into one line with the whole of it on hover, and opening collapsed on one chosen before it mounted, an empty ledger stated plainly; and what the row leaves out — every cell carrying its column's rank, a card on every row, the drawdown caveat beside the drawdown (a sum over sessions it is NOT), the bot id only where the profile declares one, the configuration spoken about only where it MOVED, an absent idle stretch stated as absent rather than as zero, and the facets: the configuration offered as words rather than as a boolean, and no currency facet at all where every deployment books in one
  booking_period_panels.test.ts — the three-state reconciliation incl. "not checked", the completeness wording, the magnitude drawdown, the timeline (tracks, polarity, no extent, unreadable timestamps, and no rule ruled across lanes that do not share the boundary), the table carrying every field the hover card has incl. the equity band, the column groups, the shared currency stated once and kept per-cell where the rows disagree, the opening balance with its absence stated rather than computed, the fee breakdown one hover from the fee, a period's run and a session lane's label each opening that run through the channel and each named as plain text where nothing can open it, and under a narrowing: only the chosen lanes drawn while the run-wide verdict keeps its figures and says so
  aggregated_portfolio_panel.test.ts — the fold of a run over its scenarios, and mostly what it LEAVES OUT: the run-wide cost split with maker/taker only where charged and the average spread kept out of the account currency; the three distinctions a reader gets wrong without it (the highest peak of ANY account against the deepest account's own peak, the REALISED balance against the valued equity, an undefined recovery factor as n/a); the spot holdings stated as estimates and absent where the currency is not spot; a mixed-model currency saying so and silent otherwise; and the guards — no figure the executive summary already states, no pending-order or latency figure (that is another route's subject), no per-scenario inventory table
  orders_panel.test.ts      — the two order routes as ONE panel: the group heading carrying the SERVED funnel rather than a count of the rows beneath it, a rejection marked there and nothing marked where there was none, a scenario that reached no queue saying so instead of showing a funnel of zeroes (and the same where the run serves no pending section at all), the orders resting at data end stated only where there are any, an untimed scenario as absent rather than as zero, and the two outcomes that have never fired kept out until they do. Then the row: the backend's rejection sentence beneath the row it belongs to and nowhere else, a value the record never held stated as absent rather than as a zero nobody reported, what EXECUTED where it did against what was asked for where it did not, a refusal and an expiry on different channels, and a row keyed by its POSITION so one order can appear as several rows; plus every cell carrying its column's rank, an empty run stated plainly, and nothing to click but the headings; no POSITION column, because `order_id` IS the position id and the column repeated it; and under a narrowing only the chosen scenarios drawn, with an empty result stated as theirs rather than as the run's; the column headed the backend's way (`Order id`) with the glossary sentence on the heading, because `order_id` is the POSITION's id and `Order` alone claimed otherwise; and the LIFECYCLE of one position read as one — the id named once with the following rows carried on, the opening row marked so the boundary sits on it, the id shown again where two positions alternate (measured: 2 of 246 groups do), and the row above read from the NARROWED list; and the way to the trades — the link on the row that names the position, absent where the position produced none, where the run carries no trade history and where the workspace has no such panel, the jump naming the PANEL and the POSITION rather than the id alone, and the mark covering the whole lifecycle while leaving the same id in another scenario alone; and the THIRD level from the event stream — the disclosure drawn once per position and only where the run wrote a stream at all, the request made on OPENING and for that one position, the waiting state told apart from an empty stream, the steps grouped into the ORDERS they belong to by `submitted_seq` rather than by the position id they share, an order that was never submitted named that rather than given a number, the order of the STREAM kept where the clock repeats, and the de-duplication left to the store that can actually do it; the funnel in the backend's OWN words since contract 23 (submitted, accepted, rejected, never confirmed, expired) with the duration carrying its word rather than standing as a bare `1438 ms`, and the two counters that have never fired kept out until they do. The `arrived` caveat that stood here is GONE with its subject: it paraphrased a defect of theirs, they fixed it and named the field `total_accepted`; the chart mark on a position with trades, pointed at the position, and none on a position that produced no trade
  order_steps_harness.ts    — the step capability for a test host, and one captured-shaped step: the request is RECORDED rather than performed, the way the position-link harness does it, so a panel test can prove it asks ONCE for the position the reader opened without having a workspace to fetch in
  broker_panel.test.ts      — the panel that replaced Portfolio: one block per broker titled by the declared key, the conditions a scenario traded under, and the MARGIN gate — nothing printed where the backend does not require the fields (leverage 1), all three together where it does. Then the sentence that is the point of the panel: several brokers said to be incomparable, what actually DIFFERS named from the fields that differ, no difference claimed where they agree, silent on one broker, and the margin half in WORDS rather than by comparing a mode string whose `none` is a default. Plus the symbol table: the rules per symbol, a volume kept at the precision the backend stated and never in exponential notation, both swap directions as one fact, every cell carrying its column's rank, an empty symbol list stated rather than drawn, and nothing to click
  trade_history.test.ts     — the magnitude excursion, the VISIBLE row cap, what the card carries that the row cannot, the scenario threshold (summaries past it, the group heading still complete, opening one by pointer), the FILLS as a third level (folded until clicked, both legs then drawn, no headings and no controls of their own, the share named only where the trade took part of a bigger fill, and never a claim about how many trades share one), and under a narrowing: narrowed BEFORE capped, the cap counted against the narrowed set, an empty result stated as the scenario's; plus what a narrow list keeps — every cell carrying its column's rank, the group heading laid out from the END of the tracks rather than by a span fixed at eight columns, and the net closing the row after the life of the trade; plus the POSITION leading the row as part of the trade's own key, and the way back — the jump naming the panel and the position, no link where that panel is not in the workspace, and every trade of a position marked because a partial close books more than one; the chart mark on every trade of a unit the run chart can draw and on no other, pointing the chart at the position rather than the position id, and absent where no host offers the chart; and what a unit cost on its heading — only the parts the API served that are not zero, the whole split in the card beside it, a spread never measured said as not recorded with its reason, and no card where no total was served
  panel_boundary.test.ts    — the header drawing its panel kind's icon, and the error boundary around ONE panel: content drawn where nothing is wrong, a panel that threw kept inside its own frame with its title and controls intact, the header marked so a folded panel still says it failed, the error written to the console and never into the page, a failed panel given another go once it is showing a different model, and a panel whose defect is in the CODE settling on the frame rather than looping between drawing and failing
  panel_kinds.test.ts       — every kind with its own id and place in the suggested order, the first arrangement deployments · the run list · the run report · chart, the first tab the run list without a run and the run report with one, the run list and the run report in one area with the run named on the report's tab, a form icon on every tab, no kind for About or the settings (they are dialogs), nothing known of a retired kind; a kind for every section of the run report, kept out of the Panels menu, the section a kind shows named, and a list section drawn as a list, every other as a sheet; and the narrowing's quick bar beside a section exactly where the registry says the narrowing reaches it
  dock_layout.test.ts       — a stored layout reconciled: kept whole where every kind is known, an unknown panel dropped from its group with the front tab moved, an emptied group and the active group with it dropped, floating, popout and tab groups gone, and nothing returned where nothing usable is left
  dock_store.test.ts        — against a plain-data dock whose groups stand in one row and which brings a panel it adds to the front: the suggested order in one group with the run list in front and kept, the run report in front where a run is restored, a stored layout that never held the run report gaining it right after the run list where a run is chosen — in front only where the list was, and not at all without a run or where the reader hid it, a stored layout brought back reconciled, a layout the dock refuses answered with the suggested order, a panel brought to the front or opened beside the active one, a reset, a layout written once it holds still or at once when flushed, and a dock holding no panel never written over the arrangement it had; the open panels kept as dockview reports them, a section opened beside the Runs panel as a split and in front, the next one beside the last as a tab, an open section brought to the front rather than opened twice, and every section given back on reset, shown; and closing as hiding — a section whose panel is closed hidden with where it stood kept, shown again beside what it stood beside at the size it had, a tab put back among its tabs at its index, a section shown in the column where nothing it stood beside is open any more, ⇲ sending it back shown with its place forgotten, a section hidden through its panel or in the column, a closed main panel brought back where it stood, every place forgotten on reset with nothing hidden, and a hidden section that still knows where it stood after a reload; the run chart opened the first time as a split to the right of the run report; and the edges of the dock — what is being dragged known and forgotten once the drag ends anywhere, a dragged panel docked along the whole edge with a quarter of the dock, a row along the bottom with a quarter of its height, a group dragged by its header moved with all its tabs, and nothing added where nothing is dragged
  dock_edges.test.ts        — the dock's own edges: not there while nothing is dragged, every edge offered while a panel is, the room a drop will take shown under the pointer and gone when it leaves, a drop docking along the edge it landed on, and the edges taken away when the drag ends anywhere
  panel_host.test.ts        — a panel drawn the first time it is shown and never mounted twice, told when it is shown AGAIN and not on the first showing, a panel that throws stopped at its own frame with a sentence and the stack in the console, an unknown kind said so
  app_dialog.test.ts        — absent while closed; the title, the content and one way out, named for its caller; a fixed height only where one is given; the close button asking to close
  panel_tab.test.ts         — the run's grade on the tab of the run report where it is not a success (failed in the error role, finished_with_errors in the warning role, nothing for a success or no run), the chosen run named on that tab and on no other, the card saying what the panel is for and the status in words; the form icon and the kind's title, a close button that closes and stops its click there, named as hiding for a pointer and a screen reader, ⇲ on a section's tab putting it back into the column and on no other tab, the stored title for an unknown kind; the title of a section panel dimmed where the chosen run has nothing for it, and a section that could not be loaded marked with the word
  app_menu_bar.test.ts      — the panels worked in, offered in the suggested order with their form icons, the run list and the run report sharing the area Runs as a submenu, each under the name it has there; a tick on each open panel, a click hiding an open one and bringing a closed one back; every section listed in the column's order, each with where it is (in the column, open as a panel with its mark, hidden), a shown one hidden and a hidden one shown, one the chosen run lacks struck and not switched, nothing struck while no run is chosen, collapse all and reset column from the same submenu; the account status in the frame, and no Layout menu of its own
  use_section_states.test.ts — a section open as a panel placed there even where the column has it switched off, and a section called absent only once the chosen run has answered without it
  run_report_view.test.ts   — the run report as a bundle: the chosen run named in one line with the whole of it on hover, Change run bringing the run list to the front, no run chosen said with the way to the list and no column, a stored run gone from the index named, and a summary that failed said above the column while the column stays
  chart_quick_bar.test.ts   — what the three compact selects offer loaded when the chart comes to the front, the symbols of a broker the reader left selected, each select named for a screen reader and showing its name while nothing is chosen
  quick_bar.test.ts         — the chart's selection while the chart is the panel in front, nothing for a panel without options or a group that shows none
  runs_quick_bar.test.ts    — silent while the whole run is shown, the scenario in focus named in the line and in its title, a name this run does not have said only once the roster arrived, and the way back to the whole run
  use_open_in_context.test.ts — no way out where no host supplied one, and no throw either; the host's way out handed to a panel. Its harness, `open_in_context_harness.ts`, RECORDS where a panel sent the reader instead of navigating
  open_in_dock.test.ts      — the docked app's way out: each run it opens loads ITS summary and brings the Runs panel forward, the opened run starts without the previous run's narrowing, and a deployment it opens loads its history and brings the Deployments panel forward
  position_link.test.ts     — the comparison of a position: matching BOTH halves — never the position id alone, never a row that has no position at all
  hints_store.test.ts       — reconciliation (a retired id dropped, an unknown version discarded, no duplicates), a dismissal that lasts the session and is never written down, a ban that outlives the visit, and the reset that undoes both
  json_tree.test.ts         — key naming, quoted strings, array indices, null, fold depth
  run_config.test.ts        — the two configuration shapes, override PRESENCE without resolution, the overriding scenarios folded away while the warning stays in the open, the worker join, and the guarantee that no top-level key is unreachable
  app_button.test.ts        — the three shapes, a toggle announced as one ONLY where it is one, a genuinely disabled button rather than one merely styled as it, and that nothing submits a form by accident
  app_icon.test.ts          — the registry's drawing for a meaning, two meanings told apart, the meaning named on the element (`data-icon`), hidden from a screen reader, in the colour of its element with stroke 2
  icon_registry.test.ts     — the registry held to its rules: every meaning named somewhere in `src/` (read as text through `import.meta.glob`, in quotes of either kind, the registry itself left out by what it says rather than by its path), no two meanings on one drawing, every name in the scheme, every panel kind named `kind-<its id>`
  jump_link.test.ts         — a button in the link shape of AppButton, never an anchor; the name read and the arrow hidden from a screen reader; the click, title and class of its caller handed to the button
  hover_card.test.ts        — portalled out of the page, opens on focus, carries the caller's figures and their polarity, and a figure's caveat on its pair — only where it has one
  chart_card.test.ts        — the card of a thing drawn on a chart: what it says (its heading, its pairs in their tone), beside the pointer on the side with more room and never over it, and kept to the room on that side so it never leaves the frame
  report_format.test.ts     — the three formatters worth testing apart from the panels that use them: the canonical UTC clock, and a stamp that is NOT a date giving nothing rather than throwing (Intl raises on an invalid date, so one damaged field took down the whole list it was in); the byte steps, named after the step they actually divided by; a long hash shortened to the part that distinguishes it
  path_label.test.ts        — the whole path comes out whole, the name told from the folders, a break offered at every separator, and the full value kept in the title
  timeline_chart.test.ts    — scale and clamping, the broken axis and its length-preserving property, staggered labels, a way in put into a label only where the caller handed its lane something to open, and the label column kept as its own element around it; and measured in pixels (widths handed over by class): a span named where its characters fit, given its short name where only that fits, else none, an axis label dropped where it fits on neither row with both ends always kept, a label slid onto the axis while its pointer stays at the mark, and none drawn wider than the axis
  candle_chart.test.ts      — the chart built at its first real size and never at 0×0, bars that arrived earlier handed over and fitted, a collapse to nothing ignored and the next real size followed; the colours read from the theme tokens, repainted on a theme switch without a rebuild, taken at build time when the switch came first, and no longer followed once unmounted — two theme blocks with values nobody would choose are injected, so a colour can only have come from the token it names; the chart library and the ResizeObserver are replaced, because WHEN the chart builds and WHAT it paints with are under test, and a canvas reports neither inside jsdom; the marks of trades painted by their role from the tokens — an entry in plain ink, a result in its polarity, a flat one quiet — the one looked at larger and repainted with the theme, a long window centred on its focus while a short one is shown whole, and the count of marks on the element, since the canvas cannot be read; and the card at the pointer — every mark handed to the library with its id, the card of the id the library reports shown and none for an id the register does not know or for no id at all, and a card whose mark is gone dropped
  run_chart.test.ts         — the pure half of the run chart, over the captures: a backtest's units in the order the index declares them, drawn over the span their ticks covered in the market they name, their trades counted, a unit with no tick blocked, nothing guessed while the source that names the market is on its way, a session drawn in its configuration's market with its window open, and one that names none blocked; the unit it opens on with nothing in focus and nothing chosen (the first with trades, never one that cannot be drawn); the finest timeframe within the bar limit, ordered by length rather than name; the bar an instant falls in, looked up and never computed; the marks of long and short trades, a loss with its sign as a word, a partial close with one entry and an exit per part, the position looked at larger, and none before the first bar; every mark with an id of its own (an exit the trade row's declared key) and a card naming its position — the entry how it opened, the exit how it closed, its net in its polarity and the close named only where one was recorded; and the instant a position opened
  run_chart_store.test.ts   — the units read off the loaded reports and the archive asked nothing while no chart is on show; coverage and bars asked once one is, in the finest timeframe that fits and from one period before the window; waiting said while the market's source is on its way; the reader's unit and timeframe kept for the run and dropped for another; ONE focus — the scenario in focus is the chart's unit, a unit chosen in the chart puts it in focus, the focus cleared leaves the chart where it was, and the chart mark moves a focus on another unit while setting none where there was none; a position shown — its unit, the position marked, centred where it opened; the marks standing on bars served; a market the archive holds nothing for asking no bars; a cut window said; a late answer for a unit no longer on show writing nothing; a session drawn to the end of the coverage; and nothing asked once the last chart is gone
  run_chart_view.test.ts    — the run chart's states in words: no run, the candles drawn with their marks counted, the cut window said with the warning mark, the market the archive holds nothing for named, a window without bars named rather than drawn empty, a run that names no market, and the archive asked only while it is on show; and its quick bar: every unit listed, the ones that cannot be drawn disabled with their reason, and the unit and the timeframe chosen there, the timeframes shortest first
  deployment_panels.test.ts — a session's run opened through the channel and named as plain text where nothing can open it, the change marks between rows, drawn as a line ABOVE the session that starts the new stand and never as a row of the list (against the produced four-session history), the absent idle stretch, the upper-bound gap, the missing totals row, the identity that does not move, the advisory wording

tests/fixtures/            — responses captured from the running backend, plus the contract manifest
```

---

## Fixtures — captured, not hand-written

`tests/fixtures/` holds real responses taken from the running backend through the dev proxy, with
`capture_manifest.json` recording the `X-Api-Contract` number they were captured under. Two reasons,
and the second is the one that matters:

- A mock written by hand becomes a **second mirror of the HTTP contract**, and the two drift apart
  without anything saying so.
- The fixtures are **assigned to our own interfaces inside the test file**, so the type-checker
  performs a structural comparison. A field the backend drops makes the fixture stop satisfying the
  mirror and the BUILD fails — which is a CI gate, not merely a red test.

The run chart's market data is captured the same way: `coverage_<broker>_<symbol>.json` for the two
markets the fixture run traded, `bars_<broker>_<symbol>_M1.json` over exactly its units' tick spans
— asked from one minute earlier, as the chart asks — and the server's `timeframes.json`.
`e2e/api_mock.ts` serves them, the bars cut to the range asked the way the route cuts them.

`tests/setup.ts` supplies browser interfaces jsdom lacks (`ResizeObserver`, pointer capture). Those
stand in for MISSING APIs and never replace behaviour under test — a stub that answered differently
from a browser would make the suite agree with itself rather than with reality. One consequence is
honest and worth knowing: reka-ui's pointer path cannot be triggered in jsdom, so hovering is a
browser-only behaviour and the focus path is what the suite exercises.

Both halves are falsifiable and were proven so when written: raising the manifest number fails the
contract test, and removing `parent_kind` from the runs fixture fails `vue-tsc`. It has since caught
two mirror errors that review did not — `advisory` typed as a string when it is an object, and
`longest_gap_hours` typed as non-null when a one-session deployment has no gap at all.

**Two captures of the same route, because one cannot carry both halves.** `order_events.json` is
NARROWED to one position — which is what a panel asks for — and a narrowed answer holds no
`broker_truth` at all by design. `order_events_live.json` is unnarrowed and from the real-money
session, because that list exists nowhere else: a backtest has no venue to ask, its own book IS
the venue. It is also the only capture holding the live-only event types `cancel_deferred` and
`cancel_requested`.

One guard belongs to the fixtures themselves: a test asserts that the captured deployment still
carries the hard cases (a non-null advisory, a non-zero `unfinished`, both change marks).
Re-capturing against a quiet deployment would otherwise leave every test green and testing nothing
— the same failure as a gate with no files in scope, one level up.

Refresh them only deliberately, and read `GET /api/v1/contract` when you do — its `changes` list
says what moved. Then raise `EXPECTED_CONTRACT` in `api_contract.test.ts` in the same change:

```bash
python scripts/capture_fixtures.py --dry   # what would move, nothing written
python scripts/capture_fixtures.py         # all nineteen, or nothing
```

**When a refresh is needed, and when it is not.** It is needed when the contract changes SHAPE — a
field added, removed or renamed — because every fixture is assigned to its mirrored interface and a
new required field fails the type-check against an old capture; making the field optional instead
would be a compatibility shim, and the mirror follows the current contract only. It is also needed
when a pinned source is gone, or when FiniexTestingIDE names new ids for its fixture catalog. A
change of MEANING alone, with the same fields, needs none. Measured 2026-10-12: a capture takes about 47 s and prints one line per file.

---

## Mocking Strategy

### API layer

All HTTP calls are intercepted via `vi.mock('@/api/api_client', ...)`. The mock factory returns `vi.fn()` instances for each exported function. Tests set per-call behavior with `vi.mocked(...).mockResolvedValue(...)`.

```ts
vi.mock('@/api/api_client', () => ({
  getTimeframes: vi.fn(),
  getCoverage: vi.fn(),
  getBars: vi.fn(),
}))
```

Test files that use `bars_store` must pre-load the `timeframe_store` in `beforeEach` because `bars_store` calls `timeframeStore.minutesFor()` during `fetchBars`:

```ts
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.mocked(apiClient.getTimeframes).mockResolvedValue(TF_INFOS)
  await useTimeframeStore().loadTimeframes()
})
```

### axios (api_client tests only)

The `api_client` module calls `axios.create()` at module level. The mock intercepts `axios.default.create` and returns a stub with a controlled `get` function:

```ts
const mockGet = vi.fn()
vi.mock('axios', () => ({
  default: { create: vi.fn(() => ({ get: mockGet })) },
}))
```

`vi.mock` is hoisted by Vitest, so the mock is in place before `api_client.ts` is imported.

### localStorage and sessionStorage

Both are available natively in the jsdom environment. `localStorage` is cleared in `beforeEach` with `localStorage.clear()` to prevent state leaking between tests. `sessionStorage` is cleared before EVERY test by `tests/setup.ts`: the arrangement and the column's layout are read from the tab's own `sessionStorage` first (`src/tab_storage.ts`), and jsdom keeps it across the tests of a file — without the clear, every test after the first would start as a reload of the one before it rather than as a new tab.

### Two tests carry a longer clock, and it is a finding rather than a fact

The two cases that draw the full default trade-row cap take **~4.8 s in jsdom**, measured on their
own rather than under load, because each of the 500 rows is wrapped in its own floating-layer
instance. They declare `timeout: 20_000` so the default 5 s does not turn a slow render into a
failure that says nothing — the assertions are untouched and can still go red.

**The cost moved but did not go away, and the budgets must not be trimmed as table-era slack.** The
wrapping now belongs to `RecordList` rather than to the panel: a list wraps a row only where its
caller offers a card, which is why the run picker mounts none at all — but the trade history offers
one for every trade, so it is still 500 instances on a 500-row draw.

The cost itself should not stay. `HoverCard` mounts one tooltip PROVIDER per instance, where the
primitive expects a single provider high in the tree and one root per item. Lifting it is a change
to a shared base component used in three places — `base/RecordList.vue`, `base/TimelineChart.vue` and
`runs/BookingPeriodTimeline.vue` through the chart — so it is recorded here rather than done on the
way.

### Missing browser interfaces (`tests/setup.ts`)

Stubs there stand in for interfaces jsdom does not implement — never for behaviour under test, because a stub that answered differently from a browser would make the suite agree with itself. `ResizeObserver` and the pointer-capture methods exist because reka-ui's floating layer measures its trigger. `Blob.prototype.text` is implemented over `FileReader`, which jsdom does have, so a layout-import test still proves the file's own bytes reach the importer. FileReader resolves on a TASK, so such a test needs one turn of the macrotask queue (`setTimeout(…, 0)`) and not only `flushPromises()`.

The `ResizeObserver` stub never calls back, which is right for a component that only needs the API to exist. A suite whose subject IS the callback replaces it for its own file — `candle_chart.test.ts` does, with `vi.stubGlobal` — and undoes that in `afterEach`.

---

## Pinia Setup Pattern

Each test file that uses stores calls `setActivePinia(createPinia())` in `beforeEach`. This creates a fresh store registry for every test — no state bleeds between cases.

A store that persists — the arrangement, the layout, the settings — reads its storage when it is created (the arrangement and the layout the tab's own first, see *localStorage and sessionStorage*), so such a file clears `localStorage` in the same `beforeEach`; otherwise one test's narrowing is the next test's starting point.

---

## Async Patterns

Stores that trigger async work on reactive changes (e.g., `bars_store` watches the selection) are settled with `await flushPromises()` from Vue Test Utils. This drains the entire microtask queue including Vue's reactive scheduler and chained promise resolutions.

---

## A fourth tier, and it is a PERSON: the smoke protocol

The three tiers above — type-check, unit suite, browser suite — say whether the code does what it
was written to do. None of them says whether the app SHOWS the right thing on a run nobody wrote a
test for.

The fourth tier is an operator-requested sweep over the viewer's surface: every situation the app
must be able to show, walked against real stored runs, one after another. It is not a gate and not
automated; its instrument is a browser and a deliberate look. Two scripts support it:

- **`scripts/classify_runs.py`** asks the API which situation each stored run actually produces —
  several brokers, a failed grade, logs only, shared fills, a very long market span. A case no
  stored run produces any more is recorded UNCOVERED rather than dropped, because an uncovered case
  is the one that breaks unseen. Measured 2026-09-30 over 46 runs, three cases are uncovered: two
  account currencies in one run, a unit ERROR, and a scenario with two portfolio rows.
- **`scripts/capture_fixtures.py`** re-cuts the fixtures from their source runs. The
  contract moved through seven versions in five days and each time the mirror, the fixtures and
  `EXPECTED_CONTRACT` move together, because the mirror follows one contract and never two — by
  hand that is where one capture gets forgotten.
  **The sources are pinned by id, and what QUALIFIES each one stands beside it as code rather than
  as prose.** An id points at something this project allows to vanish: runs are regenerated, and a
  breaking change takes the ledger and the whole run history with it. So a pin is never substituted
  silently — that is exactly what would make a fixture diff say nothing — but a pin that is GONE
  stops the capture and prints the stored runs satisfying the same requirements, each with its
  measured figures, so replacing it is a one-line edit. Where NONE does, the archive genuinely
  cannot answer, and the request to FiniexTestingIDE is printed ready to send, one line per
  requirement with what depends on it. The capture is also all-or-nothing: one target that does not
  answer leaves every fixture untouched, because two refreshed files beside fourteen stale ones read
  as a whole capture and are worse than none. Afterwards it names any measured property that MOVED,
  because a spec that transcribes one — the position spread in `position_link.spec.ts` is the only
  one today — then needs the new number.
- **`scripts/check_terms.py`** is the one instrument for the thing nothing else verifies: the WORD on
  a label. The type-checker proves a field exists and the suite proves a figure is drawn; neither has
  an opinion about what it is called. It joins every `label: t('…')` in `src/` to the field it
  renders — adjacent in a figure block, and in a list panel by zipping the headings to the
  `:data-rank` cells, with the rank both sides already declare as the check — then compares that
  against `scripts/term_register.json`, which is tracked so the baseline is reviewable and holds one
  entry per line so a changed word is a one-line diff. **The register carries the MAPPING and never
  the MEANING:** which field a label renders, and the name of the document that defines it. What the
  field means is fetched from the backend when it is wanted, because a stored copy of someone else's
  glossary is wrong the day they reword it with nothing saying so. It prints nothing when everything
  agrees, and otherwise
  names a label the register does not know, a label whose field moved, a field gone from the
  backend's consumer documentation, or one of its console labels that changed. **It finds change, not
  wrongness:** that a column head reads badly is a judgement, recorded once in the register's `note`
  column and preserved across a regeneration, because no comparison can surface something that never
  moves. Measured 2026-10-07: a renamed field reached the screen as `undefined` and a person found it
  days later — this is one line of output instead.

The protocol itself, its freshness check and its case catalogue are internal and live outside
`docs/`, because they name run ids on this machine and change with the archive rather than with the
code.

## Adding New Tests

1. Create `tests/<module_name>.test.ts`.
2. Mock any API calls with `vi.mock('@/api/api_client', ...)`.
3. Use `setActivePinia(createPinia())` in `beforeEach` for store-based tests.
4. Use `flushPromises()` after triggering reactive changes that cause async side effects.
5. A component that sends the reader to another view does it through `use_open_in_context`, never a route. Mount it under a host that calls `provideTestOpenInContext()` (`tests/open_in_context_harness.ts`) and assert what the harness recorded in `opened` — no router instance is needed. Mounted with `canOpen` false it must draw the name as plain text, and that is worth its own case.
6. A panel that reads presentation preferences is mounted under a host component that calls `provideDisplaySettings(...)` — the same way `PanelColumn` supplies them. Mounted without a host it must still work, on the defaults, and that is worth its own case.
7. Portalled content (reka-ui dialogs, menus, hover cards) is read off `document`, not off the wrapper, and the wrapper is unmounted in `afterEach` rather than the body being wiped — wiping removes the node the teleport still holds.
8. **In a tabbed dialog, read the ACTIVE panel** (`.tab-panel[data-state="active"]`). The primitive keeps the inactive panels in the document and empties them, so the first match is usually an empty shell — a test that reads it sees `''` and fails for the wrong reason. Switching a tab by hand needs `mousedown`, not `click`: the primitive acts on pointer-down.
9. No server, no network — tests run offline.
10. **A GENERIC base component is mounted through the template that uses it, or its type parameter
    is lost.** `RecordList` infers its row type from `rows` where a template names it; through
    `mount()` there is no template, so every slot scope arrives as `unknown` and the props degrade
    with it. `record_list.test.ts` narrows that at ONE documented place rather than at each of six
    slots. A host `.vue` would be cleaner and is not available: `tsconfig.tests.json` compiles only
    `tests/**/*.ts`.
11. **A component that waits for a real size gets one on purpose.** jsdom lays nothing out, so every
    element measures 0×0 and the shared `ResizeObserver` stub never fires — a component that builds
    only at a real size then never leaves its unsized state, and a test of "nothing happens at 0×0"
    passes for the wrong reason. Give the size with `vi.spyOn(Element.prototype, 'clientWidth' |
    'clientHeight', 'get')` and a firing observer with `vi.stubGlobal('ResizeObserver', …)`, unmount,
    then undo both in `afterEach`. `candle_chart.test.ts` is the model.
