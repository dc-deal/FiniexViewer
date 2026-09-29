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
of the scenario groups. `panel_layout.spec.ts` holds that **no panel scrolls sideways**, at a wide
and at a narrow width: `.panel-content` carries `overflow-x: auto`, which is the right safety valve
and a poor everyday state, because the moment it engages the panel's leftmost column slides out of
view and nothing says so. Two defects of exactly that shape reached the screen in one week — a
56-character worker type pushing the configuration table past its column, and an axis label whose
transform pulled it back on screen but not in layout, so a panel offered 67 px of scrollbar for
nothing. Both are geometry, so jsdom cannot see either. `performance.spec.ts` is excluded from the
ordinary run (`npm run test:perf`, one worker) because its budgets fail under contention.

**The browser is not in the container.** The image is Alpine on musl and Playwright's browsers are
glibc builds, so the runner connects over CDP to a browser on the developer's machine —
`e2e/cdp_fixture.ts` documents the one command that needs. `.npmrc` carries
`playwright_skip_browser_download=1` so a rebuild never spends a gigabyte on a Chromium that
cannot start. CI is a separate answer (a compose service on the official image) and shares the
same config.

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
  run_panels.test.ts        — KPI rendering (units, n/a, per-subset and per-trade-count gating, SIGNAL absence), the warnings/errors tiers, the shutdown mode as detail rather than verdict, the narrowing (a unit's errors, a run-wide warning kept while another unit's drops, the outcome counts marked as the run's), the executive figures marked as the run's, the portfolio breakdown incl. the chart link and the narrowed unit MARKED rather than filtered (the run-wide total stays), and the run header incl. the two kinds of parent
  layout_store.test.ts      — reconciliation against the registry, pin/lock semantics, hide/show, reorder, export-import
  settings_store.test.ts    — per-field reconciliation (unknown key dropped, missing key defaulted, out-of-range refused), the schema-version discard, setters that ignore rather than clamp, and the display subset handed to panels
  settings_menu.test.ts     — the three dialog tabs (display against the store, layout export/import incl. a bad file reported rather than swallowed, account in each of its four states), and the menu: the theme entry naming what it switches TO, the account name once the server reports one
  caller_store.test.ts      — the four states of GET /api/v1/caller, the display-name fallback, a refused token told apart from an unreachable server, and that nothing is cached
  facet_filter.test.ts      — OR within a facet and AND across facets, a facet counting against the OTHERS and not itself, a picked value kept listed at zero, a row that states no value never claimed by one, and that nothing is mutated
  run_picker.test.ts        — the flat list (every run whatever its group), newest first, sorting on the INSTANT rather than the text of the stamp, the start time beside the id, a damaged stamp shown as no date rather than Invalid Date, a logs-only run marked but still selectable, narrowing by facet, and the list collapsing once a run is chosen
  scenario_roster.test.ts   — the complete roster incl. the scenarios that produced nothing and their reason, the notice above the filter, narrowing by facet and by search, the honest count, a facet dropped where no row states a value, and CHOOSING scenarios (click narrows, a second click takes one back out, several collected at once, a failed scenario choosable like any other, inert without a host, the hint that says what a click does and the state that replaces it)
  run_reports_store.test.ts — section loading (warnings/errors, portfolio), error text, clearing on run change, shared error slot across concurrent sections, and the ABSENCE as a value — the cause kept beside the empty slot, two sections missing for different reasons, an absence that is not an error, and every reason forgotten on a selection change
  api_client.test.ts        — request construction, endpoint paths, query params, response mapping, 404 / 409 / 403 mapping
  api_contract.test.ts      — the captured fixtures against the contract they were taken under, and each list's declared row key
  deployments_store.test.ts — ledger listing, the authority guard on an unknown id, sessions and periods loaded together, the two-currency case, a forbidden surface as its own state
  booking_period_panels.test.ts — the three-state reconciliation incl. "not checked", the completeness wording, the magnitude drawdown, the timeline (tracks, polarity, no extent, unreadable timestamps, and no rule ruled across lanes that do not share the boundary), the table carrying every field the hover card has incl. the equity band, the column groups, the shared currency stated once and kept per-cell where the rows disagree, and under a narrowing: only the chosen lanes drawn while the run-wide verdict keeps its figures and says so
  trade_history.test.ts     — the magnitude excursion, the gated expectancy, the VISIBLE row cap, what the card carries that the row cannot, and the scenario threshold (summaries past it, the group row still complete, opening one by pointer and by keyboard), and under a narrowing: narrowed BEFORE capped, the cap counted against the narrowed set, an empty result stated as the scenario's, the run-wide funnel and analytics marked as the run's
  hints_store.test.ts       — reconciliation (a retired id dropped, an unknown version discarded, no duplicates), a dismissal that lasts the session and is never written down, a ban that outlives the visit, and the reset that undoes both
  json_tree.test.ts         — key naming, quoted strings, array indices, null, fold depth
  run_config.test.ts        — the two configuration shapes, override PRESENCE without resolution, the worker join, and the guarantee that no top-level key is unreachable
  app_button.test.ts        — the two shapes, a toggle announced as one ONLY where it is one, a genuinely disabled button rather than one merely styled as it, and that nothing submits a form by accident
  hover_card.test.ts        — portalled out of the page, opens on focus, carries the caller's figures and their polarity
  path_label.test.ts        — the whole path comes out whole, the name told from the folders, a break offered at every separator, and the full value kept in the title
  timeline_chart.test.ts    — scale and clamping, the broken axis and its length-preserving property, staggered labels
  deployment_panels.test.ts — the change marks between rows (against the produced four-session history), the absent idle stretch, the upper-bound gap, the missing totals row, the identity that does not move, the advisory wording

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

The cost itself should not stay. `HoverCard` mounts one tooltip PROVIDER per instance, where the
primitive expects a single provider high in the tree and one root per item. Lifting it is a change
to a shared base component used in four places, so it is recorded here rather than done on the way.

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
