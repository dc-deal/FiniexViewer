# Booking Periods

Booking periods come from FiniexTestingIDE's ledger, and one table and one timeline draw them for a single run and across a deployment alike. Read this document before you change `BookingPeriodTable`, `BookingPeriodTimeline` or `TimelineChart`, because a change shows in both places.

**The booking-period components are shared by both views.** `BookingPeriodTable` takes rows and
the declared key tuple as props, so the run panel and the deployment view are two callers of one
table rather than two implementations of it. The timeline is split in two on purpose:
`base/TimelineChart.vue` places numbers on a scale and knows nothing about runs, periods or time,
while `runs/BookingPeriodTimeline.vue` holds every domain decision — what a lane is, which clock
the axis carries, how a period becomes a coloured span. No package was added for it: a Gantt
library would be a dependency for one view, and a proportional bar on a linear scale is a hundred
lines that stay themeable through the existing tokens.

**The booking periods are FiniexTestingIDE's ledger, and the table reads them as one** (#46, their
glossary: *journal · ledger · closing*). Every period row carries the card its bar on the timeline
has — one builder, `runs/booking_period_card.ts` — which holds what a narrow panel's columns gave up;
the rows stay read-only and can be focused, so the card is not the pointer's alone (`RecordList`,
a read-only row with a `rowCard`). Each unit of several periods closes with the TOTAL the run's route
serves (`unit_totals`), a sum line in the same columns. Its *Max DD* is the deepest SINGLE period —
which is what the column shows, by their document — and its card puts the account's own decline
beside it, cumulative across the boundaries (`account_max_drawdown` and its share): a fall that runs
across a boundary is deeper than any one period's, and the two side by side are where that shows. A
unit of one period draws no total, since its total is that period again. The deployment view draws
none: its route serves no unit totals. The figures over many periods — a Sharpe, a Calmar, a month's
drawdown, their *closing* — are not served yet and not computed here; a *Closing* panel waits for
them (requested 2026-10-18).

**The two outermost axis labels hang INWARDS, and that is layout rather than taste.** A label
placed at its mark and pulled back by `translate` moves on screen but not in layout, so a centred
label at the far edge keeps half its box past the chart. The panel around it then offers a
scrollbar for something nobody can see — measured 2026-09-29 at 67 px — and scrolling that phantom
slides the lane-label column out of view, which is how `GBPUSD_blocks_01` came to read as
`locks_01`. The first label therefore hangs right of its mark and the last hangs left, whichever
branch placed them, evenly spaced or one per kept piece. `e2e/panel_layout.spec.ts` holds it,
because only a browser can measure it.

**Once the browser has measured, every label is judged in PIXELS** (2026-10-14). The chart reads
its own width and, from a hidden probe of ten characters, what one character takes — the labels are
monospace, so a label's width is its length times that. A span shows its name where the name fits
inside it, its short name where only that fits, and nothing otherwise; the whole name is on its card
either way. Axis labels are placed the two ends first, then each on the first row where its box
touches nothing, else the second, else not at all — a label that fits on neither row is dropped
rather than overprinted — and a label that would reach past the axis is slid along it until it lies
wholly on it, its pointer staying at the mark. Until then a share of the width decided, and in a
narrow panel fourteen percent was a few pixels: `period 12` crowded into a bar 40 px wide and three
stamps printed into one. Before a measurement exists — jsdom never makes one — the share rule
still applies.

**The table under the chart carries EVERY field a period has, and stays a table.** It once showed
eleven of the fifteen the hover card shows, so the list meant to make periods comparable carried
less than the thing that describes one. The two answer different questions — *what about this one*
versus *how do they compare* — and comparison is why it is not a card per period: one column is one
field, so the eye runs down it, while in cards the same field sits at a different height in every
one. The width that made the fuller table awkward is bought back honestly: the columns are grouped
under **Period · Result · Account**, and the currency is stated ONCE above the table instead of four
times per row. A response is one currency by construction, but that is the backend's guarantee, so
rows that disagree fall back to the code in the cell.

**A booking close is not a boundary the other lanes share, so nothing is ruled across them.** The
timeline briefly drew a vertical rule at every distinct closing instant. On the lane that closed it
only repeated the span's own edge; on every other lane it asserted a relationship that does not
exist, because the units of a run book independently — where one scenario closes its booking period is not
an event for another. Removed 2026-09-27, with the marker machinery it was the only caller of. The
spans carry their own boundaries; a cross-lane rule belongs to something the spans do NOT encode,
and when such a thing appears it gets designed against real data rather than kept in reserve.

**One lane is a UNIT inside a run and a SESSION across a deployment.** `unit_name` is the profile
name and identical in every session of a deployment, so laning by it stacks every session's
periods into one row — measured: eight periods rendered as two visible bars, six hidden behind
the others.

**The stamps are never rescaled, and this is the sharp edge.** A deployment carries TWO time bases
that differ by a factor of thousands: the ledger's session stamps are wall clock (four sessions of
26 s each, 7 s apart) while a booking period is stamped on the canonical clock the session replayed
(the same ~27 h window in all four). No single axis can carry both. An earlier attempt squeezed
each session's periods into its wall-clock window to produce a staircase, and that drew a session
that does not exist. The axis therefore follows the period stamps, unscaled: sessions that
replayed one window look ALIKE, which is the finding — those runs are comparable because they
covered the same stretch. In a real forward-running deployment the two clocks coincide and the
staircase appears on its own. The wall-clock sequence lives in the sessions table, in `started`,
`ran_hours` and `gap_hours`.

**A vertical rule marks each distinct booking close** — the trading-day anchor every lane shares.
Distinct instants only, so four sessions closing at one anchor draw one line rather than four.

**A drawdown is rendered as a magnitude, whatever sign arrived.** The backend aligned the booking
period column to a magnitude, but stored artifacts written before that keep the negative form and
nothing in the payload distinguishes them. A decline has one direction, so `drawdown()` drops the
sign and loses nothing.

**The reconciliation is a COMPLETENESS check and the panel says so.** `total_*` are summed over the
periods and `run_*` are the run's own counters, but both descend from a single value handed to two
carriers three lines apart. A disagreement therefore means a record was lost on the way — evicted
by a history cap, falling in no period's window — and can never mean the P&L is wrong: an
arithmetic defect moves both figures together and the check stays green. `reconciles` is
three-state, and `null` (the run reports no figure in this currency, so nothing was compared) is
rendered as loudly as `false`. A tick there would claim evidence that does not exist.
