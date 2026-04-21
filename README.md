# FiniexViewer

> **Version:** 0.1.0 (Alpha — Pre-Release)
> **Status:** Initial scaffold. No runnable code yet — see issues for the build-out plan.

A web-based viewer companion for **[FiniexTestingIDE](https://github.com/dc-deal/FiniexTestingIDE)**.

The initial scope is intentionally narrow: a read-only candle chart that loads historical tick and bar data from a running FiniexTestingIDE API server. It is the first concrete step toward the UX layer planned on the FiniexTestingIDE long-term roadmap.

---

## What This Is

- A **separate repository** that talks to FiniexTestingIDE over HTTP.
- A **Vue 3 + TypeScript + Pinia + Vite** single-page application.
- A **candle viewer** — pick a broker, a symbol, a timeframe, a date range, look at the chart.

## What This Is Not (Yet)

- Not a trade execution UI.
- Not a strategy runner — no live simulation control from the viewer.
- No authentication, no user accounts, no personal workspace.
- Not a replacement for the FiniexTestingIDE CLI — the CLI remains the primary interface for data management, scenario execution, and test runs.

## Relationship to FiniexTestingIDE

FiniexViewer consumes the REST API provided by FiniexTestingIDE (introduced in parallel under the `api/` module of the main repo). Without a running FiniexTestingIDE API server, the viewer has nothing to display.

```
┌─────────────────────────┐        HTTP / REST        ┌──────────────────────────┐
│     FiniexViewer        │ ◄───────────────────────► │   FiniexTestingIDE       │
│  (Vue 3, TypeScript)    │     /api/v1/brokers/...    │   (Python, FastAPI)      │
│                         │                            │                          │
│  - Broker/Symbol picker │                            │  - Parquet tick reader   │
│  - Date range filter    │                            │  - Bar index manager     │
│  - Lightweight Charts   │                            │  - Scenario engine       │
└─────────────────────────┘                            └──────────────────────────┘
```

Details on the two-container setup, dev phases, and request flow: see [docs/frontend_architecture.md](docs/frontend_architecture.md).

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Build tool | **Vite** | Fast dev server, minimal config |
| Framework | **Vue 3** (Composition API, `<script setup>`) | Modern, small footprint |
| Language | **TypeScript** | Type-safe API contracts |
| State | **Pinia** | Standard Vue 3 state management |
| Routing | **Vue Router** | Standard SPA routing |
| Charts | **Lightweight Charts** (TradingView) | Purpose-built for financial candles |
| HTTP client | **axios** (or native `fetch`) | Decided in #2 |

## Status & Roadmap

See the issue tracker. The v0.1 milestone is broken into five work items:

| # | Issue | Purpose |
|---|---|---|
| 1 | Vision & Roadmap | Long-term direction and non-goals |
| 2 | Project Foundation & API Client | Scaffold, Pinia stores, first API call |
| 3 | UI Shell & Selectors | Layout, navigation, broker/symbol pickers |
| 4 | Candle Viewer | Chart integration, date range, timeframe selector |
| 5 | Public Polish | README screenshots, dev setup, cleanup |

See [HANDOFF_INITIAL_SETUP.md](HANDOFF_INITIAL_SETUP.md) for architectural context before starting work.

## Development (Planned)

Once scaffolded (see issue #2), the standard commands will apply:

```bash
npm install
npm run dev      # start dev server
npm run build    # production build
npm run type-check
```

The dev server expects the FiniexTestingIDE API server to be running locally on its configured port. API base URL is read from `.env.local`.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This is a pre-release alpha project under active development. Features, APIs, and architecture may change without notice. It is provided as-is for research and educational purposes. Nothing in this project constitutes financial advice.
