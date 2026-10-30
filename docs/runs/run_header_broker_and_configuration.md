# Run Header, Broker and Configuration

Before two runs can be compared, a reader needs to know what each one was: which artifact and which code, what its brokers allowed, and what it was started with. Read this document before you change `RunHeaderPanel`, `BrokerPanel` or `ConfigPanel`.

## Run header — which artifact am I looking at, and which code made it

The one section that answers for a run carrying **no report artifacts at all**, and since contract
26 that is true of the route as well: measured 2026-10-10 on all three logs-only runs in the
archive, `/reports/runs/{id}/header` answers 200 while `artifacts` is empty. It is therefore loaded
UNGATED, the way the configuration is — `header` is not in a run's artifact list, so gating on it
would ask for nothing and show nothing.

**Two models, and neither replaces the other.** The index ROW is always there; the served HEADER
carries the two things the row cannot. Composed in `run_sections_store` as `{ info, served }`, the same shape
the Orders panel uses, because the panel contract takes one model and a second source would have
had to rebuild it.

```
info     always      identity, membership, version, configuration file
served   may be null who started the run, and WHICH CODE RAN
```

**The second is the point.** `code_identity` names every repository the run recorded — its commit,
its branch, whether the tree was dirty and whether the code can be put back exactly — and every
decision logic and worker with its version and the file it came from. A reader who finds a result
surprising can now ask *was this even reproducible* and get an answer.

**One number in it is a trap, and the mirror says so in both places.** `changes` is a SAMPLE and
`uncommitted_count` is the count: measured on the fixture run, 20 entries served against 118.
Rendering the list's length as the count would understate it by eighty-eight and nothing on screen
would say so, which is why `api_contract.test.ts` asserts `uncommitted_count > changes.length`
rather than the component asserting it.

**Every label here is THEIRS**, taken from the `run-header` document as they instructed: *"Use it
as written — do not coin another: the label is how a reader finds the term in these documents."*
That is also why the run list's `Run type` became `Pipeline` in the same change — one field, one
word, and ours sat beside a `Purpose` facet it could not be told apart from.

What the panel does NOT print: a clean tree states nothing beyond its commit, and `allow_dirty`
appears only when it is true, in the warning role with its glyph and its word. It says real orders
were explicitly allowed from code that was not committed, which is a thing to weigh before
trusting the figures beside it. `first_start` (contract 37) appears only when it is true too, as
*Declared first start*, a plain fact rather than a warning: a session trading real money that
started without a carry-over to continue, because its start was declared the bot's first.
`accept_composite_change` (contract 41) appears only where a start was given one, as *Changed
configuration accepted* with the key, in the warning role: the start continued what the venue held
under another composite, so a trade across the change is the result of neither configuration. The
session's `composite_change_accepted` warning says whether it let anything through.
`features_beyond_venue` (contract 45) appears only where a backtest declared any, as *Beyond the venue*
with the features, in the warning role: it was allowed order features its venue's API does not hold, so
its results do not predict a session on that venue, which a hint below the block says once. Empty on
every other run and null on an older one, and both state nothing. Their `run-header` document lists it
as on the run list too; measured 2026-10-30 no row of the run list carries it, so it is read here alone.

## Broker — the conditions a run traded under

`GET /reports/runs/{run_id}/broker`, `key: ["broker_type"]`, rendered by `runs/BrokerPanel.vue`: a
`FigureBlock` of conditions per broker with a `RecordList` of its symbols beneath.

**It replaced Portfolio rather than renaming it.** What each account EARNED is the scenario roster's
row and its card now. What rules it traded UNDER had no home at all — and that question has a wrong
answer by default, which is the reason the panel exists rather than a reason it is nice to have.

**The sentence at the top is the point of the whole panel.** Two stored runs put forex at 1:500 with
hedging beside crypto at 1:1 with none (`20260930_080501_5a37660b`, `20260927_092959_cd1d9b1e`):
four scenarios under margin calls, one under none. A drawdown reached on 500:1 leverage and a
drawdown reached on a spot account are not the same kind of number — one could have been liquidated
and the other could not — and every other panel in this view puts them in one column and sorts them
against each other. The advisory is built from the fields that actually DIFFER, so it never claims a
difference two brokers do not have, and it is silent on a run that used one broker.

**The margin fields are gated on `leverage > 1`, which is the BACKEND's condition and not ours.**
Their `docs/broker_config_guide.md` marks `margin_mode`, `margin_call_level` and `stopout_level` as
required *"If leverage > 1"*, and the adapter guide repeats it. Below that a broker states none of
them, so what arrives is a default: the captured spot broker reads `margin_mode: 'none'` with both
levels at `0.0`, and rendering "margin call at 0.00%" says the opposite of what is true — that the
account is called immediately, rather than that it can never be called. Gating on the MODE instead
would have worked on this data and been the wrong rule, which is why the reading came before the
guess. For the same reason the advisory says *margin calls on some and not on others* in words
rather than printing `retail_hedging / none`, where the second half is a default.

