# Deployments Panel

A deployment is the identity a series of runs share, and the Deployments panel follows one bot across its restarts through the ledger rather than through a run's artifacts. Read this document before you change the panel, `src/components/deployments/` or `deployments_store`. Its heading calls it a view and not a panel workspace because it does not use the registry of report sections; the booking periods it draws are described in [Booking periods](../runs/booking_periods.md).

## Deployments — a second view, deliberately not a panel workspace

A backtest is read one run at a time; a bot that runs for thirty days is not. There the object of
interest is the **deployment** — the identity a series of runs share — and the question is what
happened across the restarts. That is a different shape from the run workspace, and it is built as
a plain view rather than as panels:

- **`src/views/DeploymentsView.vue`** with `src/components/deployments/` (`DeploymentPicker`,
  `DeploymentHeader`, `SessionsTable`, `AdvisoryNotice`) and `src/stores/deployments_store.ts`.
- The `deployments` panel; the chosen deployment is the main link's (`deployment.id`), restored by
  `use_deployment_binding` once the ledger has loaded.

**Why not panels.** The registry and the layout store are global: one `layout.v1`, and the Panels
menu lists every entry of it under Runs. Deployment panels in that registry would put their entries
among the run report's sections, where they can never render. Scoping the registry per view is foundation work that a
list and a table do not need.

**Choosing a deployment is a facet bar over a flat list**, the same `FacetBar` + `RecordList` the
run picker and the scenario roster use — the select box it replaces showed `bot · deployment_id`,
**two of the twelve fields a ledger row carries**. The other ten — how many sessions, when the
first and last started, what it earned, how deep it fell, the longest idle stretch, whether the
configuration moved — were invisible until something had been chosen, which is the run cascade's
defect one level shallower: a reader choosing a deployment is choosing between its HISTORIES.

Nine columns ranked 9 → 7 → 5 → 3, a card for the rest, and the list collapses to one line once a
deployment is chosen. Open again, it takes a third of the view beside the history — and in a view
lower than 40rem it stands alone and takes the whole of it, because a third of a short panel left
a strip for each half (operator, 2026-10-20); a pick folds it away and the history returns. `Bot` is rank 1 beside the id deliberately: the id is minted per deployment
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
- `unfinished` is shown even when zero. Those runs are absent from `sessions` by construction (the
  ledger row is written last), and a bare session count is a number the reader has no reason to doubt.

**The head says each figure once** (operator, 2026-10-20), in three lines: the chosen line names
the deployment and its bot, with the rest of its row — the bot id among it — on the same card the
list shows; the deployment's own line counts the sessions and the unfinished runs and carries the
advisory, the full sentence on hover; and one line per account currency carries the ledger's
figures and the span of the starts, the date said once where both fall on the same UTC day. The
unfinished runs and the advisory stand above the currencies because they belong to none: an
unfinished run has no ledger row and so no currency.

**`index` on a session row is not rendered.** It rides on the row and is NOT in the declared key
(`["run_id", "currency"]`), so presenting it as the session's number invents a counter the ledger
does not keep — and it repeats as soon as a deployment books in two currencies. The general rule:
`key` says what identifies a row, and a field outside it may be shown as data but never as the
row's identity or its number.

**A 403 is a third kind of refusal.** `deployments` is its own grant surface, so a token can be
valid and carry nothing on it. `SurfaceForbiddenError` separates that from an absence and from an
outage, and the view says which surface is missing — not the backend's own text, which lists every
grant the token holds.
