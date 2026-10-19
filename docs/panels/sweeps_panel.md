# Sweeps Panel

A sweep runs one strategy over many parameter combinations and ranks them by an objective it
declares. The Sweeps panel shows every sweep on record and, for the one chosen, its combinations in
the order the backend ranked them — the question a sweep asks is which combination won, and a single
run is the second step, reached from the ranking. Read this before you change `SweepsView.vue`,
`components/sweeps/` or `sweeps_store.ts`.

## Where it comes from

FiniexTestingIDE's sweep plane, on its own grant surface `sweeps` (their `sweeps` document):

```
GET /api/v1/sweeps                 one row per sweep, newest first        key ["sweep_id"]
GET /api/v1/sweeps/{sweep_id}      its combinations, ranked               key ["run_id", "currency"]
```

**A sweep is not a run.** It has no report of its own; its combinations are runs whose index row
names it (`parent_kind: "sweep"`), and a combination's `run_id` is the way into the report routes.
The run list already folds those runs under their sweep; this panel adds what the list cannot say —
what the search was, and which combination won.

## The order is the answer

The route ranks each sweep's combinations itself, **within each account currency**, by the objective
and direction the sweep declared — or, where it declared neither, by the one it names in its own
`objective` and `maximize` instead. Nothing here re-sorts or re-ranks:

- the rows stand in the served order, numbered; the first of each currency carries ★ — a position,
  not a figure — and so does every row that ties it on the objective: a tie has no single winner
  (measured 2026-10-19, all four combinations of `sweep_20261008_223212` read `net_pnl` 0.0);
- the objective's column is marked in its heading (`Expectancy ▼`, highest first) and printed in
  weight, formatted as the executive summary formats the same field;
- two currencies are two rankings, each under its own heading and each starting at 1;
- a line above says what the ranking was ordered by, and whose objective it was.

**Error combinations never rank**, so the route leaves them out while the sweep's own `error_count`
still counts them — said in a notice where it is not zero.

## What makes a ranking comparable

Their document: *"A ranking is comparable only where the things ranked are."* The panel says so only
where it is not — **where everything is alike, nothing is printed**:

- combinations that differ in `logic_version`, `decision_version`, `git_commit` or `profile_hash`
  (equality of served values, nothing more) — the ranking compares measures that may have changed
  underneath;
- combinations whose records were pruned (`records_pruned_at`) — their figures can no longer be
  checked;
- error combinations, as above.

**Expectancy is a mean R, and the R count stands beside it.** Measured 2026-10-19: `r_multiple` is
computed against the stop of the trade row, so a stop trailed to break-even gave one partial close
308.9 R, and the first combination of `sweep_20261012_210055` read expectancy +11.07 on a net P&L
of −93.99. Asked of FiniexTestingIDE; until it is answered the ranking is shown as served, with the
net P&L and the count of R-defined trades beside the objective — their own advice: *"a small count
beside a striking expectancy is the thing to show your reader"*.

## The panel

One panel, built the way the deployments are: a facet bar over the list of sweeps (strategy, set,
symbol, objective; newest or most runs), folded to one line once a sweep is chosen — *Sweep
sweep_… · strategy · combinations · started* and *Change sweep* — so the ranking below has the room.

```
 Sweep  sweep_20261012_210055  CORE/trend_channel_reference 1.4.0 · 9 combinations · …   Change sweep
 Ranked by Expectancy, highest first — the sweep's own objective
 #     Parameters                 Expectancy ▼   Net P&L      Trades  R trades  Win rate  PF    Max DD  Run
 1 ★   sl_mult 0.8 · tp_mult 1.5      +11.07R    -93.99 USD     31       31      19.4%   0.21   …      2026…
```

- **Parameters** by the last part of their configuration key, the whole key on the title and in the
  card. The card carries every figure a combination is judged on and the fields that make it
  comparable: the code, its logic version, the parameter and settings fingerprints, how many
  candidates it was selected from.
- **A click on a combination opens its run** in the run bundle (`openRun`, a `command`), and the row
  of the run open there is marked.
- **The run header's *Combination in sweep* opens the sweep** — `openSweep` in the open channel
  chooses it and brings this panel to the front.
- The sweep chosen is the link's `sweep` key, stored with the arrangement; a link stored before the
  key existed reads as none chosen.

## Not yet

- **A jump from an activity to its run** (moved here from viewer#49): whether a running backtest's
  run already stands in the run index is not measured yet; it is measured on a running sweep.
- **Parameter importance and an interaction heatmap** — the later half of viewer#32, sourced from
  FiniexTestingIDE's own analyses.
- **A row cap.** The ranking draws every combination: 500 of them stood in 671 ms against the
  preview bundle (2026-10-19, the machine under intermittent load), so none is needed at that size.

## How it is tested

- `sweeps_store.test.ts` — the list and the ranking as served, the link, a stale id, a refused
  surface.
- `sweeps_view.test.ts` — the list folding on a pick, the ranking in the served order with ★ on its
  first, the objective's column and the R count, parameters by their last key, two currencies apart,
  an undeclared objective, the notices only where the ranking compares unlike, a row opening its run.
- `run_panels.test.ts` — the run header's sweep opening the sweep.
- `e2e/sweeps.spec.ts` — the panel from the Panels menu, a pick, the ranking, a combination opening
  its run in the run bundle.
