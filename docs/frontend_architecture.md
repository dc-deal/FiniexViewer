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
GET /api/v1/caller                                    token, no grant — who the server takes us to be
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
GET /api/v1/reports/runs/{run_id}/scenario-details    the ROSTER — every scenario, produced or not
GET /api/v1/reports/runs/{run_id}/warnings-errors     tiered warnings, per-unit errors, run outcome
GET /api/v1/reports/runs/{run_id}/portfolio           the same KPIs broken down per unit
GET /api/v1/reports/runs/{run_id}/booking-periods     the bookkeeping stretches, plus a completeness check
GET /api/v1/reports/runs/{run_id}/config              what the run was commissioned with
GET /api/v1/reports/runs/{run_id}/trade-history       every closed position, with its excursions
GET /api/v1/reports/runs/{run_id}/...                 10 further per-section reports (not yet consumed)
```

**Ledger plane** — a bot's life across its restarts, on its own grant surface `deployments`:

```
GET /api/v1/deployments                               one row per (deployment x account currency)
GET /api/v1/deployments/{deployment_id}               the sessions, oldest first
GET /api/v1/deployments/{deployment_id}/booking-periods   every period of every session, in one call
```

A **deployment is not a run**: no header, no directory, no artifacts of its own. It is an identity
that a series of runs name, and its rows live in the run-results ledger — so it cannot be opened
through a report route. The hinge runs the other way: each session carries its `run_id`, which is
what every report route takes. It also runs backwards, because a session's index row carries
`parent_id` with `parent_kind: "deployment"`, so a run knows its deployment without a lookup.

**Contract version and row keys.** Two mechanisms the backend added after the models changed four
times in one day, and both are used here:

```
GET /api/v1/contract      open, like /health   ->  {"contract": 17, "app_version": "...", "changes": [...]}
X-Api-Contract: 17        on EVERY response, refusals included
{ "key": ["deployment_id", "currency"], "deployments": [ ... ] }
```

`key` states what makes one row of a list unique, and in three of the five lists the obvious field
is the wrong one. The viewer READS it at the render edge — a shared component builds its row
identity from the declared tuple, which is what lets one table serve two routes — and ASSERTS it in
the suite. The contract number is asserted against captured fixtures, so re-capturing them against
a newer backend fails locally instead of a field quietly turning `null` in production.

The report plane is model-fed on the backend: one canonical model per section, derived once and rendered identically to console, CSV and API. The API is the same object serialized, not a separate projection that can drift.

Six consequences the frontend is built around:

- **The index row carries the whole run header**, so the picker, its facets and the Run Header panel are all built from one request: `run_id`, `group`, `name`, `has_reports`, `start_time`, `parent_id` and the provenance triple `app_version` / `git_commit` / `config_snapshot`. No follow-up request per run — an N+1 against `run-summary` would be the obvious mistake here, and the Run Header panel needs no request at all because its model IS this row.
- **A 404 on a report section is an absence, not a failure.** A run can exist without carrying a given artifact. `getRunSummary` maps that to `null`, and the view says the artifact is missing instead of showing an error.
- **Every report body names the run it was built from**, and `api_client` asserts it against what was requested (`RunIdMismatchError`). This is the only defence a client has against an ambiguous id: a duplicate passes every membership check, the route resolves it to whichever run it finds first, and nothing else in the payload would give that away. It has happened — three runs once shared one id here.
- **A 409 is a third thing again: the artifact is there and cannot be parsed**, because it was written by an older schema and the run has to be repeated. `getWarningsErrors` raises `ArtifactUnreadableError` carrying the backend's own detail text, and the view shows it as a notice *beside* the panels rather than instead of them — one unreadable section must not hide the readable ones. Three distinct answers, three distinct states: 404 absent, 409 stale, anything else an outage.
- **The index is the authority on which runs exist, and it is never bypassed.** A URL, a bookmark or a shared link can name a run whose artifacts were removed since. `selectRun` refuses an id the index does not contain, so a stale link produces no request at all rather than one 404 per section — the same rule the layout store applies to stored panel ids. An empty index is its own state (`{"runs": [], "count": 0}` is a normal 200), and the view says so instead of offering empty pickers with no explanation.
- **`has_reports` on the index row decides whether a run is worth asking about.** `false` means the run exists as logs only and every report route answers 404 — a normal state, because a test session writes logs and no artifacts. It is neither a failure nor a reason to hide the run: the picker shows it marked `logs only`, and neither the store nor the view issues a request for it. It IS selectable — it was a disabled option once, but the run view now says what such a run is and the store asks the backend for nothing, so a row that cannot be clicked would only look broken. Hiding it instead would raise the question where the run went; asking anyway would be the 404 storm the rule above exists to prevent.

**`run_id` is opaque, and stays that way.** It is minted as `<date>_<time>_<8 hex>` and the backend pins the character class to `[0-9a-f_]` with a test, so interpolating it into a URL path unencoded is safe by assertion rather than by hope. Nothing here parses it: no split, no date extracted for display, no sort. Ordering comes from the index, which is newest-first by contract.

**Two axes, two fields.** `group` is the PIPELINE, `parent_id` is the NESTING. They were briefly one field (`single_runs` | `sweeps` | `autotrader`), which mixed a shape with a pipeline and could not express a nested session. A third field, `parent_kind`, now SAYS which kind of family `parent_id` names, so nothing derives it from `group` any more:

| `parent_kind` | What `parent_id` names | What its siblings want |
|---|---|---|
| `null` | nothing — the run stands alone | — |
| `sweep` | a **combination** of a parameter sweep | a **ranking** by the sweep's declared objective |
| `deployment` | a **session** of a deployment | a **timeline**, ordered by `start_time` |

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

Its sibling on the categorical side: **a value that means "not applicable" must never render as a state.** `run_outcome` is `''` on artifacts written before the grading existed, so the panel says "no outcome recorded" rather than showing an empty verdict. `shutdown_mode` is AutoTrader-only and `''` on a backtest, so it is absent rather than rendered — and where it *is* present it is detail, never a verdict: an operator stopping a healthy session with Ctrl+C produces the same `emergency` as a crash, so it is shown as alarming only where `run_outcome` is `failed`. `operator_interrupted` would resolve that ambiguity, but it is newer than most artifacts, which default it to `false`; it is mirrored and deliberately not rendered until an artifact can carry a true value.

### The printout never computes

The backend derives every figure once, off the hot loop, and its renderers only format. The viewer follows the same rule: no KPI is re-derived here. If a figure a panel needs is not on a model, it is requested as a model field rather than calculated locally — a second calculation drifts from the first, which is exactly the defect the backend removed from its own console (`execution_rate_pct` and `max_dd_pct` were divisions inside a renderer and are now fields).

### Canonical section order

The order both backend pipelines render, and the order panels should follow:

```
header → scenario details (sim) → portfolio: per-unit, then aggregated →
trade history: per-unit, then aggregated → broker → signal → feed stability →
performance: per-unit, aggregated, bottleneck → profiling (sim) →
worker/decision breakdown → warmup (sim) → warnings & errors →
closing: executive (backtest) / session summary (AutoTrader)
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

All colors, spacing, and type scale are defined as CSS custom properties in `src/styles/tokens.css`. Dark mode is the default; light mode overrides the same variables under `[data-theme='light']`. The active theme is controlled by a `data-theme` attribute on `<html>`, written in exactly one place — `App.vue` watches the settings store and sets the attribute. No panel receives the theme as a prop; it reads the tokens the attribute selects, which is why a theme change needs no re-render anywhere else.

This avoids a CSS-in-JS dependency, works natively in every browser, and is trivially inspectable in DevTools. Reka UI (headless component layer) is deferred — no concrete accessibility need has surfaced yet.

**Surfaces are not roles.** `bg-hover` and `bg-active` are lightness steps of one surface that a
control moves through as it is pointed at and pressed — lifting, then sinking, in both themes, so
"pressed" reads the same way whichever theme is on. They are not measured for hue distinctness the
way a role colour is; what they were measured for is text contrast, which is 12.97:1 or better over
all three button surfaces in both themes (2026-09-27).

**A role colour is computed, and the constraints can contradict each other.** Measured 2026-09-29:
the light theme's `--color-positive` was `#0f8a7e` — **4.24:1 against white, the only status colour
in that theme below WCAG AA for normal text**, and the only one under the 0.100 chroma floor. The
replacement was not chosen but searched for, and the search says how little room there is:

```
max chroma reachable in sRGB      >= 4.24:1   >= 4.50:1
hue 178-192  (the teal it is)        0.103       0.101
hue 165-178  (greener)               0.118       0.114
hue 150-165  (green)                 0.156       0.150
```

`#008674` takes that whole room: chroma 0.101, 4.504:1. A greener candidate reached 0.114 and
4.58:1 — better on both stated thresholds — and was rejected, because its distance from
`--color-negative` under deuteranopia fell from 11.7 to 8.3 ΔE. Green against red is the axis
red-green colour blindness collapses, so the better numbers would have been paid for on the channel
that matters most for a profit-and-loss palette. The sign in the figure itself is the second
channel that makes 10.7 ΔE enough.

**`text-secondary` on a surface is the look of a DISABLED control, and nothing clickable may wear
it.** A settings button did, and the first person to meet it read it as greyed out and unusable
although it worked. That is not a misreading — it is the correct reading of a wrong style.

