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
- the *Objective* column prints each sweep's own objective, in weight, formatted as the executive
  summary formats the same field; the sweep's heading names it (`expectancy ↑`), and its title
  says whose objective it was;
- two currencies are two rankings under one heading, each numbered from 1.

**Error combinations never rank**, so the route leaves them out while the sweep's own `error_count`
still counts them — said on the sweep's heading where it is not zero.

## What makes a ranking comparable

Their document: *"A ranking is comparable only where the things ranked are."* The panel says so only
where it is not — a ⚠ word on the sweep's heading, its sentence on hover; **where everything is alike,
nothing is printed**:

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

One list, folded the way the run list folds a family (`RecordList` with groups): a facet bar over
the sweeps (strategy, set, symbol, objective; newest or most runs), each sweep a heading that opens,
and beneath an open one its combinations. No list above and no ranking below — the panel never
splits, and several sweeps can stand open at once, to be compared.

```
 #     Parameters                 Objective   Net P&L      Trades  R trades  Win rate  PF    Run
 ▾ sweep_20261012_210055  CORE/trend_channel_reference 1.4.0 · 9 runs · expectancy ↑ · Oct 12, 21:01  ⚠ 2 with errors
   1 ★ sl_mult 0.8 · tp_mult 1.5      +11.07R    -93.99 USD     31       31      19.4%   0.21  2026…
   2   sl_mult 0.8 · tp_mult 2        +11.02R    -98.39 USD     31       31      19.4%   0.18  2026…
 ▸ sweep_20261012_075654  CORE/trend_channel_reference 1.4.0 · 9 runs · expectancy ↑ · Oct 12, 09:57
```

- **A sweep's ranking loads the first time it is opened** (`sweeps_store.loadRanking`), and its one
  line says so while it comes — or that it could not be read, that the ledger knows the sweep no
  longer, or that no combination produced usable data. The rows are built in
  `components/sweeps/sweep_rows.ts`, plain functions over the served answers.
- **A click on a combination chooses its run, as the run list chooses one**: the run becomes the
  link's, every panel that follows it switches, and the run bundle comes forward
  (`reveal(…, 'selection')`). The row of the run chosen is marked.
- **Parameters** by the last part of their configuration key, the whole key on the title and in the
  card. The card carries every figure a combination is judged on and the fields that make it
  comparable: the code, its logic version, the parameter and settings fingerprints, how many
  candidates it was selected from.
- **The sweep looked at last is the link's `sweep` key**, stored with the arrangement: it stands open
  after a reload, and the run header's *Combination in sweep* (`openSweep`) opens it and brings it
  into view. A link stored before the key existed reads as none chosen.
- **Coming back to the panel fetches the list and every ranking it holds again**, quietly — a
  running sweep grows a combination at a time.

## Not yet

- **A jump from an activity to its run** (moved here from viewer#49): measured possible on
  2026-10-19 — a running combination stands in the run index while it runs — and not built yet.
- **Parameter importance and an interaction heatmap** — the later half of viewer#32, sourced from
  FiniexTestingIDE's own analyses.
- **A row cap.** The ranking draws every combination: 500 of them stood in 671 ms against the
  preview bundle (2026-10-19, the machine under intermittent load), so none is needed at that size.

## How it is tested

- `sweep_rows.test.ts` — the lines of the list: a closed sweep's one silent line, the state of an
  open one, its combinations in the served order with ★ on the first and on every tie, two
  currencies numbered apart, the objective formatted by its field, parameters by their last key,
  whose objective ordered it, and the heading's words only where the ranking compares unlike.
- `sweeps_store.test.ts` — the list and each ranking as served, loaded once, the link, a stale id, a
  gone sweep, one ranking's failure, a refused surface, the refresh.
- `sweeps_view.test.ts` — closed headings, a sweep opened to its ranking, the linked sweep open on
  mount, a combination chosen as a run, the heading's objective, a stale link and a refused surface.
- `run_panels.test.ts` — the run header's sweep opening the sweep.
- `e2e/sweeps.spec.ts` — the panel from the Panels menu, a sweep opened, its ranking, a combination
  chosen and its report coming forward.
