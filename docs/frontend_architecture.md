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

1. Browser calls `http://localhost:5173/` and opens the free chart from the Panels menu.
2. Vite serves the Vue SPA.
3. On mount, the SPA calls `GET /api/v1/timeframes` once to populate the timeframe selector (result cached in `timeframe_store`, never re-fetched).
4. After the user selects broker, symbol, and timeframe, the SPA calls `GET /api/v1/brokers/mt5/symbols/EURUSD/bars?timeframe=M30&from=...&to=...`.
5. The Vite dev server proxies all `/api` calls to `http://finiex-dev:8000` (Docker network resolution).
6. FastAPI reads from the existing `BarIndexManager`, returns OHLC data.
7. The SPA pipes the response into Lightweight Charts, the chart renders.

No shared filesystem, no direct imports across repositories. The HTTP contract is the only coupling.

## Consumed API Surface

The backend exposes two planes. The viewer consumes both, and treats them differently only in what they describe.

**Data plane** — the market data behind the two candle charts, the free one and the run chart:

```
GET /api/v1/health                                    open, no token
GET /api/v1/timeframes                                open, no token
GET /api/v1/caller                                    token, no grant — who the server takes us to be
GET /api/v1/brokers                                   token, no grant
GET /api/v1/brokers/{broker}/symbols
GET /api/v1/brokers/{broker}/symbols/{symbol}/coverage   404 where the archive holds nothing (`findCoverage`)
GET /api/v1/brokers/{broker}/symbols/{symbol}/bars       the bars that OPEN in the range; `X-Bar-Truncated` read
```

**The bars route answers the bars that OPEN in `[from, to]`**, each stamped with the open of its
period (`X-Bar-Time-Basis: open`), and never cuts quietly: a range past its cap of 10,000 is
answered with the cap's worth and `X-Bar-Truncated: true` (their `market-data` document).
`getBars` returns both, so a shortened answer is never drawn as a whole one.

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
GET /api/v1/reports/runs/{run_id}/broker              the venues, their symbols and their rules
GET /api/v1/reports/runs/{run_id}/aggregated-portfolio  the fold, per account currency
GET /api/v1/reports/runs/{run_id}/pending-orders      what became of a scenario's orders
GET /api/v1/reports/runs/{run_id}/order-history       the orders themselves, as records
GET /api/v1/reports/runs/{run_id}/order-events        the STEPS between those records
GET /api/v1/reports/runs/{run_id}/...                 5 further per-section reports (not yet consumed)
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

- **The index row carries the whole run header**, so the picker, its facets and the Run Header panel are all built from one request: `run_id`, `group`, `name`, `has_reports`, `start_time`, `parent_id` and the provenance triple `app_version` / `git_commit` / `config_snapshot`. No follow-up request per run — an N+1 against `run-summary` would be the obvious mistake here. Since contract 26 the header is ALSO a route of its own (`/reports/runs/{id}/header`), carrying what the index row cannot: who started the run, and the code identity of every component that ran. The row stays the source for the list and its facets; the route is the source for a panel that shows the whole header.
- **A 404 on a report section is an absence, not a failure.** A run can exist without carrying a given artifact. `getRunSummary` maps that to `null`, and the view says the artifact is missing instead of showing an error.
- **Every report body names the run it was built from**, and `api_client` asserts it against what was requested (`RunIdMismatchError`). This is the only defence a client has against an ambiguous id: a duplicate passes every membership check, the route resolves it to whichever run it finds first, and nothing else in the payload would give that away. It has happened — three runs once shared one id here.
- **A 409 is a third thing again: the artifact is there and cannot be parsed**, because it was written by an older schema and the run has to be repeated. Every report getter raises `ArtifactUnreadableError` through one helper, `raiseIfUnreadable`, carrying the backend's own detail text — the backend answers a 409 for ANY report artifact, and until 2026-10-14 only three routes mapped it while the rest showed `Request failed with status code 409` as a failure. The view shows it as a notice *beside* the panels rather than instead of them, one line per section, the run summary's included — which before took the whole run view down as if the server were out. One unreadable section must not hide the readable ones. Three distinct answers, three distinct states: 404 absent, 409 stale, anything else an outage.
- **The index is the authority on which runs exist, and it is never bypassed.** A stored selection can name a run whose artifacts were removed since. `loadRun` refuses an id the index does not contain, so a stale one produces no request at all rather than one 404 per section — the same rule the layout store applies to stored panel ids. An empty index is its own state (`{"runs": [], "count": 0}` is a normal 200), and the view says so instead of offering empty pickers with no explanation.
- **`has_reports` on the index row decides whether a run is worth asking about.** `false` means the run exists as logs only and every report route answers 404 — a normal state, because a test session writes logs and no artifacts. It is neither a failure nor a reason to hide the run: the picker shows it marked `logs only`, and neither the store nor the view issues a request for it. It IS selectable — it was a disabled option once, but the run view now says what such a run is and the store asks the backend for nothing, so a row that cannot be clicked would only look broken. Hiding it instead would raise the question where the run went; asking anyway would be the 404 storm the rule above exists to prevent.

**`run_id` is opaque, and stays that way.** It is minted as `<date>_<time>_<8 hex>` and the backend pins the character class to `[0-9a-f_]` with a test, so interpolating it into a URL path unencoded is safe by assertion rather than by hope. Nothing here parses it: no split, no date extracted for display, no sort. Ordering comes from the index, which is newest-first by contract.

**Two axes, two fields.** `group` is the PIPELINE, `parent_id` is the NESTING. They were briefly one field (`single_runs` | `sweeps` | `autotrader`), which mixed a shape with a pipeline and could not express a nested session. A third field, `parent_kind`, now SAYS which kind of family `parent_id` names, so nothing derives it from `group` any more:

| `parent_kind` | What `parent_id` names | What its siblings want |
|---|---|---|
| `null` | nothing — the run stands alone | — |
| `sweep` | a **combination** of a parameter sweep | a **ranking** by the sweep's declared objective |
| `deployment` | a **session** of a deployment | a **timeline**, ordered by `start_time` |

The distinction is not cosmetic. A sweep's children are **alternatives** — contemporaneous answers to "what if the parameters were these", so ranking them is the whole point. A deployment's children are a **sequence** — consecutive sessions of one bot's life across its restarts, where a ranking would be meaningless. And the parents differ too: neither is a run, but a sweep is *defined* by the runs naming it, while a deployment has its own rows in the ledger and its own routes.

**A family heading prints the kind word although the id repeats it** — `deployment
deploy_20261008_110304`. A parent id is as opaque as a `run_id`: the timestamp in it is for a person
reading a directory listing, and nothing may parse it, so the kind comes from `parent_kind` and the
repeated word is the price of not deriving. Settled by FiniexTestingIDE on 2026-10-12, which keeps
the id format as it is.

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

Its sibling on the categorical side: **a value that means "not applicable" must never render as a state.** `run_outcome` is `''` on artifacts written before the grading existed, so the panel says "no outcome recorded" rather than showing an empty verdict. `shutdown_mode` is AutoTrader-only and `''` on a backtest, so it is absent rather than rendered — and where it *is* present it is detail, never a verdict: an operator stopping a healthy session with Ctrl+C produces the same `emergency` as a crash, so it is shown as alarming only where `run_outcome` is `failed`. `operator_interrupted` would resolve that ambiguity, but it is newer than most artifacts, which default it to `false`; it is mirrored and deliberately not rendered until an artifact can carry a true value. `refused_at_first_tick` separates a second kind of `emergency` from a crash: a live session that stopped at its first tick because its warmup history had a gap the venue could not fill yet. It is graded `failed`, because a restart is the remedy, but nothing broke — so the shutdown detail reads *emergency (refused at the first tick)* and its reason stands in the warning role with the warning mark, where a crash's reason stands in the error role with the error mark. The backend's console draws the same distinction, yellow against red. The mark is an icon in the line's own colour rather than the console's ⛔, which renders as a red emoji whatever the line's role.

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

- `docker-compose.override.yml` — named rather than linked, because it lives in the
  FiniexTestingIDE repository and is gitignored there: a link from here can never resolve. The
  dual-container setup it belongs to is documented in that repository, under
  `docs/user_guides/finiexviewer_setup.md`.
- The two documents in this folder: this one and [testing_architecture.md](testing_architecture.md).

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

All colors, spacing, and type scale are defined as CSS custom properties in `src/styles/tokens.css`. The type sizes are in `rem`, so a small size inside a small size stays the same size — `--font-size-sm` was `0.85em` until 2026-10-14 and compounded, which set tab titles and the section toggles at 11.56 px under 13.6 px panel text. What floats over the page — a hover card, a menu, a filter popup — wears its own overlay surface, border and shadow (`--color-bg-overlay`, `--color-border-overlay`, `--shadow-overlay`): on the panel surface with the panel border a card could not be told from what it covered. The overlay surface stays a small step, because muted text has to keep 4.5:1 on it; the border and the shadow set it apart. The "whole run" mark beside a figure a narrowing cannot split is one component, `base/ScopeMark.vue`, drawn with an outline rather than a border so it takes no room in the line it stands in. Dark mode is the default; light mode overrides the same variables under `[data-theme='light']`. Each theme also sets `color-scheme`, so the browser's own parts — buttons, fields, scrollbars, a native list — follow the app's theme rather than a default of the browser's: a bare button's ink once stood white on the light theme, unseen. The active theme is controlled by a `data-theme` attribute on `<html>`, written in exactly one place — `App.vue` watches the settings store and sets the attribute. No panel receives the theme as a prop; it reads the tokens the attribute selects, which is why a theme change needs no re-render anywhere else. The one exception is a canvas, which is painted with values: `CandleChart.vue` reads the tokens itself and repaints through a `MutationObserver` on the attribute (see *Chart Engine*). A future canvas layer — an indicator, the signal overlay, an algo's drawings — takes the same path.

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

`base/AppButton.vue` is every button in three shapes: `solid` has a surface of its own, `quiet` is an
action inside a line of text and stays flat until pointed at, and `link` is a jump to another place
(below). Before it existed there were two bespoke button styles and five one-off text actions, and
none of them had a hover or a pressed state — a click produced no feedback at the control itself.

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

**`link` is the third shape, and `base/JumpLink.vue` its one user.** A jump to another place — a
run id in a session row, a position id in a group header, a lane's label — is worn as a link:
accent ink, no padding and the font of its line, so its text stands exactly where text would stand
in a table cell. It keeps the four states: hover lifts a surface *and* underlines, the press sinks
it *and* moves it a pixel, and focus draws the ring — and also underlines and lifts the surface,
because a cell that cuts its text off cuts a ring drawn outside the link too, and focus must show
inside the link's own box where no clip reaches. `JumpLink` adds the arrow that says the jump
leaves the panel — hidden from a screen reader, which hears the name — and shortens the name
itself: a table cell cuts the text inside it with an ellipsis, but a button is one box to the
cell, which could only clip it whole. Where a place lets its values wrap instead (the run header's
definition list), it lets the name wrap too. Until 2026-10-12 the same look stood in six
components — four `RouterLink`s underlined on hover and nothing else, two jump buttons underlined
on hover and focus.

**A jump sits INSIDE the element that owns a column, never on it.** The timeline's label column is
a `span` holding the `JumpLink`, not a `JumpLink` carrying the column's class: put on the button,
the class lost to the link shape's inherited font, and the run ids were drawn at 16 px beside a
13.6 px axis caption, with a hover surface the width of the whole column.