### Buttons — `AppButton`, and why the states are the component

`base/AppButton.vue` is every button in two shapes: `solid` has a surface of its own, `quiet` is an
action inside a line of text and stays flat until pointed at. Before it existed there were two
bespoke button styles and five one-off text actions, and none of them had a hover or a pressed
state — a click produced no feedback at the control itself.

**Each state carries two channels, so none depends on one.** Hover lifts the surface *and* takes
the interactive border; the press sinks the surface *and* moves the control down a pixel. The
second half matters: the surface step is a luminance ratio of about 1.1, far too weak to carry
press feedback alone, while position works regardless of contrast sensitivity. Focus draws a ring
rather than recolouring the border, because a border that only changes colour is invisible against
a surface of similar lightness — and the keyboard reader is the one who needs it most.

A toggle reuses the pressed look as a lasting state instead of inventing a fifth appearance, and
`aria-pressed` is emitted only where `active` is actually used: a plain button carrying it claims
to be a toggle it is not.

**`marked` is the chosen look WITHOUT that announcement**, and the distinction is not pedantry. A
facet's popover trigger holds a state worth showing — values are picked — but it is a disclosure,
and Reka UI already gives it `aria-expanded`; `aria-pressed` beside that announces two roles at
once. So `marked` takes the border and the ink, and what the control states in words (the count
badge) is what carries the meaning aloud. `active` stays for a real toggle, such as the sort group
where one of several is chosen.

**`compact` is the second size**, and it exists because density is a requirement of these views
rather than a preference: a facet bar carries six or more chips side by side. It changes the
padding and nothing else, so every state still reads the same.

**A portalled trigger is not an exception — `as-child` is the answer.** The facet chips carried
sixty lines of CSS that restated `AppButton`'s four states with the same tokens, because two of the
three are Reka UI `PopoverTrigger`s. Wrapping them with `as-child` lets the primitive keep the
disclosure behaviour while `AppButton` carries the look, and the duplicate contract is gone — a
second copy drifts the moment the first one changes. Measured after the change: the chips are still
20 px tall with `2px 8px` of padding, so nothing got less dense. The same pattern already held the
dialog's close button.

**What is still not an `AppButton`:** the app bar, the accordion header, the JSON fold, and the
option rows inside a facet's popover. Those are menu items and disclosure headers rather than
buttons — a different control type with a different shape, not the same one written twice.

### URL Query State — `use_query_sync` / `use_run_query_sync` / `use_facet_query`

Every user-selectable option on a page is stored in the URL as a query param, so any view is a shareable link that survives reload. Three composables own disjoint sets of params:

- `use_query_sync.ts` — the chart selection (`?broker=...&symbol=...&timeframe=...`), activated in `AppShell`.
- `use_run_query_sync.ts` — the run and the scenarios narrowed to (`?run=...&unit=...`), activated in `RunsView`. `unit` is one step BELOW the run and selecting a run clears it, so it is applied after the run resolves — read first, it is silently dropped and a shared link loses its narrowing. `?group=` and `?name=` were the old cascade's params and are actively REMOVED from a link that still carries them, rather than left to look meaningful.
- `use_facet_query.ts` — a facet bar's narrowing, ordering and search, one instance per bar.

Priority on load: **URL params > localStorage > null**. All three wait for `router.isReady()` before reading params, to avoid a race with the initial navigation, then watch their state and write on every change. For the chart selection, localStorage is a write-through cache; the run selection has no cache, because the run index is live data.

**One writer, because four owners of one query cannot each rebuild it.** `router.replace({ query })`
with a freshly built object drops every param the others own — and `route.query` only updates once
a navigation RESOLVES, so two writers firing in the same flush both read the state before either
wrote and the second one wins. That is reachable rather than theoretical: choosing a run writes
`run`, and the same change clears the roster's facets, which writes `unitf`.

`query_param_utils.ts` therefore holds `patchQuery(router, patch)`: writers state what THEIR keys
should become, and one navigation per tick applies them together against the live query. A later
patch for the same key wins, which is what writing twice means. `readQuery` and `writeParam` remain
underneath it.

#### A facet bar in the URL

Three params per bar, prefixed with the thing the bar narrows — `run…` for the run index, `unit…`
for the scenario roster, the same two words `run=` and `unit=` already use:

```
/runs?run=20260929_080044_c7cc7f14
     &runf=group:simulation;artifacts:reports  &runsort=oldest  &runq=tunnel
     &unitf=status:success;result:profit       &unitsort=pnl    &unitq=EUR
```

A param is absent while its part of the bar is untouched, and the sort is written only when it is
not the bar's default, so an ordinary link stays short. The facets are written sorted by id, so the
same narrowing always produces the same link whatever order the chips were clicked in.

**Why the search and the sort ride along.** A search REMOVES rows, so it is a filter. A sort does
not change the set, but these sorts are analytical — *worst result first*, *longest tick timespan
first* — and that is what a sender means to show. Panel order, collapsed sections and pinned panels
stay in `localStorage`: those are how one reader arranged their screen, not what they are looking
at.

**Separators: `facet:value,value;facet:value`.** Measured 2026-09-29 over 52 distinct facet values
from the live run index and three scenario rosters — every one matches `[A-Za-z0-9_. ]`, so none
collides. A value that ever carried `,` `;` or `:` would not survive the round trip; the answer then
is repeated params rather than an escape scheme, the same conclusion the `unit` param reached.

### Settings — three kinds of state, and which one needs an account

There are three kinds of state in this application and they do not share a home. Getting the line
wrong is what makes a shared link meaningless or a preference travel to someone who did not ask
for it:

| | What it is | Where it lives | Needs an account? |
|---|---|---|---|
| **Selection** | which run, scenario, symbol, timeframe, filter | URL query params | never |
| **Presentation** | panel order, collapsed state, theme, thresholds, caps | `localStorage` | no |
| **Operation** | writing, triggering a run, changing a configuration | nowhere yet | **yes — and only this** |

