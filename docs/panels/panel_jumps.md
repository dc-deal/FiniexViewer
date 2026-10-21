# Jumps Between Panels

A panel names what to open and the host decides how, so no panel needs to know the dock. Read this document before you add a way from one panel into another; *Show in list* and the `reveal` behind every jump are described in [Panel Dock](panel_dock.md).

**From a panel into another view — `use_open_in_context.ts`.** The sibling of the position link,
one level up: a panel names WHAT to open (`openRun(id)`, `openDeployment(id)`, `openSweep(id)`) and the host decides
HOW. The app root supplies `openInDock()` (`components/dock/open_in_dock.ts`): it CHOOSES the run or
the deployment through the stores' own `selectRun` / `selectDeployment` — the context and the load,
exactly as a pick in their list — and brings that panel to the front through the dock store
(`dock.reveal`, as a command); no panel knows the dock, and none changed when the routes went. It never calls the
context's bare setter: a docked view stays mounted, so nothing reloads behind a context that merely
changed. Measured 2026-10-14, when the jump did exactly that: a run opened from a deployment showed
its own sections beside the previous run's executive summary — the sections follow the context, the
summary loads with the choice. `openRun(id, section)` names a section of the run's report as well:
the run is chosen the same way, and that section comes forward as a panel of its own
(`dock.openSection`) — in the column it may stand folded or far below the header, and the reader
asked for the section rather than the report. `canOpen` is false where
no host supplied the channel, and a panel then draws the name as plain text rather than a way in
that leads nowhere. Its callers, most through `JumpLink`: a session's run, and on a change mark the
configuration of the session before and after it (`SessionsTable`); a period's run on the deployment
side (`BookingPeriodTable`); a session lane's label (`BookingPeriodTimeline` hands `TimelineChart` an
`open` per lane — what a lane MEANS stays the caller's); a run's deployment and sweep
(`RunHeaderPanel`); an activity's run or sweep (`ActivitiesView`); and the list that holds a chosen run
the run list leaves out (`RunPicker`'s notice, and *Show in list* in `use_panel_jump.ts`). No panel holds a route or a `RouteLocationRaw`
any more. Opening one of them in a new tab went with the `RouterLink`, which is accepted: the URL
carries no selection, and a new tab starts from the arrangement saved last and keeps its own from
then on (see [State and Storage](../architecture/state_and_storage.md)).

**The jump from a report row into the chart is not built.** The portfolio row that linked a unit's
symbol into the chart was deleted, and the jump with it; it returns with the run-bound chart of
viewer#31 — an `openChart` on this channel, added when a caller exists.

## The way between an order and its trade

A reader on `pos_gbpusd_1 · close · executed` can reach the trades that position produced, and a
reader on a trade can reach its orders — including a refusal on the way. The position id leads the
row in BOTH lists, as a link, so the two read as two views of one thing.

**The join is `(scenario_name, position_id)` and it is DECLARED**, not worked out here:
FiniexTestingIDE, 2026-10-02 — *"an executed order-history row's `(scenario_name, position_id)`
names the same position as a trade-history row's, by construction"*. **Never the position id
alone:** every scenario counts from `pos_<symbol>_1`, so two scenarios of one symbol both have a
`pos_gbpusd_1`. Both halves travel together everywhere — in the stored mark, in the comparison, in the test.

**The ROW level is deliberately shut, and the reason is theirs.** A close books exactly one trade
and appends exactly one `close · executed` row; measured here, 1,554 of 1,554 pair exactly on
`(exit_time, exit_price)`. We do not use it, by either content or ordinal, because *"in a long
AutoTrader session the order history and the trade history are bounded buffers of different sizes
and drop their oldest records at different points, after which 'the n-th' points at the wrong trade
without any sign."* A jump therefore lands on a POSITION, and where a partial close booked several
trades all of them are marked — correct, since "what happened on the way to this position" has one
answer whichever close the reader came from.

**`use_position_link.ts` is ambient, like the scenario narrowing, and for the same reason.** Making
a sibling panel visible and scrolling to a row is about the WORKSPACE, which a panel must not know;
writing the mark into a context would tie a panel to one link. The app root provides the
channel (`use_run_report_channels`, the jump itself in `use_panel_jump`) and the panels only read
the mark and ask for the jump. The jump searches the run bundle for the marked row, never the whole
document. The channel carries three things:

| | |
|---|---|
| `marked` | the position on show — the run's `position` in its link's context |
| `jumpTo(panelId, ref)` | `mark` it · `show` the panel · `setOpen` it · scroll to the marked row |
| `canJumpTo(panelId)` | does that panel have a model at all — the HOST's knowledge, read from the same `sources` record `PanelColumn` is handed (`run_sections_store`) |

**A new run drops the mark; a restore keeps it.** A position id is a counter per unit —
`pos_eurgbp_1` exists in every run that traded EURGBP — so a mark carried into the next run marks a
DIFFERENT position under the same name. `selectRun` therefore clears `position` and the units in
the same action that sets the new run, and the roster's narrowing is scoped to its run
(`use_facet_state`); a selection RESTORED with a mark keeps it, because a restore is not a new
run. The scroll is looked for
inside the run view's own root rather than the whole document, so a second copy of a panel can
never answer first. Both fixed 2026-10-12: until then the mark of one run survived into the next.

**The mark is stored and the SCROLL is not.** A reload puts the reader back on the same position,
and a page that jumps on every reload is a page that moved while nobody was looking. The scroll
waits one tick for drawn rows to take the mark, then watches the view until the marked row appears
— a panel the jump had to open is not drawn yet — and gives up after two seconds rather than
scrolling to nothing: a target beyond the trade list's visible cap, or inside a group it folded, is
a row that is not there. A fixed number of ticks failed twice — two until 2026-10-12, shorter than
the URL write the mark then waited for, and one on 2026-10-13, once the mark no longer rode in the
URL. Nobody saw the first: Trade history stands above Orders, and the trades of
the first order are on screen without a scroll. Only a jump from far down the orders needs one.

**Three absences draw no link at all**, which is the difference between a jump and a dead end: a
position that produced no trade (55 measured), a run that serves no trade history (10 measured), and
a panel this run has no model for. The position id is still printed in all three — it is data, part
of the trade's own declared key.
