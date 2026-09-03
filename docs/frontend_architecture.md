# Frontend Architecture

How FiniexViewer runs, how it talks to the FiniexTestingIDE backend, and why the pieces are split the way they are.

---

## Goals

- **Clean separation** of frontend and backend concerns: different language, different runtime, different deployment lifecycle.
- **Modern container architecture**: two services, one network, service discovery via container DNS — the same shape a production deployment would take.
- **Low-friction development**: one `docker compose up` brings everything needed for local work.

## Two-Container Topology

FiniexViewer runs in its own container. The FiniexTestingIDE backend (Python + FastAPI) runs in another. They share a Docker network and reach each other by service name.

```
┌─────────────────────────── docker compose (host machine) ────────────────────────────┐
│                                                                                       │
│   ┌──────────────────────────┐        network: default         ┌─────────────────┐   │
│   │  Service: finiex-dev     │ ◄──────────────────────────────► │ finiex-viewer   │   │
│   │                          │    http://finiex-dev:8000        │                 │   │
│   │  image: python:3.12-slim │                                  │ image: node:20  │   │
│   │  mounts:                 │                                  │ mounts:         │   │
│   │   - FiniexTestingIDE     │                                  │  - FiniexViewer │   │
│   │     :/app                │                                  │    :/app        │   │
│   │   - FiniexViewer (RW)    │                                  │                 │   │
│   │     :/viewer             │                                  │                 │   │
│   │  ports:                  │                                  │ ports:          │   │
│   │   - 8000:8000 (FastAPI)  │                                  │  - 5173:5173    │   │
│   └──────────────────────────┘                                  └─────────────────┘   │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
         ▲                                                                 ▲
         │ Browser: http://localhost:8000/docs  (OpenAPI UI)               │
         │                                                                 │
         └─────── Browser: http://localhost:5173 (Vue Dev Server) ─────────┘
```

### Why both folders mount into `finiex-dev`

The backend container is the development host — it carries the editor tooling and the primary shell session. Mounting the Viewer folder into it (`/viewer`) lets contributors edit both codebases in a single environment without a second attached shell.

### Why the Viewer has its own container

Python and Node have very different tooling footprints. A combined image grows large and slow, and mixing package managers is a source of silent bugs. A dedicated Node container is the standard answer.

### Service-to-service communication

Inside the compose network, services resolve each other by service name:

- The Vite dev proxy targets `http://finiex-dev:8000` — the environment variable `VITE_API_BASE_URL` sets this.
- No ports need to be bound to the host for inter-container traffic. Host-exposed ports (`8000`, `5173`) are for the developer's browser only.

## Development Phases

The compose override is built around three conceptual phases. Moving between them is a configuration change, not a code change.

### Phase 1 — Backend-only work

```
docker compose up -d
```

