# Contributing to FiniexViewer

Thank you for your interest. FiniexViewer is the frontend of
[FiniexTestingIDE](https://github.com/dc-deal/FiniexTestingIDE): it shows what the IDE's HTTP API
serves and arranges what the reader chooses. This page says how a change is made here — what it
carries, which checks it passes, and what its screens are built from.

## Before you start

- **Setup and commands** are in the [README](README.md). If you work in the dev container, install
  and run inside it: the project folder is shared with the host, and an install on the host replaces
  the container's native builds.
- **Open an issue first** for anything beyond a small fix, so the approach is agreed before code is
  written.
- **The HTTP contract is the only coupling to FiniexTestingIDE.** A new field or route is made there
  first; this repository never invents or stubs an endpoint. And it renders what the API states — a
  figure the API does not serve is a request to FiniexTestingIDE, not a calculation here.

## What a change carries

- **Its tests, in the same change.** A new store, composable, API function or component brings its
  unit test (Vitest, `tests/**/*.test.ts`). What only a browser can show — a real reload, real
  storage, real geometry — goes into `e2e/` (Playwright).
- **Its documentation, in the same change.** A new view, store, composable or consumed route
  reaches `docs/`; the [documentation index](docs/documentation_index.md) names every document in
  one line.
- **Every user-facing string through `t()`** (`src/translate.ts`), in sentence case.
- **Types throughout** — `any` only with a reason; shared types in `src/types/`, API shapes in
  `src/types/api/`.
- **The code's own conventions** — single quotes, imports grouped from external to `@/`, early
  exits, UTC everywhere with the conversion only where it is displayed. `npm run lint` applies most
  of them.

## The checks

| Check | Command | Expected |
|---|---|---|
| Types | `npm run type-check` | clean — a CI gate |
| Unit tests | `npm run test` | the full suite green — a CI gate |
| Lint | `npm run lint:check` | clean, or the remaining findings named in the pull request |
| Dead code | `npm run knip` | clean |
| Browser | `bash scripts/e2e.sh` | green, where the change touches what a browser shows |

State the unit test count before and after: a change that removes tests leaves a green suite,
because the tests are gone rather than failing.

## The screens are built from the app's own building blocks

Every view is drawn from the building blocks in [UI Building Blocks](docs/interface/ui_building_blocks.md)
and from nothing else: a button is an `AppButton`, an on/off is an `AppSwitch`, a list is a
`RecordList` under a `FacetBar`. Where none fits, look for a variant of the closest one first. Where
none does either, propose the new building block in the issue before building it — then build it in
`src/components/base/` with its unit test, its line in the map and its paragraph in the
[style guide](docs/interface/theme_buttons_and_icons.md), in the same change.

What the style guide explains, and a review looks at first:
- a control looks like a control, with its four states, each on two channels;
- a status colour never travels alone — form first, then the word, then the colour;
- a change of state, or a selection, never moves the layout;
- a new control comes with a `HintLine` that says what it does.

## Commits and pull requests

- **One commit per finished topic** — a feature with its tests and docs, or one round of fixes of
  one kind. A behaviour change and a rename go in separate commits.
- **The message** says what changed in its subject and why in its body.
- **A pull request** targets `master`. Its description says what changed for the reader, then every
  check with its count. `resolves #N` stands only for an issue the pull request completes.

## License

By contributing you agree that your contribution is licensed under the project's
[MIT License](LICENSE).
