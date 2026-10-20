# Orders and Order Steps

The Orders panel joins the pending-order funnel and the order history into one list per scenario, and opens the steps each order went through under its position. Read this document when an order count looks wrong or a row seems to repeat, and before you change `OrdersPanel` or `OrderStepList`.

## Orders — why an order did not become what it was meant to be

`GET /api/v1/reports/runs/{run_id}/pending-orders` **and** `GET …/order-history`, composed in
`run_sections_store` and rendered by `runs/OrdersPanel.vue` as a `RecordList` grouped by scenario: the
scenario's pending funnel is the group heading, its order records are the rows. Registered closed by
default: it is evidence, and a reader opens it with a question.

**ONE panel where there were two, and that is the point.** The two routes describe the same orders
from two sides — `pending-orders` what BECAME of a scenario's orders, `order-history` the orders
themselves. The Pending Orders panel could say *527 rejected* and reach not one of the 527, while
the sentence explaining each was already on the wire in a route nothing consumed. The registry lost
an entry rather than gaining one.

**The join is the scenario name, and it holds by CONSTRUCTION.** `pending-orders.units[].name` and
`order-history.orders[].scenario_name` are both written from the same run unit's name
(FiniexTestingIDE, 2026-10-01). One edge, and it is handled: a scenario whose every order was
refused before the queue never enters the pending pipeline, so it has rows and no funnel, and the
heading says so rather than drawing a funnel of zeroes that would claim a measurement nobody made.

A SECOND edge stood here and was wrong — that an AutoTrader run serves no units at all. Measured
2026-10-08: both stored AutoTrader runs carry one, the field study with 46 submitted and 46 timed
in flight. The sentence came from an archive in which no such run had placed an order yet.

**The question nothing else on the page can answer.** Every other section says what the run DID.
Measured 2026-10-01 over 202 units across 20 runs, one unit **resolved 527 orders and filled none of
them** — and every other panel of that run showed a normal-looking result.

**The funnel, in their own words since contract 23.** The heading reads submitted · accepted ·
rejected · never confirmed · expired · avg in flight, and the last three appear only where they are
not zero. The identity is theirs, and it is checked rather than assumed:

```
total_submitted = total_accepted + total_rejected + total_never_confirmed + total_expired
```

**Measured 2026-10-08 over 230 units: it holds on 230 of 230, without exception.** That settles a
question carried here for a week — whether an order RESTING at data end is counted twice. Since the
identity divides every submission over four endings, a resting order is already inside `accepted`: a
subset, never a fifth bucket. Exactly one unit in the archive holds a resting order at all, and
`total_expired` is zero there as everywhere, so the two are disjoint.

**What replaced the old arithmetic, and why it is GONE rather than maintained.** Until contract 22
the heading read resolved · arrived · rejected · timed out · force closed, and `arrived` carried a
tooltip explaining a defect of the backend's own: `total_filled` counted an order that had merely
begun resting, and our `BTCUSD_blocks_02` was their worked example. They fixed it and named the field
`total_accepted`. The paraphrase lost its subject, so it was deleted with it rather than kept out of
attachment — a sentence describing behaviour nobody has any more is worse than no sentence.

`arrived` is right for everything this panel can draw, because `units` is empty on an AutoTrader run
and a session's counter means reported FILLS. The word splits by pipeline the day sessions carry
units. `timed_out` and `force_closed` read zero on every unit measured, so the heading prints them
only when they are not zero.

**A ROW IS A LIFECYCLE RECORD, NOT AN ORDER**, and that decides the shape. One order appears as
several rows: `pending` on entry, `executed` on the fill, a `close` row when its position closes,
one more per partial close. Measured 2026-10-02 over 40 runs and 4,660 rows, the vocabulary is five
`action`/`status` pairs — `open/pending` 1561 · `close/executed` 1554 · `open/executed` 994 ·
`open/rejected` 548 · `open/expired` 3. So the list is two levels and not three: an order cannot be
a group with its lifecycle beneath it, because no field identifies one.

**`order_id` is not an identity and the route declares no key** — that is the backend's answer
rather than an omission. It is a per-unit position counter: 167 rows carried one id on a measured
run. They asked us not to adopt the content key that happens to be unique either, because two
partial closes on one tick would collide. A row is keyed by its POSITION within its scenario, in
append order; the ordinal field is planned in testingide#557, and a contract test asserts the
absence so the day it arrives is loud.

**A POSITION reads as one thing, because a reader should not have to ask.** Within a scenario the
rows of one position are tied together: the row that OPENS a position carries the id and a rule
above it, the rows that carry it on show `└─` in the id's place. Nothing is derived — the grouping
is `order_id`, which their glossary states is the position's id.

The continuation is read from the row ABOVE rather than from a block of its own, and that is
measured: 2 of 246 scenario groups interleave two positions (both in a scenario named
`partial_close_lifecycle`, where two run at once and their records alternate). Where that happens
the id simply appears again. It is built over the NARROWED list, so the predecessor is the row the
reader actually sees.

