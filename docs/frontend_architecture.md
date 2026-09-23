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
GET /api/v1/health                                    open, no token
GET /api/v1/timeframes                                open, no token
GET /api/v1/brokers                                   token, no grant
GET /api/v1/brokers/{broker}/symbols
GET /api/v1/brokers/{broker}/symbols/{symbol}/coverage
GET /api/v1/brokers/{broker}/symbols/{symbol}/bars
```

The two open routes are open by decision, not by omission: `/health` is the liveness check, and
`/timeframes` is the app's own static configuration rather than data about a venue or a run. Useful
as a diagnostic once the gate is on — if the timeframe selector fills while everything else answers
401, the transport is fine and the credential is not.

**Report plane** — read-only access to persisted run artifacts, addressed by `run_id`:

```
GET /api/v1/reports/runs                              run index — the only route that yields a run_id
GET /api/v1/reports/runs/{run_id}/run-summary         cross-section KPIs, summed over all units
GET /api/v1/reports/runs/{run_id}/warnings-errors     tiered warnings, per-unit errors, run outcome
GET /api/v1/reports/runs/{run_id}/portfolio           the same KPIs broken down per unit
GET /api/v1/reports/runs/{run_id}/booking-periods     the bookkeeping stretches, plus a completeness check
GET /api/v1/reports/runs/{run_id}/config              what the run was commissioned with
GET /api/v1/reports/runs/{run_id}/trade-history       every closed position, with its excursions
GET /api/v1/reports/runs/{run_id}/...                 10 further per-section reports (not yet consumed)
```

**Ledger plane** — a live bot's life across its restarts, on its own grant surface `deployments`:

```
GET /api/v1/deployments                               one row per (deployment x account currency)
GET /api/v1/deployments/{deployment_id}               the sessions, oldest first
GET /api/v1/deployments/{deployment_id}/booking-periods   every period of every session, in one call
```

A **deployment is not a run**: no header, no directory, no artifacts of its own. It is an identity
that a series of runs name, and its rows live in the run-results ledger — so it cannot be opened
through a report route. The hinge runs the other way: each session carries its `run_id`, which is
what every report route takes. It also runs backwards, because a live run's index row carries
`parent_id` with `parent_kind: "deployment"`, so a run knows its deployment without a lookup.

**Contract version and row keys.** Two mechanisms the backend added after the models changed four
times in one day, and both are used here:

```
GET /api/v1/contract      open, like /health   ->  {"contract": 2, "app_version": "...", "changes": [...]}
X-Api-Contract: 2         on EVERY response, refusals included
{ "key": ["deployment_id", "currency"], "deployments": [ ... ] }
```

`key` states what makes one row of a list unique, and in three of the five lists the obvious field
is the wrong one. The viewer READS it at the render edge — a shared component builds its row
identity from the declared tuple, which is what lets one table serve two routes — and ASSERTS it in
the suite. The contract number is asserted against captured fixtures, so re-capturing them against
a newer backend fails locally instead of a field quietly turning `null` in production.

The report plane is model-fed on the backend: one canonical model per section, derived once and rendered identically to console, CSV and API. The API is the same object serialized, not a separate projection that can drift.

Six consequences the frontend is built around:

- **The index row carries the whole run header**, so the run cascade (group → scenario/profile → run) is built from one request: `run_id`, `group`, `name`, `has_reports`, `start_time`, `parent_id` and the provenance triple `app_version` / `git_commit` / `config_snapshot`. No follow-up request per run — an N+1 against `run-summary` would be the obvious mistake here, and the Run Header panel needs no request at all because its model IS this row.
- **A 404 on a report section is an absence, not a failure.** A run can exist without carrying a given artifact. `getRunSummary` maps that to `null`, and the view says the artifact is missing instead of showing an error.
- **Every report body names the run it was built from**, and `api_client` asserts it against what was requested (`RunIdMismatchError`). This is the only defence a client has against an ambiguous id: a duplicate passes every membership check, the route resolves it to whichever run it finds first, and nothing else in the payload would give that away. It has happened — three runs once shared one id here.
- **A 409 is a third thing again: the artifact is there and cannot be parsed**, because it was written by an older schema and the run has to be repeated. `getWarningsErrors` raises `ArtifactUnreadableError` carrying the backend's own detail text, and the view shows it as a notice *beside* the panels rather than instead of them — one unreadable section must not hide the readable ones. Three distinct answers, three distinct states: 404 absent, 409 stale, anything else an outage.
- **The index is the authority on which runs exist, and it is never bypassed.** A URL, a bookmark or a shared link can name a run whose artifacts were removed since. `selectRun` refuses an id the index does not contain, so a stale link produces no request at all rather than one 404 per section — the same rule the layout store applies to stored panel ids. An empty index is its own state (`{"runs": [], "count": 0}` is a normal 200), and the view says so instead of offering empty pickers with no explanation.
- **`has_reports` on the index row decides whether a run is worth asking about.** `false` means the run exists as logs only and every report route answers 404 — a normal state, because a test session writes logs and no artifacts. It is neither a failure nor a reason to hide the run: the picker shows it, marked `logs only` and not selectable, and neither the store nor the view issues a request for it. Hiding it instead would raise the question where the run went; asking anyway would be the 404 storm the rule above exists to prevent.

**`run_id` is opaque, and stays that way.** It is minted as `<date>_<time>_<8 hex>` and the backend pins the character class to `[0-9a-f_]` with a test, so interpolating it into a URL path unencoded is safe by assertion rather than by hope. Nothing here parses it: no split, no date extracted for display, no sort. Ordering comes from the index, which is newest-first by contract.

**Two axes, two fields.** `group` is the PIPELINE, `parent_id` is the NESTING. They were briefly one field (`single_runs` | `sweeps` | `autotrader`), which mixed a shape with a pipeline and could not express a nested live run. A third field, `parent_kind`, now SAYS which kind of family `parent_id` names, so nothing derives it from `group` any more:

| `parent_kind` | What `parent_id` names | What its siblings want |
|---|---|---|
| `null` | nothing — the run stands alone | — |
| `sweep` | a **combination** of a parameter sweep | a **ranking** by the sweep's declared objective |
| `deployment` | a **session** of a live deployment | a **timeline**, ordered by `start_time` |

The distinction is not cosmetic. A sweep's children are **alternatives** — contemporaneous answers to "what if the parameters were these", so ranking them is the whole point. A deployment's children are a **sequence** — consecutive sessions of one bot's life across its restarts, where a ranking would be meaningless. And the parents differ too: neither is a run, but a sweep is *defined* by the runs naming it, while a deployment has its own rows in the ledger and its own routes.

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

Its sibling on the categorical side: **a value that means "not applicable" must never render as a state.** `run_outcome` is `''` on artifacts written before the grading existed, so the panel says "no outcome recorded" rather than showing an empty verdict. `shutdown_mode` is live-only and `''` on a simulation run, so it is absent rather than rendered — and where it *is* present it is detail, never a verdict: an operator stopping a healthy session with Ctrl+C produces the same `emergency` as a crash, so it is shown as alarming only where `run_outcome` is `failed`. `operator_interrupted` would resolve that ambiguity, but it is newer than most artifacts, which default it to `false`; it is mirrored and deliberately not rendered until an artifact can carry a true value.

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

### API Token — the dev proxy holds it, the browser never does

The backend is gaining bearer authentication. Every route except `/api/v1/health` and
`/api/v1/timeframes` will require `Authorization: Bearer <token>`.

Access is by **grant**, spelled `<surface>:<name>`, and this viewer's token holds
`brokers:*` · `bars:*` · `reports:*` · `sweeps:*` — the four surfaces its routes sit on. A grant is
mandatory: a token without one is refused at boot rather than defaulting to everything.

**The `reports` grant is conditional and the condition is not a formality.** It reaches the run
artifacts of a private trading strategy, and it was granted to a browser only because the API is
published to loopback, so the page and the API share one machine and the token's reader is its
owner. That decision is re-taken before the viewer is served from anywhere else — if Phase 3 above
gets a date, it is raised with the backend first.

**A browser client cannot hold a secret.** A value a browser transmits is a value its user
possesses — readable from the bundle or from the network panel. There is no build setting that
changes this, which is why the token is **not** a `VITE_` variable: anything with that prefix is
inlined into the client bundle at build time, and that would publish the credential to anyone who
opens the page.

Instead the dev server's `/api` proxy attaches it, in the Node process:

```
browser ──/api/v1/…──▶  Vite dev proxy  ──Authorization: Bearer …──▶  backend
                        (holds FINIEX_API_TOKEN)
