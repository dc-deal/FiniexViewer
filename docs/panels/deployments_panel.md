# Deployments Panel

A deployment is the identity a series of runs share, and the deployment side follows one bot across its restarts through the ledger rather than through a run's artifacts. Read this document before you change the deployment list, the deployment bundle, `src/components/deployments/` or `deployments_store`; the booking periods it draws are described in [Booking periods](../runs/booking_periods.md).

## A list that picks, and a bundle that shows (viewer#43)

A backtest is read one run at a time; a bot that runs for thirty days is not. There the object of
interest is the **deployment** — the identity a series of runs share — and the question is what
happened across the restarts. Since 2026-10-27 the deployment side is built the way the run side
is: a list that picks, and a bundle whose members each open as a panel of its own.

```
[☰ Deployments]        [▤ Run bundle] [▤ Deployment bundle · deploy_…205734]   ← a tab behind the run bundle
 the ledger, one row                   Deployment deploy_…205734 demo_btcusd_bot   (its row on the card)
 per deployment and                    ▾ Sessions          ⇱    the counts, the advisory, each currency
 account currency                      ▾ Booking periods   ⇱    the timeline and the table
Panels ▸ Deployments ▸  Deployment list · Deployment bundle · ─ · Sessions · Booking periods
```

- **The list** — `src/views/DeploymentsView.vue` with `DeploymentPicker`. A pick chooses the
  deployment and shows its bundle as a selection (`reveal('deployment', 'selection', 'deployments')`)
  — never reopening one the reader closed. The list stays whole and marks the pick, as the run list
  does; it no longer folds.
- **The bundle** — `src/views/DeploymentBundleView.vue`, kind `deployment`: the chosen deployment's
  line (its id and bot, its ledger row on the card, `deployment_card.ts`) above a `PanelColumn` of
  its members. Its tab says *not one series* where the advisory fires, and its ⋯ carries *Collapse
  all* and *Reset bundle* like the run bundle's.