Two consequences follow. **A settings menu needs no user system**: everything it holds today is
presentation, it is per-machine by nature, and putting it behind a login would make the viewer
worse rather than safer. And **a user system is driven by write, not by settings** — identity earns
its keep the moment the browser can change something on the other side, which the read-only API
does not allow (see *API Token* above, and issue #22).

- **`src/stores/settings_store.ts`** — presentation state under the single versioned key
  `settings.v1`. Reconciled on load field by field and never trusted: the result is built from the
  defaults and a stored field is adopted only when it passes its own check, so a key this build
  does not know is never copied and a key the stored value lacks takes its default. The schema
  version guards what a field check cannot — a field that kept its name and changed its meaning.
  An out-of-range value is **ignored, not clamped**: a number silently changed to a different one
  is a wrong answer.
- **`src/types/settings_types.ts`** — the shape and `DEFAULT_SETTINGS` beside it, because a default
  that drifts from its type is the defect that placement prevents.
- **`src/components/TopMenu.vue`** — the application menu in the shell header, behind one burger
  trigger: settings, a theme entry that names the theme it switches TO, and an account entry that
  carries the display name once the server has reported one. Both settings entries open the same
  dialog on the tab they belong to, so there is one surface rather than two.
- **`src/components/SettingsDialog.vue`** — three tabs: **Display** (the preferences), **Layout**
  (export and import, which have no other home) and **Account** (the identity below).
- **`src/stores/caller_store.ts`** — who the server takes this client to be.
- **`src/composables/use_display_settings.ts`** — how a preference reaches a panel.

**A panel does not read the store.** `PanelColumn` provides the display subset and a panel injects
it, with the defaults as the fallback — so a panel mounted on its own, or by a future live host,
behaves exactly as it did before settings existed. Ambient rather than a prop for the same reason
the theme is: it applies to every panel, only some care, and passing it to all of them would hang a
stray attribute on the ones that do not declare it.

**Why one store even though the destination is a server.** These values will eventually be stored
by FiniexTestingIDE rather than the browser (issue #22). That is not an argument for waiting — it
is the argument for the store: the expensive part of the later move is not relocating the values,
it is *finding* them once they have spread across a dozen components. The same bet this project
makes at the display-string marker, for the same reason.

**The shape of that destination is agreed (2026-09-24), and it decides what this store is.**
Preferences will be a **generic document per account whose schema this project owns** — the backend
stores it opaquely. Scenario *configurations* are the opposite: typed and validated by the backend
against the components' parameter schema, never by the viewer's authority. So the settings store
stays a **thin cache** whose reconciliation is ours to keep, and it never reconciles a
configuration — which is the same line the Configuration panel already draws from the other side
(*show, never resolve*).

### Identity — `GET /api/v1/caller`, and the two rules that bound it

**Two principals.** A token identifies a **client**; an **account** identifies a person, and a token
is bound to exactly one account. Until a login exists, presenting this viewer's token is acting as
its account. The permission verb (`read` / `write` / `execute`) is a separate axis from the surface
with **a separate token per verb**, so a write path means the dev proxy holds one credential per
verb rather than one credential with more rights. None of that changes the header the proxy sends.

`caller_store` reads the route and keeps a STATE rather than a message, so the wording stays in the
component where the display-string marker reaches it:

| State | What it means |
|---|---|
| `ready` | gating is on and the identity is real |
| `unenforced` | a 200 arrived and **proves nothing** — the server verifies no token, so every identity field is null even for a caller that sent a valid one |
| `unauthenticated` | 401: the credential was refused |
| `failed` | the server did not answer — a different problem with a different fix |

**`grants` is INFORMATION, never a capability list.** Settled with the backend on 2026-09-25: the
list is displayed, every surface stays reachable, and a refusal is the 403 — which names the surface
and what the token holds. A client that hid a view because the list lacked an entry would be a
second, weaker copy of a model it does not own, and it would fail in the silent direction: an absent
view looks like one that never existed. If the rights model ever needs a client to reason from it,
that arrives as its own announced contract change.

**The answer is never cached, because a restart is invisible from here.** An account or a grant
takes effect on the backend only across a restart of its process, and no response carries a boot id
or a start time — confirmed by the backend rather than assumed, and the build version does not move
either. So `App.vue` re-reads on `visibilitychange`, and the dialog states the identity *as of* the
instant it was read. That approximation is only safe because of the rule above: the answer decides
nothing, so a stale one costs a line of text.

**One hazard recorded rather than solved.** Stored settings are discarded whole on a schema-version
mismatch, which is right for a per-machine file. Once the same document lives on a server and is
read by two machines, that rule lets an older client discard a newer document and write its own
back. It needs an answer in the change that moves the backing, not before — there is no shared
document yet.

**The first real setting is the scenario threshold.** Above that many units a panel makes the
summary primary and the individual unit secondary — Trade History collapses each unit to its group
row, which still carries the name, the net, the fees and the trade count. A thirteen-scenario run
is already hard to read and a forty-scenario run is unreadable; the threshold is what lets the
presentation know how many units it is dealing with. Nothing is ever hidden silently.

### Narrowing a list — one facet bar, and what it is not allowed to do

A run of forty scenarios breaks every view built for three. The answer is the arrangement a tracker
of thousands of rows uses: **a facet bar over a plain list**, nothing cleverer.

- **`src/components/base/facet_filter.ts`** — the whole behaviour as pure functions over rows the
  caller already has: `applyFacets`, `facetOptions`, `toggleValue`, `sortRows`. Testable without
  mounting anything.
- **`src/components/base/FacetBar.vue`** — generic over its row type. It owns no state: the caller
  holds the selection and applies the same pure functions, so the bar and the list can never
  disagree about what is shown.
- **`src/types/facet_types.ts`** — a `FacetDefinition` is the only place that knows what a row looks
  like, which is what lets one bar serve a scenario roster, a run index and a session list.

Four rules the implementation follows, each of which is a way a filter usually goes wrong:

- **Values within one facet are OR, different facets are AND.** Picking a second value of the same
  facet widens the question; picking in a second facet narrows it.
- **A facet counts against the OTHER facets, never against itself.** Counting against its own
  selection makes every unpicked value read 0 as soon as one is picked, and a reader can then never
  widen a choice without clearing it first. A picked value stays listed at 0 so it can be taken off.
- **A row that states no value is never claimed by one.** `market_type` is empty on every run
  recorded before the backend added it; such a row shows while the facet is open and drops as soon
  as a value is picked. An empty string is not a category, and a facet with nothing to offer is not
  drawn at all.
- **The count is read against the whole list**, not against what survived — a filter that counts
  only its own result cannot say what it is hiding.

**Nothing here derives anything.** A facet's values come out of the row through the caller's own
`valuesOf`. Sorting a scenario list by net P&L is deliberately ABSENT: the roster carries no figures
and the response that does is a shorter list, so the sort would need those two merged into a third
thing — raised with FiniexTestingIDE on 2026-09-27 and waiting on their answer rather than worked
around here.

### The list itself — one stem under every table-shaped list

`FacetBar` narrows a list; **`src/components/base/RecordList.vue`** draws it. The two are deliberately
separate: either can serve a list the other has never seen, and the run picker has extra controls
between the bar and the rows that a single combined component would have to grow a prop for.

- **`RecordList.vue`** — generic over its row type. It owns the grid tracks, the sticky headings, the
  row button with its four states, the group heading, an optional spanning prose line, an optional
  card beside the row, and an optional block of CHILD records. It holds no state, sorts nothing,
  filters nothing and folds nothing.
- **`src/types/list_types.ts`** — `ListColumn` (label, track, whether it is a figure, its rank, and
  an optional `hint`), `ListCard` (what the card beside a row shows) and `ListGroup` (one partition:
  key, rows, open).

**The columns line up across rows, and a grid on the row cannot do it.** Each row is its own
`<button>` — deliberately, because a row that cannot be focused or pressed is the look of a broken
control — and a grid declared on the button sizes ITS OWN tracks. Forty-one rows were forty-one
independent grids: measured 2026-09-29, the figures drifted 99 px across fourteen rows. `subgrid`
reconciles them — the list owns the tracks, the `<li>` disappears with `display: contents` so the
button becomes a direct item of it, and the button adopts the tracks instead of inventing them.

**A heading is CLIPPED and carries its own word.** `.record-head > span` is `white-space: nowrap`;
without an overflow rule a heading wider than its column spilled over the one beside it and the two
words overprinted — measured 2026-10-01, `Win Rate` took 68 px of a 66 px track on the deployment
view, where a fifteenth column takes share from the rest. The stem clips now and puts the whole
label in a `title`, the same pattern a cell uses. A column that must stay legible at every width
says so with a FLOOR in its own track instead: five of the booking periods carry one, because a
timestamp is 20 fixed characters and a heading is as wide as its word, and a proportional share
cannot express either.

**`rowClass` is the one class a CALLER puts on a row**, for a distinction only it can see; the list
keeps `picked`, `grouped` and `inert` beside it rather than handing the class list over. Its first
use is the position boundary above. A lead line (`hasLead`) says such a thing in words and takes a
row to do it — a rule belongs on the row it precedes.

**A column can declare what it MEANS, for a field whose own name misleads.** `hint` rides in the
heading's `title` AFTER the label — never in place of it, because a heading wider than its column is
clipped and the title is how it can still be read in full. The first case is `order_id` on an order
row: the backend's glossary opens its entry with *"Not an order's own id: the id of the POSITION the
order belongs to"*, so a heading reading `Order` alone claimed something false. The heading carries
their term, `Order id`, and their sentence is one hover away. It is the same attachment point
viewer#26 will serve these from.

**`figure: true` needs TWO halves, exactly like `rank`, and for the same reason.** The declaration
right-aligns the HEADING, which the stem owns; the CELLS come from the caller's slot, so the caller
right-aligns those. Measured 2026-09-30 across every ranked list, comparing the right edge of the
INK: three of the four had figure cells sitting **11 to 172 px left of the heading they belong to**,
ten columns of ten in the booking periods. Every declaration was correct and the geometry was not,
which is why no unit test could see it — the invariant lives in `e2e/list_ranks.spec.ts`. Each
caller marks its figure cells `figure-cell` and carries one rule for them.

A column of figures that does not line up with its own label is not a column. The fix is one rule
per list; the reason it is not one rule in the stem is that a scoped stylesheet cannot reach into a
caller's slotted cells, and the stem does not know which position each caller's figures sit in.
Cloning the slot's vnodes to stamp both `rank` and `figure` from the column list would remove both
duplications at once — recorded as a direction, not taken, because it would change how all five
callers are written.

**A GROUP and a CHILD are different things, kept apart on purpose.** A group is a partition of the
same row kind: no columns of its own, only a heading over rows that already fit. A child is a record
of ANOTHER kind that a row owns — a trade's fills — with its own columns. Serving both from one
mechanism is what makes a list component collapse under itself. The grouping is the CALLER's
declaration, never a control: a list whose grouping the reader can rearrange has no shape anyone
recognises, and a screenshot of it shows a different list than their own.

**A group heading carries no figure it had to compute.** Its numbers are the ones the API SERVED for
that group — `scenario_totals` on the trade history — looked up by key. `ListGroup` therefore holds
no totals at all. That is not fastidiousness: the backend's own declared reductions state that a
drawdown must come from the row that won it, that a rate is rebuilt from summed components rather
than averaged, and that a streak can cross a boundary and so answers nothing. A heading with no
served total shows its NAME and its ROW COUNT, and no figure.

**Where a track is content-sized and where it must not be.** `auto` is fine in a list without
groups. With groups it is a defect: while every group is closed the columns the heading spans hold
no cells at all, so the track is sized from nothing and then re-sized the moment a group opens,
sliding every heading sideways. A grouped list therefore declares proportional tracks —
`minmax(0, Nfr)`, where `fr` accounts for the gaps that percentages ignore and `minmax(0, …)` stops
one long cell widening its column. A heading cell may SPAN tracks, which is what the table's old
`colspan` did for the unit's name.

**The card beside a row is wrapped by the LIST, not by the caller.** reka-ui's trigger takes a
single element and that element is the row button, which the list owns. Wrapping every row
unconditionally would mount a tooltip context per row — five hundred on a long trade list, for
lists that offer no card — so a row without a card is a bare button.

**Bands over the headings, for a list too wide to read as one row of equal words.** `bands` is a
list of `{ label, span }`, drawn as a second sticky row above the headings, each band spanning its
columns. The booking periods read as *Period · Result · Account* rather than as fifteen equal
fields. The spans must cover the columns EXACTLY; the stem checks the arithmetic and draws no bands
at all where it does not add up, because a band off by one sits over the wrong column and nothing
on screen says so. That was a real defect in the table this replaced — `colspan 6 + 1 + 2` in an
eight-column layout stretched it past its own heading.

A declared span is the span at the **widest** tier, and it has to shrink with the ranks. Under
ranks the grid has fewer tracks than the declaration counts, so a fixed span reaches past the end
of it: measured 2026-09-30 on the booking periods at a 28 rem panel, four bands demanded fourteen
tracks of a four-track grid, the browser grew implicit columns to fit them, and every band then
stood over the wrong columns. The arithmetic check above could not see it — it compares against
`columns.length`, which is the count at the widest tier and says nothing about the others. So each
band carries all four of its spans on itself (`--s1` … `--s4`, the columns of its own that survive
that tier) and the container query chooses one for every band at once. That is what makes it
expressible in static CSS: the stem does not know how many bands a caller declares, but it does
know which tier is in force. A band that keeps **no** column is reported and no bands are drawn —
`span 0` is not a span, and patching it to one would put it over somebody else's column.

The same arithmetic reaches a GROUP heading, which is why the trade history's is counted from the
END: its name takes `1 / -2` and its net `-2 / -1`, so the heading holds at every tier. The three
cells it replaced spanned `5 + 1 + 2`, fixed at eight columns. That is also why `Net P&L` is the
last column of that list rather than the sixth.

**A line BEFORE a row, for a statement about the gap.** `hasLead` plus a `lead` slot, mirroring
`hasDetail` / `detail`. A deployment's configuration changed between two sessions: everything above
ran with one thing and everything below with another, so a badge on either row would misreport it
as a property of that row. It is a line and not a control — nothing to click, nothing to mark — and
it wears the annotation role DASHED, which is what that role is for.

**Columns given up as the list narrows, by rank.** A column declares `rank: 1 | 2 | 3 | 4 | 5`; 1
survives every width and 5 goes first. Absent means 1, so a list that ranks nothing keeps every
column, exactly as before. The rungs are **34 / 48 / 62 / 80 rem** of the LIST's own width.

**There are five rungs because the fourth was unbounded above, and that is where the defect lived.**
Measured 2026-09-30 at three window widths, comparing each track against what its content needs: at
69 rem the booking periods drew all fourteen columns in tracks of **22 px** — three monospace
characters — and overflowed by 18 px; the run list gave `Set`, the one cell a reader recognises,
112 px for 157 px of text, so it read `aggressive_t…`; the roster gave `Currency` 42 px for a 68 px
heading, three headings too tight at once. **None of those is a narrow window** — 69 rem is the
ordinary width of a maximised one here, which is exactly why a ladder topping out at 62 rem never
engaged. With the fifth rung all three overflow at zero at every measured width.

Each list declares a rank at every rung it needs and no more, because a rank the list does not use
makes a breakpoint that changes nothing — which reads as a broken one rather than as an absent one:

| list | columns | ladder |
|---|---|---|
| `RunPicker` | 10 | 10 → 8 → 7 → 6 → 4 |
| `TradeHistoryPanel` | 8 | 8 → 6 → 4 → 3 |
| `ScenarioRosterPanel` | 15 | 15 → 11 → 8 → 5 → 3 |
| `BookingPeriodTable` | 14–15 | 14 → 10 → 8 → 6 → 4 |
| `SessionsTable` | 6 | 6 → 4 → 3 |
| `DeploymentPicker` | 9 | 9 → 7 → 5 → 3 |

What goes first is decided from the DATA where the data can decide it. The roster's `market`,
`currency` and `broker` carried the same value on all ten rows of a measurement, so they lead. The
booking periods' `Win Rate` and `PF` read `n/a` on eight of ten drawn rows, because eight of those
periods booked no trade at all — and `Opening` and `Equity band` describe the same account movement
that `Final equity` closes, which is rank 1. The run list gives up its `Run id` early despite it
being the declared key: it renders as the timestamp part, the same instant `Started` spells out.

Measured on the scenario roster at a 900 px window: twelve columns in a 620 px panel is 40 px each,
five monospace characters, every cell unreadable. Ranked, the same panel shows three columns in
full: scenario · net P&L · state.

Two mechanisms, and neither alone works. A cell hidden with `display: none` leaves its TRACK
standing and its share of the width with it; a track removed under a cell that stays shifts every
later cell into the wrong column. So the stem publishes a track string per tier as a custom
property and a **container query** picks one, while the same query hides the cells. The width that
matters is the LIST's, not the window's — a panel's width is the reader's own arrangement, since
they drag the seams — which is why a container query and not a media query. A `.record-shell`
wrapper exists solely to be measured: an element cannot query its own width.

The rank lives twice, on the column and on the cell, and it has to: the list owns the tracks while
the caller owns the cells. Each ranked list asserts that the two agree.

Consumers today: the run picker, the trade history, the scenario roster, the booking periods and
the deployment sessions. Still to move: the portfolio, whose rebuild around the ACCOUNT lens is
undecided rather than blocked.

### The scenario roster — the only complete list of a run

Rendered through `base/RecordList.vue`, twelve columns wide: scenario · symbol · market · currency ·
broker · tick timespan · ticks · took · trades · net P&L · PF · state. It was a name line over a
prose figures line, which reads as a sentence per scenario and compares across forty of them not at
all. The reason a scenario produced nothing is the list's spanning detail line, so prose never sets
a column's width.

Two of the twelve declare a FLOOR rather than a share: the scenario name and the state. Everything
here compresses rather than scrolls at a narrow width, which is the right trade for a panel whose
width the reader sets — but measured at 900 px the state read `f…` and `s…`, and whether a scenario
failed is what the list is opened for. Hiding columns outright below some width is the obvious next
step and is not taken: which columns go is a judgement about what the list is FOR.

`GET …/scenario-details` is the authority for *which scenarios does this run have* (settled with the
backend 2026-09-25): it is built from the batch ITSELF rather than from results, so a scenario that
produced nothing is still a row carrying its reason. Every other per-unit response is shorter
because each answers a different question — **declared · attempted · produced · counted**.

It is **backtests only by construction** — an AutoTrader session has no scenario grid, a session IS one unit —
so the route answers `404 artifact_not_produced` there and `PanelColumn` drops the panel, which is
the same absent-source rule every other section uses.

**Five counters on that row are not carried.** Measured over 370 rows on 2026-09-27: `worker_count`,
`trades_requested` and the three signal counters read 0 on every row, including the 18 that
processed ticks and closed positions, while `ticks_processed`, `execution_time_ms` and
`tick_timespan_seconds` are carried on exactly those 18. Nothing is rendered or sorted from the
five — a zero nobody reported is not a figure. Reported to the backend and open.

**Two of that row's figures both look like "time" and are not one axis.** The **tick timespan**
(`tick_timespan_seconds`) is MARKET time — from the unit's first processed tick to its last, so a
tick-limited scenario ends before the *data window* it was declared to cover. **Execution time**
(`execution_time_ms`) is the MACHINE's: how long it took to run. The roster shows both and keeps
them apart by ink, the timespan leading in the primary colour and the execution time secondary,
because ranking scenarios by the wrong one of the two answers a question nobody asked. Execution
time was withheld until contract 13: the field carried seconds under a millisecond name, so 1.98
for 13,584 ticks read as 6.9 million ticks a second. The backend migrated the stored runs, and the
same row now reads 1980.67.

**The run index says what each run DID — contract 15, and a request this repo made rather than a
figure it computed.** `results` carries one entry per account currency (`results_key` is
`["currency"]`), beside `run_outcome` and three counts. The backend folds it from each run's
booking periods by its own declared reductions and reads the ledger once per CHANGE of the ledger,
not once per request: about 95 ms for the whole list of 41 runs. The alternative was one
`run-summary` per row — forty requests to fill a list of forty, the N+1 their own documentation
warns about — which is why this was asked for instead of worked around.

Three rules govern how it is rendered, and each has cost something to learn elsewhere:

- **`null`, `[]` and a list are three statements, not two.** `null` is the ledger holding nothing
  for that run (still going, died before its close, or `reporting: none` — read it beside
  `reporting`); `[]` is a run that closed without figures. Measured 2026-09-29 over 41 runs: 38
  lists, 2 null, 1 empty, so all three reach the screen.
- **Two currencies are two figures.** Summing them would be a value the backend never stated, and
  wrong arithmetic besides. No sort is offered over P&L or the trade count for the same reason: a
  single number to sort by does not exist per run.
- **A count of `null` is not a zero.** `error_count` and `warning_count` are marked only where a
  count was taken and is not zero. `log_warning_count` is Tier 2 — ignorable by design, the
  backend's own word — so it is mirrored and not put on the row.

**Where a configuration came from is NOT a property of a run.** `GET /api/v1/directory` carries
`origin` (`configs` | `user_configs` | `user_algos`) per FILE, and a run's `config_snapshot` is that
file's name — a deliberate linkage, confirmed by the backend. But it answers *where a file of that
name lives today*: one moved, deleted or shadowed after the run gives a different answer than the
run had, and no per-run origin is served. The label therefore describes the file, never the run.

### Choosing scenarios — `?unit=`, and what must not be narrowed with them

A run holds up to forty scenarios, and the facet bar only narrows the ROSTER. The selection is the
other half: scenarios are chosen, and the sections that are per-unit follow them.

```
?run=20260927_092959_cd1d9b1e&unit=ETHUSD_blocks_06,ETHUSD_blocks_09

  roster            marks the rows; a click adds, a second click takes one out
  trade history     narrowed
  booking periods   narrowed
  warnings/errors   narrowed — but a RUN-scoped warning stays, it is still true
  portfolio         MARKED, never narrowed
  RunsView          the whole column is FRAMED, headed "⌖ Showing only … Show all"
```

**Several at once, because the question is usually a comparison.** The names ride in one param,
comma separated — measured 2026-09-27 over 58 real names from the roster, the run index and the
portfolio: every one matches `[A-Za-z0-9_-]`, so nothing collides with the separator. A name that
ever carries a comma would not survive the round trip, and the fix then is repeated params rather
than an escape scheme. An EMPTY list means the whole run, never "nothing" — `showsUnit` encodes
exactly that, so no call site branches on it.

**The narrowed column is framed, not merely announced.** A sentence above a list cannot say how far
a manipulation reaches; an edge can. The frame wears the annotation role — a marked division — and
is itself the channel that survives for a reader who cannot separate the hues.

**It lives in the URL, because it is SELECTION.** Panel order and collapsed state are presentation
and stay in `localStorage`; what the reader is looking at belongs in the query, or a shared link
means something different for whoever opens it. It sits one step below the run and is
dropped whenever the run above it changes — carried across, it would narrow a new run to a name
that run may not have, or to one it does, which then reads as a choice nobody made.

**It reaches the panels ambiently** (`use_scenario_selection.ts`), for the same reason the display
preferences do: it applies to every panel, only four act on it, and a prop on `<component :is>`
hangs a stray attribute on the ones that do not declare it. The channel carries the SETTER too,
because the roster changes the selection — routed back as an event, the generic panel shell would
have to forward a run-specific emit, which is the domain leaking into the part that must not know
it. `RunsView` supplies it, not `PanelColumn`, which draws a deployment's panels and has no
scenario to narrow to.

**Four figures are run-wide and cannot be split, so they are LABELLED rather than filtered:** the
executive KPI table (one row per CURRENCY), the reconciliation verdict and the deepest-drawdown
footnote in Booking Periods, and the outcome counts in Warnings & Errors. It was six: the order
funnel and the per-currency analytics stood in Trade History too, and both are gone — 17 of the 19
fields in `trade_history.analytics[]` are identical in value to `run-summary.currencies[]`, which
the executive panel prints above them on the same page. The backend confirmed the duplication is
deliberate (one derivation, two routes) and that the summary's copy is the one to show. A run-wide number sitting unlabelled over one scenario's
rows reads as that scenario's — the same class of silent wrongness the narrowing exists to remove.
The executive table matters most of the six because it sits at the TOP: a reader who has just
narrowed meets it first. Portfolio is handled by marking instead: its footer is an aggregate with
no per-unit version, and keeping every row also answers the question narrowing raises there, namely
how the chosen scenarios compare with the others.

**A control nobody recognises as a control does not exist.** The roster row was built as a plain
list entry and the first reader to see it could not tell that clicking did anything — the effect
was real but happened below the fold, and the two panels nearest the click did not react at all.
Four things fix that class of problem: the scenario name wears the interactive colour and the row
has a hover surface; the state is repeated IN the roster, beside where the click happens; the
column is framed; and a `HintLine` says what a click does while nothing is picked.

### Hints — one registry, two levels of "go away"

`hint_registry.ts` holds every explanation in ONE list, an id plus a sentence. Central rather than a
string per component, for two reasons: the texts are the only place the app explains itself and are
worth reading as a set, and a guided tour is the same data in a sequence — a step is an element plus
a sentence, which is exactly a row here. An id is stable across releases because it is what a
permanent dismissal is remembered by.

`hints_store.ts` keeps two levels apart. **Dismiss** means *not now*: it lasts the session and
writes nothing, so a reader who closed the line by accident is not punished for it. **Ban** means
*never again* and is the only one persisted, under one versioned key, reconciled on load like every
other stored preference — an id the registry no longer contains is dropped, or the list only grows
and a hint reintroduced under an old id returns already banned. The settings dialog resets both,
because a banned hint has no other way back: the control that banned it disappeared with it.

**Narrowing happens BEFORE the row cap.** Capped first, the first N trades of the whole run would
be filtered down, and a scenario that traded late would show nothing while the panel claimed it had
drawn everything.

**An empty result is a statement about the scenario.** Every declared unit is in the roster whether
it traded or not, so no trades means *this scenario closed no positions*, never *nothing matched* —
and the empty states say exactly that. A `?unit=` naming a scenario the run does not declare is
called out in the line above the column, but only where the roster actually arrived: it is
backtest-only, so its absence on a session says nothing about the name.

### The words — the backend's glossary, adopted here

The API's vocabulary is fixed in `ide_docs/glossary.md`, and the four kinds of run in
`ide_docs/introduction_to_the_ide.md` ("The kinds of run"). Every label on screen uses those words,
because a word invented here would mean something different from the same word in a report.

| Kind | `group` | `ticks_from` | `orders_to` |
|---|---|---|---|
| **Backtest** | `simulation` | `archive` | `simulated` |
| **Mock session** | `autotrader` | `archive` | `simulated` |
| **Dry run** | `autotrader` | `venue` | `simulated` |
| **Real-money session** | `autotrader` | `venue` | `venue` |

- An **AutoTrader session** is any run of that pipeline; the three kinds above are its kinds.
  *Live trading* means a real-money session and nothing else.
- A **backtest** is a run of the simulation pipeline. A session is never a backtest — a mock session
  replays an archive window through the whole AutoTrader stack and is reported like every other
  session, not like a one-scenario backtest.
- **Never a bare `live`.** It named a pipeline, an adapter, a cadence and real money at once, which
  is why the backend retired it: `group` served `live` until contract 12 and serves `autotrader`
  now, in stored runs too. Where this repo means streamed data rather than a kind of run, it says
  *streamed*.
- `continuous` is not a kind of run. It joins sessions into a **deployment**, which `parent_kind`
  already answers.
- A **booking period** is what was called a *segment*; the field is `period_no` from contract 12.

**`ticks_from`, `orders_to` and `data_windows` are `null` on every run recorded before contract 12**
— measured 2026-09-29: null on all 40 runs here. Unknown, never guessed, and nothing may be derived
from their absence. A facet over them is therefore dropped by itself today, by the rule that a facet
whose single value every row carries cannot narrow anything.

### Choosing a run — a facet bar over a flat index, not a cascade

The picker asked for a group, then a scenario set, then a run. Measured against the real index on
2026-09-27: **40 runs sit in 29 different (group, set) pairs, the largest set holds six runs, and
exactly one set holds more than five.** So the last dropdown was choosing between one and six
things while the one above it held 29 — and the question a reader actually arrives with, *the run
I did on Thursday*, is navigation by TIME, which a name cascade cannot answer at all.

It is now the same `FacetBar` the scenario roster uses over a `RecordList` — the shared list surface
— pointed at `RunInfo`: facets for group, set, artifacts, reporting, origin, version, outcome and
trouble, sorted newest-first by default, with a search over the run id and the set name. Both
components are generic and hold no state, so this cost the facet definitions and ten column
declarations.

The row says what the run DID, from the index response itself and without a request per run:

```
Search runs by id or set   Group ▾  Set ▾  Artifacts ▾  …        12 of 46
Sort by  [newest]  oldest  market time  name

Started        Run type    Set                       Run id            Market time  Outcome    Net P&L      Trades
Sep 25, 11:52  simulation  ETHUSD_blocks_robustness  20260925_095227…     464.0 h  ✓ success  −317.36 USD  85 trades
```

The run id is shortened to its timestamp with the whole value one hover away: the eight hex
characters after it separate two runs of the same second and nothing else. One consequence for the
browser suite — a spec that looks for a run by the row's TEXT cannot find it, and must filter on the
id cell's `title` instead.

**The stamp says only what its neighbours do not**, the same rule the time axis follows: the year is
dropped inside the current year and kept outside it, and the seconds are gone — two runs of the same
minute are told apart by the id. `Sep 29, 2026, 12:27 PM` was 22 characters and needed 13 rem of a
28 rem panel, which is what made the narrowest rank tier overflow by 24 px. The month stays a WORD
on purpose: this column is the reader's own zone while the card beside it carries UTC, and a numeric
`2026-09-29 12:27` reads like the canonical clock that it is not.

**Ten columns, ranked 10 → 8 → 6 → 4, and a card on every row.** What a narrow list keeps is the
question the list exists to answer — WHICH run (`Started`, `Set`), whether it worked (`Outcome`) and
what it earned (`Net P&L`). `Run id` goes first although it is the row's declared key: it renders as
the timestamp part of the id, which is the same instant `Started` already shows in words, and two
spellings of one fact are not two facts. Every rung of the ladder gives something up — a rank the
list does not use makes a breakpoint that changes nothing, which reads as a broken one.

The card is what makes the ranks defensible: `RunInfo` carries twenty-one fields and ten reach a
column, so the rest are on the row whatever its width — `ticks_from` / `orders_to`, the parent, the
configuration and its id, the version and commit, `reporting`, the size on disk, how many sections
the run wrote, how many data windows it declared, and the **Tier-2 log warning count**, which the row
deliberately omits because that tier is ignorable by design and which reaches 547 on one stored run.
Nothing is fetched and nothing is derived: every line names a field of the index row already on
screen.

**Three consequences worth stating.** `runs_store` lost the whole cascade — `groups`, `names`,
`runsInSelection`, `selectedGroup`, `selectedName`, `setGroup`, `setName` — because nothing else
ever read them. A **logs-only run became selectable**: it used to be a disabled option, but the run
view now says what such a run is and the store asks the backend for nothing, so a row that cannot
be clicked would only look broken. And the list **collapses to one line once a run is chosen**,
because forty rows above the panels would push every one of them off the screen.

**The picker's own facet state is local, not in the URL** — the same as the scenario roster's. The
URL carries the SELECTION (`?run=`, `?unit=`), which is what makes a shared link mean something; a
readable encoding for arbitrary facet state is a separate design and neither list has one yet.

### Panels — a registry, a shell, one persisted layout

The viewer shows many small panels around one chart rather than one view per page. Three pieces carry that:

- **`src/panel_registry.ts`** — a declarative list of `PanelDescriptor`s: id, title, icon, component, the `source` key it reads, and whether it starts open. A plain list rather than a `register()` call, so with a static import graph the order is explicit instead of depending on which module loaded first. The app bar renders from this list, so a new panel is an entry here, not a rebuild.
- **`src/components/panels/`** — `AccordionPanel` (the shell: collapse, pin, lock, hide, controls revealed on hover and on focus), `PanelColumn` (the ordered stack, drag to reorder), `AppBar` (toggles plus *collapse all* and *reset layout*). **The bar follows the READER's order, not the registry's**: it renders from `visiblePanels`, exactly what the column renders, and appends the switched-off panels at the end in registry order. It rendered `allPanels()` until 2026-09-30, so dragging Broker to the top of the column left its toggle sixth in the bar — two arrangements to hold in one head, and the bar is the thing a reader navigates by. The collapsible behaviour, its ARIA wiring and keyboard handling come from Reka UI.
- **`src/stores/layout_store.ts`** — the arrangement, persisted under the single versioned key `layout.v1`.

**A section that fails to load says so, and every one of them does.** `run_reports_store` keyed its
failure messages by section on 2026-10-01; one ref served all seven until then, and they load
CONCURRENTLY — so the last writer won and the reader was told about whichever section happened to
finish last while the other failures vanished. Same shape as `absences` beside it, and for the same
reason. The run view prints one line per failure.

**A panel receives its model as a prop and never fetches.** `PanelColumn` is handed a `sources` record and passes `sources[descriptor.source]` to each panel. That is what lets the same component render a run artifact today and a streamed frame later (testingide#379/#380) without being written twice. The rule is about DATA: presentation preferences reach a panel ambiently instead (see *Settings* above), which ties it to no source.

**Two stores, two questions.** `runs_store` answers *which* run is selected — the index, the chosen run and the scenarios narrowed to. `run_reports_store` answers *what that run reports*, one slot per section, all cleared together when the selection changes. Sections load eagerly with the run for now; lazy loading on first expand waits until there are enough sections to justify the plumbing.

**A section whose model this run does not carry is skipped, never shown empty.** `PanelColumn` drops a panel whose source is absent, which is how a 404 on a report route reaches the UI: not as an error, as a missing section.

**And the absence now says WHY.** Until the backend named the cause (contract 5), every missing section answered `run_not_found` and this client collapsed it to `null` — so a run still going, a run started with `reporting: none`, and a run whose pipeline never writes that section all rendered as the same blank space. `getX` now answers `Report | SectionAbsence`, the store keeps the reason beside the empty slot in `absences`, and `RunsView` says it ONCE above the column, **grouped by cause** — a run that ended early is missing several sections for one reason, and naming it once is the point. The sentence shown is the backend's own `detail`: it is written for a reader and held that way by a test on their side, so replacing it with one of ours would be a second, worse copy.

**A section that cannot be DRAWN is a finding about that section, not about the report.** Every panel renders inside an error boundary: `AccordionPanel` catches a render error from its own subtree, stops it there, and puts a sentence in the panel's place with a mark on its header, so the news survives the panel being folded. The stack goes to the console; a reader gets a sentence (§10).

This exists because its absence emptied the workspace. Measured 2026-10-01: one field the backend serves as `null` on 17 of 45 stored runs was read as an array inside a computed, and Vue unwinds a render error to the nearest component that handles it — with nothing handling it, ELEVEN panels left the screen because one of them could not draw.

The boundary clears when the panel is handed a different model, so a defect in one run's DATA does not follow the reader to the next; `PanelColumn` passes the model down as that signal. A defect in the CODE throws again on the second attempt and the frame simply stays — it settles rather than looping.

The two DEPLOYMENT routes deliberately keep `| null`: an unknown deployment id is a stale link rather than a missing section, and `deployments_store` already renders that as its own state.

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

**Choosing a deployment is a facet bar over a flat list**, the same `FacetBar` + `RecordList` the
run picker and the scenario roster use — the select box it replaces showed `bot · deployment_id`,
**two of the twelve fields a ledger row carries**. The other ten — how many sessions, when the
first and last started, what it earned, how deep it fell, the longest idle stretch, whether the
configuration moved — were invisible until something had been chosen, which is the run cascade's
defect one level shallower: a reader choosing a deployment is choosing between its HISTORIES.

Nine columns ranked 9 → 7 → 5 → 3, a card for the rest, and the list collapses to one line once a
deployment is chosen. `Bot` is rank 1 beside the id deliberately: the id is minted per deployment
and says nothing a reader recognises, while `bot` is what the profile is CALLED — and neither alone
answers *is this the one I mean*, because the id is a stamp and an operator improves the name.

**One row per (deployment x account currency), and the store keeps all of them — plus the key that
says so.** A P&L added over two currencies is not a number, so the ledger splits the rows and the
view shows one header block and one sessions table per currency. `deployment_id` alone is therefore
NOT a key — picking the first match would drop a whole currency's figures, silently.

The list honours that: **one row per LEDGER ROW**, not per deployment. A select had to fold them,
because two options reading `demo_bot · deploy_2026…` twice are two things to a reader, and folding
meant either hiding a currency or summing across them. A list shows both and says why — the id
repeats, the amounts carry their own currency, and clicking either opens the one deployment they are
both part of. The store therefore keeps `deploymentsKey` from the response rather than dropping it,
the same way the booking-period reports pass theirs down. No stored deployment books in two
currencies today (all three on this machine are USD), so this is the declared key being honoured
rather than a case being served.

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

**The two outermost axis labels hang INWARDS, and that is layout rather than taste.** A label
placed at its mark and pulled back by `translate` moves on screen but not in layout, so a centred
label at the far edge keeps half its box past the chart. The panel around it then offers a
scrollbar for something nobody can see — measured 2026-09-29 at 67 px — and scrolling that phantom
slides the lane-label column out of view, which is how `GBPUSD_blocks_01` came to read as
`locks_01`. The first label therefore hangs right of its mark and the last hangs left, whichever
branch placed them, evenly spaced or one per kept piece. `e2e/panel_layout.spec.ts` holds it,
because only a browser can measure it.

**The table under the chart carries EVERY field a period has, and stays a table.** It once showed
eleven of the fifteen the hover card shows, so the list meant to make periods comparable carried
less than the thing that describes one. The two answer different questions — *what about this one*
versus *how do they compare* — and comparison is why it is not a card per period: one column is one
field, so the eye runs down it, while in cards the same field sits at a different height in every
one. The width that made the fuller table awkward is bought back honestly: the columns are grouped
under **Period · Result · Account**, and the currency is stated ONCE above the table instead of four
times per row. A response is one currency by construction, but that is the backend's guarantee, so
rows that disagree fall back to the code in the cell.

**A booking close is not a boundary the other lanes share, so nothing is ruled across them.** The
timeline briefly drew a vertical rule at every distinct closing instant. On the lane that closed it
only repeated the span's own edge; on every other lane it asserted a relationship that does not
exist, because the units of a run book independently — where one scenario closes its booking period is not
an event for another. Removed 2026-09-27, with the marker machinery it was the only caller of. The
spans carry their own boundaries; a cross-lane rule belongs to something the spans do NOT encode,
and when such a thing appears it gets designed against real data rather than kept in reserve.

**One lane is a UNIT inside a run and a SESSION across a deployment.** `unit_name` is the profile
name and identical in every session of a deployment, so laning by it stacks every session's
periods into one row — measured: eight periods rendered as two visible bars, six hidden behind
the others.

**The stamps are never rescaled, and this is the sharp edge.** A deployment carries TWO time bases
that differ by a factor of thousands: the ledger's session stamps are wall clock (four sessions of
26 s each, 7 s apart) while a booking period is stamped on the canonical clock the session replayed
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

`runs/TradeHistoryPanel.vue`, rendered through `base/RecordList.vue` — the same list surface the run
picker uses. Every other section of a run is already summed over these rows, so this is the one that
answers *which* trade, not *how much*.

**Eight columns, and everything else in the card.** That split is what the card was built for: a
trade has thirty-eight fields and a row has width for eight, and truncating the row would decide for
the reader which of them matter. The eight are declared as a `ListColumn[]`, not as markup.

Ranked 8 → 6 → 4 → 3. What a narrow list keeps is which trade (`Symbol`, `Opened`) and what it came
to (`Net P&L`) — the symbol alone does not identify a row, since a scenario trades one symbol many
times and the moment is what tells two of them apart. The excursions go first, then the lots and the
holding period; all of them stay in the card at every width.

**Three levels: the unit, the trade, the FILLS.** The trades are grouped under the unit that
produced them, and a click on a trade opens the executions that opened and closed it. The fill level
answers the one question the columns cannot: *why do four rows carry the same entry price?* Because
they are one position closed in pieces. Measured on a real run — 85 trades, 29 distinct entry fills,
61 trades whose entry fill is larger than their own lots.

The fill sub-list is read-only and draws no headings: the in-then-out ORDER is the content, so there
is nothing to sort it by, and a heading row over every two lines would label what each cell already
labels inline. Its presentation follows the backend's own printout.

**The group heading's figures are the API's served `scenario_totals`, looked up by name.** Nothing
is folded here — see *The list itself* above for why, and for what a heading shows when no total was
served. One refinement belongs to this panel: totals are declared unique by
`(scenario_name, currency)`, so a scenario that traded in two currencies has TWO. The heading shows
one figure, so such a scenario gets NONE rather than an arbitrary half.

**The tracks are proportional, and that is a fix rather than a taste.** They were eight percentage
widths under `table-layout: fixed`, and the reason is worth keeping: while every group is closed the
columns the heading spans hold no cells at all, so an automatic layout sized them from nothing and
then re-sized them the moment a group opened, sliding every heading sideways under the reader's
eyes. The `minmax(0, Nfr)` tracks carry the same eight proportions and prevent the same defect. They
also mean a rank costs nothing to lay out: the surviving `fr` shares simply redistribute.

**The group heading is counted from the END, and `Net P&L` is the last column because of it.** The
heading was three cells spanning `5 + 1 + 2`, an arithmetic fixed at eight columns — so a rank that
gave one up left it spanning tracks the grid no longer had. Two cells (`1 / -2` for the name, its
count and its fees; `-2 / -1` for the net) hold at every tier, and the net still lands under its own
heading, so a reader runs down the one column and meets both the trades and their totals. The
reading order gains by it besides: opened · held · worst · best · net is the life of the trade in
order, with the result closing the line instead of sitting in the middle.

**An adverse excursion is rendered as a magnitude.** Measured in one response: `mae_pnl` is signed
(−18,399.05) while the analytics block's `largest_mae` is the magnitude of that same number
(+18,399.05). The direction is already in the name, so rendering both as they arrive would put one
quantity on screen twice with opposite signs. `magnitude()` — the same formatter the drawdowns use,
renamed from `drawdown()` once a second quantity needed it.

**MAE and MFE are given three ways** — as a price, as the unrealised P&L at that price, and as a
distance in `price_unit` — and the card shows all three, because which one answers a question
depends on the question.

**The row cap is visible, and the narrowing runs BEFORE it.** A thirty-day session produces
thousands of trades and drawing them all would stall the page, so the panel draws 500 and SAYS how
many of how many it drew. A silent truncation reads as "that was all", which for a trade list is the
most misleading thing it could say. Capping first would take the first 500 trades of the whole run
and filter what was left, so a unit that traded late would show nothing while the panel claimed it
had drawn everything — and the cap is counted against the NARROWED set for the same reason.
Virtualisation replaces the cap the day a run exceeds it — `@tanstack/vue-virtual` is already in the
tree through reka-ui, though it would have to become a direct dependency.

### Run Totals — the fold, minus everything already on screen

`GET /reports/runs/{run_id}/aggregated-portfolio`, rendered by `runs/AggregatedPortfolioPanel.vue`
as `FigureBlock`s, one group of blocks per account currency. Registered with `defaultOpen: false`,
which IS the disclosure this was asked for — the panel shell already collapses, so nesting it inside
the Executive Summary would have meant rebuilding that panel's prop contract to carry a second
model.

**The panel's discipline is what it leaves out.** The response carries 42 fields per currency on top
of a 21-field headline, and almost all of the headline is `run-summary` again. Measured field by
field on 2026-09-30 against what the Executive Summary renders: **39 are new**, and four groups of
those are what a reader has no other way to reach — the run-wide cost split (the per-unit version is
in the roster's card and this total is nowhere else), `highest_equity` with the scenario that reached
it, the realised `final_balance` beside the equity, and the averages plus the spot holdings. Printing
the rest would be the same figure twice on one screen.

**Three distinctions that a reader gets wrong without this panel**, and each carries its caveat where
the figure is rather than in a paragraph:

- `highest_equity` is the highest peak ANY account reached; `max_equity` in the summary belongs to
  the account that fell DEEPEST. Two numbers about two different accounts.
- `final_balance` is REALISED; `total_final_equity` values what is still open as well. They differ by
  exactly the unrealised movement, and a reader meeting only one concludes the other is broken.
- A SPOT account is an inventory, so its worth is an ESTIMATE — quote balance plus the base holding
  at a price. The backend says so by serving `last_price` beside `est_current`, and the word stays on
  screen.

**Two blocks are deliberately absent, and a test guards each.** The `pending_*` figures are the
the Orders panel's subject and showing them here would pre-empt a panel that can say more; and
`spot_scenarios[]` is a per-account inventory of eight rows by eleven fields — a list rather than a
figure, and the roster already names those scenarios.

**`margin` and `spot` are the two HALVES of a currency that holds both account models**, null where
it holds one. Null there means "not split", never "nothing traded" — and where `is_mixed` is true the
panel says so, because the figures then fold two kinds of account into one.

### Orders — why an order did not become what it was meant to be

`GET /api/v1/reports/runs/{run_id}/pending-orders` **and** `GET …/order-history`, composed in
`RunsView` and rendered by `runs/OrdersPanel.vue` as a `RecordList` grouped by scenario: the
scenario's pending funnel is the group heading, its order records are the rows. Registered closed by
default: it is evidence, and a reader opens it with a question.

**ONE panel where there were two, and that is the point.** The two routes describe the same orders
from two sides — `pending-orders` what BECAME of a scenario's orders, `order-history` the orders
themselves. The Pending Orders panel could say *527 rejected* and reach not one of the 527, while
the sentence explaining each was already on the wire in a route nothing consumed. The registry lost
an entry rather than gaining one.

**The join is the scenario name, and it holds by CONSTRUCTION.** `pending-orders.units[].name` and
`order-history.orders[].scenario_name` are both written from the same run unit's name
(FiniexTestingIDE, 2026-10-01). Two edges, both handled: a scenario whose every order was refused
before the queue never enters the pending pipeline, so it has rows and no funnel; and an AutoTrader
run serves no units at all, because that section is filled by the simulation only. In both the
heading says so rather than drawing a funnel of zeroes, which would claim a measurement nobody made.

**The question nothing else on the page can answer.** Every other section says what the run DID.
Measured 2026-10-01 over 202 units across 20 runs, one unit **resolved 527 orders and filled none of
them** — and every other panel of that run showed a normal-looking result.

**The five counts are a funnel the backend states in full:**
`resolved = filled + rejected + timed_out + force_closed`, which held on all 202 units. Nothing is
computed from the identity — it is asserted in the contract test, which is where a change to the
arithmetic should be noticed. `timed_out` and `force_closed` read zero on all 202, so the heading
prints them only when they are not zero.

**A ROW IS A LIFECYCLE RECORD, NOT AN ORDER**, and that decides the shape. One order appears as
several rows: `pending` on entry, `executed` on the fill, a `close` row when its position closes,
one more per partial close. Measured 2026-10-02 over 40 runs and 4,660 rows, the vocabulary is five
`action`/`status` pairs — `open/pending` 1561 · `close/executed` 1554 · `open/executed` 994 ·
`open/rejected` 548 · `open/expired` 3. So the list is two levels and not three: an order cannot be
a group with its lifecycle beneath it, because no field identifies one.

**`order_id` is not an identity and the route declares no key** — that is the backend's answer
rather than an omission. It is a per-unit position counter: 167 rows carried one id on a measured
run. They asked us not to adopt the content key that happens to be unique either, because two
partial closes on one tick would collide. A row is keyed by its POSITION within its scenario, in
append order; the ordinal field is planned in testingide#557, and a contract test asserts the
absence so the day it arrives is loud.

**A POSITION reads as one thing, because a reader should not have to ask.** Within a scenario the
rows of one position are tied together: the row that OPENS a position carries the id and a rule
above it, the rows that carry it on show `└─` in the id's place. Nothing is derived — the grouping
is `order_id`, which their glossary states is the position's id.

The continuation is read from the row ABOVE rather than from a block of its own, and that is
measured: 2 of 246 scenario groups interleave two positions (both in a scenario named
`partial_close_lifecycle`, where two run at once and their records alternate). Where that happens
the id simply appears again. It is built over the NARROWED list, so the predecessor is the row the
reader actually sees.

**No POSITION column, and the one that stayed carries THEIR word.** `order_id` IS the position id
— their glossary says so, and over 2,548 rows carrying a position the two strings were identical on
every one — so the second column repeated the first. The survivor is headed `Order id` with the
glossary's own sentence as its hint, because `Order` alone read as an order's own identity, which is
exactly what the field is not. What the deleted column really said, *a position exists here*, the
status `executed` already says.

**The narrowing reaches it like every other scenario-shaped panel.** It filters the ORDERS, so a
scenario the reader dropped takes its funnel heading with it, and an empty result is stated as the
chosen scenarios' rather than as the run's.

**An absent value is `null`, never `0.0` or `""`** (contract 20): `event_time` on 45 % of rows,
`executed_price` and `position_id` likewise, `rejection_*` on 88 %. Each renders as absent. The
stamp is `event_time` and says when THIS ROW's event happened — the fill on `executed`, the refusal
on `rejected`, the expiry on `expired`; it was `execution_time` until contract 20 and was renamed
because that name means a DURATION everywhere else in the API.

**The orders open at data end are shown in the heading and are NOT added to the funnel.** In a
backtest the simulation records every such order as `expired` in the same step and deliberately
leaves it in the active lists — one order, two views of one instant, and it is already a row below.
It is stated because it is a property of the SCENARIO that no single row carries. In an AutoTrader
session the answer differs: an order left standing at the venue gets no `expired` row.

**The route takes a `symbol` and this app never sends one.** The panel groups by scenario and one
scenario is one symbol, so the parameter would narrow nothing a reader asked for. Before contract 20
it was also unsafe: a rejected row had an empty symbol and the filter silently dropped every
rejection.

### The way between an order and its trade

A reader on `pos_gbpusd_1 · close · executed` can reach the trades that position produced, and a
reader on a trade can reach its orders — including a refusal on the way. The position id leads the
row in BOTH lists, as a link, so the two read as two views of one thing.

**The join is `(scenario_name, position_id)` and it is DECLARED**, not worked out here:
FiniexTestingIDE, 2026-10-02 — *"an executed order-history row's `(scenario_name, position_id)`
names the same position as a trade-history row's, by construction"*. **Never the position id
alone:** every scenario counts from `pos_<symbol>_1`, so two scenarios of one symbol both have a
`pos_gbpusd_1`. Both halves travel together everywhere — in the URL, in the comparison, in the test.

**The ROW level is deliberately shut, and the reason is theirs.** A close books exactly one trade
and appends exactly one `close · executed` row; measured here, 1,554 of 1,554 pair exactly on
`(exit_time, exit_price)`. We do not use it, by either content or ordinal, because *"in a long
AutoTrader session the order history and the trade history are bounded buffers of different sizes
and drop their oldest records at different points, after which 'the n-th' points at the wrong trade
without any sign."* A jump therefore lands on a POSITION, and where a partial close booked several
trades all of them are marked — correct, since "what happened on the way to this position" has one
answer whichever close the reader came from.

**`use_position_link.ts` is ambient, like the scenario narrowing, and for the same reason.** Making
a sibling panel visible and scrolling to a row is about the WORKSPACE, which a panel must not know;
writing a query param needs a router, which would tie a panel to one. `RunsView` provides the
channel and the panels only read the mark and ask for the jump. The channel carries three things:

| | |
|---|---|
| `marked` | the position on show, parsed from the `position` query param |
| `jumpTo(panelId, ref)` | write the param · `show` the panel · `setOpen` it · scroll to the marked row |
| `canJumpTo(panelId)` | does that panel have a model at all — the HOST's knowledge, read from the same `sources` record `PanelColumn` is handed |

**The mark is in the URL and the SCROLL is not.** A shared link puts the reader on the same position
(§23), and a page that jumps on every reload is a page that moved while nobody was looking. The
scroll waits two ticks — one for the layout store's change to reach the column, one for the panel it
just opened to render — and where the row is still absent it does nothing rather than scrolling to
nothing: a target beyond the trade list's visible cap, or inside a group it folded, is a row that is
not there.

**Three absences draw no link at all**, which is the difference between a jump and a dead end: a
position that produced no trade (55 measured), a run that serves no trade history (10 measured), and
a panel this run has no model for. The position id is still printed in all three — it is data, part
of the trade's own declared key.

### Broker — the conditions a run traded under

`GET /reports/runs/{run_id}/broker`, `key: ["broker_type"]`, rendered by `runs/BrokerPanel.vue`: a
`FigureBlock` of conditions per broker with a `RecordList` of its symbols beneath.

**It replaced Portfolio rather than renaming it.** What each account EARNED is the scenario roster's
row and its card now. What rules it traded UNDER had no home at all — and that question has a wrong
answer by default, which is the reason the panel exists rather than a reason it is nice to have.

**The sentence at the top is the point of the whole panel.** Two stored runs put forex at 1:500 with
hedging beside crypto at 1:1 with none (`20260930_080501_5a37660b`, `20260927_092959_cd1d9b1e`):
four scenarios under margin calls, one under none. A drawdown reached on 500:1 leverage and a
drawdown reached on a spot account are not the same kind of number — one could have been liquidated
and the other could not — and every other panel in this view puts them in one column and sorts them
against each other. The advisory is built from the fields that actually DIFFER, so it never claims a
difference two brokers do not have, and it is silent on a run that used one broker.

**The margin fields are gated on `leverage > 1`, which is the BACKEND's condition and not ours.**
`ide_docs/broker_config_guide.md` marks `margin_mode`, `margin_call_level` and `stopout_level` as
required *"If leverage > 1"*, and the adapter guide repeats it. Below that a broker states none of
them, so what arrives is a default: the captured spot broker reads `margin_mode: 'none'` with both
levels at `0.0`, and rendering "margin call at 0.00%" says the opposite of what is true — that the
account is called immediately, rather than that it can never be called. Gating on the MODE instead
would have worked on this data and been the wrong rule, which is why the reading came before the
guess. For the same reason the advisory says *margin calls on some and not on others* in words
rather than printing `retail_hedging / none`, where the second half is a default.

**A size is formatted, never stringified.** The symbol table carries volumes, steps and tick sizes
that span six orders of magnitude, and JavaScript switches to exponential notation below 1e-7 — the
captured spot symbol steps in units of 1e-8, which put `1e-8` in a column of plain decimals. An
`Intl.NumberFormat` at up to eight fraction digits keeps one notation for one kind of quantity, and
drops trailing zeroes so a forex minimum still reads `0.01`.

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

**The workers are on the shared list**, which removed the last bespoke `<table>` from the app.
Three columns, read-only, no ranks: measured over the stored configurations a worker is 8–14
characters of type and 19–37 of parameters, so all three fit at any width this panel is given, and
a rank that never engages is a breakpoint that changes nothing.

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

**A worker type is a path, and a path needs `base/PathLabel.vue`.** Since operators write their own
strategies, `worker_instances` and `decision_logic_type` hold values like
`user_algos/touch_and_turn/touch_and_turn_range_worker.py` — 56 characters of monospace. Measured
2026-09-29: sharing the panel's width with the decision logic left that column 140 px, so the type
broke mid-word and the parameters column sat off the edge behind a scrollbar. `PathLabel` renders
the last segment as the name and dims the folders before it, and offers a `<wbr>` at every
separator so the label wraps at `/` instead of pushing its table sideways; the whole value stays in
the `title`. The workers section takes the full width of the strategy grid for the same reason.

### Display Strings — a marker, not a translation layer

Every user-facing string goes through `t()` (`src/translate.ts`), which returns its input unchanged. The interface is English-only and there is no language switch.

The marker exists because the expensive half of adding a language later is *finding* the display strings, not translating them. The English text is the key — `vue-i18n` supports message-as-key — so adopting a real module replaces one implementation and adds a catalogue, without touching a single call site.

Deliberately absent until a second language exists: a language switch (nothing to switch), and a key taxonomy (a scheme invented for 40 strings will not fit 400). When one English text ever needs two different translations, an optional context argument solves it then; adding one is backward compatible.

**`plural(count, one, many)` sits beside `t()`**, because a count and its noun have to agree:
`1 trade`, `2 trades`. Both words are passed in already marked — `plural(n, t('trade'), t('trades'))`
— so every display string stays literally inside a `t()` at its call site, which is the whole
mechanism by which they can be found later. A helper that marked them itself would hide them from
exactly the search `t()` exists to serve. It is English-only on purpose and lives in
`translate.ts`, because that is the file a real translation module replaces, and pluralisation is
one of the things such a module owns — languages with more than two forms need a rule this cannot
express.

Not every count needs it. `3 of 40`, `1 rejected` and `2/5 executed` read correctly as they are.
And a sentence whose VERB agrees as well as its noun is rewritten rather than patched: the
deployment advisory says *"One session, so a single configuration stands behind these rows"* rather
than joining an `s` onto a plural sentence, the same construction the scenario roster already used.

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

Browser-level verification is Playwright (viewer#23), in `e2e/`, run with `npm run test:e2e` and kept as hygiene rather than a gate. It needs no API server — the responses are replayed from the unit fixtures — and no browser in the container, which is Alpine on musl: the runner drives a browser on the developer's machine over CDP. See `docs/testing_architecture.md`.

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