**What is still not an `AppButton`:** the entries of a menu, the accordion header, the JSON fold,
and the option rows inside a facet's popover. Those are menu items and disclosure headers rather
than buttons — a different control type with a different shape, not the same one written twice.

### Icons — `AppIcon` and the registry

**An icon is named by what it MEANS, and one registry decides how it is drawn.**
`src/icon_registry.ts` maps each meaning to a drawing — Tabler Icons (MIT), pinned exactly as
`@tabler/icons-vue` 3.49.0, stroke 2 — and `base/AppIcon.vue` draws one by name. A caller never
names a drawing, so one meaning has one icon everywhere and a wrong name is a type error rather
than an empty square. The names are the `IconName` union in `src/types/icon_types.ts`, and the
compiler holds the registry to it in both directions. The word is *icon* on purpose: a *symbol*
here is a traded instrument, and the *register* is the term map `scripts/check_terms.py` reads.

**Colour and size come from where the icon sits.** It draws in `currentColor`, the colour of the
element it is placed in — in a panel header that is the trigger's primary ink, a step stronger
than the secondary title beside it, as the emoji before it was. Its size is `1.2em`: about 16 px in
a panel header, the size stroke 2 was chosen for because a thinner line on secondary ink reads as
faint, and about 14 px in a menu or a tab, whose text is smaller. It is hidden from a
screen reader, because an icon travels with a word and the word is what is read out.

**One naming scheme, checked rather than trusted** (`tests/icon_registry.test.ts`): `form-*` the
shape a panel takes, `kind-*` a panel kind — named after the panel's id — `status-*` a state,
`action-*` a control and `nav-*` where a panel belongs. The check fails on a meaning nothing draws,
on two meanings that share a drawing, on a name outside the scheme, and on a panel whose icon is
not `kind-<its id>`. It reads the source as text: a name in quotes of either kind counts, and the
registry is left out by what it says rather than by its path, so moving the file cannot silence
the check. Today the registry holds the eleven panel kinds, which replaced the emoji in the panel
headers and in the section bar the Panels menu has since replaced; an emoji kept its own colours, so
that bar greyed it out for a hidden panel, and a line icon in the element's colour needs only the
fading. The app's other glyphs
follow in a sweep of their own.

**The browser tab carries the same library's `chart-candle`** (`public/favicon.svg`), in the two
accent values chosen by the browser's own colour scheme — a favicon cannot read the app's tokens.

### Selection State — `context_store` and `arrangement_store`

**The selection lives in a LINK, and the link lives in the context store.** `links.A` holds what the
reader is looking at — `run {id, units, position}`, `deployment {id}`, `market {broker, symbol}` —
and nothing outside a link carries a selection. Link A is the main one; more arrive with the docked
panels of viewer#31, where a panel reads its own link's context. There is no URL state (operator,
2026-10-12): a single-user, local-first viewer has no link to share yet, and a link command is
cheap to add back because the context keys are the old query keys.

**Every write is an action, and an action applies its cascade.** A restore applies stored values
as they are, without cascading:

| Action | sets | clears |
|---|---|---|
| `selectRun(id)` | `run.id` | `run.units`, `run.position` |
| `setUnits` · `toggleUnit` · `clearUnits` | `run.units` | — the mark stays, as it always did; a click puts one scenario in focus (`toggledFocus`) |
| `mark(position)` | `run.position` | — |
| `selectDeployment(id)` | `deployment.id` | — |
| `setBroker(broker)` | `market.broker` | `market.symbol` |
| `setSymbol(symbol)` | `market.symbol` | — |
| `restore(stored)` | everything | nothing |

**The arrangement store keeps it** under ONE versioned key — kept per browser tab, see below —
created in `App.vue` so every view mounts onto the restored selection:

```
arrangement.v1 = { version: 1,
                   links: { A: { run: { id, units, position }, deployment: { id }, market: { broker, symbol } } },
                   bars:  { 'run-picker': { selection, search, sort }, 'scenario-roster': { …, scope: <run id> } },
                   chart: { timeframe },
                   runChart: { run, unit, timeframe },
                   dock:  <dockview's toJSON()>,  places: { <panel id>: { besides, direction, index?, size? } } }
```

It is reconciled field by field on load, never trusted: a field of the wrong shape is left empty,
an entry of another schema version is REMOVED rather than converted, and a corrupt one counts as
none. The timeframe belongs to the CHART, not to the link — it says how one chart is drawn, not what
is selected. The chart selection's former keys (`sel.broker`, `sel.symbol`, `sel.timeframe`) are
removed on start. `dock` and `places` are the dock store's (see *Docked Panels*).

