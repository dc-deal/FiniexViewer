# Scenario Roster and Focus

A run can hold many scenarios, and the roster is the one list that names all of them, including those that produced nothing. Read this document before you change `ScenarioRosterPanel`, the context's `run.units` or `use_scenario_selection`: it says what each panel does with the scenario in focus.

## The scenario roster — the only complete list of a run

Rendered through `base/RecordList.vue`, one column per field: scenario · symbol · market · currency ·
broker · tick timespan · ticks · took · trades · win rate · net P&L · PF · max DD · fees · state. It was a name line over a
prose figures line, which reads as a sentence per scenario and compares across forty of them not at
all. The reason a scenario produced nothing is the list's spanning detail line, so prose never sets
a column's width.

Two of them declare a FLOOR rather than a share: the scenario name and the state. Everything
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

## Choosing scenarios — `run.units`, and what must not be narrowed with them

A run holds up to forty scenarios, and the facet bar only narrows the ROSTER. The selection is the
other half: scenarios are chosen, and the sections that are per-unit follow them.

```
run 20260927_092959_cd1d9b1e · in focus ETHUSD_blocks_06

  roster            marks its row; a click moves the focus, a second click shows the whole run
  trade history     narrowed
  booking periods   narrowed
  warnings/errors   narrowed — but a RUN-scoped warning stays, it is still true
  executive, totals MARKED as the whole run, never narrowed
  run bundle        the whole column is FRAMED, dashed
  menu bar          "⌖ Only ETHUSD_blocks_06 · Show all", once for every panel
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
executive's and Run totals' on the first currency's title row, the verdict's in its headline — and
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
executive KPI table (one row per CURRENCY), Run totals (a fold over every scenario), the
reconciliation verdict in Booking periods, and the outcome counts
in Warnings & errors. Run totals joined them in viewer#42: inside the bundle's dashed frame its money
read as the focused scenario's. There were two more once: the order
funnel and the per-currency analytics stood in Trade history too, and both are gone — 17 of the 19
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

**Narrowing happens BEFORE the row cap.** Capped first, the first N trades of the whole run would
be filtered down, and a scenario that traded late would show nothing while the panel claimed it had
drawn everything.

**An empty result is a statement about the scenario.** Every declared unit is in the roster whether
it traded or not, so no trades means *this scenario closed no positions*, never *nothing matched* —
and the empty states say exactly that. A `?unit=` naming a scenario the run does not declare is
called out in the line above the column, but only where the roster actually arrived: it is
backtest-only, so its absence on a session says nothing about the name.
