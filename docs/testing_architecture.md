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
component does what it was written to do; it cannot prove that a real reload of a real URL in a
real browser puts the reader back where they were. Specs live in `e2e/`, run with
`npm run test:e2e`, and are **hygiene rather than a gate** — browser tests are slow and flaky under
load, and a gate that is red on Monday morning gets switched off, taking the type-check beside it
out of use.

Two properties are deliberate. `retries: 0`, because a test that goes green on the third attempt
is flaky and we would never see it. And **the mocked responses come from the unit fixtures**
(`e2e/api_mock.ts` reads the same captures), never hand-written in a spec: a second mirror of the
HTTP contract goes stale in silence, which has already happened once here.

**What the browser tier is for, concretely.** `run_selection.spec.ts` holds the reload and the URL
— a real `localStorage`, a real history entry. `trade_groups.spec.ts` holds the open/closed regimes
of the scenario groups, and two things only a browser can state: that the group heading resolves to
the SAME grid as the rows beneath it — read from `getComputedStyle`, which also catches a track
collapsed to zero — and that a trade opens its fills and they offer nothing to click. The test it
replaced counted `<th>` against the group row's `colspan`; after the migration both are zero, so it
would have passed for ever on a subject that no longer exists. `position_link.spec.ts` holds the jump between an
order and its trade, and every part of it lives in the VIEW rather than in a panel: a CLOSED target
panel being opened, a HIDDEN one coming back rather than the jump landing nowhere, the position
reaching the address bar, and the mark surviving a real reload without the page scrolling on its
own. The fixtures make the trap concrete — `pos_ethusd_1` appears in five scenarios of the order
history and two of them produced a trade, so the link is drawn twice and the mark lands in one
scenario rather than in every row carrying that id. `panel_boundary.spec.ts` holds the one claim the
unit suite cannot reach, because it is about the WORKSPACE and not about a panel: a section that
cannot be drawn takes ONLY itself off the screen. The fault is injected rather than waited for —
`mockApi` takes an option to serve one named field of one section as a number, so the read throws
exactly where the original defect did, and the body stays the real capture in every other respect.
The healthy panel count is measured in the same test rather than written down, since which sections
a run carries is a property of the captures. Two moments, because they fail differently:
`warnings-errors` is open by default and throws at FIRST PAINT, which is the shape that cost eleven
panels at once; the Orders panel is folded and throws when the reader opens it, so the mark also has
to survive folding it again. `list_ranks.spec.ts` holds the ranks, and it is the ONLY instrument for them: jsdom evaluates no
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

