# Browser Tests

Some properties exist only in a real browser: a reload from real storage, real layout, a grid nested inside another grid. Read this document before you add or change a spec in `e2e/`, or when one fails.

**Playwright, for the layer jsdom can only approximate** (viewer#23). The unit suite proves a
component does what it was written to do; it cannot prove that a real reload in a real browser
puts the reader back where they were. Specs live in `e2e/`, run with
`npm run test:e2e`, and are **hygiene rather than a gate** — browser tests are slow and flaky under
load, and a gate that is red on Monday morning gets switched off, taking the type-check beside it
out of use.

Two properties are deliberate. `retries: 0`, because a test that goes green on the third attempt
is flaky and we would never see it. And **the mocked responses come from the unit fixtures**
(`e2e/api_mock.ts` reads the same captures), never hand-written in a spec: a second mirror of the
HTTP contract goes stale in silence, which has already happened once here. For the same reason a spec
DERIVES what it needs from the capture rather than transcribing it: `api_mock.ts` exports
`FIXTURE_RUN` and `FIXTURE_DEPLOYMENT`, and keeps the family key it derives to itself — the last being the family line the run
list now folds the fixture run behind, with `revealFixtureRun(page)` to open it. A spec that
CLICKS a run calls that first; one that opens on a stored run does not.

**The selection is not in the URL, so a spec that needs a run open STORES it.**
`openWith(page, path, seed)` in `e2e/arrangement_seed.ts` writes `arrangement.v1` before the app
boots — ONCE per tab, guarded in `sessionStorage`, because a reload must find what the page stored
meanwhile rather than the seed again. `storedLink` and `storedBar` read back what the app stored,
which is what a spec asserts where it used to read the address bar. There are no routes: every spec
opens `/`, where Runs is the tab in front, and `showPanel(page, title)` brings another panel forward
by its tab, the way a reader does.

**What each spec proves** is in the [Browser Test Catalogue](browser_test_catalogue.md), one entry per spec: read it before adding a case, and keep its entry current in the same change.

**`readme_pictures.spec.ts` takes the README's pictures**, so they stay current (operator,
2026-10-29): at every release, and whenever a view they show changes visibly. Against the LIVE API
and from runs the backend's fixture catalogue keeps, in ONE arrangement — `readme_arrangement.json`,
three columns with every bundle closed and its members standing apart — laid out 1920 wide in its
own proportions, the dark theme: the whole window once, then the dock group a
highlight is about. Nothing private reaches a picture: the lists are narrowed to public runs, and
`PICTURES_HIDE`, a comma list of words given at the call and never written into the repository,
fails the run wherever one of them stands in the window's text. The session's picture fails the
same way unless it shows the frame the spec stepped to. Like the performance spec, an
ordinary run leaves it out:
`PICTURES=1 PICTURES_HIDE=<words> bash scripts/e2e.sh e2e/readme_pictures.spec.ts --workers=1`.

**`e2e/order_steps.spec.ts` says why a browser spec earns its place.** The
nested step list is a grid INSIDE a row of another grid, which is the arrangement behind two of the
overflow defects this project has shipped, and no jsdom assertion can see it. The capture is
NARROWED to one position the way the route is, so the mock answers for that one and an empty stream
for every other — and the spec narrows the list by the app's own `unit` param first, because
`pos_eurgbp_1` belongs to four scenarios here and the first row carrying it is in a different one.

**The browser is not in the container.** The image is Alpine on musl and Playwright's browsers are
glibc builds, so the runner connects over CDP to a browser on the developer's machine —
`e2e/cdp_fixture.ts` documents the one command that needs. `.npmrc` carries
`playwright_skip_browser_download=1` so a rebuild never spends a gigabyte on a Chromium that
cannot start. CI is a separate answer (a compose service on the official image) and shares the
same config.

**A geometry assertion used by more than one spec lives in `e2e/list_geometry.ts`, and it is shared
because it drifted.** `expectHeadingsReadable` was copied into two specs. When a column first
declared a `hint`, one copy was relaxed from *the title equals the label* to *the title begins with
it* and the other was not — and the stale copy failed months later, the moment a second column
declared one. The fix had to be made twice, which is the signal: one assertion, one home. The
chart's panes, read off the rows of the library's table, live in `e2e/pane_rows.ts` for the same
reason: three specs find the pane of the candles.