```

This is the backend-for-frontend pattern, and it is what the IETF draft on browser-based apps
recommends. Three properties, all measured rather than assumed:

- **Inert until a token exists.** With `FINIEX_API_TOKEN` unset no header is sent at all — the
  previous behaviour, byte for byte.
- **The browser never receives it.** Verified against a request-capturing stand-in: the request to
  `:5173` carries no `Authorization`, the request that reaches the target does.
- **A real environment variable wins over a `.env` file.** Vite's `loadEnv` prioritises
  `process.env`, so Compose keeps deciding `VITE_API_BASE_URL` while the token can come from
  `.env.local`, which Compose does not set.

**The production case is unsolved and deliberately not faked.** A statically served bundle has no
proxy, so there is nowhere to put a token that the user does not also get. The same proxy is the
answer there too — the human signs in to it and it holds the service token — but that is user
management, which neither this repo nor the backend's auth package covers today.

One browser-shaped consequence worth knowing when the gate goes on: a cross-origin `401` reaches
JavaScript with its status, but `WWW-Authenticate` and `Retry-After` stay hidden unless the server
lists them in `expose_headers`. Neither is CORS-safelisted.

**`vite.config.ts` exports an object, not a config function.** `vitest.config.ts` merges this file,
and `mergeConfig` cannot merge a function — the env is therefore loaded at module scope.

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

**The same mechanism also carries "nothing to report".** Feed Health reads its own source rather than the shared run summary, and `runs_store` answers null where neither half of that panel speaks. Only `signal_fresh_ratio` is about SIGNAL — it is null when no SIGNAL worker ran; the four disturbance figures come from the feed-stability report and describe the DATA SOURCES, so a market feed can stall with no SIGNAL worker anywhere. The panel appears when a freshness was measured OR at least one episode occurred, and is dropped when neither is true. The backend's console draws the same line: `format_disturbance_line` returns an empty string at zero episodes rather than printing four zeros. Deciding this in the store rather than in the panel keeps the judgement out of the template and reuses the absent-source rule instead of inventing a second one.

**The stored layout is reconciled against the registry on load, never trusted.** Panel ids the registry no longer knows are dropped; panels added since the layout was stored are appended with their defaults; a corrupt entry falls back to the default workspace. Hidden panels are recorded in an explicit `hidden` list — without it, reconciliation cannot tell a panel the user hid from one that is new, and would resurrect it on every load.

**Pin anchors, lock protects.** Pin moves a panel to the top of the column and opens it once; afterwards open/closed stays free. Lock exempts a panel from *collapse all* (and later from width-driven auto-collapse). Hiding needs no confirmation: the app bar always shows what is hidden, so nothing is lost.

**From a report row into the chart.** The portfolio panel links a unit's symbol to `/viewer?broker=<data_source>&symbol=<symbol>` — the two views share one query namespace (see `query_param_utils`), so the link is a normal `RouterLink` and needs no store to carry the hand-over. It works because `data_source` holds the same broker keys `GET /brokers` returns (`mt5`). Live runs leave `data_source` empty and get plain text instead: `broker_name` is a display name (`Kraken`) and is not addressable, and guessing the key from it would invent a mapping the backend owns. The timeframe is deliberately not passed — the chart keeps whichever one the user last chose.

### Deployments — a second view, deliberately not a panel workspace

A backtest is read one run at a time; a bot that runs for thirty days is not. There the object of
interest is the **deployment** — the identity a series of runs share — and the question is what
happened across the restarts. That is a different shape from the run workspace, and it is built as
a plain view rather than as panels:

- **`src/views/DeploymentsView.vue`** with `src/components/deployments/` (`DeploymentPicker`,
  `DeploymentHeader`, `SessionsTable`, `AdvisoryNotice`) and `src/stores/deployments_store.ts`.
- Route `/deployments`, selection carried in the URL as `?deployment=<id>` through
  `use_deployment_query_sync`, merging with the query rather than replacing it.

**Why not panels.** The registry and the layout store are global: one `layout.v1`, and `AppBar`
renders `allPanels()` unfiltered. Deployment panels in that registry would put their toggles into
the run view, where they can never render. Scoping the registry per view is foundation work that a
list and a table do not need.

**One row per (deployment x account currency), and the store keeps all of them.** A P&L added over
two currencies is not a number, so the ledger splits the rows and the view shows one header block
and one sessions table per currency. `deployment_id` alone is therefore NOT a key — picking the
first match would drop a whole currency's figures, silently.

**Nothing is re-aggregated client-side.** `net_pnl` is a sum over the sessions, `max_drawdown` is
their **maximum** — each session carries the running decline against the peak reached so far, so
adding the column counts one decline once per session that was still inside it. The sessions table
therefore has no totals row at all; the figures above it are the ledger's own, already reduced.

**Three renderings that are decisions rather than styling**, each taken because the alternative
misreports something:

- `advisory` sits ABOVE the table. By the time a reader reaches a change mark in the third row they
  have already added up the column above it. It arrives as COUNTS (`strategy_stands`,
  `operation_stands`), and the sentence is built in `AdvisoryNotice` — wording belongs to the
  component, so it stays reachable for the display-string marker and can change without the
  contract changing.
- `strategy_changed` / `operation_changed` render as a line BETWEEN two rows. A badge at the end of
  a row reads as a property of that session, which is the wrong reading — the flag marks a boundary.
- `unfinished` is shown even when zero. Those runs are absent from `sessions` by construction (the
  ledger row is written last), and a bare session count is a number the reader has no reason to doubt.

**A drawdown is rendered as a magnitude, whatever sign arrived.** The backend aligned the booking
period column to a magnitude, but stored artifacts written before that keep the negative form and
nothing in the payload distinguishes them. A decline has one direction, so `drawdown()` drops the
sign and loses nothing.

**The booking-period components are shared by both views.** `BookingPeriodTable` takes rows and
the declared key tuple as props, so the run panel and the deployment view are two callers of one
table rather than two implementations of it. The timeline is split in two on purpose:
`base/TimelineChart.vue` places numbers on a scale and knows nothing about runs, periods or time,
while `runs/BookingPeriodTimeline.vue` holds every domain decision — what a lane is, which clock
the axis carries, how a period becomes a coloured span. No package was added for it: a Gantt
library would be a dependency for one view, and a proportional bar on a linear scale is a hundred
lines that stay themeable through the existing tokens.

**One lane is a UNIT inside a run and a SESSION across a deployment.** `unit_name` is the profile
name and identical in every session of a deployment, so laning by it stacks every session's
periods into one row — measured: eight periods rendered as two visible bars, six hidden behind
the others.

**The stamps are never rescaled, and this is the sharp edge.** A deployment carries TWO time bases
that differ by a factor of thousands: the ledger's session stamps are wall clock (four sessions of
26 s each, 7 s apart) while a booking period is stamped on the market clock the session replayed
(the same ~27 h window in all four). No single axis can carry both. An earlier attempt squeezed
each session's periods into its wall-clock window to produce a staircase, and that drew a session
that does not exist. The axis therefore follows the period stamps, unscaled: sessions that
replayed one window look ALIKE, which is the finding — those runs are comparable because they
covered the same stretch. In a real forward-running deployment the two clocks coincide and the
staircase appears on its own. The wall-clock sequence lives in the sessions table, in `started`,
`ran_hours` and `gap_hours`.

**A vertical rule marks each distinct booking close** — the trading-day anchor every lane shares.
Distinct instants only, so four sessions closing at one anchor draw one line rather than four.

**`index` on a session row is not rendered.** It rides on the row and is NOT in the declared key
(`["run_id", "currency"]`), so presenting it as the session's number invents a counter the ledger
does not keep — and it repeats as soon as a deployment books in two currencies. The general rule:
`key` says what identifies a row, and a field outside it may be shown as data but never as the
row's identity or its number.

**The reconciliation is a COMPLETENESS check and the panel says so.** `total_*` are summed over the
periods and `run_*` are the run's own counters, but both descend from a single value handed to two
carriers three lines apart. A disagreement therefore means a record was lost on the way — evicted
by a history cap, falling in no period's window — and can never mean the P&L is wrong: an
arithmetic defect moves both figures together and the check stays green. `reconciles` is
three-state, and `null` (the run reports no figure in this currency, so nothing was compared) is
rendered as loudly as `false`. A tick there would claim evidence that does not exist.

**A 403 is a third kind of refusal.** `deployments` is its own grant surface, so a token can be
valid and carry nothing on it. `SurfaceForbiddenError` separates that from an absence and from an
outage, and the view says which surface is missing — not the backend's own text, which lists every
grant the token holds.

### Trade History — the only place a single trade exists

`runs/TradeHistoryPanel.vue`. Every other section of a run is already summed over these rows, so
this is the one that answers *which* trade, not *how much*.

**The table carries nine columns and the hover card carries all thirty-eight.** That split is what
the card was built for: a trade has more to say than a row has width, and truncating the row would
decide for the reader which fields matter.

**An adverse excursion is rendered as a magnitude.** Measured in one response: `mae_pnl` is signed
(−18,399.05) while the analytics block's `largest_mae` is the magnitude of that same number
(+18,399.05). The direction is already in the name, so rendering both as they arrive would put one
quantity on screen twice with opposite signs. `magnitude()` — the same formatter the drawdowns use,
renamed from `drawdown()` once a second quantity needed it.

**MAE and MFE are given three ways** — as a price, as the unrealised P&L at that price, and as a
distance in `price_unit` — and the card shows all three, because which one answers a question
depends on the question.

**The row cap is visible.** A thirty-day session produces thousands of trades and drawing them all
would stall the page, so the panel draws 500 and SAYS how many of how many it drew. A silent
truncation reads as "that was all", which for a trade list is the most misleading thing it could
say. Virtualisation replaces the cap the day a run exceeds it — `@tanstack/vue-virtual` is already
in the tree through reka-ui, though it would have to become a direct dependency.

### Configuration — shown, never resolved

`GET /reports/runs/{run_id}/config` serves the configuration a run was commissioned with, resolved
from the backend's run-config store through the run's `config_id`. Rendered by
`runs/ConfigPanel.vue` with `runs/config_shape.ts` beside it and `base/JsonTree.vue` underneath.

**The cascade belongs to the backend and is not rebuilt here.** It is documented there as two
levels for `strategy_config` and `stress_test_config` (global → scenario) and three for
`execution_config` and `trade_simulator_config` (app config → global → scenario), its merge depth
is not visible in what we receive, and for the three-level blocks the base layer lives in the
backend's own app configuration and is not in this document at all. Computing an effective value
would be a second implementation of someone else's rule, drifting silently the moment they change
it — the same failure as a hand-written mock of a response.

**So the panel reports presence, not resolution.** That a scenario carries its own block is
readable from the document; what that override resolves to is not. The notice therefore names the
scenarios and the blocks they carry, and says the block above is the base rather than what those
scenarios ran with. Same construction as the backend's own `advisory` on a deployment: it says a
blanket reading is invalid instead of computing a new figure.

**One route, two shapes.** An autotrader profile carries `strategy_config` at the top; a scenario
set carries `global.strategy_config` plus a `scenarios` list. That difference is contained in
`config_shape.ts` rather than travelling through the components as a union.

**`config` is deliberately not mirrored as a type**, and that is a considered exception to the
typing rule: the document is written by the OPERATOR, its shape differs per pipeline, and it grows
a branch whenever someone writes a new strategy. `StrategyConfig` IS mirrored, because its four
keys are the framework's own composition model — `worker_factory.py` reads `worker_instances` and
`workers` by exactly those names. Mirror what the framework guarantees; leave open what the
operator authors.

**The JSON tree is the floor, and its completeness is asserted.** Whatever the named views do not
show stays reachable there, and a test holds that every top-level key of both captured shapes is
present in the render. Without it, choosing what to highlight would quietly hide the rest —
including a key that does not exist yet.

**Two 404s, two meanings.** `config_snapshot_missing` is the ordinary absence of a section, mapped
to null. `run_not_found` says the backend does not know a run our own index just named — a
disagreement between two indexes, raised as `RunNotFoundError` rather than swallowed behind a blank
panel. They are told apart by the response body, since the status cannot say which.

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
