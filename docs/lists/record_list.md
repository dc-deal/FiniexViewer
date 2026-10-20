# Record List

Every table-shaped list in the viewer is drawn by one component, `RecordList`, and this document explains what the list owns and what its caller owns. Read it before you build a list or change `RecordList.vue`; how the columns keep their place when a panel changes size is in [List Geometry](list_geometry.md).

## The list itself — one stem under every table-shaped list

`FacetBar` narrows a list; **`src/components/base/RecordList.vue`** draws it. The two are deliberately
separate: either can serve a list the other has never seen, and the run picker has extra controls
between the bar and the rows that a single combined component would have to grow a prop for.

- **`RecordList.vue`** — generic over its row type. It owns the grid tracks, the sticky headings, the
  row button with its four states, the group heading, an optional spanning prose line, an optional
  card beside the row, and an optional block of CHILD records. A chosen (`picked`) or marked row
  wears the annotation edge always and the raised surface AT REST only, so hover and press still
  answer under the pointer. It holds no state, sorts nothing,
  filters nothing and folds nothing.
- **`src/types/list_types.ts`** — `ListColumn` (label, track, whether it is a figure, its rank, and
  an optional `hint`) and `ListGroup` (one partition: key, rows, open). What the card beside a row
  shows is a `FigureCard` (`src/types/figure_types.ts`), the shape every card of the app takes.

**The columns line up across rows, and a grid on the row cannot do it.** Each row is its own
`<button>` — deliberately, because a row that cannot be focused or pressed is the look of a broken
control — and a grid declared on the button sizes ITS OWN tracks. Forty-one rows were forty-one
independent grids: measured 2026-09-29, the figures drifted 99 px across fourteen rows. `subgrid`
reconciles them — the list owns the tracks, the `<li>` disappears with `display: contents` so the
button becomes a direct item of it, and the button adopts the tracks instead of inventing them.

**A heading is CLIPPED and carries its own word.** `.record-head > span` is `white-space: nowrap`;
without an overflow rule a heading wider than its column spilled over the one beside it and the two
words overprinted — measured 2026-10-01, `Win Rate` took 68 px of a 66 px track on the deployment
view, where a fifteenth column takes share from the rest. The stem clips now and puts the whole
label in a `title`, the same pattern a cell uses. A column that must stay legible at every width
says so with a FLOOR in its own track instead: five of the booking periods carry one, because a
timestamp is 20 fixed characters and a heading is as wide as its word, and a proportional share
cannot express either.

**`rowClass` is the one class a CALLER puts on a row**, for a distinction only it can see; the list
keeps `picked`, `grouped` and `inert` beside it rather than handing the class list over. Its first
use is the position boundary above. A lead line (`hasLead`) says such a thing in words and takes a
row to do it — a rule belongs on the row it precedes.

**A line BEFORE a row, for a statement about the gap.** `hasLead` plus a `lead` slot, mirroring
`hasDetail` / `detail`. A deployment's configuration changed between two sessions: everything above
ran with one thing and everything below with another, so a badge on either row would misreport it
as a property of that row. It is a line and not a control — nothing to click, nothing to mark — and
it wears the annotation role DASHED, which is what that role is for.

**A column can declare what it MEANS, for a field whose own name misleads.** `hint` rides in the
heading's `title` AFTER the label — never in place of it, because a heading wider than its column is
clipped and the title is how it can still be read in full. The first case is `order_id` on an order
row: the backend's glossary opens its entry with *"Not an order's own id: the id of the POSITION the
order belongs to"*, so a heading reading `Order` alone claimed something false. The heading carries
their term, `Order id`, and their sentence is one hover away. It is the same attachment point
viewer#26 will serve these from.

**`figure: true` needs TWO halves, exactly like `rank`, and for the same reason.** The declaration
right-aligns the HEADING, which the stem owns; the CELLS come from the caller's slot, so the caller
right-aligns those. Measured 2026-09-30 across every ranked list, comparing the right edge of the
INK: three of the four had figure cells sitting **11 to 172 px left of the heading they belong to**,
ten columns of ten in the booking periods. Every declaration was correct and the geometry was not,
which is why no unit test could see it — the invariant lives in `e2e/list_ranks.spec.ts`. Each
caller marks its figure cells `figure-cell` and carries one rule for them.

