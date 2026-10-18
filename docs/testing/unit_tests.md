# Unit Tests

Unit tests run offline: no API server, every HTTP call mocked with responses captured from the running backend. Read this document before you write or change a test under `tests/`; what each existing test file holds is listed in [Unit Test Catalogue](unit_test_catalogue.md).

## Tools

| Tool | Role |
|---|---|
| **Vitest** | Test runner — shares the Vite context, no separate configuration overhead |
| **Vue Test Utils** | Store and component mounting in isolation |
| **jsdom** | DOM environment for Node.js (localStorage, window, routing) |
| **@vitest/coverage-v8** | V8-native coverage reporting, no instrumentation step |

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