**A size is formatted, never stringified.** The symbol table carries volumes, steps and tick sizes
that span six orders of magnitude, and JavaScript switches to exponential notation below 1e-7 — the
captured spot symbol steps in units of 1e-8, which put `1e-8` in a column of plain decimals. An
`Intl.NumberFormat` at up to eight fraction digits keeps one notation for one kind of quantity, and
drops trailing zeroes so a forex minimum still reads `0.01`.

## Configuration — shown, never resolved

`GET /reports/runs/{run_id}/config` serves the configuration a run was commissioned with, resolved
from the backend's run-config store through the run's `config_id`. Rendered by
`runs/ConfigPanel.vue` with `runs/config_shape.ts` beside it and `base/JsonTree.vue` underneath.

**The cascade belongs to the backend and is not rebuilt here.** It is documented there as two
levels for `strategy_config` and `stress_test_config` (global → scenario) and three for
`execution_config` and `trade_simulator_config` (app config → global → scenario), its merge depth
is not visible in what we receive, and for the three-level blocks the base layer lives in the
backend's own app configuration and is not in this document at all. Computing an effective value
would be a second implementation of someone else's rule, drifting silently the moment they change
it — the same failure as a hand-written mock of a response.

**Compared across a deployment's change mark** (2026-10-27): opened through *Configuration before ·
after*, the panel lists every value that differs from the session on the other side of the mark,
by its path and oldest side first, marks a moved decision-logic value where it stands with the other
side's value beside it, and says that a default or a start option that changed is in neither file.
The comparison is `configChanges` in `config_shape.ts` — equality of the two files' served values,
nothing resolved — the one comparison of two answers this repository makes, because their `config`
document instructs it for a strategy mark. It reaches the panel through a channel
(`use_config_comparison`), so the panel reads no store, and *Stop comparing*, or choosing another
run, ends it. testingide#615's `config_changes` replaces its source.

**The workers are on the shared list**, which removed the last bespoke `<table>` from the app.
Three columns, read-only, no ranks: measured over the stored configurations a worker is 8–14
characters of type and 19–37 of parameters, so all three fit at any width this panel is given, and
a rank that never engages is a breakpoint that changes nothing.

**So the panel reports presence, not resolution.** That a scenario carries its own block is
readable from the document; what that override resolves to is not. The notice therefore names the
scenarios and the blocks they carry, and says the block above is the base rather than what those
scenarios ran with. Same construction as the backend's own `advisory` on a deployment: it says a
blanket reading is invalid instead of computing a new figure.

**One route, two shapes.** An autotrader profile carries `strategy_config` at the top; a scenario
set carries `global.strategy_config` plus a `scenarios` list. That difference is contained in
`config_shape.ts` rather than travelling through the components as a union.

**A scenario names itself under either of two spellings, and both are permanent.** Contract 12
(2026-09-28) renamed the scenario's identity inside the configuration document from `name` to
`scenario_name`, and the backend states that a run recorded before it *"keeps the snapshot it
recorded"* — unlike the booking-period rename of that same version, which WAS migrated into the
stored runs and is called *"the one rename here that reaches back"*. The archive therefore holds
both for good: measured over all 48 stored runs, `scenario_name` on 363 of 420 scenario objects and
`name` on the other 57, never both and never neither. Reading both is mirroring an artifact's own
values rather than a compatibility layer, because the response SHAPE is one and the difference lives
inside the opaque document it carries. Where neither is present the name reads as ABSENT — the
override list used to fall back to the drawing position and printed `#10` where the document said
`EURGBP_balanced_10`, an invented counter of exactly the kind the deployment session index taught
this project not to render.

**`config` is deliberately not mirrored as a type**, and that is a considered exception to the
typing rule: the document is written by the OPERATOR, its shape differs per pipeline, and it grows
a branch whenever someone writes a new strategy. `StrategyConfig` IS mirrored, because its four
keys are the framework's own composition model — `worker_factory.py` reads `worker_instances` and
`workers` by exactly those names. Mirror what the framework guarantees; leave open what the
operator authors.

**The JSON tree is the floor, and its completeness is asserted.** Whatever the named views do not
show stays reachable there, and a test holds that every top-level key of both captured shapes is
present in the render. Without it, choosing what to highlight would quietly hide the rest —
including a key that does not exist yet.

**Two 404s, two meanings.** `config_snapshot_missing` is the ordinary absence of a section, mapped
to null. `run_not_found` says the backend does not know a run our own index just named — a
disagreement between two indexes, raised as `RunNotFoundError` rather than swallowed behind a blank
panel. They are told apart by the response body, since the status cannot say which.

**A worker type is a path, and a path needs `base/PathLabel.vue`.** Since operators write their own
strategies, `worker_instances` and `decision_logic_type` hold values like
`user_algos/touch_and_turn/touch_and_turn_range_worker.py` — 56 characters of monospace. Measured
2026-09-29: sharing the panel's width with the decision logic left that column 140 px, so the type
broke mid-word and the parameters column sat off the edge behind a scrollbar. `PathLabel` renders
the last segment as the name and dims the folders before it, and offers a `<wbr>` at every
separator so the label wraps at `/` instead of pushing its table sideways; the whole value stays in
the `title`. The workers section takes the full width of the strategy grid for the same reason.