A column of figures that does not line up with its own label is not a column. The fix is one rule
per list; the reason it is not one rule in the stem is that a scoped stylesheet cannot reach into a
caller's slotted cells, and the stem does not know which position each caller's figures sit in.
Cloning the slot's vnodes to stamp both `rank` and `figure` from the column list would remove both
duplications at once — recorded as a direction, not taken, because it would change how all five
callers are written.

**A list can group TWICE, and a group may state nothing at all.** `outerBy` puts a second level
above `groupBy`, because the orders list has rows that belong to a scenario AND to a position and
each level needs its own heading. `showsGroupHead` lets the caller refuse a heading for a given
group: the run list folds 85 lines into 42, but 28 of those groups hold one run, and a heading over
one row is a line, a glyph and a click to disclose what is already on screen. A group with no
heading is never closed — nothing could open it again.

**ONE disclosure glyph, and the list decides it.** Two panels wrote `group.open ? '▾' : '▸'` by
hand, a third opened its fills with no glyph at all, and the operator could not find the disclosure
on screen (2026-10-08). The glyph now travels as a slot prop — `marker` — exactly as a row's does:
the list decides the SHAPE and the STATE, the caller decides which cell it sits in, because the
caller owns the cells. The intermediate form, where the list drew its own glyph beside the slot,
cost its own defect: a position heading carried TWO triangles, and the unit test read the first of
them and passed. The heading's cells are placed on explicit tracks, so a glyph of the list's own
would be auto-placed onto a row of its own.

**ONE indentation step, and it means UNDER A HEADING.** `--record-step` is the single rung: a row
whose group states itself sits one step in, a row whose group states nothing stays level with the
headings. Both halves matter — the first version gave every row of a grouping list the step, which
is no ladder at all, and the operator said so on sight.

The step is RESERVED on every row of such a list and taken back with a `transform` from the rows
that stand alone, because a transform moves the ink without moving the box. An `auto` track is
sized from its cells, so a step only some rows carry sizes the column differently depending on
which groups are open: measured 2026-10-10, opening one family grew the run list's first track by
exactly one step and pushed the column beside it 24 px sideways. A list that scrolls also reserves
its scrollbar gutter, or the bar appearing on a click takes 15 px from the proportional column.

**A GROUP and a CHILD are different things, kept apart on purpose.** A group is a partition of the
same row kind: no columns of its own, only a heading over rows that already fit. A child is a record
of ANOTHER kind that a row owns — a trade's fills — with its own columns. Serving both from one
mechanism is what makes a list component collapse under itself. The grouping is the CALLER's
declaration, never a control: a list whose grouping the reader can rearrange has no shape anyone
recognises, and a screenshot of it shows a different list than their own.

**A group heading carries no figure it had to compute.** Its numbers are the ones the API SERVED for
that group — `scenario_totals` on the trade history — looked up by key. `ListGroup` therefore holds
no totals at all. That is not fastidiousness: the backend's own declared reductions state that a
drawdown must come from the row that won it, that a rate is rebuilt from summed components rather
than averaged, and that a streak can cross a boundary and so answers nothing. A heading with no
served total shows its NAME and its ROW COUNT, and no figure.

**The card beside a row is wrapped by the LIST, not by the caller.** reka-ui's trigger takes a
single element and that element is the row button, which the list owns. Wrapping every row
unconditionally would mount a tooltip context per row — five hundred on a long trade list, for
lists that offer no card — so a row without a card is a bare button.

**A figure's caveat rides on its pair in the card too**, as a `title` on the label and the value —
the same place a `FigureBlock` puts it. The card stays open under the pointer, so the pair can be
hovered. Until 2026-10-15 the card dropped it: every caveat handed to a card — the deployment's
drawdown, a unit's fees charged, a spread not recorded, the run's full config id — was in the
caller's figures and nowhere on screen.
