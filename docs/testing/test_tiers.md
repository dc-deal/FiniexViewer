# Test Tiers and Quality Gates

This document is the overview of how a change is verified in this repository. Read it first when you check a change, and before you start a long command inside the container: it says what each tier proves, which commands gate CI, and what none of them can show.

## Testing Strategy

Unit tests: **Vitest** + **Vue Test Utils**. Vitest runs in the same Vite context as the app — zero extra configuration. Vue Test Utils mounts components and stores in isolation. CI runs on every push and pull request via GitHub Actions.

Priority targets: `selection_store` cascade logic, `timeframe_store` load-once cache and `minutesFor` lookup, `bars_store` coverage validation and window calculation, `context_store` cascades and `arrangement_store` reconciliation, `api_client` request construction. See issue #13.

Browser-level verification is Playwright (viewer#23), in `e2e/`, run with `npm run test:e2e` and kept as hygiene rather than a gate. It needs no API server — the responses are replayed from the unit fixtures — and no browser in the container, which is Alpine on musl: the runner drives a browser on the developer's machine over CDP. See [Browser Tests](browser_tests.md).

## Quality Tooling — two tiers

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
**A long run inside the container gets a DEADLINE, and `scripts/run.sh` is how.** A `docker exec`
that times out is not stopped — only the host side of it is: the process inside keeps its CPU and
its heap, and nothing reports that it is still there. That is how the container reached 27.28 GB at
1300 % CPU on 2026-09-29 and starved the Docker API into answering 500, with a `knip` call
abandoned at a 300 s timeout still running an hour later. The script puts the deadline INSIDE
(`timeout -k 10 N`), and a trap kills whatever the deadline left, the same way `e2e.sh` kills the
browser:

```bash
bash scripts/run.sh test        # the unit suite, 420 s
bash scripts/run.sh lint        # 300 s
bash scripts/run.sh build       # 600 s
bash scripts/run.sh knip        # 600 s
bash scripts/run.sh -- <cmd>    # anything, at the default deadline
```

A deadline reads as exit **143**, not as a failing test — BusyBox `timeout` lets the signal kill the
child rather than returning GNU's 124. The script says so in words and then prints the container's
largest and oldest processes, because `etime` is the column that names an orphan.

Two traps it was built around, both measured 2026-10-10 and both self-inflicted: a matcher whose
own command line contains the word it searches for finds ITSELF (`pkill -f vitest` killed its own
parent), and a ZOMBIE answers a `pkill` with success although nothing happens — the container has
no init to reap, so it carried 33 of them and the trap announced a cleanup after every single run.
Every pattern therefore carries a bracket, and the probe ignores anything in state `Z`.

## A fourth tier, and it is a PERSON: the smoke protocol

The three tiers above — type-check, unit suite, browser suite — say whether the code does what it
was written to do. None of them says whether the app SHOWS the right thing on a run nobody wrote a
test for.

The fourth tier is an operator-requested sweep over the viewer's surface: every situation the app
must be able to show, walked against real stored runs, one after another. It is not a gate and not
automated; its instrument is a browser and a deliberate look. Two scripts support it:

- **`scripts/classify_runs.py`** asks the API which situation each stored run actually produces —
  several brokers, a failed grade, logs only, shared fills, a very long market span. A case no
  stored run produces any more is recorded UNCOVERED rather than dropped, because an uncovered case
  is the one that breaks unseen. Measured 2026-09-30 over 46 runs, three cases are uncovered: two
  account currencies in one run, a unit ERROR, and a scenario with two portfolio rows.
- **`scripts/capture_fixtures.py`** re-cuts the fixtures from their source runs. The
  contract moved through seven versions in five days and each time the mirror, the fixtures and
  `EXPECTED_CONTRACT` move together, because the mirror follows one contract and never two — by
  hand that is where one capture gets forgotten.
  **The sources are pinned by id, and what QUALIFIES each one stands beside it as code rather than
  as prose.** An id points at something this project allows to vanish: runs are regenerated, and a
  breaking change takes the ledger and the whole run history with it. So a pin is never substituted
  silently — that is exactly what would make a fixture diff say nothing — but a pin that is GONE
  stops the capture and prints the stored runs satisfying the same requirements, each with its
  measured figures, so replacing it is a one-line edit. Where NONE does, the archive genuinely
  cannot answer, and the request to FiniexTestingIDE is printed ready to send, one line per
  requirement with what depends on it. The capture is also all-or-nothing: one target that does not
  answer leaves every fixture untouched, because two refreshed files beside fourteen stale ones read
  as a whole capture and are worse than none. Afterwards it names any measured property that MOVED,
  because a spec that transcribes one — the position spread in `position_link.spec.ts` is the only
  one today — then needs the new number.
- **`scripts/check_terms.py`** is the one instrument for the thing nothing else verifies: the WORD on
  a label. The type-checker proves a field exists and the suite proves a figure is drawn; neither has
  an opinion about what it is called. It joins every `label: t('…')` in `src/` to the field it
  renders — adjacent in a figure block, and in a list panel by zipping the headings to the
  `:data-rank` cells, with the rank both sides already declare as the check — then compares that
  against `scripts/term_register.json`, which is tracked so the baseline is reviewable and holds one
  entry per line so a changed word is a one-line diff. **The register carries the MAPPING and never
  the MEANING:** which field a label renders, and the name of the document that defines it. What the
  field means is fetched from the backend when it is wanted, because a stored copy of someone else's
  glossary is wrong the day they reword it with nothing saying so. It prints nothing when everything
  agrees, and otherwise
  names a label the register does not know, a label whose field moved, a field gone from the
  backend's consumer documentation, or one of its console labels that changed. **It finds change, not
  wrongness:** that a column head reads badly is a judgement, recorded once in the register's `note`
  column and preserved across a regeneration, because no comparison can surface something that never
  moves. Measured 2026-10-07: a renamed field reached the screen as `undefined` and a person found it
  days later — this is one line of output instead.

The protocol itself, its freshness check and its case catalogue are internal and live outside
`docs/`, because they name run ids on this machine and change with the archive rather than with the
code.