**Each browser tab keeps its own** (`src/tab_storage.ts`, viewer#31, 2026-10-14) — the arrangement
and the column's `layout.v1` alike, which is what makes a second window the way to compare two runs.
A tab reads its own `sessionStorage` entry. A NEW tab has none: it adopts the last one any tab saved
and keeps it as its own, so another tab's later write never reaches it, not even on a reload. Every
write goes to both — the tab's own, and `localStorage` as the start of the next new tab. Settings
and dismissed hints are the reader's, not the tab's, and stay in `localStorage` alone.

**Adopted at the READ, not at the first write.** With one shared key, measured in the browser on
2026-10-14, a reload brought back the column the OTHER window had changed every time — the column's
layout is written only when it changes, and this tab had changed nothing — and the other window's
run whenever its delayed save landed between this tab's leaving and its reading.

**The data stores are facades over it.** `runs_store.selectedRunId` / `selectedUnits`,
`deployments_store.selectedDeploymentId` and `selection_store.broker` / `symbol` / `timeframe` are
read from the context and the arrangement; `selectRun(id)` sets the context and loads. `loadRun`
checks the id against the index, and an answer that arrives for a run no longer selected is
discarded — the case a restore and a quick click produce together. An id the index does not know is
asked for once more before it is called gone, because not known YET is not gone: a deployment can
name a session newer than the index the Runs panel loaded. `loadDeployment` does the same against
the ledger.

**Binders do the loading a view needs on mount:** `use_run_binding` and `use_deployment_binding`
load the index, then the stored selection; `use_chart_binding` resets a timeframe the symbol has no
coverage for. The run side is called at the APP ROOT since 2026-10-14, together with
`use_run_reports_loading` (the run's sections) and `use_run_report_channels` (the channels the
sections read): a section opened as a panel of its own needs all three while the run bundle is
closed or behind a tab, and a docked panel is drawn only once it is first shown. Fetching the index
again when the run list is shown again stays in that panel — it is the one place that knows. The bars store REPORTS that case (`timeframeUncovered`) and never writes a selection
itself — a data store that changes what the reader chose is the defect this replaced.

**A picker opens collapsed on a selection it finds at mount.** Its `watch` sees only a CHANGE, and a
restored selection is none — measured 2026-10-13 in the browser, where every restored run opened
with the whole list above it.

#### A facet bar's state — `use_facet_state`

Each bar keeps its narrowing, its search and its sort under its own entry in `bars`. A bar nobody
touched stores nothing and opens on its defaults; an EMPTY selection means the reader cleared it,
and that is kept — a reload shows what they last saw rather than handing the default back. A
`scope` names what a narrowing was made FOR: the scenario roster's is the run, so a narrowing made
for another run is dropped on the way in and when the run changes under a mounted roster, while the
sort is kept.

**Why the search and the sort are kept too.** A search REMOVES rows, so it narrows like a facet. A
sort does not change the set, but these sorts are analytical — *worst result first*, *longest tick
timespan first* — and that is part of what the reader was looking at. Panel order, collapsed
sections and pinned panels stay in the layout's own key: those are how one reader arranged their
screen, not what they are looking at.

### Settings — three kinds of state, and which one needs an account

There are three kinds of state in this application and they do not share a home. Getting the line
wrong is what makes a restored view show the wrong thing or a preference travel to someone who did
not ask for it:

| | What it is | Where it lives | Needs an account? |
|---|---|---|---|
| **Selection** | which run, scenario, deployment, symbol, timeframe, filter | `arrangement.v1`, per browser tab | never |
| **Presentation** | panel order, collapsed state, theme, thresholds, caps | the column's `layout.v1` per browser tab; the settings in `localStorage` | no |
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
  trigger: settings, a theme entry that names the theme it switches TO, and About.
- **`src/components/SettingsDialog.vue`** — two tabs: **Display** (the preferences) and **Layout**
  (the way back to the suggested order of the docked panels, and the export and import of the
  order of the sections in the run bundle). Every open starts on Display.
- **`src/components/AccountStatus.vue`** — the identity below, in the menu bar beside the
  application menu. Who the viewer works as is a fact to see at a glance rather than a setting to
  open, so it left the settings' Account tab on 2026-10-13.
- **`src/components/MachineStatus.vue`** — how full the machine is, in the menu bar before the
  account (see *How full the machine is* below).
- **`src/components/base/AppDialog.vue`** — every dialog's frame: what is set or read and then
  closed — the settings, About — rather than kept open beside the work, which is a panel. One
  frame, so no dialog re-invents the overlay or the close: 80 % of the window caps both sides, the
  content scrolls inside it, and a dialog whose content must not move the frame — the settings,
  switching tabs — gets a fixed height. `AboutDialog.vue` is the second user.
- **`src/stores/caller_store.ts`** — who the server takes this client to be.
- **`src/stores/machine_store.ts`** — the machine's last reading, asked again every few seconds.
- **`src/composables/use_display_settings.ts`** — how a preference reaches a panel.

**A panel does not read the store.** The app root provides the display subset (`use_run_report_channels`) and a panel injects
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
component where the display-string marker reaches it. `AccountStatus` draws each state as a mark and
a word, never a colour alone. Its hover card carries, for an identity, the account, the client, the
grants, the token's note and when the server was last checked (*Last checked*); a sentence heads the
card only where something is not fine — where everything is, the rows say it all (operator,
2026-10-14). The machine's card follows the same rule, and names its grade *Memory pressure*, since
the backend grades memory alone:

| State | What it means | Menu bar: icon · word |
|---|---|---|
| `idle` / `loading` | the first read is under way | `status-connecting` · *connecting* |
| `ready` | gating is on and the identity is real | `status-account` · the display name, quiet |
| `unenforced` | a 200 arrived and **proves nothing** — the server verifies no token, so every identity field is null even for a caller that sent a valid one | `status-warning` · *no sign-in*, warning role |
| `unauthenticated` | 401: the credential was refused | `status-warning` · *token refused*, warning role |
| `failed` | the server did not answer — a different problem with a different fix | `status-error` · *server unreachable*, error role |

Only the FIRST read shows as `loading`. Every return to the tab reads again, and a re-read keeps
the last answer on show until the new one arrives — otherwise the menu bar would flicker through
`connecting` each time.

**`grants` is INFORMATION, never a capability list.** Settled with the backend on 2026-09-25: the
list is displayed, every surface stays reachable, and a refusal is the 403 — which names the surface
and what the token holds. A client that hid a view because the list lacked an entry would be a
second, weaker copy of a model it does not own, and it would fail in the silent direction: an absent
view looks like one that never existed. If the rights model ever needs a client to reason from it,
that arrives as its own announced contract change.

### How full the machine is — `GET /api/v1/machine-resources`

Contract 31. The machine is the one the server, the backtests and the live sessions share, and memory
that runs out is the moment a process is ended by the operating system — nothing refuses politely
before that. `MachineStatus` draws it in the menu bar, before the account:

```
CPU  15% · Memory  17%                         ok: the two shares, nothing else
⚠ warn · CPU  63% · Memory  84%                the backend's grade, where it is not ok
CPU  15% · Memory  17% · ⚠ as of 14:37:22      the readings have stopped arriving
```

- **The two shares stand there always; the grade speaks only where it is not `ok`**, as a mark and
  the backend's own word, and a grade this version does not know shows as itself. `pressure_level`
  is graded by the backend on memory alone — a busy processor is the machine doing its work.
  Nothing is computed here: the thresholds (`warn_at_pct`, `critical_at_pct`) and the reasons travel
  in the answer and are shown as they come, on the hover card beside the limit, where it was read
  (`limit_source`, `count_source`) and the window the processors' share covers.
- **Each share sits in a slot three digits wide** — spaces, kept by `white-space: pre` — so a figure
  going from 9 to 100 moves nothing beside it, and the account keeps its place.
- **`machine_store` asks every 5 s while the page is in view and nothing while it is hidden**; back
  in view it reads at once. A slow answer is not asked for twice, and one unanswered after 4 s is
  given up. **The last reading is held through a failure**, and once three polls have brought
  nothing new it is shown with its time (`as of …`, warning role). The backend asks for exactly
  that, so a reading that stopped arriving is visibly old rather than silently current.
- **The polling starts at the app root**, like the caller, so the store holds one reading for
  whoever shows it: the menu bar now, a System panel later (viewer#31, S6).
- The processors' `used_pct` and `window_s` are both null on the first reading after a restart of
  the server: the bar shows `—`, and the card says there is no window yet.

**The answer is never cached, because a restart is invisible from here.** An account or a grant
takes effect on the backend only across a restart of its process, and no response carries a boot id
or a start time — confirmed by the backend rather than assumed, and the build version does not move
either. So `App.vue` re-reads on `visibilitychange`, and the hover card states the identity *as of*
the instant it was read. That approximation is only safe because of the rule above: the answer decides
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

**One line wherever it fits** (viewer#31, 2026-10-14). In a narrow panel the bar took three and four
lines before a single row of the list showed, so it was folded:

```
⌕  Pipeline ▾  Artifacts ▾  +6 3 ▾          ✕ clear   29 of 141   Sort: newest ▾
│  └ the facets that fit, in their order   │             │             └ a menu of the sorts
│                    the rest, behind +N ──┘             └ shown of all
└ the search, folded until asked for — open while it holds a term
```

- **The facets run in `base/OverflowRow.vue`** — one row that never wraps, its arithmetic in
  `overflow_fit.ts` and pure: those that fit stand in the row, in their order, and the rest wait
  behind `+N`, each there as a submenu with its values, their counts and its picks. The control carries the
  picks behind it as a count and wears the chosen look, so a narrowing out of sight still shows
  where the click happens.
- **The bar does not move when it is used.** Everything a use changes keeps the room of its widest
  state — `clear` is laid out while there is nothing to clear, the count at its most digits, the
  sort at its longest name, the count on `+N` at two digits — because the facets that fit are
  measured against what stands beside them, and a chip would otherwise go behind `+N` or come out
  from under the pointer.
- **At the narrowest the right-hand group takes a second line**, never a third; which line it takes
  depends on the panel's width alone. Measured 2026-10-15 on the run list: one line at 1400 and at
  700 px, two at 420 px.
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
  as a value is picked. An empty string is not a category. A facet that cannot narrow anything is
  drawn DISABLED rather than dropped: dropped, chips appeared and vanished mid-bar as values were
  picked, and the open panel moved out from under the pointer (measured on screen 2026-10-08).
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
  an optional `hint`) and `ListGroup` (one partition: key, rows, open). What the card beside a row
  shows is a `FigureCard` (`src/types/figure_types.ts`), the shape every card of the app takes.

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

**A list can group TWICE, and a group may state nothing at all.** `outerBy` puts a second level
above `groupBy`, because the orders list has rows that belong to a scenario AND to a position and
each level needs its own heading. `showsGroupHead` lets the caller refuse a heading for a given
group: the run list folds 85 lines into 42, but 28 of those groups hold one run, and a heading over
one row is a line, a glyph and a click to disclose what is already on screen. A group with no
heading is never closed — nothing could open it again.

**ONE disclosure glyph, and the list decides it.** Two panels wrote `group.open ? '▾' : '▸'` by
hand, a third opened its fills with no glyph at all, and the operator could not find the disclosure
on screen (2026-10-08). The glyph now travels as a slot prop — `marker` — exactly as a row's does:
the list decides the SHAPE and the STATE, the caller decides which cell it sits in, because the
caller owns the cells. The intermediate form, where the list drew its own glyph beside the slot,
cost its own defect: a position heading carried TWO triangles, and the unit test read the first of
them and passed. The heading's cells are placed on explicit tracks, so a glyph of the list's own
would be auto-placed onto a row of its own.

**ONE indentation step, and it means UNDER A HEADING.** `--record-step` is the single rung: a row
whose group states itself sits one step in, a row whose group states nothing stays level with the
headings. Both halves matter — the first version gave every row of a grouping list the step, which
is no ladder at all, and the operator said so on sight.

The step is RESERVED on every row of such a list and taken back with a `transform` from the rows
that stand alone, because a transform moves the ink without moving the box. An `auto` track is
sized from its cells, so a step only some rows carry sizes the column differently depending on
which groups are open: measured 2026-10-10, opening one family grew the run list's first track by
exactly one step and pushed the column beside it 24 px sideways. A list that scrolls also reserves
its scrollbar gutter, or the bar appearing on a click takes 15 px from the proportional column.

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

**Or the list measures the closed groups too — `measureClosed`.** Not every column of a grouped
list can take a share: the run list's stamp and figures are as wide as their values, and a share
wide enough for the widest one wastes room on every other row. Those tracks stay `auto`, and then a
closed group holding the widest value of a column widens it the moment it opens — measured
2026-10-15 on the run list, 4.75 px once the index held thirteen runs more, and every heading
beside it moved. With `measureClosed` the list also draws the rows of every closed group, at the
end of the grid, with no height, unseen, hidden from assistive technology (`aria-hidden`) and out of
reach of focus and pointer (`inert`). The tracks are then sized over every row, shown or not, which
is how established data grids settle it. It is opt-in, because a long list then draws rows it does
not show — measured 2026-10-15 on the preview bundle, +74 ms on the warm run list at 154 runs; the
unseen rows are memoised on the row, so a pick does not draw them again. The run list is the caller
that needs it. Such a row keeps the `record-row` class, since
the width-bearing styles hang on it, and is told apart by `record-unseen` — whatever counts the
rows on screen counts `.record-row:not(.record-unseen)`.

**The card beside a row is wrapped by the LIST, not by the caller.** reka-ui's trigger takes a
single element and that element is the row button, which the list owns. Wrapping every row
unconditionally would mount a tooltip context per row — five hundred on a long trade list, for
lists that offer no card — so a row without a card is a bare button.

**A figure's caveat rides on its pair in the card too**, as a `title` on the label and the value —
the same place a `FigureBlock` puts it. The card stays open under the pointer, so the pair can be
hovered. Until 2026-10-15 the card dropped it: every caveat handed to a card — the deployment's
drawdown, a unit's fees charged, a spread not recorded, the run's full config id — was in the
caller's figures and nowhere on screen.

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

### Choosing scenarios — `run.units`, and what must not be narrowed with them

A run holds up to forty scenarios, and the facet bar only narrows the ROSTER. The selection is the
other half: scenarios are chosen, and the sections that are per-unit follow them.

```
run 20260927_092959_cd1d9b1e · units ETHUSD_blocks_06, ETHUSD_blocks_09

  roster            marks the rows; a click adds, a second click takes one out
  trade history     narrowed
  booking periods   narrowed
  warnings/errors   narrowed — but a RUN-scoped warning stays, it is still true
  portfolio         MARKED, never narrowed
  RunsView          the whole column is FRAMED, dashed
  menu bar          "⌖ Only EURGBP_01 · Show all", once for every panel
  Run chart         draws the scenario in focus
```

**ONE scenario in focus — the lists and the run chart show the same case** (operator, 2026-10-16).
A click puts a scenario in focus, a click on another moves the focus there, and a second click on
the same one shows the whole run again (`toggledFocus` in `context_store.ts`). Several at once was
built first, for comparison, and taken back: a reader works one case at a time, and the run chart
draws ONE unit, so a narrowing of several left the lists and the chart showing different things.
Units are compared where they stand side by side already — the scenario roster's columns, the
groups of an un-narrowed list — and runs in a second browser window. The names stay a LIST in the
run's context, so several can come back as a modifier click without a new shape; a stored list of
several is reconciled to its first. An EMPTY list means the whole run, never "nothing" —
`showsUnit` encodes exactly that, so no call site branches on it.

**The narrowed column is framed, not merely announced.** A sentence above a list cannot say how far
a manipulation reaches; an edge can. The frame wears the annotation role — a marked division — and
is dashed, the channel that survives for a reader who cannot separate the hues.

**A selection never moves the layout.** The frame's room is always there, transparent until a
narrowing colours it: drawn only on a choice, its border and padding indented every panel and the
statement above it pushed the column down a line, so what the reader was looking at slid away under
the click. The statement is said ONCE, in the menu bar (`NarrowingStatement`), because the focus
reaches every panel and a panel's own bar would repeat it in each group the bundle's members stand in.
Every run-wide label below is a mark (`ScopeMark`) drawn inside a line that already exists — the
executive's and Run Totals' on the first currency's title row, the verdict's in its headline — and
says its whole sentence on its title. `run_selection.spec.ts` holds it in a browser: the executive panel's box and the row under
the pointer stay exactly where they were.

**It lives in the run's context, because it is SELECTION.** Panel order and collapsed state are
presentation and stay in the layout's own key; what the reader is looking at belongs to the link,
so a second link (viewer#31) narrows its own run. It sits one step below the run and is
dropped whenever the run above it changes — carried across, it would narrow a new run to a name
that run may not have, or to one it does, which then reads as a choice nobody made.

**It reaches the panels ambiently** (`use_scenario_selection.ts`), for the same reason the display
preferences do: it applies to every panel, only four act on it, and a prop on `<component :is>`
hangs a stray attribute on the ones that do not declare it. The channel carries the SETTER too,
because the roster changes the selection — routed back as an event, the generic panel shell would
have to forward a run-specific emit, which is the domain leaking into the part that must not know
it. The app root supplies it (`use_run_report_channels`), so it reaches a section wherever the
section is drawn.

**The figures that are run-wide and cannot be split are LABELLED rather than filtered:** the
executive KPI table (one row per CURRENCY), Run Totals (a fold over every scenario), the
reconciliation verdict and the deepest-drawdown footnote in Booking Periods, and the outcome counts
in Warnings & Errors. Run Totals joined them in viewer#42: inside the bundle's dashed frame its money
read as the focused scenario's. There were two more once: the order
funnel and the per-currency analytics stood in Trade History too, and both are gone — 17 of the 19
fields in `trade_history.analytics[]` are identical in value to `run-summary.currencies[]`, which
the executive panel prints above them on the same page. The backend confirmed the duplication is
deliberate (one derivation, two routes) and that the summary's copy is the one to show. A run-wide number sitting unlabelled over one scenario's
rows reads as that scenario's — the same class of silent wrongness the narrowing exists to remove.
The executive table matters most because it sits at the TOP: a reader who has just
narrowed meets it first. Portfolio is handled by marking instead: its footer is an aggregate with
no per-unit version, and keeping every row also answers the question narrowing raises there, namely
how the chosen scenarios compare with the others.

**A control nobody recognises as a control does not exist.** The roster row was built as a plain
list entry and the first reader to see it could not tell that clicking did anything — the effect
was real but happened below the fold, and the two panels nearest the click did not react at all.
Four things fix that class of problem: the scenario name wears the interactive colour and the row
has a hover surface; the choice is marked on its rows, beside where the click happens; the column
is framed and the menu bar says what is chosen; and a `HintLine` says what a click does. The
hint STAYS after a pick: until 2026-10-14 a line naming the choice replaced it, and the swap moved
the whole list under the pointer — a pixel with the hint showing, a line once it was dismissed.

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

The API's vocabulary is fixed in FiniexTestingIDE's `docs/glossary.md`, and the four kinds of run in
its `docs/introduction_to_the_ide.md` ("The kinds of run"). Every label on screen uses those words,
because a word invented here would mean something different from the same word in a report. The
words this viewer coins for its own display — panel, bundle, link, narrowing and the rest — are in
[the glossary](glossary.md), each saying which of FiniexTestingIDE's words it is not.

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
— pointed at `RunInfo`: facets for pipeline, artifacts, reporting, parent, version, purpose, money
and outcome, sorted newest-first by default, with a search over the run id and the set name. Both
components are generic and hold no state, so this cost the facet definitions and ten column
declarations.

The row says what the run DID, from the index response itself and without a request per run:

```
⌕  Pipeline ▾  Artifacts ▾  Reporting ▾  …  +2 ▾       ✕ clear   12 of 46   Sort: newest ▾

Started        Pipeline    Set                       Run id            Market time  Outcome    Net P&L      Trades
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
be clicked would only look broken. And the list **is a panel of its own** since 2026-10-14: a pick
brings the run report — another panel — to the front, so the list never folds away to make room.
It folded to one line once a run was chosen until then, because forty rows above the sections
pushed every one of them off the screen.

**The narrowing is kept too**, as the bar's entry in `arrangement.v1` (`use_facet_state`).
`Purpose` is the one facet that opens with a value picked, and the default is applied as an
ordinary selection rather than behind it: a chip shows it, `clear` removes it, and a cleared bar
stays cleared after a reload. That shape is GitHub's `is:issue state:open`.

**The list GROUPS by family, and a family of one stays a plain row.** Measured 2026-10-09 over 85
runs: 42 lines instead of 85, 14 of them a family and 28 a run standing alone.

```
[Search ...] [Pipeline v] [Artifacts v] ... [Money v] [Outcome v]        27 of 85

  Oct 08, 13:06  demo_btcusd_bot            24.3 h  OK success    0.00 USD   0 trades  deployment
> deployment deploy_20261008_110304   5 runs - Oct 08, 13:05
> kraken_spot_ethusd_field_study      2 runs - Oct 08, 01:43
  Oct 07, 17:06  eurusd_aggressive_trend_mock  48.0 h  OK success  -359.85 USD  335 trades
```

The key is the PARENT where the backend states one and the set name otherwise, and the measurement
is what decided that: **the set name alone folds no sweep**, because a sweep's children each carry
their own (`..._c000` through `..._c008`), so the thirteen sweep runs stayed thirteen lines —
exactly the complaint. By set name, meanwhile, eighteen `demo_btcusd_bot` runs fold under one
heading although they are six separate deployment sessions.

Three consequences. Families start CLOSED, because the fold is the point. A family stands at its
TOP run and says that run's stamp, so "sort by time" keeps meaning time whatever the sort is — the
list keeps groups in the order their first row appears, so the reader's sort orders the families
too. And the `Set` FACET fell away: the grouping is that partition, and on a sweep the facet
offered thirteen values matching one run each, which is a second search line. The search still
reads the set name.

The kind badge (`deployment`, `sweep`) is on the heading, and a row inside a family no longer
carries it — five identical badges under one heading that says the word is the noise this project's
own rule forbids. A run standing alone keeps its badge, because nothing above it says what it is.

### Docked Panels — `PanelDock`, `panel_kinds` and the dock store

**The application is a dock of panels, not a set of pages.** `PanelDock` wraps dockview (MIT,
pinned exactly together with its two packages through `overrides`, because it is released weekly):
tabs, groups and the seams between them. It knows PLACEMENT only — what a panel shows is its
KIND's, what it is about is its link's (*Selection State*). Floating groups are switched off: a
panel never floats over another (a non-goal, confirmed 2026-10-11). There is no router; the menu
bar and the tabs are the way between the views.

```
AppMenuBar   FiniexViewer  Panels ▾                         CPU · Memory   account   ☰
PanelDock    [☰ Deployments] [☰ Runs] [▤ Run bundle · 20261012_205715…] [◫ Run chart]
               ├─ PanelHost (kind: runs) → RunsView        the run list
               └─ PanelHost (kind: run)  → RunReportView   the run bundle
```

**The run list and the run bundle are two panels** (viewer#31, 2026-10-14). `runs` is the LIST — the
facet bar and the runs, nothing else; a pick chooses the run (`selectRun`) and brings `run` to the
front where it is open — a pick is a selection, and a selection never reopens a panel. `run` is the
BUNDLE: the word is on its tab, *Run bundle · <run id>*, in the Panels menu and on ⇲ (viewer#42), so
the container has one name wherever it is named. It holds one line naming the run with *Show in
list*, and then the report's sections stacked as its members in one column.

**Show in list** (viewer#42, after VS Code's *Reveal in Explorer*; `useShowInList` in
`use_panel_jump.ts`) brings the run list to the front — reopened where it stood if it was closed —
opens the family holding the chosen run, centres its row in the list (the list only, never the view
around it) and marks it for a moment with a dashed edge in the annotation colour that fades
(`.record-row.flash`; standing still for the same moment without motion). It is not offered where
the list is on show with that row in view: the dock store keeps which panels are ON SHOW, as each
panel's host hears it from dockview (`shownIds`, `noteShown`), and the list measures whether the
chosen row stands in its own view with an IntersectionObserver (`runs_store.chosenRowInView`). The
button keeps its room while hidden, so the run line does not cut differently while the reader
scrolls. Where the list's filter or search hides the chosen run, the list says so with *Show every
run*. The chosen run's family opens WITH the choice and can be closed again; it held itself open
before, so its heading was a button that did nothing. Its tab
names the run, so two browser windows comparing two runs are told apart at a glance — cut after the
date and time, whole in the tab's card (`PanelKind.subtitle`). The run's grade stands on the
bundle's tab, where the report is; the narrowing is said once, in the menu bar. The two failures are kept apart in
`runs_store`: the index failing is the list's to say (`indexError`), the summary failing the
report's (`summaryError`) — one shared ref let a broken summary blank the list it was picked from.

- **`src/panel_kinds.ts`** — every kind in the SUGGESTED ORDER, from the general to the particular:
  a deployment holds runs, a run has its chart (operator, 2026-10-13). A kind names its title, the
  FORM its tab shows (`form-list`, `form-sheet`, `form-chart`), whether the first arrangement holds
  it, and the AREA whose submenu lists it in the Panels menu — the run list, the run bundle and the
  run chart share the area *Runs*, each under the name it has there (`menuTitle` where the tab's
  title would repeat the area's name: *Run list*). What
  is read or set and then closed — About, the settings — is a dialog and has no kind. Each component
  is loaded on demand into its own chunk, as the routes before them were.
- **`src/stores/dock_store.ts`** — the dock's API and the first arrangement: Deployments, Runs and
  the run bundle as tabs of one group, in front where the work is — the bundle where a run is
  restored, the run list where none is yet (`firstActiveKind`) — and the run chart beside the report
  (operator, 2026-10-15): a split to its right at 40 % of the width where the dock is at least
  1400 px wide, a tab right after it below that, where a split would leave the report's lists too
  narrow (measured: at 620 px the run list overflowed its panel by 95 px). The free chart is not in
  it and opens from the Panels menu. A stored layout that never held the run report gains it right
  after the run list where a run is chosen, in front where the list was, and one that never held
  the run chart gains it beside the report; never a panel the reader hid, which has a place to come
  back to. `reveal(kind, reason)` brings a panel to the front; a closed one opens where it
  last stood (*Closing hides* below), and beside the active one where nothing it stood beside is
  open — for a command only, never for a selection. A restored layout takes every panel's title
  from its kind: dockview stores the title with the layout, and an old one kept the tab's
  accessible name and the dock's announcements on a name the panel no longer has. `reset()` goes back to the suggested order and forgets every place — offered in the
  settings' Layout tab, beside everything else about arrangement, rather than as a menu of one
  entry. The layout is written
  into `arrangement.v1` once it has held still for 300 ms, and at once when the page goes or the dock
  is about to unmount — BEFORE, while dockview still holds the panels: written after, it was empty,
  and every hot reload during development replaced the reader's arrangement with the suggested one
  (reproduced 2026-10-14). A dock holding no panel is never written.
- **`src/components/dock/dock_layout.ts`** — the stored layout reconciled on load, never trusted. A
  panel of a kind this version does not know is dropped from its group, an emptied group from the
  grid, and floating and popout groups go. Where nothing usable is left — or dockview refuses what
  was stored — the suggested order is laid out instead, never an empty screen.
- **The dock is the window, and it CLIPS.** dockview draws every panel into an overlay of its own
  and sizes it from script, but only while the panel is on show: one behind another tab keeps the
  size it had. Made smaller, the window left such an overlay reaching past its bottom, unseen, and
  the page grew a scrollbar over empty space (measured 2026-10-16: the grid at 660 px, a hidden
  overlay at 918). `PanelDock` therefore hides its overflow. It clips only the unseen — a panel
  brought forward is laid out anew, and dockview shifts its own tab-overflow list inside the dock.
- **Every panel is shown through ONE `reveal(kind, reason)`** (the dock store, operator 2026-10-16,
  VS Code's `openView` as the model). It brings the panel to the front wherever it stands, in its
  own group, and it is the only way a jump, a link or a pick shows one — the store exports no
  `open`, so the type-check refuses a component that tries. The reason decides whether a CLOSED
  panel may open: a `command` (the Panels menu, a link or a jump the reader clicked) opens it where
  it stood; a `selection` (a pick in a list) never does. Seven call sites each decided that on their
  own before, and a pick in the run list reopened the run report the reader had closed, every
  section of it already out as a panel of its own.
- **A panel docks along a whole edge of the dock** (`DockEdges.vue`, operator 2026-10-16). Dragged
  to the outermost edge, a tab becomes a column over the dock's full height or a row over its full
  width, a quarter of it to start with; a drop on a group only splits that group. dockview has edge
  targets of its own (`dndEdges`) and they cannot do it here, for two reasons traced that day: the
  Vue binding declares the option a Boolean prop, so left unset it arrives as `false` and switches
  them off; and switched on, they see no drag over a panel kept in the page — `renderer: 'always'`
  puts its content in an overlay outside their element, so only the tab bars reached them. So the
  dock draws four bands of its own while a drag is under way (`onWillDragPanel`,
  `onWillDragGroup`), shows the room a drop will take in dockview's drop colours, and docks through
  the public API (`addGroup({ direction })`, `moveTo`). dockview's own edges are switched off
  explicitly, so the two never compete. The `dock-edges` hint says it, because nothing on screen
  shows an edge until a tab is dragged.
- **`PanelHost`** draws a panel the first time it is SHOWN and keeps it after: a tab behind another
  costs nothing until it is picked, and a panel returned to finds its scroll where it left it. It is
  the panel's error boundary, and it hands the panel its visibility — `onPanelShownAgain` fetches
  the run index and the ledger afresh, quietly and without a spinner, whenever their panel comes
  back, because a docked panel stays mounted where a route was entered anew.
- **`PanelTab`** shows the form icon, the title, ONE status where it says something, and ✕, which
  hides the panel; a section's tab also carries ⇲, *Back into the bundle*. Its card says what the
  panel is for, the bundle it is part of, what it follows and chooses, and the status in words —
  one builder, `tab_card.ts`, from the kind's declared relations (below). A section's card names
  the whole run in its heading, which its tab has no room for. The run bundle's tab carries the
  backend's grade of the open run (`run_outcome`) where it is not `success` — the icon in the
  warning or error role, its word read out with the tab and written in the card. Where everything
  went well, the tab says nothing. **`dock_theme.css`** gives
  dockview's two themes this app's tokens: a tab behind another keeps the primary ink, because
  muted ink means *disabled* here, and the front tab is marked by its surface AND an accent rule.

**What a panel follows and chooses is DATA on its kind** (viewer#42 — VS Code's register of views
as the model: a register, the link it reads, one `reveal` that shows a view). `PanelKind.relations`
names the bundle a kind is a member of, the link keys it FOLLOWS — a change of which changes what it
shows: other figures, other rows, another unit drawn — and the keys a control in it CHOOSES. A key it
only marks a row by is not followed: a list that stays whole does not follow the pick it shows. A
section declares its own in the registry, the same in the bundle and as a panel. Who controls whom
is the chooser and the follower of a key, never one panel over another.

```
kind              member of   follows                  chooses
Deployments       —           deployment ¹             deployment · run
Runs              —           —                        run
Run bundle        —           run  + its members ²     its members ²
Run chart         —           run · scenario           scenario
Free chart        —           market ¹                 market
Scenarios         Run bundle  run                      scenario
Trade History     Run bundle  run · scenario           position
Orders            Run bundle  run · scenario           position
Booking Periods   Run bundle  run · scenario           —
Warnings & Errors Run bundle  run · scenario           —
every other       Run bundle  run                      —
```

¹ Said on the card only where ANOTHER kind can choose the key: a key nobody else chooses is the
panel's own pick, and *Follows* would send the reader looking for a panel that sets it. ² A bundle
says what the members standing in its column follow and choose; one open as a panel of its own,
hidden, or absent for the run takes its links with it. The card words them in one fixed phrase per
key, in the link's order: *Follows — the chosen run and the scenario in focus · Chooses — the
position · Part of — Run bundle*. A test holds every kind to its declaration: a section the
narrowing filters follows the scenario, one that only marks it does not, and nothing is followed
that no kind chooses. Not claimed: the run chart centres on a chosen position only where it is of
the unit it shows, and the run header links a deployment only on a deployment's session.

**A section of the run bundle opens as a panel of its own** (viewer#31, decided 2026-10-14). The
run bundle stays one column and a section the reader wants beside another is pulled out: the button
among its header's controls (`action-open-panel`) opens it as a docked panel, and ⇲ on that panel's
tab (`action-back-into-column`, *Back into the bundle*) puts it back in the column. A section is in
one place at a time. An
AutoTrader session writes fewer sections than a backtest; the column absorbs that by growing
shorter, where a grid of eleven panels would have left empty areas or moved.

```
[☰ Runs] [▤ Run bundle · 20261012_…]     │ [☰ Trade History]
  the bundle's column                      │   the section, with its own scroll
  ▾ Executive Summary                  ⇱   │
  ▸ Orders                             ⇱   │
```

- **One kind per section, `report-<section id>`** (`reportKindId` in `panel_kinds.ts`), kept out of
  the menu's top level: the Panels menu lists the sections in the submenu *Runs*. Its tab
  shows the FORM — `form-list` for
  the four lists, `form-sheet` for the others — and a section panel carries the narrowing's frame
  where the narrowing filters the section; the narrowing itself is said in the menu bar. The
  registry says how a section takes it, in `narrowing`: `filters` (Trade History, Orders, Booking Periods, Warnings & Errors) draws only the
  chosen scenarios' rows, `marks` (Scenarios) keeps every row and marks the chosen ones, `null`
  does not read it — the Executive Summary reads it and narrows nothing, its mark saying the
  figures are the whole run's. The tab dims its title where the chosen run has nothing for
  the section, and shows ✖ *could not be loaded* where the section failed.
- **`components/dock/ReportSection.vue`** draws the section's component with the model the column
  hands it (`run_sections_store`), behind the same boundary. Where there is nothing to draw the
  panel STANDS and says why — the backend's sentence where it gave one, *This run carries no such
  section* where the run's artifact list lacks it, since which pipeline writes which section is the
  backend's rule. A size container, so the lists measure their caps against this panel, and framed
  dashed where the narrowing FILTERS it, like the column: a frame says *what you see is a part*,
  which is untrue of a list that still shows every row.
- **Where a section stands is derived, never stored.** The dock store keeps `openIds` from
  dockview's own `onDidAddPanel` / `onDidRemovePanel`, and the column leaves out a section whose
  panel is open; its place in `layout.v1` stays, so ⇲ restores it and a reset of the dock gives
  every section back. `openSection(id)` brings an open section to the front, or opens it — the
  first as a split to the right of the run bundle, each further one as a tab beside the last, so the
  screen is not cut thinner with every section. The lines above the column (absences, failures,
  older schemas) leave out a slot whose every reader is open as a panel: that panel says it.
- **The jump lands where the section IS:** its own panel comes to the front and is searched for the
  marked row; for a section in the column, the run bundle comes to the front first, since the jump
  may start in a section panel. A hint above the column (`open-as-panel`) says how a section comes
  out and goes back.
- **A bundle the reader emptied says so** (viewer#42): where every section stands as a panel of its
  own or is hidden, the column gives way to one sentence — *⇲ on a panel's tab brings it back here,
  the Panels menu shows a hidden one* — and neither the frame nor the hint, which says the same,
  stands around nothing. Where what is left is sections the run does not carry, the sentence speaks
  of the sections it carries. A run that carries none had nothing taken out, and the lines above the
  column already say why (`use_section_states.ts` holds where each section stands).

**Closing hides, alike for every panel — and the Panels menu shows it again where it stood**
(viewer#31, 2026-10-14). The section bar above the column is gone; the Panels menu took its place.
A tick is a panel on show, a click hides it or shows it again, and the menu stays open so several
can be switched in one visit. The run bundle's sections stand in the submenu *Runs*, in
the column's order, each with where it is (`use_section_states.ts`): in the column, open as a panel
(⇱), hidden, or struck where the chosen run has none — listed rather than left out, because an
inventory that silently shortens is not one.

```
Panels ▾
├ ✓ Deployments
├   Runs ▸ ┬ ✓ Run list
│          ├ ✓ Run bundle
│          ├ ✓ Run chart
│          ├ ─────────
│          ├ ✓ Executive Summary          in the bundle
│          ├ ✓ Trade History          ⇱   open as a panel
│          ├   Feed Health                hidden
│          ├   Scenarios                  struck: the run has none
│          ├ ─────────
│          └ Collapse all · Reset bundle
└   Free chart
```

- **Where a panel stood is noted just BEFORE the layout changes** — dockview's `onWillMutateLayout`
  fires while a panel about to be closed is still in place. A place names the panels it stood
  beside, not its group, because dockview issues group ids anew: the tabs it shared a group with and
  its index among them, or the panels of the neighbouring group (`adjacentGroupInDirection`), the
  side, and the width or height its own group had. Kept as `places` in `arrangement.v1`, so a panel
  hidden before a reload still comes back where it stood.
- **Showing a panel again** uses its place while one of the panels it stood beside is still open,
  at the size it had; otherwise a main panel opens beside the active one, and a section goes back
  into the column, whose panel comes to the front.
- **A section's panel closed is a section hidden** (`onDidRemovePanel`), however it was closed —
  its tab's ✕ or the menu. Only ⇲ sends it into the column, which forgets its place; the column's own
  ✕ goes the same way through `hideSection`. A rebuild of the dock — a reset — hides nothing.

**The quick bar beside a group's tabs** holds the few options of the panel in FRONT of that group
(`QuickBar`, from the kind's `quickBar`): for the chart, its broker, symbol and timeframe as compact
selects (`AppSelect` with `compact`) — the value is what shows, the name while nothing is chosen, and
each carries its name for a screen reader. A panel without options leaves the bar empty, and two
groups side by side each speak for their own front panel.

**The quick bar gives way before a tab does.** `dock_theme.css` gives dockview's actions container
a shrink share of 100 to 1 against the tabs, down to the least width the bar's content declares: the
bar shortens first, and a tab goes into the overflow menu only after it.

**The narrowing is said once, in the menu bar** (`NarrowingStatement`, viewer#42). It stood in the
quick bar of the run bundle and of each section panel, so a bundle split into three groups said it
three times, and a narrow group lost its tabs to it. It names the scenario in focus, the whole line
in its title where the bar is too narrow to show it, and says where the run lacks that name. The
line is a grid whose text track is `minmax(0, max-content)`, so its least width is its mark and its
button alone, and it shrinks before the machine status beside it moves (`e2e/narrow_panels.spec.ts`,
at 760 px).

**Measured 2026-10-13:** the start bundle grew from 393 to 744 kB (gzip 130 → 210 kB), and that is
dockview. The timings, taken again the same day on a quiet machine, moved by nothing beyond noise.

### Panels — a registry, a shell, one persisted layout

These are the REPORT panels inside the run bundle, the accordion column; since viewer#31 any of them opens as a docked panel of its own. The viewer shows many small panels around one chart rather than one view per page. Three pieces carry that:

- **`src/panel_registry.ts`** — a declarative list of `PanelDescriptor`s: id, title, icon (a registry name, `kind-<id>`), component, the `source` key it reads, and whether it starts open. A plain list rather than a `register()` call, so with a static import graph the order is explicit instead of depending on which module loaded first. The column and the Panels menu render from this list, so a new panel is an entry here, not a rebuild. **The list IS the default order and its principle is stated beside it**: the verdict · the UNIT it is denominated in · what ran · when · the sum · the evidence · whether to trust it · the provenance. The unit is the category the first version of that principle lacked, and its absence misplaced Broker — market type, symbol, contract size and swap decide what a figure MEANS, so it reads second rather than among the breakdowns. Changed 2026-10-07 after days of use, and only *Reset bundle* (Panels ▸ Runs) carries it into an arrangement somebody already made.
- **`src/components/panels/`** — `AccordionPanel` (the shell: collapse, pin, lock, hide, controls revealed on hover and on focus) and `PanelColumn` (the ordered stack, drag to reorder). The column renders from `arrangedPanels` — every panel, switched-off ones included, in the order the reader made — and leaves out what is switched off, what is open as a panel of its own and what this run does not carry. The Panels menu lists the same arrangement (see *Docked Panels*); the section bar that drew it on its side above the column retired on 2026-10-14. The collapsible behaviour, its ARIA wiring and keyboard handling come from Reka UI.
- **`src/stores/layout_store.ts`** — the panel column's order and state, persisted under its own versioned key `layout.v1`, per browser tab like the arrangement (the selection is in `arrangement.v1`, see *Selection State*).

**A section that fails to load says so, and every one of them does.** `run_reports_store` keyed its
failure messages by section on 2026-10-01; one ref served all seven until then, and they load
CONCURRENTLY — so the last writer won and the reader was told about whichever section happened to
finish last while the other failures vanished. Same shape as `absences` beside it, and for the same
reason. The run view prints one line per failure.

**A panel receives its model as a prop and never fetches.** `run_sections_store` composes the `sources` record ONCE for every place a section is drawn; `PanelColumn` is handed it and passes `sources[descriptor.source]` to each panel. That is what lets the same component render a run artifact today and a streamed frame later (testingide#379/#380) without being written twice. The rule is about DATA: presentation preferences reach a panel ambiently instead (see *Settings* above), which ties it to no source.

**A composed model is its own computed, so it keeps its identity while unrelated sections arrive.**
Three panels read a model `run_sections_store` composes from several responses — the Run Header, the Orders
and the Scenarios. Built inside the one `sources` literal, each was a new object whenever ANY
section landed, and a panel that watched its model handed a reader's choices back: the roster
cleared its narrowing as the trade history or the configuration arrived, neither of which it reads.
Apart, a composed model changes only with its OWN parts — and since those still arrive one by one,
a panel that resets on a new run watches the run's id, never the model's identity (`OrdersPanel`,
`ScenarioRosterPanel`, `TradeHistoryPanel`).

**A list caps its height against the VIEW it sits in, never against the browser window.** The run
and deployment views are CSS size containers (`container-type: size`), and the lists inside them —
the run list, the deployment list, the scenario roster, the booking-period table — measure their
`max-height` in `cqh`. With `vh` a view given half the screen still sized its run list for the whole
of it, and the rows past the view's own hidden overflow could not be reached. Dialogs and hover
cards stay in `vh`: they float over the whole screen, so the window IS their measure. The run list,
the whole of its panel since 2026-10-14, takes the REST of its view through flex rather than a cap
with a fixed reserve for what stands above it: with the hint dismissed, a reserve of 11.5 rem stood
empty below the last row (measured 2026-10-16: 144 px); `cqh` stays its floor, a third of the view.

**Two stores, two questions.** `runs_store` answers *which* run is selected — the index, the chosen run and the scenarios narrowed to. `run_reports_store` answers *what that run reports*, one slot per section, all cleared together when the selection changes. Sections load eagerly with the run for now; lazy loading on first expand waits until there are enough sections to justify the plumbing.

**An answer belongs to the selection it was asked under.** `clear()` moves a generation counter on, and a request made before it writes nothing afterwards — no section, no absence, no failure, not even its loading flag. Without it the last answer won, whichever run it was for: a slow section of the previous run landed in the next one wherever that run did not ask for the same section (an AutoTrader session asks for no roster), and the old request switched off the loading flag of the new one. `clear()` resets the flags itself, so a section the next run never asks for does not say it is loading for good.

**A section whose model this run does not carry is skipped, never shown empty.** `PanelColumn` drops a panel whose source is absent, which is how a 404 on a report route reaches the UI: not as an error, as a missing section.

**One still on its way is neither, and keeps its place.** `run_sections_store` states `pending` per source from the stores' loading flags. `PanelColumn` keeps such a panel where it stands with a loading line instead of its content, holding the height that content last had (one `ResizeObserver` over the panel bodies), and the Panels menu keeps its entry usable rather than striking it through as absent. A run change used to empty the column behind one spinner and let each panel come back on its own, so the column collapsed and rebuilt piece by piece in front of the reader. The view-wide spinner now waits only for the run index.

**And the absence now says WHY.** Until the backend named the cause (contract 5), every missing section answered `run_not_found` and this client collapsed it to `null` — so a run still going, a run started with `reporting: none`, and a run whose pipeline never writes that section all rendered as the same blank space. `getX` now answers `Report | SectionAbsence`, the store keeps the reason beside the empty slot in `absences`, `run_sections_store` adds the summary's, and `RunsView` says it ONCE above the column, **grouped by cause** — a run that ended early is missing several sections for one reason, and naming it once is the point. The sentence shown is the backend's own `detail`: it is written for a reader and held that way by a test on their side, so replacing it with one of ours would be a second, worse copy.

**A section that cannot be DRAWN is a finding about that section, not about the report.** Every panel renders inside an error boundary: `AccordionPanel` catches a render error from its own subtree, stops it there, and puts a sentence in the panel's place with a mark on its header, so the news survives the panel being folded. The stack goes to the console; a reader gets a sentence, because a stack trace on screen explains nothing to them.

This exists because its absence emptied the workspace. Measured 2026-10-01: one field the backend serves as `null` on 17 of 45 stored runs was read as an array inside a computed, and Vue unwinds a render error to the nearest component that handles it — with nothing handling it, ELEVEN panels left the screen because one of them could not draw.

The boundary clears when the panel is handed a different model, so a defect in one run's DATA does not follow the reader to the next; `PanelColumn` passes the model down as that signal. A defect in the CODE throws again on the second attempt and the frame simply stays — it settles rather than looping.

The two DEPLOYMENT routes deliberately keep `| null`: an unknown deployment id is a stale link rather than a missing section, and `deployments_store` already renders that as its own state.

**The same mechanism also carries "nothing to report".** Feed Health reads its own source rather than the shared run summary, and `runs_store` answers null where neither half of that panel speaks. Only `signal_fresh_ratio` is about SIGNAL — it is null when no SIGNAL worker ran; the four disturbance figures come from the feed-stability report and describe the DATA SOURCES, so a market feed can stall with no SIGNAL worker anywhere. The panel appears when a freshness was measured OR at least one episode occurred, and is dropped when neither is true. The backend's console draws the same line: `format_disturbance_line` returns an empty string at zero episodes rather than printing four zeros. Deciding this in the store rather than in the panel keeps the judgement out of the template and reuses the absent-source rule instead of inventing a second one.

**The stored layout is reconciled against the registry on load, never trusted.** Panel ids the registry no longer knows are dropped; panels added since the layout was stored are appended with their defaults; a corrupt entry falls back to the default workspace. A panel the user switched off is in the list with `hidden` set, which is also how reconciliation tells it apart from one that is new.

**An arrangement from an older SCHEMA is deleted, not converted.** `readStored` removes the key when `version` is not the current one. The project is alpha and the arrangement is a convenience: code that reads a shape nobody writes any more would outlive the day it was useful, and an entry left sitting in storage is the same artifact under another name. The cost is that a reader re-arranges once, which is why the key carries a version at all.

**Hiding is a FLAG, not a removal — and that is the whole reason the menu works.** A switched-off panel keeps its place in the arrangement and only the column declines to draw it. Before 2026-10-07 hiding removed the panel and remembered its id in a separate list, so its toggle was appended at the end of the section bar of the time: switching one panel off reordered the bar under the hand that did it, and the control a reader would click to bring it back had moved. A toggle that moves when you flip it is a control that runs away from the finger.

**Pin anchors, lock protects — and pinning makes a second CATEGORY rather than a quiet reshuffle.** Pin moves a panel into the first group and opens it once; afterwards open/closed stays free. Lock exempts a panel from *collapse all* (and later from width-driven auto-collapse). The two groups are separated by a DRAWN line in the column — `pinnedBoundary()` is the rule, applied to what the column actually draws. The line wears the `annotation` role and is dashed, because it marks a division rather than something to weigh; it is absent when every panel is pinned or none is, there being nothing to separate. Without it, pinning reorders the column and nothing on screen says why. Hiding needs no confirmation: the Panels menu always shows what is switched off, in its own place.

**From a panel into another view — `use_open_in_context.ts`.** The sibling of the position link,
one level up: a panel names WHAT to open (`openRun(id)`, `openDeployment(id)`) and the host decides
HOW. The app root supplies `openInDock()` (`components/dock/open_in_dock.ts`): it CHOOSES the run or
the deployment through the stores' own `selectRun` / `selectDeployment` — the context and the load,
exactly as a pick in their list — and brings that panel to the front through the dock store
(`dock.open`); no panel knows the dock, and none changed when the routes went. It never calls the
context's bare setter: a docked view stays mounted, so nothing reloads behind a context that merely
changed. Measured 2026-10-14, when the jump did exactly that: a run opened from a deployment showed
its own sections beside the previous run's executive summary — the sections follow the context, the
summary loads with the choice. `canOpen` is false where
no host supplied the channel, and a panel then draws the name as plain text rather than a way in
that leads nowhere. Four places use it, each through `JumpLink`: a session's run (`SessionsTable`),
a period's run on the deployment side (`BookingPeriodTable`), a session lane's label
(`BookingPeriodTimeline` hands `TimelineChart` an `open` per lane — what a lane MEANS stays the
caller's) and a run's deployment (`RunHeaderPanel`). No panel holds a route or a `RouteLocationRaw`
any more. Opening one of them in a new tab went with the `RouterLink`, which is accepted: the URL
carries no selection, and a second tab shares the one arrangement.

**The jump from a report row into the chart is not built.** The portfolio row that linked a unit's
symbol into the chart was deleted, and the jump with it; it returns with the run-bound chart of
viewer#31 — an `openChart` on this channel, added when a caller exists.

### Deployments — a second view, deliberately not a panel workspace

A backtest is read one run at a time; a bot that runs for thirty days is not. There the object of
interest is the **deployment** — the identity a series of runs share — and the question is what
happened across the restarts. That is a different shape from the run workspace, and it is built as
a plain view rather than as panels:

- **`src/views/DeploymentsView.vue`** with `src/components/deployments/` (`DeploymentPicker`,
  `DeploymentHeader`, `SessionsTable`, `AdvisoryNotice`) and `src/stores/deployments_store.ts`.
- The `deployments` panel; the chosen deployment is the main link's (`deployment.id`), restored by
  `use_deployment_binding` once the ledger has loaded.

**Why not panels.** The registry and the layout store are global: one `layout.v1`, and the Panels
menu lists every entry of it under Runs. Deployment panels in that registry would put their entries
among the run report's sections, where they can never render. Scoping the registry per view is foundation work that a
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

**Once the browser has measured, every label is judged in PIXELS** (2026-10-14). The chart reads
its own width and, from a hidden probe of ten characters, what one character takes — the labels are
monospace, so a label's width is its length times that. A span shows its name where the name fits
inside it, its short name where only that fits, and nothing otherwise; the whole name is on its card
either way. Axis labels are placed the two ends first, then each on the first row where its box
touches nothing, else the second, else not at all — a label that fits on neither row is dropped
rather than overprinted — and a label that would reach past the axis is slid along it until it lies
wholly on it, its pointer staying at the mark. Until then a share of the width decided, and in a
narrow panel fourteen percent was a few pixels: `period 12` crowded into a bar 40 px wide and three
stamps printed into one. Before a measurement exists — jsdom never makes one — the share rule
still applies.

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

**The heading names what the unit COST, part by part, and only the parts that are not zero.**
`fees` is the served `total_fees`, `spread` the served `total_spread_cost` (contract 32) — measured
rather than charged, already inside the gross, so it stands beside the fees and never in them. On
forex the fees usually read 0.00 and the spread is the whole cost; on a spot market both stand. A
part of zero is left out, so `fees 0.00` no longer sits on every forex unit. The card beside the
heading (`groupCard` on the list) carries the whole split — gross, net, the fees with their swap, the
spread — and a spread of null reads `not recorded` there, the reason on its pair: the data the unit
read had no quote, or the run was recorded before contract 32. A null spread stays off the line,
because every older run has one. Where such data was given modelled quotes (contract 33) the line
says `modelled spread` with the unit's `total_modelled_spread_cost`, and the card carries it as a
figure of its own. Nothing is added up: the API serves no total cost.

**The tracks are proportional, and that is a fix rather than a taste.** They were eight percentage
widths under `table-layout: fixed`, and the reason is worth keeping: while every group is closed the
columns the heading spans hold no cells at all, so an automatic layout sized them from nothing and
then re-sized them the moment a group opened, sliding every heading sideways under the reader's
eyes. The `minmax(0, Nfr)` tracks carry the same eight proportions and prevent the same defect. They
also mean a rank costs nothing to lay out: the surviving `fr` shares simply redistribute.

**The group heading is counted from the END, and `Net P&L` is the last column because of it.** The
heading was three cells spanning `5 + 1 + 2`, an arithmetic fixed at eight columns — so a rank that
gave one up left it spanning tracks the grid no longer had. Two cells (`1 / -2` for the name, its
count and its costs; `-2 / -1` for the net) hold at every tier, and the net still lands under its own
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

**A spread that was never measured reads `not recorded`, never `0`** (contract 32). A unit that read
data without a quote — every row bid = ask — has a null `total_spread_cost`, and the run's
`total_spread_cost` and `avg_spread` are null as soon as one unit's is, since a sum over a part
would read as the whole. `spreadFigure` in `report_format.ts` says so, and the figure's hover gives
the reason; the roster's card does the same per unit.

**Since contract 33 such data pays a MODELLED spread, and it stands beside the measured one.** A
backtest gives each tick without a quote the quote the spread estimated for the previous day
implies; what the fills crossed against it is `modelled_spread_cost` on a trade and a booking period,
`total_modelled_spread_cost` on a unit, a trade group and the aggregated fold — their glossary's
*modelled spread*. Measured and modelled add up to what the fills crossed, and each fill counts in
exactly one of the two. `modelledSpreadFigures` in `report_format.ts` builds the one figure every
place shares, and only where it is not zero: on recorded quotes it is 0, on a period recorded before
the contract null, and a line of either on every run would be noise. The scenario roster's card adds
how much of the scenario's data was priced that way (`modelled_spread` on scenario-details: the ticks
modelled of those without a quote, the median spread given), with the factor, the estimator and the
day digest — what identifies the charge across runs — a hover away.

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
`run_sections_store` and rendered by `runs/OrdersPanel.vue` as a `RecordList` grouped by scenario: the
scenario's pending funnel is the group heading, its order records are the rows. Registered closed by
default: it is evidence, and a reader opens it with a question.

**ONE panel where there were two, and that is the point.** The two routes describe the same orders
from two sides — `pending-orders` what BECAME of a scenario's orders, `order-history` the orders
themselves. The Pending Orders panel could say *527 rejected* and reach not one of the 527, while
the sentence explaining each was already on the wire in a route nothing consumed. The registry lost
an entry rather than gaining one.

**The join is the scenario name, and it holds by CONSTRUCTION.** `pending-orders.units[].name` and
`order-history.orders[].scenario_name` are both written from the same run unit's name
(FiniexTestingIDE, 2026-10-01). One edge, and it is handled: a scenario whose every order was
refused before the queue never enters the pending pipeline, so it has rows and no funnel, and the
heading says so rather than drawing a funnel of zeroes that would claim a measurement nobody made.

A SECOND edge stood here and was wrong — that an AutoTrader run serves no units at all. Measured
2026-10-08: both stored AutoTrader runs carry one, the field study with 46 submitted and 46 timed
in flight. The sentence came from an archive in which no such run had placed an order yet.

**The question nothing else on the page can answer.** Every other section says what the run DID.
Measured 2026-10-01 over 202 units across 20 runs, one unit **resolved 527 orders and filled none of
them** — and every other panel of that run showed a normal-looking result.

**The funnel, in their own words since contract 23.** The heading reads submitted · accepted ·
rejected · never confirmed · expired · avg in flight, and the last three appear only where they are
not zero. The identity is theirs, and it is checked rather than assumed:

```
total_submitted = total_accepted + total_rejected + total_never_confirmed + total_expired
```

**Measured 2026-10-08 over 230 units: it holds on 230 of 230, without exception.** That settles a
question carried here for a week — whether an order RESTING at data end is counted twice. Since the
identity divides every submission over four endings, a resting order is already inside `accepted`: a
subset, never a fifth bucket. Exactly one unit in the archive holds a resting order at all, and
`total_expired` is zero there as everywhere, so the two are disjoint.

**What replaced the old arithmetic, and why it is GONE rather than maintained.** Until contract 22
the heading read resolved · arrived · rejected · timed out · force closed, and `arrived` carried a
tooltip explaining a defect of the backend's own: `total_filled` counted an order that had merely
begun resting, and our `BTCUSD_blocks_02` was their worked example. They fixed it and named the field
`total_accepted`. The paraphrase lost its subject, so it was deleted with it rather than kept out of
attachment — a sentence describing behaviour nobody has any more is worse than no sentence.

`arrived` is right for everything this panel can draw, because `units` is empty on an AutoTrader run
and a session's counter means reported FILLS. The word splits by pipeline the day sessions carry
units. `timed_out` and `force_closed` read zero on every unit measured, so the heading prints them
only when they are not zero.

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

**The orders RESTING at data end are shown in the heading and are NOT added to the funnel.** In a
backtest the simulation records every such order as `expired` in the same step and deliberately
leaves it in the active lists — one order, two views of one instant, and it is already a row below.
It is stated because it is a property of the SCENARIO that no single row carries. In an AutoTrader
session the answer differs: an order left standing at the venue gets no `expired` row.

**The route takes a `symbol` and this app never sends one.** The panel groups by scenario and one
scenario is one symbol, so the parameter would narrow nothing a reader asked for. Before contract 20
it was also unsafe: a rejected row had an empty symbol and the filter silently dropped every
rejection.

### The third level — what an order actually went through

`GET /api/v1/reports/runs/{run_id}/order-events`, narrowed, rendered by `runs/OrderStepList.vue`
inside a row of the Orders panel. Their own sentence for why it exists: *"[order history] keeps a row
for each submission and one for every way an order ENDED. What happened in between is missing
there."* This is that in-between — the venue taking the order, a stop triggering, every cancel asked
for and how it was answered.

**It hangs off the POSITION, not off a row, and that is forced rather than chosen.** An
`order-history` row carries no `seq`, no `submitted_seq` and no `client_order_id`, so nothing on it
says which order it belongs to. Measured on `pos_ethusd_1` of the field study: **three history rows
against two stream orders.** So a reader opens a POSITION, and the ORDERS inside it come from the
stream, which identifies its own.

Confirmed by testingide on 2026-10-08, asked directly: *"the intended granularity for the join is the
position: narrow `/order-events` by (`scenario_name`, `order_id`) and group by `submitted_seq`. Your
position-level expansion is the correct build, not a workaround."* The row-level field is planned in
testingide#557 and ships with a contract raise; clicking ONE history row becomes possible then, and
not before.

**`order_id` must never be the group key.** It is the POSITION and repeats across a position's open
and its closes — one id covers two orders on the field study and four on the capture's partial close.
`submitted_seq` identifies one order, and a `denied` order carries none because it was never
submitted, so null is a VALUE here and gets its own group rather than one group per step.

**Never sorted by time.** `seq` is the order of the stream, and several steps often share one instant
@ a backtest takes and fills a market order at once. The captured response has fewer distinct
`event_time` values than events, which is asserted rather than trusted.

**One request per POSITION, not per run, and the host owns it.** The stream is the largest thing this
API serves here — 1,025 events on one stored run against the four of a position a reader opened — and
the route narrows itself, so one position costs 3 KB where its run costs 138 KB. `use_order_steps.ts`
is the ambient capability, the same `provide`/`inject` channel the position link uses and for the
same reason: a panel that reached for the store would stop being renderable from a different host.
`run_reports_store.ts` keeps the answers per position and refuses a second request for one it already
has — the panel asks on every opening and does not check first, because what is held is the store's
knowledge and a second copy of that check is a second place to get it wrong.

**The gate is `stream_files`, not `artifacts`.** The stream is not a report artifact and appears in no
run's artifact list; the backend names it on the run index row instead. Measured 2026-10-08: 51 of 52
runs carry `["order_events.jsonl"]` there and one carries `[]`. Without the gate the panel would
offer a disclosure that can only ever answer 404.

**`broker_truth` is deliberately not here.** A narrowed answer carries none, and their document says
why: those lines are the venue's whole account at a moment, *"never a step of one order."* They are
the subject of a venue-account panel, which is its own undertaking.

**Its own component rather than a second list in the panel, and the reason is an instrument.**
`scripts/check_terms.py` pairs ONE `ListColumn` array per file against that file's row template,
positionally, and drops the pairing where the two disagree. A second array beside the first silently
cost the Orders panel's eight labels their field mapping — measured 2026-10-08, `Lots` fell back to
the trade history's reading and the check reported it as moved. One column array per file is a
property the check depends on.

### The way between an order and its trade

A reader on `pos_gbpusd_1 · close · executed` can reach the trades that position produced, and a
reader on a trade can reach its orders — including a refusal on the way. The position id leads the
row in BOTH lists, as a link, so the two read as two views of one thing.

**The join is `(scenario_name, position_id)` and it is DECLARED**, not worked out here:
FiniexTestingIDE, 2026-10-02 — *"an executed order-history row's `(scenario_name, position_id)`
names the same position as a trade-history row's, by construction"*. **Never the position id
alone:** every scenario counts from `pos_<symbol>_1`, so two scenarios of one symbol both have a
`pos_gbpusd_1`. Both halves travel together everywhere — in the stored mark, in the comparison, in the test.

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
writing the mark into a context would tie a panel to one link. The app root provides the
channel (`use_run_report_channels`, the jump itself in `use_panel_jump`) and the panels only read
the mark and ask for the jump. The jump searches the run bundle for the marked row, never the whole
document. The channel carries three things:

| | |
|---|---|
| `marked` | the position on show — the run's `position` in its link's context |
| `jumpTo(panelId, ref)` | `mark` it · `show` the panel · `setOpen` it · scroll to the marked row |
| `canJumpTo(panelId)` | does that panel have a model at all — the HOST's knowledge, read from the same `sources` record `PanelColumn` is handed (`run_sections_store`) |

**A new run drops the mark; a restore keeps it.** A position id is a counter per unit —
`pos_eurgbp_1` exists in every run that traded EURGBP — so a mark carried into the next run marks a
DIFFERENT position under the same name. `selectRun` therefore clears `position` and the units in
the same action that sets the new run, and the roster's narrowing is scoped to its run
(`use_facet_state`); a selection RESTORED with a mark keeps it, because a restore is not a new
run. The scroll is looked for
inside the run view's own root rather than the whole document, so a second copy of a panel can
never answer first. Both fixed 2026-10-12: until then the mark of one run survived into the next.

**The mark is stored and the SCROLL is not.** A reload puts the reader back on the same position,
and a page that jumps on every reload is a page that moved while nobody was looking. The scroll
waits one tick for drawn rows to take the mark, then watches the view until the marked row appears
— a panel the jump had to open is not drawn yet — and gives up after two seconds rather than
scrolling to nothing: a target beyond the trade list's visible cap, or inside a group it folded, is
a row that is not there. A fixed number of ticks failed twice — two until 2026-10-12, shorter than
the URL write the mark then waited for, and one on 2026-10-13, once the mark no longer rode in the
URL. Nobody saw the first: Trade History stands above Orders, and the trades of
the first order are on screen without a scroll. Only a jump from far down the orders needs one.

**Three absences draw no link at all**, which is the difference between a jump and a dead end: a
position that produced no trade (55 measured), a run that serves no trade history (10 measured), and
a panel this run has no model for. The position id is still printed in all three — it is data, part
of the trade's own declared key.

### Run Header — which artifact am I looking at, and which code made it

The one section that answers for a run carrying **no report artifacts at all**, and since contract
26 that is true of the route as well: measured 2026-10-10 on all three logs-only runs in the
archive, `/reports/runs/{id}/header` answers 200 while `artifacts` is empty. It is therefore loaded
UNGATED, the way the configuration is — `header` is not in a run's artifact list, so gating on it
would ask for nothing and show nothing.

**Two models, and neither replaces the other.** The index ROW is always there; the served HEADER
carries the two things the row cannot. Composed in `run_sections_store` as `{ info, served }`, the same shape
the Orders panel uses, because the panel contract takes one model and a second source would have
had to rebuild it.

```
info     always      identity, membership, version, configuration file
served   may be null who started the run, and WHICH CODE RAN
```

**The second is the point.** `code_identity` names every repository the run recorded — its commit,
its branch, whether the tree was dirty and whether the code can be put back exactly — and every
decision logic and worker with its version and the file it came from. A reader who finds a result
surprising can now ask *was this even reproducible* and get an answer.

**One number in it is a trap, and the mirror says so in both places.** `changes` is a SAMPLE and
`uncommitted_count` is the count: measured on the fixture run, 20 entries served against 118.
Rendering the list's length as the count would understate it by eighty-eight and nothing on screen
would say so, which is why `api_contract.test.ts` asserts `uncommitted_count > changes.length`
rather than the component asserting it.

**Every label here is THEIRS**, taken from the `run-header` document as they instructed: *"Use it
as written — do not coin another: the label is how a reader finds the term in these documents."*
That is also why the run list's `Run type` became `Pipeline` in the same change — one field, one
word, and ours sat beside a `Purpose` facet it could not be told apart from.

What the panel does NOT print: a clean tree states nothing beyond its commit, and `allow_dirty`
appears only when it is true, in the warning role with its glyph and its word. It says real orders
were explicitly allowed from code that was not committed, which is a thing to weigh before
trusting the figures beside it.

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
Their `docs/broker_config_guide.md` marks `margin_mode`, `margin_call_level` and `stopout_level` as
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

**A scenario names itself under either of two spellings, and both are permanent.** Contract 12
(2026-09-28) renamed the scenario's identity inside the configuration document from `name` to
`scenario_name`, and the backend states that a run recorded before it *"keeps the snapshot it
recorded"* — unlike the booking-period rename of that same version, which WAS migrated into the
stored runs and is called *"the one rename here that reaches back"*. The archive therefore holds
both for good: measured over all 48 stored runs, `scenario_name` on 363 of 420 scenario objects and
`name` on the other 57, never both and never neither. Reading both is mirroring an artifact's own
values rather than a compatibility layer, because the response SHAPE is one and the difference lives
inside the opaque document it carries. Where neither is present the name reads as ABSENT — the
override list used to fall back to the drawing position and printed `#10` where the document said
`EURGBP_balanced_10`, an invented counter of exactly the kind the deployment session index taught
this project not to render.

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

### The run chart — one unit of a run on its candles

The chart beside the run (viewer#31, the item #21 left open): one unit of the chosen run on its
candles, its trades marked where they opened and closed. A panel of the kind `run-chart` in the
area *Runs*, part of the first arrangement beside the run report (see *Docked Panels*), so a trade
in the list and its candle are one glance apart; hidden, it comes back from the Panels menu, and
the chart mark on a trade or an order brings it to the front on that position. With no run chosen
it says so and draws nothing.

```
[☰ Runs][▤ Run · 20261012_205715]          │ [◫ Run chart · EURGBP_refus…]   EURGBP_refusals_01 ▾ · M1 ▾
  Trade History                             │   ▲ entry: up below the bar (long), down above it (short)
  pos_eurgbp_1 ↗ ◫  long  +0.68 EUR ──────► │   ● exit: on the other side, + or − as a word,
                                            │     the colour its polarity
```

- **`src/stores/run_chart_store.ts`** holds the chart's unit, timeframe, bars and marks. It asks the
  archive only while a run chart is on show (`attach` / `detach` from the view): the units are read
  off what the run report already loaded, so a reader who never opens the panel pays nothing.
- **`src/components/runs/run_chart.ts`** — the pure half: `chartUnits`, `defaultUnit`,
  `autoTimeframe`, `barOf`, `tradeMarks`, `focusTime`.
- **The units come from what the run states.** A backtest names each unit's market in
  `scenario-details` (`symbol`, `data_broker_type`) and the span its ticks covered
  (`first_tick_time` … `last_tick_time`) — that span is drawn rather than the declared window, which
  a unit can run past. A session names one market for the run in its configuration
  (`broker_type`, `symbol`, an untyped record read at runtime) and only the start of its window
  (`data_windows`): it is drawn to the end of the coverage. A unit that processed no tick, or
  whose market nothing names, stays in the list, disabled, with the reason.
- **The unit is the scenario in focus** (operator, 2026-10-16) — one focus for the lists and the
  chart. A unit chosen in the chart's quick bar puts it in focus for every panel, and the focus
  cleared leaves the chart where it was. With no focus the chart shows its own choice, kept per run
  in the arrangement (`runChart`) and made by the chart mark on a trade or an order, else the first
  unit with trades. The chart mark moves a focus that stands on another unit, and sets none where
  there was none — the lists keep showing the whole run.
- **The timeframe is the finest the archive renders for the market that draws the window in at
  most 2,000 bars** — an hour of a backtest in M1, a session of weeks in hours — unless the reader
  chose one. The coverage lists its timeframes alphabetically, so they are ordered by the lengths
  `/timeframes` states.
- **The bars are asked from one period BEFORE the window.** The route answers the bars that open in
  the range, and the bar the first tick fell in opened before it — measured 2026-10-15:
  `from=05:00:00.274` answered from the 05:01 bar, and the trade at 05:00:40 had no candle. The
  length only widens the ask; a mark stands on a bar SERVED, the last one that opened at or before
  the event, never on one computed from a period's length — a trading day or a week does not start
  on a multiple of its length, and lightweight-charts snaps a mark between bars onto the next one.
- **What it centres on is the link's marked position.** The chart mark on a row marks the position
  (`context.mark`), sets the chart's unit and opens the panel (`use_chart_link.ts`, provided at
  the root beside the other channels) — so the row in the list and the marks on the candles agree
  on what is being looked at, and that position's marks are drawn larger. A long window is centred
  on where the position opened; a short one is shown whole.
- **Every state says what it is**: no run, the run's units on their way, no unit that can be drawn,
  a market the archive holds nothing for, a window without bars, and a notice where the route cut
  the window — an empty chart says nothing about why it is empty.

### Chart Engine — Lightweight Charts (TradingView)

[Lightweight Charts](https://github.com/tradingview/lightweight-charts) is a purpose-built OHLCV charting library: small bundle, good performance, minimal API surface. It handles candle rendering, time axis, crosshair, and resize natively.

**Alternatives considered:**
- **ECharts** — general-purpose, heavier, more configuration overhead for financial data.
- **Recharts / Chart.js** — not optimised for candlestick OHLCV; significant custom work needed.
- **Custom WebGL/Canvas** — full control but months of work with no financial primitives.

Lightweight Charts becomes limiting if we need complex multi-pane indicator layouts or a professional trading UI. For v0.1–v0.2 scope (read-only candle display), it is the right choice.

**The chart is built at its first REAL size, and a collapse to nothing is ignored** (`CandleChart.vue`).
A container of 0×0 is a panel not yet laid out or not in view; a chart created or fitted at that
size keeps a collapsed time scale, and resized to it, loses its place. So nothing is drawn until
the container has a size, bars that arrived earlier are handed over and fitted when it does, and a
later 0×0 leaves the chart as it was until the next real size.

**The chart paints with the theme tokens, and repaints when the theme changes** (`CandleChart.vue`).
Every other surface follows a theme switch on its own — `App.vue` sets `data-theme` on the document
and the tokens follow — but a canvas is painted with values. So the chart reads `--color-bg-base`,
`--color-text-secondary` and `--color-border` for its surface, text and rules, `--color-accent` for
the crosshair's lines (interactive focus) and `--color-positive` / `--color-negative` for the
candles (a candle's direction is a polarity), and a `MutationObserver` on `data-theme` repaints it
without building it again. The run chart's marks are painted the same way: an entry in
`--color-text-primary`, an exit in the polarity of its result and `--color-text-secondary` where
it is flat — the shape and the sign carry the meaning, the colour only reinforces it. Until 2026-10-12 the colours were written into the component as the
dark theme's values, so the light theme showed a dark chart; the dark theme is pixel-identical to
before, measured on the canvas. The crosshair's two axis labels keep the library's own dark label
(`#131722`, its text chosen for contrast) in both themes, deliberately: it reads on both surfaces,
and it is how TradingView draws it.

**Everything drawn says what it is, at the pointer — through ONE register** (`CandleChart.vue`).
The library reports the id of the thing under the pointer as `hoveredObjectId`, for a marker (its
`id`) and for a series primitive (the `externalId` its `hitTest` answers) alike. The chart keeps a
register of id → `FigureCard` and shows the card of whatever is under the pointer in a `ChartCard`:
placed from the pointer, on the side with more room, inside the chart's frame, and taking no pointer
events so the chart keeps them. The trade marks are the register's first source — an exit's id is
its trade row's declared key, an entry's is the position's, and their cards come from
`runs/trade_card.ts`, the same builder as the card beside a row in the trade list, so the two cannot
come to say a trade differently. The algo's drawings (testingide#379) are planned as primitives, and
a primitive brings its id and its card to the same register; nothing else changes.
Measured in the browser on 2026-10-16: the library reported `exit|EURGBP_refusals_01|pos_eurgbp_1|379`
under the pointer and the card showed that trade. That half has no spec: the marks are paint on a
canvas, the library ignores synthetic pointer events, and finding a mark with real ones costs 36 ms a
step over the whole pane. Re-check it by hand when the library is upgraded — version 5 moves the
markers into a plugin.

The card's look is the app's, not one component's: `src/styles/card.css` holds it, and
`base/FigureCardBody.vue` says what a card says — its heading and its pairs, each pair carrying its
caveat — for `HoverCard` beside an element and `ChartCard` on a chart alike.

### Testing Strategy

Unit tests: **Vitest** + **Vue Test Utils**. Vitest runs in the same Vite context as the app — zero extra configuration. Vue Test Utils mounts components and stores in isolation. CI runs on every push and pull request via GitHub Actions.

Priority targets: `selection_store` cascade logic, `timeframe_store` load-once cache and `minutesFor` lookup, `bars_store` coverage validation and window calculation, `context_store` cascades and `arrangement_store` reconciliation, `api_client` request construction. See issue #13.

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
