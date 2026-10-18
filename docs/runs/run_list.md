# Run List

The run list is the Runs panel: every stored run in one flat list, narrowed by a facet bar rather than a cascade of dropdowns. Read this document before you change `RunPicker`, `runs_store` or what a run's row shows: it says which response field each figure comes from and how runs fold into families.

## Choosing a run — a facet bar over a flat index, not a cascade

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

**The stamp says only what its neighbours do not**, the same rule the time axis follows: the year is
dropped inside the current year and kept outside it, and the seconds are gone — two runs of the same
minute are told apart by the id. `Sep 29, 2026, 12:27 PM` was 22 characters and needed 13 rem of a
28 rem panel, which is what made the narrowest rank tier overflow by 24 px. The month stays a WORD
on purpose: this column is the reader's own zone while the card beside it carries UTC, and a numeric
`2026-09-29 12:27` reads like the canonical clock that it is not.

**Ranked columns, and a card on every row.** What a narrow list keeps is the
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