**No POSITION column, and the one that stayed carries THEIR word.** `order_id` IS the position id
— their glossary says so, and over 2,548 rows carrying a position the two strings were identical on
every one — so the second column repeated the first. The survivor is headed `Order id` with the
glossary's own sentence as its hint, because `Order` alone read as an order's own identity, which is
exactly what the field is not. What the deleted column really said, *a position exists here*, the
status `executed` already says.

**The narrowing reaches it like every other scenario-shaped panel.** It filters the ORDERS, so a
scenario the reader dropped takes its funnel heading with it, and an empty result is stated as the
chosen scenarios' rather than as the run's.

**An absent value is `null`, never `0.0` or `""`** (contract 20): `event_time` on 45 % of rows,
`executed_price` and `position_id` likewise, `rejection_*` on 88 %. Each renders as absent. The
stamp is `event_time` and says when THIS ROW's event happened — the fill on `executed`, the refusal
on `rejected`, the expiry on `expired`; it was `execution_time` until contract 20 and was renamed
because that name means a DURATION everywhere else in the API.

**The orders RESTING at data end are shown in the heading and are NOT added to the funnel.** In a
backtest the simulation records every such order as `expired` in the same step and deliberately
leaves it in the active lists — one order, two views of one instant, and it is already a row below.
It is stated because it is a property of the SCENARIO that no single row carries. In an AutoTrader
session the answer differs: an order left standing at the venue gets no `expired` row.

**The route takes a `symbol` and this app never sends one.** The panel groups by scenario and one
scenario is one symbol, so the parameter would narrow nothing a reader asked for. Before contract 20
it was also unsafe: a rejected row had an empty symbol and the filter silently dropped every
rejection.

## The third level — what an order actually went through

`GET /api/v1/reports/runs/{run_id}/order-events`, narrowed, rendered by `runs/OrderStepList.vue`
inside a row of the Orders panel. Their own sentence for why it exists: *"[order history] keeps a row
for each submission and one for every way an order ENDED. What happened in between is missing
there."* This is that in-between — the venue taking the order, a stop triggering, every cancel asked
for and how it was answered.

**It hangs off the POSITION, not off a row, and that is forced rather than chosen.** An
`order-history` row carries no `seq`, no `submitted_seq` and no `client_order_id`, so nothing on it
says which order it belongs to. Measured on `pos_ethusd_1` of the field study: **three history rows
against two stream orders.** So a reader opens a POSITION, and the ORDERS inside it come from the
stream, which identifies its own.

Confirmed by testingide on 2026-10-08, asked directly: *"the intended granularity for the join is the
position: narrow `/order-events` by (`scenario_name`, `order_id`) and group by `submitted_seq`. Your
position-level expansion is the correct build, not a workaround."* The row-level field is planned in
testingide#557 and ships with a contract raise; clicking ONE history row becomes possible then, and
not before.

**`order_id` must never be the group key.** It is the POSITION and repeats across a position's open
and its closes — one id covers two orders on the field study and four on the capture's partial close.
`submitted_seq` identifies one order, and a `denied` order carries none because it was never
submitted, so null is a VALUE here and gets its own group rather than one group per step.

**Never sorted by time.** `seq` is the order of the stream, and several steps often share one instant
@ a backtest takes and fills a market order at once. The captured response has fewer distinct
`event_time` values than events, which is asserted rather than trusted.

**One request per POSITION, not per run, and the host owns it.** The stream is the largest thing this
API serves here — 1,025 events on one stored run against the four of a position a reader opened — and
the route narrows itself, so one position costs 3 KB where its run costs 138 KB. `use_order_steps.ts`
is the ambient capability, the same `provide`/`inject` channel the position link uses and for the
same reason: a panel that reached for the store would stop being renderable from a different host.
`run_reports_store.ts` keeps the answers per position and refuses a second request for one it already
has — the panel asks on every opening and does not check first, because what is held is the store's
knowledge and a second copy of that check is a second place to get it wrong.

**The gate is `stream_files`, not `artifacts`.** The stream is not a report artifact and appears in no
run's artifact list; the backend names it on the run index row instead. Measured 2026-10-08: 51 of 52
runs carry `["order_events.jsonl"]` there and one carries `[]`. Without the gate the panel would
offer a disclosure that can only ever answer 404.

**`broker_truth` is deliberately not here.** A narrowed answer carries none, and their document says
why: those lines are the venue's whole account at a moment, *"never a step of one order."* They are
the subject of a venue-account panel, which is its own undertaking.

**Its own component rather than a second list in the panel, and the reason is an instrument.**
`scripts/check_terms.py` pairs ONE `ListColumn` array per file against that file's row template,
positionally, and drops the pairing where the two disagree. A second array beside the first silently
cost the Orders panel's eight labels their field mapping — measured 2026-10-08, `Lots` fell back to
the trade history's reading and the check reported it as moved. One column array per file is a
property the check depends on.