Three traps it walked into while being written, all now in the spec's own comments. A url carrying
`?run=` draws NO run list, because the picker collapses once a run is chosen. The booking-period
table lives in a closed `<details>`, which is not laid out at all — its grid resolves to numbers
that mean nothing, and the first version of the spec duly reported a track count no declaration
could produce. And sweeping the panel bar by index looked equivalent to opening panels by NAME and
was not: three panels read `aria-expanded=false` after the sweep had clicked them, because the clicks
landed before the stored layout finished reconciling and it closed them again — so the spec measured
two lists of four and said nothing about the other two. It now names the lists it measured and fails
if one is missing, because a silent skip reads as coverage. `deployments.spec.ts` holds the LEDGER view, which had no browser coverage at all until 2026-10-01
— the mock served only the run plane, so the deployments page, its picker and its timeline had never
been opened by a test although their three captures existed. It holds the picker listing the ledger
and opening a history, the selection surviving a reload as a link, a stale link saying so, the
figure cells right-aligned under their headings, and the timeline marking round moments rather than
the overlapping stamps an operator photographed. `panel_layout.spec.ts` holds that **no panel scrolls sideways**, at a wide
and at a narrow width: `.panel-content` carries `overflow-x: auto`, which is the right safety valve
and a poor everyday state, because the moment it engages the panel's leftmost column slides out of
view and nothing says so. Two defects of exactly that shape reached the screen in one week — a
56-character worker type pushing the configuration table past its column, and an axis label whose
transform pulled it back on screen but not in layout, so a panel offered 67 px of scrollbar for
nothing. Both are geometry, so jsdom cannot see either. `performance.spec.ts` is excluded from the
ordinary run (`npm run test:perf`, one worker) because its budgets fail under contention.

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
  selection_store.test.ts   — cascade logic, localStorage persistence, resetTimeframe, isReady
  timeframe_store.test.ts   — load-once cache, minutesFor lookup, error handling, loading flag
  bars_store.test.ts        — coverage validation, window calculation, timeframe mismatch, error handling
  use_query_sync.test.ts    — URL-first priority, localStorage fallback, _ready guard, URL write-back
  runs_store.test.ts        — run index loading, the flat index, missing-artifact flag, error handling, and the scenario narrowing: several at once, one taken back out, no duplicates, dropped whenever the run below it changes
  use_run_query_sync.test.ts — the run restored from the URL, a link saved under the old cascade opened and its dead params cleaned away, merge with foreign params, and the scenario narrowing: restored AFTER the run that clears it, several names comma separated, a hand-edited param with blanks, ignored without a run, written and removed again
  translate.test.ts         — the marker returns its input; the count agrees with its noun, zero reads as plural, a large count stays grouped
  query_param_utils.test.ts — query reading (string-only), param write and delete
  use_facet_query.test.ts   — the facet encoding round trip and its stable order, a group it cannot read, a value with a space; seeding a bar from the URL, writing nothing while untouched, keeping another view's params, two bars in one URL; and `patchQuery` keeping both writers of one tick
  run_panels.test.ts        — KPI rendering (units, n/a, per-subset and per-trade-count gating, SIGNAL absence), the warnings/errors tiers, the shutdown mode as detail rather than verdict, the narrowing (a unit's errors, a run-wide warning kept while another unit's drops, the outcome counts marked as the run's), the executive figures marked as the run's, the portfolio breakdown incl. the chart link and the narrowed unit MARKED rather than filtered (the run-wide total stays), and the run header incl. the two kinds of parent, MARKET TIME (covered in days past two, the summed span only where the units overlap, n/a where the run never recorded it), the two excursions, what the account started from, and a run of several accounts saying how many and which one fell deepest
  app_bar.test.ts           — the inventory of sections: a toggle per registered panel, an absent section LISTED and disabled rather than hidden, and the ORDER — the reader's arrangement rather than the registry's, with a switched-off panel still listed but after everything still arranged
  layout_store.test.ts      — reconciliation against the registry, pin/lock semantics, hide/show, reorder, export-import
  settings_store.test.ts    — per-field reconciliation (unknown key dropped, missing key defaulted, out-of-range refused), the schema-version discard, setters that ignore rather than clamp, and the display subset handed to panels
  settings_menu.test.ts     — the three dialog tabs (display against the store, layout export/import incl. a bad file reported rather than swallowed, account in each of its four states), and the menu: the theme entry naming what it switches TO, the account name once the server reports one
  caller_store.test.ts      — the four states of GET /api/v1/caller, the display-name fallback, a refused token told apart from an unreachable server, and that nothing is cached
  record_list.test.ts         — the shared list stem: the flat list unchanged (one row per record under one set of headings, the TRACKS owned by the list rather than by a row), groups (partitioned in the order the rows arrive and never alphabetically, a closed group's heading drawn without its rows, the click reported as a key so the component holds no state, the first cell indented and never the row, the heading a native button carrying aria-expanded), the card beside a row (wrapped by the list, absent where the caller answers null, and NO tooltip machinery mounted at all where no card was offered), nested read-only use (no headings, and a row that is a div rather than a button that ignores its click), a chosen row announced as chosen and only where rows can be chosen, and BANDS: their spans must cover the columns exactly or none are drawn, each band carries the span it KEEPS at every rank tier (the declared span counts the widest tier only), and a band that would lose every column when narrow is reported rather than patched to one; and what a heading says on hover — the label alone, or the label THEN the column's hint, never the hint in place of it; and one class the CALLER puts on a row, kept beside the list's own states rather than replacing them
  facet_filter.test.ts      — OR within a facet and AND across facets, a facet counting against the OTHERS and not itself, a picked value kept listed at zero, a row that states no value never claimed by one, and that nothing is mutated
  run_picker.test.ts        — the flat list on the shared stem (every run whatever its group), newest first, sorting on the INSTANT rather than the text of the stamp, a damaged stamp shown as no date rather than Invalid Date, the stamp read from its OWN cell since the id beside it also begins with the year, the year dropped inside the current one and kept outside it, a logs-only run marked but still selectable, narrowing by facet, the list collapsing once a run is chosen, what the row says the run DID (one figure per account currency and never folded, an outcome shown only where the run recorded one, the trouble count silent at zero, the id shortened with the whole value in its title, how much market time it covered), and the RANKS with the card that makes them defensible: every cell carrying the rank its own column declares, a card on every row, the configuration and provenance and weight, `ticks_from` stated only where the run recorded it, the artifacts counted with their names in the title, the Tier-2 log count present only where it is not zero, and a run whose stamp is not a date still drawn
  scenario_roster.test.ts   — the complete roster incl. the scenarios that produced nothing and their reason, the notice above the filter, narrowing by facet and by search, the honest count, a facet dropped where no row states a value, and CHOOSING scenarios (click narrows, a second click takes one back out, several collected at once, a failed scenario choosable like any other, inert without a host, the hint that says what a click does and the state that replaces it). Its figures are read CELL BY CELL against the column headings since the twelve-column migration — as running text, a probe for the currency an amount is IN matched the currency a scenario merely declares
  run_reports_store.test.ts — section loading (warnings/errors, portfolio, broker, aggregated), error text KEYED BY SECTION so a concurrent load cannot drop a sibling's failure, clearing on run change, and the ABSENCE as a value — the cause kept beside the empty slot, two sections missing for different reasons, an absence that is not an error, and every reason forgotten on a selection change
  api_client.test.ts        — request construction, endpoint paths, query params, response mapping, 404 / 409 / 403 mapping
  api_contract.test.ts      — the captured fixtures against the contract they were taken under, and each list's declared row key
  deployments_store.test.ts — ledger listing, the row identity the ledger DECLARED kept rather than dropped, the authority guard on an unknown id, sessions and periods loaded together, the two-currency case, a forbidden surface as its own state
  deployment_picker.test.ts — the select box replaced by a facet bar over a flat list: what a deployment DID on the row rather than behind the choice, ONE ROW PER LEDGER ROW (a bot booking in two account currencies has two, and the identity is read from the declared key rather than hardcoded), the deployment a clicked row belongs to, the list collapsing once one is chosen, an empty ledger stated plainly; and what the row leaves out — every cell carrying its column's rank, a card on every row, the drawdown caveat beside the drawdown (a sum over sessions it is NOT), the bot id only where the profile declares one, the configuration spoken about only where it MOVED, an absent idle stretch stated as absent rather than as zero, and the facets: the configuration offered as words rather than as a boolean, and no currency facet at all where every deployment books in one
  booking_period_panels.test.ts — the three-state reconciliation incl. "not checked", the completeness wording, the magnitude drawdown, the timeline (tracks, polarity, no extent, unreadable timestamps, and no rule ruled across lanes that do not share the boundary), the table carrying every field the hover card has incl. the equity band, the column groups, the shared currency stated once and kept per-cell where the rows disagree, the opening balance with its absence stated rather than computed, the fee breakdown one hover from the fee, and under a narrowing: only the chosen lanes drawn while the run-wide verdict keeps its figures and says so
  aggregated_portfolio_panel.test.ts — the fold of a run over its scenarios, and mostly what it LEAVES OUT: the run-wide cost split with maker/taker only where charged and the average spread kept out of the account currency; the three distinctions a reader gets wrong without it (the highest peak of ANY account against the deepest account's own peak, the REALISED balance against the valued equity, an undefined recovery factor as n/a); the spot holdings stated as estimates and absent where the currency is not spot; a mixed-model currency saying so and silent otherwise; and the guards — no figure the executive summary already states, no pending-order or latency figure (that is another route's subject), no per-scenario inventory table
  orders_panel.test.ts      — the two order routes as ONE panel: the group heading carrying the SERVED funnel rather than a count of the rows beneath it, a rejection marked there and nothing marked where there was none, a scenario that reached no queue saying so instead of showing a funnel of zeroes (and the same where the run serves no pending section at all), the orders resting at data end stated only where there are any, an untimed scenario as absent rather than as zero, and the two outcomes that have never fired kept out until they do. Then the row: the backend's rejection sentence beneath the row it belongs to and nowhere else, a value the record never held stated as absent rather than as a zero nobody reported, what EXECUTED where it did against what was asked for where it did not, a refusal and an expiry on different channels, and a row keyed by its POSITION so one order can appear as several rows; plus every cell carrying its column's rank, an empty run stated plainly, and nothing to click but the headings; no POSITION column, because `order_id` IS the position id and the column repeated it; and under a narrowing only the chosen scenarios drawn, with an empty result stated as theirs rather than as the run's; the column headed the backend's way (`Order id`) with the glossary sentence on the heading, because `order_id` is the POSITION's id and `Order` alone claimed otherwise; and the LIFECYCLE of one position read as one — the id named once with the following rows carried on, the opening row marked so the boundary sits on it, the id shown again where two positions alternate (measured: 2 of 246 groups do), and the row above read from the NARROWED list; and the way to the trades — the link on the row that names the position, absent where the position produced none, where the run carries no trade history and where the workspace has no such panel, the jump naming the PANEL and the POSITION rather than the id alone, and the mark covering the whole lifecycle while leaving the same id in another scenario alone; and the THIRD level from the event stream — the disclosure drawn once per position and only where the run wrote a stream at all, the request made on OPENING and for that one position, the waiting state told apart from an empty stream, the steps grouped into the ORDERS they belong to by `submitted_seq` rather than by the position id they share, an order that was never submitted named that rather than given a number, the order of the STREAM kept where the clock repeats, and the de-duplication left to the store that can actually do it; the funnel in the backend's OWN words since contract 23 (submitted, accepted, rejected, never confirmed, expired) with the duration carrying its word rather than standing as a bare `1438 ms`, and the two counters that have never fired kept out until they do. The `arrived` caveat that stood here is GONE with its subject: it paraphrased a defect of theirs, they fixed it and named the field `total_accepted`
  order_steps_harness.ts    — the step capability for a test host, and one captured-shaped step: the request is RECORDED rather than performed, the way the position-link harness does it, so a panel test can prove it asks ONCE for the position the reader opened without having a workspace to fetch in
  broker_panel.test.ts      — the panel that replaced Portfolio: one block per broker titled by the declared key, the conditions a scenario traded under, and the MARGIN gate — nothing printed where the backend does not require the fields (leverage 1), all three together where it does. Then the sentence that is the point of the panel: several brokers said to be incomparable, what actually DIFFERS named from the fields that differ, no difference claimed where they agree, silent on one broker, and the margin half in WORDS rather than by comparing a mode string whose `none` is a default. Plus the symbol table: the rules per symbol, a volume kept at the precision the backend stated and never in exponential notation, both swap directions as one fact, every cell carrying its column's rank, an empty symbol list stated rather than drawn, and nothing to click
  trade_history.test.ts     — the magnitude excursion, the VISIBLE row cap, what the card carries that the row cannot, the scenario threshold (summaries past it, the group heading still complete, opening one by pointer), the FILLS as a third level (folded until clicked, both legs then drawn, no headings and no controls of their own, the share named only where the trade took part of a bigger fill, and never a claim about how many trades share one), and under a narrowing: narrowed BEFORE capped, the cap counted against the narrowed set, an empty result stated as the scenario's; plus what a narrow list keeps — every cell carrying its column's rank, the group heading laid out from the END of the tracks rather than by a span fixed at eight columns, and the net closing the row after the life of the trade; plus the POSITION leading the row as part of the trade's own key, and the way back — the jump naming the panel and the position, no link where that panel is not in the workspace, and every trade of a position marked because a partial close books more than one
  panel_boundary.test.ts    — the error boundary around ONE panel: content drawn where nothing is wrong, a panel that threw kept inside its own frame with its title and controls intact, the header marked so a folded panel still says it failed, the error written to the console and never into the page, a failed panel given another go once it is showing a different model, and a panel whose defect is in the CODE settling on the frame rather than looping between drawing and failing
  position_link.test.ts     — the position as it travels in a URL and as it is compared: the round trip, a scenario name that contains the separator, no percent-encoding needed, every half-written param marking nothing, and the comparison matching BOTH halves — never the position id alone, never a row that has no position at all
  hints_store.test.ts       — reconciliation (a retired id dropped, an unknown version discarded, no duplicates), a dismissal that lasts the session and is never written down, a ban that outlives the visit, and the reset that undoes both
  json_tree.test.ts         — key naming, quoted strings, array indices, null, fold depth
  run_config.test.ts        — the two configuration shapes, override PRESENCE without resolution, the overriding scenarios folded away while the warning stays in the open, the worker join, and the guarantee that no top-level key is unreachable
  app_button.test.ts        — the two shapes, a toggle announced as one ONLY where it is one, a genuinely disabled button rather than one merely styled as it, and that nothing submits a form by accident
  hover_card.test.ts        — portalled out of the page, opens on focus, carries the caller's figures and their polarity
  report_format.test.ts     — the three formatters worth testing apart from the panels that use them: the canonical UTC clock, and a stamp that is NOT a date giving nothing rather than throwing (Intl raises on an invalid date, so one damaged field took down the whole list it was in); the byte steps, named after the step they actually divided by; a long hash shortened to the part that distinguishes it
  path_label.test.ts        — the whole path comes out whole, the name told from the folders, a break offered at every separator, and the full value kept in the title
  timeline_chart.test.ts    — scale and clamping, the broken axis and its length-preserving property, staggered labels
  deployment_panels.test.ts — the change marks between rows, drawn as a line ABOVE the session that starts the new stand and never as a row of the list (against the produced four-session history), the absent idle stretch, the upper-bound gap, the missing totals row, the identity that does not move, the advisory wording

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
P=http://localhost:5173/api/v1
curl -s "$P/deployments" -o tests/fixtures/deployments_list.json
curl -s -D - -o /dev/null "$P/reports/runs" | grep -i '^x-api-contract:'
```

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

### localStorage

Available natively in the jsdom environment. Cleared in `beforeEach` with `localStorage.clear()` to prevent state leaking between tests.

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

### Vue Router (use_query_sync tests)

A real `createRouter` instance is created per test with `createWebHashHistory()` (no browser navigation needed). The router is passed as a plugin when mounting the test component.

---

## Pinia Setup Pattern

Each test file that uses stores calls `setActivePinia(createPinia())` in `beforeEach`. This creates a fresh store registry for every test — no state bleeds between cases.

For `use_query_sync` tests, the same pinia instance is passed both to `setActivePinia` and to the `mount` plugin list so the component and the test assertions share the same store:

```ts
const pinia = createPinia()
setActivePinia(pinia)
mount(TestComponent, { global: { plugins: [pinia, router] } })
```

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
- **`scripts/capture_fixtures.py`** re-cuts the sixteen fixtures from their source runs. The
  contract moved through seven versions in five days and each time the mirror, the fixtures and
  `EXPECTED_CONTRACT` move together (§21) — by hand that is where one capture gets forgotten.
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
5. Mount a component that links to another view with `global: { stubs: { RouterLink: RouterLinkStub } }` — the stub's `to` prop is what the test asserts, so no router instance is needed.
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
