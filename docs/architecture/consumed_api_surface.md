# Consumed API Surface

The HTTP contract is the only coupling between this viewer and FiniexTestingIDE, and this document lists what the viewer takes from it. Read it before you add a function to `src/api/api_client.ts` or a type to `src/types/api/`, and whenever a new contract version changes what a route returns.

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

## Canonical section order

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