- **The members** — `src/deployment_sections.ts`: *Sessions* (`DeploymentSessionsPanel`: the counts
  line, the advisory above the table it qualifies, and each currency's header and sessions) and
  *Booking periods* (`DeploymentPeriodsPanel`). Their models come from `deployment_sections_store`,
  read off `deployments_store`; open as a panel of its own, a member is drawn by
  `components/dock/DeploymentSection.vue` and ⇲ puts it back. As a panel its tab reads *Deployment
  sessions* or *Deployment booking periods* (`panelTitle`): beside the run report's *Booking periods*
  two tabs read the same (operator, on screen 2026-10-27), and a test holds every kind's title apart.
- **Where it stands.** The first arrangement holds it as a tab behind the run bundle, not beside the
  list: there it would make the arrangement four columns wide, and as a tab beside the list a pick
  would leave it behind, since a pick never covers its list. A stored arrangement without it gains it
  there, whether a deployment is chosen or not — never one the reader hid (decided 2026-10-27).
- **Loading.** `use_deployment_binding` runs at the app root, so the bundle and its members have the
  ledger while the list is closed; the list asks for the ledger again when it is shown again.
- **The jumps.** *Open deployment* (a session row's link, an activity) shows the bundle; *Show in
  list* from a deployment's run shows the list.

**Choosing a deployment is a facet bar over a flat list**, the same `FacetBar` + `RecordList` the
run picker and the scenario roster use — the select box it replaces showed `bot · deployment_id`,
**two of the twelve fields a ledger row carries**. The other ten — how many sessions, when the
first and last started, what it earned, how deep it fell, the longest idle stretch, whether the
configuration moved — were invisible until something had been chosen, which is the run cascade's
defect one level shallower: a reader choosing a deployment is choosing between its HISTORIES.

Nine columns ranked 9 → 7 → 5 → 3, a card for the rest; the list takes the height of its panel,
the history standing in the bundle beside it. `Bot` is rank 1 beside the id deliberately: the id is minted per deployment
and says nothing a reader recognises, while `bot` is what the profile is CALLED — and neither alone
answers *is this the one I mean*, because the id is a stamp and an operator improves the name.

**One row per (deployment x account currency), and the store keeps all of them — plus the key that
says so.** A P&L added over two currencies is not a number, so the ledger splits the rows and the
view shows one header block and one sessions table per currency. `deployment_id` alone is therefore
NOT a key — picking the first match would drop a whole currency's figures, silently.

The list honours that: **one row per LEDGER ROW**, not per deployment. A select had to fold them,
because two options reading `demo_bot · deploy_2026…` twice are two things to a reader, and folding
meant either hiding a currency or summing across them. A list shows both and says why — the id
repeats, the amounts carry their own currency, and clicking either opens the one deployment they are
both part of. The store therefore keeps `deploymentsKey` from the response rather than dropping it,
the same way the booking-period reports pass theirs down. No stored deployment books in two
currencies today (all three on this machine are USD), so this is the declared key being honoured
rather than a case being served.

**Nothing is re-aggregated client-side.** `net_pnl` is a sum over the sessions, `max_drawdown` is
their **maximum** — each session carries the running decline against the peak reached so far, so
adding the column counts one decline once per session that was still inside it. The sessions table
therefore has no totals row at all; the figures above it are the ledger's own, already reduced.

**Three renderings that are decisions rather than styling**, each taken because the alternative
misreports something:

- `advisory` sits ABOVE the table. By the time a reader reaches a change mark in the third row they
  have already added up the column above it. It arrives as COUNTS (`strategy_stands`,
  `operation_stands`) and the distinct `orders_to`, and the words are built in `AdvisoryNotice` —
  wording belongs to the component, so it stays reachable for the display-string marker and can
  change without the contract changing. A null advisory is the backend's answer that there is
  nothing to report, so a non-null one is ALWAYS a warning — and where the stands held, it is the
  orders: real money and simulated orders in one history is the one case it fires on by itself.
- `strategy_changed` / `operation_changed` / `orders_to_changed` render as a line BETWEEN two rows,
  the words on a dashed rule half a row high. A badge at the end of a row reads as a property of
  that session, which is the wrong reading — the flag marks a boundary.
  **A mark says WHERE and never WHAT** (their `deployments` and `config` documents). The words of a
  configuration mark carry a card with its meaning in the backend's words — what the bot decided,
  or what a session did without changing that — and say that WHICH parameters moved is not served
  yet: testingide#615 serves them as `config_changes` on the session row (setting, before, after),
  read from the rendered profile. Beside the words, *Configuration before · after* opens the
  configuration of the session above the mark and of the one carrying it, as a panel of its own,
  each COMPARED with the other (operator, 2026-10-27): the values that differ between the
  two files are listed, oldest side first, and a moved decision-logic value is marked where it
  stands. That comparison is what their `config` document instructs a consumer to do for a
  strategy mark; `config_changes` replaces it once served. An operation mark also moves with the
  defaults merged in under the file and with a start option, which neither file holds, and both
  its card and the comparison say so.
- `unfinished` is shown even when zero: the runs that never reached their close, a session running
  now among them. Since contract 40 a session books each trading day as it closes, so one that
  sealed a day also stands in `sessions`, its *Ran* a dash until its close is booked — the two
  counts overlap and are never added. A bare session count is a number the reader has no reason to
  doubt.
- What the run ids, *before · after* and the unfinished count mean is said by the
  `deployment-sessions` hint above the sessions, never on a browser tooltip (operator, 2026-10-28).

**The head says each figure once** (operator, 2026-10-20), in three lines: the chosen line names
the deployment and its bot, with the rest of its row — the bot id among it — on the same card the
list shows; the deployment's own line counts the sessions and the unfinished runs and carries the
advisory, the full sentence on hover; and one line per account currency carries the ledger's
figures and the span of the starts, the date said once where both fall on the same UTC day. The
unfinished runs and the advisory stand above the currencies because they belong to none: a run that
died before its first sealed day has no ledger row and so no currency.

**`index` on a session row is not rendered.** It rides on the row and is NOT in the declared key
(`["run_id", "currency"]`), so presenting it as the session's number invents a counter the ledger
does not keep — and it repeats as soon as a deployment books in two currencies. The general rule:
`key` says what identifies a row, and a field outside it may be shown as data but never as the
row's identity or its number.

**A 403 is a third kind of refusal.** `deployments` is its own grant surface, so a token can be
valid and carry nothing on it. `SurfaceForbiddenError` separates that from an absence and from an
outage, and the view says which surface is missing — not the backend's own text, which lists every
grant the token holds.
