# List Geometry

A panel's size is the reader's own arrangement, so a list must stay readable at any width and height without its columns drifting from their headings. Read this document when a column overflows or the headings move as a group opens, and before you declare ranks or bands for a list.

**Where a track is content-sized and where it must not be.** `auto` is fine in a list without
groups. With groups it is a defect: while every group is closed the columns the heading spans hold
no cells at all, so the track is sized from nothing and then re-sized the moment a group opens,
sliding every heading sideways. A grouped list therefore declares proportional tracks —
`minmax(0, Nfr)`, where `fr` accounts for the gaps that percentages ignore and `minmax(0, …)` stops
one long cell widening its column. A heading cell may SPAN tracks, which is what the table's old
`colspan` did for the unit's name.

**Or the list measures the closed groups too — `measureClosed`.** Not every column of a grouped
list can take a share: the run list's stamp and figures are as wide as their values, and a share
wide enough for the widest one wastes room on every other row. Those tracks stay `auto`, and then a
closed group holding the widest value of a column widens it the moment it opens — measured
2026-10-15 on the run list, 4.75 px once the index held thirteen runs more, and every heading
beside it moved. With `measureClosed` the list also draws the rows of every closed group, at the
end of the grid, with no height, unseen, hidden from assistive technology (`aria-hidden`) and out of
reach of focus and pointer (`inert`). The tracks are then sized over every row, shown or not, which
is how established data grids settle it. It is opt-in, because a long list then draws rows it does
not show — measured 2026-10-15 on the preview bundle, +74 ms on the warm run list at 154 runs; the
unseen rows are memoised on the row, so a pick does not draw them again. The run list is the caller
that needs it. Such a row keeps the `record-row` class, since
the width-bearing styles hang on it, and is told apart by `record-unseen` — whatever counts the
rows on screen counts `.record-row:not(.record-unseen)`.

**Columns given up as the list narrows, by rank.** A column declares `rank: 1 | 2 | 3 | 4 | 5`; 1
survives every width and 5 goes first. Absent means 1, so a list that ranks nothing keeps every
column, exactly as before. The rungs are **34 / 48 / 62 / 80 rem** of the LIST's own width.

**There are five rungs because the fourth was unbounded above, and that is where the defect lived.**
Measured 2026-09-30 at three window widths, comparing each track against what its content needs: at
69 rem the booking periods drew all fourteen columns in tracks of **22 px** — three monospace
characters — and overflowed by 18 px; the run list gave `Set`, the one cell a reader recognises,
112 px for 157 px of text, so it read `aggressive_t…`; the roster gave `Currency` 42 px for a 68 px
heading, three headings too tight at once. **None of those is a narrow window** — 69 rem is the
ordinary width of a maximised one here, which is exactly why a ladder topping out at 62 rem never
engaged. With the fifth rung all three overflow at zero at every measured width.

Each list declares a rank at every rung it needs and no more, because a rank the list does not use
makes a breakpoint that changes nothing — which reads as a broken one rather than as an absent one:

| list | columns | ladder |
|---|---|---|
| `RunPicker` | 10 | 10 → 8 → 7 → 6 → 4 |
| `TradeHistoryPanel` | 8 | 8 → 6 → 4 → 3 |
| `ScenarioRosterPanel` | 15 | 15 → 11 → 8 → 5 → 3 |
| `BookingPeriodTable` | 14–15 | 14 → 10 → 8 → 6 → 4 |
| `SessionsTable` | 6 | 6 → 4 → 3 |
| `DeploymentPicker` | 9 | 9 → 7 → 5 → 3 |

What goes first is decided from the DATA where the data can decide it. The roster's `market`,
`currency` and `broker` carried the same value on all ten rows of a measurement, so they lead. The
booking periods' `Win Rate` and `PF` read `n/a` on eight of ten drawn rows, because eight of those
periods booked no trade at all — and `Opening` and `Equity band` describe the same account movement
that `Final equity` closes, which is rank 1. The run list gives up its `Run id` early despite it
being the declared key: it renders as the timestamp part, the same instant `Started` spells out.

Measured on the scenario roster at a 900 px window: twelve columns in a 620 px panel is 40 px each,
five monospace characters, every cell unreadable. Ranked, the same panel shows three columns in
full: scenario · net P&L · state.

Two mechanisms, and neither alone works. A cell hidden with `display: none` leaves its TRACK
standing and its share of the width with it; a track removed under a cell that stays shifts every
later cell into the wrong column. So the stem publishes a track string per tier as a custom
property and a **container query** picks one, while the same query hides the cells. The width that
matters is the LIST's, not the window's — a panel's width is the reader's own arrangement, since
they drag the seams — which is why a container query and not a media query. A `.record-shell`
wrapper exists solely to be measured: an element cannot query its own width.

The rank lives twice, on the column and on the cell, and it has to: the list owns the tracks while
the caller owns the cells. Each ranked list asserts that the two agree.

Consumers today: the run picker, the trade history, the scenario roster, the booking periods and
the deployment sessions. Still to move: the portfolio, whose rebuild around the ACCOUNT lens is
undecided rather than blocked.

**Bands over the headings, for a list too wide to read as one row of equal words.** `bands` is a
list of `{ label, span }`, drawn as a second sticky row above the headings, each band spanning its
columns. The booking periods read as *Period · Result · Account* rather than as fifteen equal
fields. The spans must cover the columns EXACTLY; the stem checks the arithmetic and draws no bands
at all where it does not add up, because a band off by one sits over the wrong column and nothing
on screen says so. That was a real defect in the table this replaced — `colspan 6 + 1 + 2` in an
eight-column layout stretched it past its own heading.

A declared span is the span at the **widest** tier, and it has to shrink with the ranks. Under
ranks the grid has fewer tracks than the declaration counts, so a fixed span reaches past the end
of it: measured 2026-09-30 on the booking periods at a 28 rem panel, four bands demanded fourteen
tracks of a four-track grid, the browser grew implicit columns to fit them, and every band then
stood over the wrong columns. The arithmetic check above could not see it — it compares against
`columns.length`, which is the count at the widest tier and says nothing about the others. So each
band carries all four of its spans on itself (`--s1` … `--s4`, the columns of its own that survive
that tier) and the container query chooses one for every band at once. That is what makes it
expressible in static CSS: the stem does not know how many bands a caller declares, but it does
know which tier is in force. A band that keeps **no** column is reported and no bands are drawn —
`span 0` is not a span, and patching it to one would put it over somebody else's column.

The same arithmetic reaches a GROUP heading, which is why the trade history's is counted from the
END: its name takes `1 / -2` and its net `-2 / -1`, so the heading holds at every tier. The three
cells it replaced spanned `5 + 1 + 2`, fixed at eight columns. That is also why `Net P&L` is the
last column of that list rather than the sixth.

**A list caps its height against the VIEW it sits in, never against the browser window.** The run
and deployment views are CSS size containers (`container-type: size`), and the lists inside them —
the run list, the deployment list, the scenario roster, the booking-period table — measure their
`max-height` in `cqh`. With `vh` a view given half the screen still sized its run list for the whole
of it, and the rows past the view's own hidden overflow could not be reached. Dialogs and hover
cards stay in `vh`: they float over the whole screen, so the window IS their measure. The run list,
the whole of its panel since 2026-10-14, takes the REST of its view through flex rather than a cap
with a fixed reserve for what stands above it: with the hint dismissed, a reserve of 11.5 rem stood
empty below the last row (measured 2026-10-16: 144 px); `cqh` stays its floor, a third of the view.
