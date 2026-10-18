# Container Topology and the Dev Proxy

This document explains how FiniexViewer runs beside the FiniexTestingIDE backend during development, and the path a request takes from the browser to the API. Read it when you set up the project, when a call fails before it reaches the backend, or before you change the compose setup, `vite.config.ts` or the way the dev proxy attaches the API token.

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
- Every document of the viewer, with a line on what each answers: [the documentation index](../documentation_index.md).

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