Starts `finiex-dev` with the Viewer folder mounted but without a running Vite server. Used for API work (FiniexTestingIDE issues #297, #298) before the frontend scaffold exists.

### Phase 2 — Joint development

```
docker compose --profile viewer up -d
```

Starts both services. The Viewer container runs `npm install && npm run dev` on start. Both the OpenAPI UI (`:8000/docs`) and the Vue dev server (`:5173`) are reachable from the browser.

Use this once the Viewer scaffold exists (after FiniexViewer issue #2).

### Phase 3 — Public / Production (deferred)

A production image for the Viewer (static build served by a lightweight HTTP server) and a standalone `docker-compose.yml` inside the FiniexViewer repo are planned, but no issue carries them yet — the roadmap lists production delivery under known directions. The design choice — static hosting versus embedding the built bundle into the FastAPI app — is open. Everything documented above is a development setup.

## Network Flow (Request Example)

Loading a candle chart for `mt5/EURUSD M30`:

1. Browser calls `http://localhost:5173/viewer`.
2. Vite serves the Vue SPA.
3. On mount, the SPA calls `GET /api/v1/timeframes` once to populate the timeframe selector (result cached in `timeframe_store`, never re-fetched).
4. After the user selects broker, symbol, and timeframe, the SPA calls `GET /api/v1/brokers/mt5/symbols/EURUSD/bars?timeframe=M30&from=...&to=...`.
5. The Vite dev server proxies all `/api` calls to `http://finiex-dev:8000` (Docker network resolution).
6. FastAPI reads from the existing `BarIndexManager`, returns OHLC data.
7. The SPA pipes the response into Lightweight Charts, the chart renders.

No shared filesystem, no direct imports across repositories. The HTTP contract is the only coupling.

## Consumed API Surface

The backend exposes two planes. The viewer consumes both, and treats them differently only in what they describe.

**Data plane** — the market data behind the candle chart:

```
GET /api/v1/health
GET /api/v1/timeframes
GET /api/v1/brokers
GET /api/v1/brokers/{broker}/symbols
GET /api/v1/brokers/{broker}/symbols/{symbol}/coverage
GET /api/v1/brokers/{broker}/symbols/{symbol}/bars
```

**Report plane** — read-only access to persisted run artifacts, addressed by `run_id`:

```
GET /api/v1/reports/runs                              run index — the only route that yields a run_id
GET /api/v1/reports/runs/{run_id}/run-summary         cross-section KPIs, summed over all units
GET /api/v1/reports/runs/{run_id}/warnings-errors     tiered warnings, per-unit errors, run outcome
GET /api/v1/reports/runs/{run_id}/portfolio           the same KPIs broken down per unit
GET /api/v1/reports/runs/{run_id}/...                 11 further per-section reports (not yet consumed)
```

The report plane is model-fed on the backend: one canonical model per section, derived once and rendered identically to console, CSV and API. The API is the same object serialized, not a separate projection that can drift.

Six consequences the frontend is built around:

- **The index row carries the whole run header**, so the run cascade (group → scenario/profile → run) is built from one request: `run_id`, `group`, `name`, `has_reports`, `start_time`, `parent_id` and the provenance triple `app_version` / `git_commit` / `config_snapshot`. No follow-up request per run — an N+1 against `run-summary` would be the obvious mistake here, and the Run Header panel needs no request at all because its model IS this row.
- **A 404 on a report section is an absence, not a failure.** A run can exist without carrying a given artifact. `getRunSummary` maps that to `null`, and the view says the artifact is missing instead of showing an error.
- **Every report body names the run it was built from**, and `api_client` asserts it against what was requested (`RunIdMismatchError`). This is the only defence a client has against an ambiguous id: a duplicate passes every membership check, the route resolves it to whichever run it finds first, and nothing else in the payload would give that away. It has happened — three runs once shared one id here.
- **A 409 is a third thing again: the artifact is there and cannot be parsed**, because it was written by an older schema and the run has to be repeated. `getWarningsErrors` raises `ArtifactUnreadableError` carrying the backend's own detail text, and the view shows it as a notice *beside* the panels rather than instead of them — one unreadable section must not hide the readable ones. Three distinct answers, three distinct states: 404 absent, 409 stale, anything else an outage.
- **The index is the authority on which runs exist, and it is never bypassed.** A URL, a bookmark or a shared link can name a run whose artifacts were removed since. `selectRun` refuses an id the index does not contain, so a stale link produces no request at all rather than one 404 per section — the same rule the layout store applies to stored panel ids. An empty index is its own state (`{"runs": [], "count": 0}` is a normal 200), and the view says so instead of offering empty pickers with no explanation.
- **`has_reports` on the index row decides whether a run is worth asking about.** `false` means the run exists as logs only and every report route answers 404 — a normal state, because a test session writes logs and no artifacts. It is neither a failure nor a reason to hide the run: the picker shows it, marked `logs only` and not selectable, and neither the store nor the view issues a request for it. Hiding it instead would raise the question where the run went; asking anyway would be the 404 storm the rule above exists to prevent.

**`run_id` is opaque, and stays that way.** It is minted as `<date>_<time>_<8 hex>` and the backend pins the character class to `[0-9a-f_]` with a test, so interpolating it into a URL path unencoded is safe by assertion rather than by hope. Nothing here parses it: no split, no date extracted for display, no sort. Ordering comes from the index, which is newest-first by contract.

**Two axes, two fields.** `group` is the PIPELINE, `parent_id` is the NESTING. They were briefly one field (`single_runs` | `sweeps` | `autotrader`), which mixed a shape with a pipeline and could not express a nested live run:

| `group` | `parent_id` | What it is | What its siblings want |
|---|---|---|---|
| `simulation` | `null` | a standalone simulation run | — |
| `simulation` | set | a **combination** of a parameter sweep | a **ranking** by the sweep's declared objective |
| `live` | `null` | a live session | — |
| `live` | set | a **fragment** of a session | a **timeline**, ordered by `start_time` |

The distinction is not cosmetic. A sweep's children are **alternatives** — contemporaneous answers to "what if the parameters were these", so ranking them is the whole point. A session's children are a **sequence** — consecutive sealed slices of one continuous run, where a ranking would be meaningless. And the parents differ too: a sweep is not a run at all (no header, *defined* by the runs naming it as parent), while a session is a run, present in the index from its first second and usually still going while its fragments accumulate.

A **sweep combination is structurally an ordinary run**: measured against a standalone run, all fourteen report routes answer with identical field sets, so the existing panels render one without a change. What a sweep adds is not a report shape but a level above it — the ranking of its combinations by the objective it declared, and the parameters that were varied. Those live on `GET /api/v1/sweeps` and `GET /api/v1/sweeps/{sweep_id}`, which are known and not yet consumed.

**Not every report route answers for every run.** `group` decides:

**Do not gate a panel on `group` — gate it on `artifacts`.** The index row lists the files the run actually carries, and **the set is not fixed, not even within one pipeline.** Live writes fewer sections than simulation (no `scenario_details` / `profiling` / `run_meta` / `aggregated_portfolio`), and a simulation run writes more when it has more to say — `robustness.json` only with robustness mode enabled, `block_splitting.json` only for a profile run. Counting the files in any one archive gives a number, not the contract: measured 2026-08-30, simulation ran 18 or 19 depending on the run. A client that assumes a set earns a 404 for the difference; reading the list costs no request because it rides on the row. `has_reports` is derived from that list being non-empty, so the two cannot disagree.

### Units and undefined values

The models carry numbers, not units. These are contract, confirmed by the backend, and the conversion happens at the render edge:

- `win_rate` is a **ratio 0..1** — multiply for display.
- `max_drawdown` is a **positive magnitude** in account currency. The sign is a display choice, not data.
- `expectancy` is mean R, meaningful only when `r_trade_count > 0`.
- `profit_factor` is `null` when it is **undefined** (a run without a losing trade), never 0.
- `avg_win_r` / `avg_loss_r` are `null` when their subset is empty. Gate each on **its own** count (`r_win_count` / `r_loss_count`): a run can have R-defined trades with no winner among them, so `r_trade_count` alone would still print a mean nobody measured.
- `signal_fresh_ratio` is `null` when no SIGNAL worker was involved — deliberately not 1.0, which would claim a perfect feed.
- **`portfolio` does not use `null` for this.** An untraded unit arrives with `win_rate: 0.0` and `profit_factor: 0.0`, so the gate there is `total_trades`, not the value. The distinction matters in both directions: a unit with one losing trade and no winner has a profit factor that really *is* 0, and printing `n/a` for it would hide a measured result.

The rule behind all of them: **a value that means "not measured" must never render as a number.** It renders as `n/a`. Which field says "not measured" differs per section — check the model, do not assume `null`.

### The printout never computes

The backend derives every figure once, off the hot loop, and its renderers only format. The viewer follows the same rule: no KPI is re-derived here. If a figure a panel needs is not on a model, it is requested as a model field rather than calculated locally — a second calculation drifts from the first, which is exactly the defect the backend removed from its own console (`execution_rate_pct` and `max_dd_pct` were divisions inside a renderer and are now fields).

### Canonical section order

The order both backend pipelines render, and the order panels should follow:

```
header → scenario details (sim) → portfolio: per-unit, then aggregated →
trade history: per-unit, then aggregated → broker → signal → feed stability →
performance: per-unit, aggregated, bottleneck → profiling (sim) →
worker/decision breakdown → warmup (sim) → warnings & errors →
closing: executive (sim) / session summary (live)
```

Aggregated blocks appear only for a multi-unit run, and a section whose model is absent is skipped rather than shown empty.

Response shapes are mirrored by hand in `src/types/api/report_types.ts`. No generated client, no shared code — the HTTP contract is the only coupling.

## Why Not One Container

- Mixed tooling (Python + Node) produces large, slow images.
- Separate restart lifecycles matter during development — a Vite crash should not take the API with it.
- Separate container boundaries enforce the HTTP contract. A single container is tempting to circumvent with "just import the Python model directly".
- A two-service compose file is the shape of real production deployments.

## Why Not More Containers

- A dedicated database or cache service would be over-engineering at this scope. The existing Parquet file layout on disk is the data store. If a runtime database joins the picture later, it is added as a third service then.
- No Nginx / reverse proxy in development. Host-exposed ports are sufficient for localhost work.

## CORS

During development, the Vite dev server serves the frontend at `:5173`, but XHR/fetch calls target `:8000`. This is cross-origin. Two ways to avoid CORS headaches:

- **Vite proxy** (preferred during dev): configure Vite to proxy `/api` to the backend, so the browser only ever sees `:5173`.
- **FastAPI CORS middleware**: permissive localhost origins in the API server foundation (FiniexTestingIDE #297).

Both are in place. The proxy path is primary; the CORS middleware is the safety net.

## Related Files

- [../../docker-compose.override.yml](../../docker-compose.override.yml) — lives in the FiniexTestingIDE repo, provides the dev integration (gitignored, local-only).
- [../HANDOFF_INITIAL_SETUP.md](../HANDOFF_INITIAL_SETUP.md) — bootstrap context for this repo.

---

## Tech Decisions

### Theming — CSS Custom Properties

All colors, spacing, and type scale are defined as CSS custom properties in `src/styles/tokens.css`. Dark mode is the default; light mode overrides the same variables under `[data-theme='light']`. The active theme is controlled by a `data-theme` attribute on `<html>`, toggled by the `use_theme` composable and persisted to `localStorage`.

This avoids a CSS-in-JS dependency, works natively in every browser, and is trivially inspectable in DevTools. Reka UI (headless component layer) is deferred — no concrete accessibility need has surfaced yet.

### URL Query State — `use_query_sync` / `use_run_query_sync`

Every user-selectable option on a page is stored in the URL as a query param, so any view is a shareable link that survives reload. Two composables own disjoint sets of params:

- `use_query_sync.ts` — the chart selection (`?broker=...&symbol=...&timeframe=...`), activated in `AppShell`.
- `use_run_query_sync.ts` — the run cascade (`?group=...&name=...&run=...`), activated in `RunsView`.

Priority on load: **URL params > localStorage > null**. Both wait for `router.isReady()` before reading params, to avoid a race with the initial navigation, then watch their store and call `router.replace` on every change. For the chart selection, localStorage is a write-through cache; the run cascade has no cache, because the run index is live data.

**Both merge, never replace.** `router.replace({ query })` with a freshly built object silently drops every param the other composable owns. `query_param_utils.ts` holds the two functions that make the merge the default: `readQuery` (the current query as plain strings) and `writeParam` (set, or delete when the value is null).

### Panels — a registry, a shell, one persisted layout

The viewer shows many small panels around one chart rather than one view per page. Three pieces carry that:

- **`src/panel_registry.ts`** — a declarative list of `PanelDescriptor`s: id, title, icon, component, the `source` key it reads, which run groups it applies to, and whether it starts open. A plain list rather than a `register()` call, so with a static import graph the order is explicit instead of depending on which module loaded first. The app bar renders from this list, so a new panel is an entry here, not a rebuild.
- **`src/components/panels/`** — `AccordionPanel` (the shell: collapse, pin, lock, hide, controls revealed on hover and on focus), `PanelColumn` (the ordered stack, drag to reorder), `AppBar` (toggles plus *collapse all* and *reset layout*). The collapsible behaviour, its ARIA wiring and keyboard handling come from Reka UI.
- **`src/stores/layout_store.ts`** — the arrangement, persisted under the single versioned key `layout.v1`.

**A panel receives its model as a prop and never fetches.** `PanelColumn` is handed a `sources` record and passes `sources[descriptor.source]` to each panel. That is what lets the same component render a run artifact today and a live frame later (testingide#379/#380) without being written twice.

**Two stores, two questions.** `runs_store` answers *which* run is selected — the `group → name → run` cascade and the index behind it. `run_reports_store` answers *what that run reports*, one slot per section, all cleared together when the selection changes. Sections load eagerly with the run for now; lazy loading on first expand waits until there are enough sections to justify the plumbing.

**A section whose model this run does not carry is skipped, never shown empty.** `PanelColumn` drops a panel whose source is absent, which is how a 404 on a report route reaches the UI: not as an error, as a missing section.

**The stored layout is reconciled against the registry on load, never trusted.** Panel ids the registry no longer knows are dropped; panels added since the layout was stored are appended with their defaults; a corrupt entry falls back to the default workspace. Hidden panels are recorded in an explicit `hidden` list — without it, reconciliation cannot tell a panel the user hid from one that is new, and would resurrect it on every load.

**Pin anchors, lock protects.** Pin moves a panel to the top of the column and opens it once; afterwards open/closed stays free. Lock exempts a panel from *collapse all* (and later from width-driven auto-collapse). Hiding needs no confirmation: the app bar always shows what is hidden, so nothing is lost.

**From a report row into the chart.** The portfolio panel links a unit's symbol to `/viewer?broker=<data_source>&symbol=<symbol>` — the two views share one query namespace (see `query_param_utils`), so the link is a normal `RouterLink` and needs no store to carry the hand-over. It works because `data_source` holds the same broker keys `GET /brokers` returns (`mt5`). Live runs leave `data_source` empty and get plain text instead: `broker_name` is a display name (`Kraken`) and is not addressable, and guessing the key from it would invent a mapping the backend owns. The timeframe is deliberately not passed — the chart keeps whichever one the user last chose.

### Display Strings — a marker, not a translation layer

Every user-facing string goes through `t()` (`src/translate.ts`), which returns its input unchanged. The interface is English-only and there is no language switch.

The marker exists because the expensive half of adding a language later is *finding* the display strings, not translating them. The English text is the key — `vue-i18n` supports message-as-key — so adopting a real module replaces one implementation and adds a catalogue, without touching a single call site.

Deliberately absent until a second language exists: a language switch (nothing to switch), and a key taxonomy (a scheme invented for 40 strings will not fit 400). When one English text ever needs two different translations, an optional context argument solves it then; adding one is backward compatible.

No tool enforces the marker — it is carried by review.

### Chart Engine — Lightweight Charts (TradingView)

[Lightweight Charts](https://github.com/tradingview/lightweight-charts) is a purpose-built OHLCV charting library: small bundle, good performance, minimal API surface. It handles candle rendering, time axis, crosshair, and resize natively.

**Alternatives considered:**
- **ECharts** — general-purpose, heavier, more configuration overhead for financial data.
- **Recharts / Chart.js** — not optimised for candlestick OHLCV; significant custom work needed.
- **Custom WebGL/Canvas** — full control but months of work with no financial primitives.

Lightweight Charts becomes limiting if we need complex multi-pane indicator layouts or a professional trading UI. For v0.1–v0.2 scope (read-only candle display), it is the right choice.

### Testing Strategy

Unit tests: **Vitest** + **Vue Test Utils**. Vitest runs in the same Vite context as the app — zero extra configuration. Vue Test Utils mounts components and stores in isolation. CI runs on every push and pull request via GitHub Actions.

Priority targets: `selection_store` cascade logic, `timeframe_store` load-once cache and `minutesFor` lookup, `bars_store` coverage validation and window calculation, `use_query_sync` URL-priority behavior, `api_client` request construction. See issue #13.

E2E tests (Cypress / Playwright): deferred until CI infrastructure is established. These require a running API server and are only valuable once the test environment is stable.

### Quality Tooling — two tiers

| Tier | Command | Tool | Enforced by |
|---|---|---|---|
| Gate | `npm run type-check` | `vue-tsc --build --force` | CI, every push and pull request |
| Gate | `npm run test` | Vitest | CI, every push and pull request |
| Hygiene | `npm run lint:check` / `lint` | ESLint 9 + `eslint-plugin-vue` + `@stylistic` | measured, cleaned as a unit is touched |
| Hygiene | `npm run knip` | knip | measured, cleaned as a unit is touched |

**Why the split.** A gate that is red on day one gets switched off, and it would take the type-check beside it out of use. The two gates are the ones that fail on genuinely broken code; the hygiene tier reports drift that a human decides when to clean.

**`--build --force`, not `--noEmit`, and the reason is worth keeping.** The root `tsconfig.json` holds `"files": []` and nothing but `references`. Outside build mode `tsc` ignores project references, so `vue-tsc --noEmit` against that file checked **nothing at all** — it exited 0 with a deliberate `const x: number = 'string'` sitting in `src/`. A gate that cannot fail is worse than no gate, because it is believed. Build mode walks the three referenced projects (`app`, `tests`, `node`) and actually type-checks them. `--force` rather than plain `--build` so a stale `.tsbuildinfo` can never mask an error. Every referenced project needs `noEmit: true` in its own options — `tsconfig.node.json` lacked it and build mode wrote `vite.config.d.ts` and `vite.config.js` into the repo root on the first run.

**`@stylistic/quotes`** carries the single-quote convention. Double quotes stay legal only where they avoid escaping an apostrophe (`avoidEscape`); a template literal without interpolation is an error. HTML attribute quoting inside a `<template>` is a different rule and is deliberately untouched — the framework convention there is double quotes.

**knip** reports files, exports and dependencies nothing references — the dead-code check TypeScript cannot make, because an unused export is valid code. `knip.json` sets `ignoreExportsUsedInFile` for `interface` and `type` only. The reason is a real distinction, not a silencer: an interface that is a field type of an exported interface stays reachable through the composite (`WarningsErrorsReport['warnings'][number]`) whether or not it is exported, so removing the `export` shrinks nothing and only makes the type unnameable at the call site. A value has no such back door — an exported `const` or function with no importer is genuinely surplus surface, and stays reported.

Both hygiene commands need the container's `node_modules`:

```bash
docker exec finiex-viewer sh -lc 'cd /app && npm run knip'
```
