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

**No Cypress / Playwright.** E2E tests require a running API server and stable CI infrastructure. Deferred — see issue #13.

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
  runs_store.test.ts        — run index loading, group/name/run cascade, missing-artifact flag, error handling
  use_run_query_sync.test.ts — cascade restore from URL, partial cascade, merge with foreign params
  query_param_utils.test.ts — query reading (string-only), param write and delete
  run_panels.test.ts        — KPI rendering (units, n/a, per-subset R gating, SIGNAL absence), the warnings/errors tiers, the portfolio breakdown incl. the chart link, and the run header incl. the two kinds of parent
  layout_store.test.ts      — reconciliation against the registry, pin/lock semantics, hide/show, reorder, export-import
  run_reports_store.test.ts — section loading (warnings/errors, portfolio), missing artifact, error text, clearing on run change, shared error slot across concurrent sections
  api_client.test.ts        — request construction, endpoint paths, query params, response mapping, 404 and 409 mapping
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
6. No server, no network — tests run offline.
