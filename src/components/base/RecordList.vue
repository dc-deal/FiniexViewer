<script setup lang="ts" generic="T">
import { computed } from 'vue'
import HoverCard from '@/components/base/HoverCard.vue'
import type { ListBand, ListCard, ListColumn, ListGroup } from '@/types/list_types'

/**
 * A list read as a TABLE and clicked as a list: aligned columns, sticky headings, one button per
 * row, optional groups above the rows and optional child records beneath them.
 *
 * Extracted from the run picker after it was measured rather than invented. Two things had to be
 * true at once and neither is obvious:
 *
 * **The columns must line up across rows, and a grid on the row cannot do it.** Each row is its own
 * `<button>` — deliberately, because a row that cannot be focused or pressed is the look of a
 * broken control — and a grid declared on the button sizes ITS OWN tracks. Forty-one rows were
 * forty-one independent grids: measured 2026-09-29, the figures drifted 99 px across fourteen rows
 * and the eye had to re-find every column on every line. `subgrid` reconciles them: this list owns
 * the tracks, the `<li>` disappears with `display: contents` so the button becomes a direct item of
 * it, and the button adopts the tracks instead of inventing them.
 *
 * **The headings stick.** A scrolled list whose headings have gone is a list of unlabelled numbers.
 *
 * A GROUP and a CHILD are different things and are kept apart on purpose. A group is a partition of
 * the same row kind — no columns of its own, only a heading over rows that already fit. A child is
 * a record of ANOTHER kind that a row owns, with its own columns: a trade's fills. Serving both
 * from one mechanism is what makes a list component collapse under itself.
 *
 * The CELLS are the caller's, in the column order, through the slots. The component holds no state,
 * sorts nothing, filters nothing and folds nothing — `FacetBar` above it filters and sorts, and the
 * caller owns which groups are open.
 */
const props = defineProps<{
  rows: T[]
  columns: ListColumn[]
  /** What makes a row unique — the list's declared key, never guessed. */
  rowKey: (row: T) => string
  /**
   * One class the CALLER puts on a row, for a distinction only it can see. The list owns the row's
   * own states — picked, grouped, inert — and never writes this one.
   *
   * It exists for a BOUNDARY inside a group: the Orders panel marks the row that starts a new
   * position, so a scenario's records read as the positions they belong to rather than as one flat
   * run of lines. A lead line (`hasLead`) would say it in words and take a row to do it; a rule
   * belongs on the row it precedes.
   */
  rowClass?: (row: T) => string | undefined
  /** The row currently chosen, if the caller has such a notion. */
  isPicked?: (row: T) => boolean
  /**
   * A row may carry a SECOND line spanning every track — a failure sentence, a detail. Prose does
   * not fit a column, and squeezing it into one would make every column as wide as the longest
   * sentence in the list.
   */
  hasDetail?: (row: T) => boolean
  /**
   * A line spanning every track BEFORE a row, where `hasDetail` draws one after it.
   *
   * It exists because some statements are about the GAP between two rows rather than about either
   * of them: a deployment's configuration changed, so everything above ran with one thing and
   * everything below with another. A badge on the row beneath would claim that row was the change.
   * It is not a control — nothing to click, nothing to mark — for the same reason.
   */
  hasLead?: (row: T) => boolean
  /**
   * Partitions the rows. Absent, the list is flat and behaves exactly as before. Groups appear in
   * the order their first row does, so the caller's sort decides their order too — a group order of
   * its own would silently override the sort the reader chose.
   */
  groupBy?: (row: T) => string
  /** Whether a group is open. The caller holds that state; the component only reports the click. */
  isOpen?: (key: string) => boolean
  /**
   * Whether to draw this row's child records NOW. The caller holds the open/closed state, the same
   * way it holds a group's — so a row whose children are collapsed simply answers false.
   */
  showsChildren?: (row: T) => boolean
  /**
   * The figures that do not fit a column, shown beside the row on hover and on focus. `null` for a
   * row with nothing more to say.
   *
   * It is the LIST that wraps the row, not the caller, and that is forced rather than chosen: the
   * card's trigger must be a single element, and the single element is the row button — which this
   * component owns, deliberately, because that is where the four states and the focus ring live.
   * The caller supplies the cells, so it has eight siblings and no one element to offer.
   */
  rowCard?: (row: T) => ListCard | null
  /**
   * No headings. For a list NESTED under a row — a trade's fills — where a heading row would
   * repeat itself over every two lines and label what the cells already label inline.
   */
  hideHead?: boolean
  /**
   * Bands over the headings, so a wide list reads as a few things rather than as one row of
   * fourteen equal words. Absent, there is no band row at all.
   */
  bands?: ListBand[]
  /**
   * The rows are read-only: no button, no hover, no pointer. A row that looks like a control and
   * does nothing is the same defect as a control that looks disabled and works.
   */
  inert?: boolean
}>()

const emit = defineEmits<{
  pick: [T]
  toggle: [string]
}>()

defineSlots<{
  /** The row's cells, in column order — exactly `columns.length` of them. */
  default: (props: { row: T }) => unknown
  /** The spanning second line, drawn only where `hasDetail` says so. */
  detail?: (props: { row: T }) => unknown
  /** The spanning line BEFORE a row, drawn only where `hasLead` says so. */
  lead?: (props: { row: T }) => unknown
  /** The group heading's cells, in column order. Drawn only where `groupBy` is given. */
  group?: (props: { group: ListGroup<T> }) => unknown
  /** A row's child records, spanning every track. Drawn only where `showsChildren` says so. */
  children?: (props: { row: T }) => unknown
}>()

/**
 * How many rungs the ladder has. Five, and the fifth is the reason: the ladder ran 34 / 48 / 62 rem,
 * which left the TOP tier unbounded — so a fourteen-column list drew all fourteen at 69 rem in
 * tracks of 22 px and overflowed by 18 px. The CSS below carries the same five and they must agree.
 */
const TIERS = 5

const tracks = computed(() => props.columns.map(column => column.width).join(' '))

/**
 * The highest rank any column declares. 1 means nothing was ranked, and then the container queries
 * below have nothing to switch — the list keeps every column at every width, exactly as before.
 */
const deepestRank = computed(
  () => Math.max(1, ...props.columns.map(column => column.rank ?? 1))
)

/**
 * One track string per tier, so the GRID changes and not only the cells.
 *
 * Hiding a cell with `display: none` leaves its track standing and its share of the width with it,
 * which would spread the survivors and fix nothing. The component therefore publishes four track
 * strings as custom properties and a container query picks one — the browser measures, and no
 * caller writes a query of its own.
 */
const tierTracks = computed<Record<string, string>>(() => {
  const styles: Record<string, string> = {}
  for (let tier = 1; tier <= TIERS; tier += 1) {
    styles[`--list-tracks-${tier}`] = props.columns
      .filter(column => (column.rank ?? 1) <= tier)
      .map(column => column.width)
      .join(' ')
  }
  return styles
})

/**
 * A band's arithmetic is checked rather than trusted: the spans must cover the columns exactly.
 * Off by one, a band sits over the wrong column and nothing on screen says so — which is how the
 * table this replaced ended up nine columns wide in an eight-column layout.
 */
/**
 * How far down the headings stick when a band row sits above them: one monospace line plus the
 * padding that row carries. Declared here rather than guessed in CSS, because both come from the
 * same two tokens.
 */
const bandHeight = 'calc(var(--font-size-sm) * 1.4 + var(--space-xs))'

/** A band with the span it keeps at each tier, since a rank changes how many columns it covers. */
interface DrawnBand {
  label: string
  /** `--s1` … `--s5`, the surviving column count per tier. The container query picks which. */
  tiers: Record<string, string>
}

const bandSpans = computed<DrawnBand[] | null>(() => {
  const bands = props.bands
  if (!bands?.length) return null
  const covered = bands.reduce((sum, band) => sum + band.span, 0)
  if (covered !== props.columns.length) {
    console.error(
      `RecordList: bands span ${covered} of ${props.columns.length} columns — drawing none`
    )
    return null
  }

  /*
   * A band's span has to SHRINK with the ranks, and this is the half that was missing.
   *
   * The declared span counts the columns at the widest tier. Under ranks the grid has fewer tracks
   * than that, so a fixed span reaches past the end of it: measured 2026-09-30 on the booking
   * periods at a 28rem panel, four bands demanded fourteen tracks of a four-track grid, the
   * browser grew implicit columns to fit them, and every band then stood over the wrong columns.
   * The check above could not see it — it compares against `columns.length`, which is the count at
   * the WIDEST tier and says nothing about the others.
   *
   * Each band therefore carries all four of its spans, and the container queries choose one for
   * every band at once. That is what makes it expressible in static CSS: the stem does not know
   * how many bands a caller declares, but it does know which tier is in force.
   */
  let first = 0
  const drawn: DrawnBand[] = bands.map(band => {
    const own = props.columns.slice(first, first + band.span)
    first += band.span
    const tiers: Record<string, string> = {}
    for (let tier = 1; tier <= TIERS; tier += 1) {
      tiers[`--s${tier}`] = String(own.filter(column => (column.rank ?? 1) <= tier).length)
    }
    return { label: band.label, tiers }
  })

  // A band that loses every one of its columns cannot be drawn at all — `span 0` is not a span,
  // and a band standing over somebody else's column is worse than no bands. Reported rather than
  // patched to 1, because the caller's ranks are what need changing.
  const empty = drawn.findIndex(band => Object.values(band.tiers).includes('0'))
  if (empty >= 0) {
    console.error(
      `RecordList: band "${drawn[empty]!.label}" keeps no column at a narrow width — drawing none`
    )
    return null
  }
  return drawn
})

/**
 * What a heading says on hover. The LABEL comes first and always: a heading wider than its column
 * is clipped, and the title is how it can still be read in full. A `hint` follows it where the
 * column declares one, for a field whose own name misleads.
 */
function headTitle(column: ListColumn): string {
  return column.hint ? `${column.label} — ${column.hint}` : column.label
}

const grouped = computed(() => props.groupBy !== undefined)

/** Declared once so the three branches of the row — inert, carded and bare — cannot drift apart. */
function rowAttrs(row: T): Record<string, unknown> {
  const picked = props.isPicked?.(row)
  return {
    class: ['record-row', props.rowClass?.(row), { picked, grouped: grouped.value, inert: props.inert }],
    ...(picked === undefined || props.inert ? {} : { 'aria-pressed': picked }),
  }
}

/**
 * One shape for both modes: without `groupBy` the whole list is a single open section that draws no
 * heading. That keeps the row, its detail and its children written once rather than in two branches
 * that drift apart.
 */
const sections = computed<ListGroup<T>[]>(() => {
  const by = props.groupBy
  if (!by) return [{ key: '', rows: props.rows, open: true }]

  const order: string[] = []
  const buckets = new Map<string, T[]>()
  for (const row of props.rows) {
    const key = by(row)
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(row)
  }
  return order.map(key => ({
    key,
    rows: buckets.get(key) ?? [],
    open: props.isOpen?.(key) ?? true,
  }))
})
</script>

<template>
  <div class="record-shell">
  <ul
    class="record-list"
    :class="{ ranked: deepestRank > 1 }"
    :style="{
      '--list-tracks': tracks,
      '--list-head-top': bandSpans ? bandHeight : '0px',
      ...tierTracks,
    }"
  >
    <!--
      `aria-hidden`, deliberately: this is a `<ul>` of buttons rather than a table, so a heading
      here cannot be ASSOCIATED with a cell the way `<th>` is. A screen reader reads each row's
      button as one sentence that already names its own figures, and a loose row of words above it
      would only add noise. Sighted scanning is what these are for.
    -->
    <!-- the columns grouped by the question they answer, above the headings that name them -->
    <li v-if="bandSpans && !hideHead" class="record-bands" aria-hidden="true">
      <!-- all four spans on the element, and the container query below picks the one in force -->
      <span
        v-for="(band, index) in bandSpans"
        :key="`${band.label}-${index}`"
        :style="band.tiers"
      >{{ band.label }}</span>
    </li>

    <li v-if="!hideHead" class="record-head" aria-hidden="true">
      <span
        v-for="(column, index) in columns"
        :key="`${column.label}-${index}`"
        :class="{ 'head-figure': column.figure }"
        :data-rank="column.rank ?? 1"
        :title="headTitle(column)"
      >{{ column.label }}</span>
    </li>

    <template v-for="section in sections" :key="section.key">
      <li v-if="grouped">
        <button
          type="button"
          class="record-group"
          :aria-expanded="section.open"
          @click="emit('toggle', section.key)"
        >
          <slot name="group" :group="section" />
        </button>
      </li>

      <li v-for="row in (section.open ? section.rows : [])" :key="rowKey(row)">
        <!-- what changed BETWEEN this row and the one above it — a statement about the gap, so it
             is a line of its own and not a control -->
        <p v-if="hasLead?.(row)" class="record-lead">
          <slot name="lead" :row="row" />
        </p>
        <!--
          The button appears twice because a card, where there is one, must WRAP it: reka-ui's
          trigger takes a single element, and this button is it. Wrapping every row unconditionally
          would mount a tooltip context per row — 500 of them on a long trade list, for the lists
          that offer no card at all. `v-bind` keeps the two branches one line each.
        -->
        <!--
          `aria-pressed` wherever the caller has a notion of a chosen row, and only there: a row
          that can be chosen is a toggle, and a reader who cannot see the marked edge has nothing
          else to tell a chosen row from an unchosen one.
        -->
        <div v-if="inert" v-bind="rowAttrs(row)"><slot :row="row" /></div>
        <HoverCard
          v-else-if="rowCard?.(row)"
          :title="rowCard(row)!.title"
          :details="rowCard(row)!.details"
          side="top"
        >
          <button type="button" v-bind="rowAttrs(row)" @click="emit('pick', row)">
            <slot :row="row" />
          </button>
        </HoverCard>
        <button v-else type="button" v-bind="rowAttrs(row)" @click="emit('pick', row)">
          <slot :row="row" />
        </button>
        <p v-if="hasDetail?.(row)" class="record-detail">
          <slot name="detail" :row="row" />
        </p>
        <div v-if="showsChildren?.(row)" class="record-children">
          <slot name="children" :row="row" />
        </div>
      </li>
    </template>
  </ul>
  </div>
</template>

<style scoped>
/* The container the queries below measure. It exists only for that: an element cannot query its
   own width, so the grid needs a parent to ask about. Nothing else about the layout changes —
   `display: contents` inside the `<ul>` is unaffected by a box outside it. */
.record-shell {
  container-type: inline-size;
  container-name: record-list;
}

.record-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: var(--list-tracks);
  align-content: start;
}

/*
 * COLUMNS GIVEN UP AS THE LIST NARROWS.
 *
 * Only for a list that declares ranks — `.ranked` — so every other list keeps every column at
 * every width, exactly as before.
 *
 * Both halves are needed and neither alone works. The TRACKS must change, because a cell hidden
 * with `display: none` leaves its track standing and its share of the width with it. And the CELLS
 * must go, because a track removed under cells that stay shifts every later cell into the wrong
 * column. `:deep` for the second half: the row's cells come from the caller's slot and so carry
 * the caller's scope, not this component's.
 *
 * The breakpoints are the list's own width, not the window's — a panel's width is the reader's
 * arrangement, since they drag the seams.
 */
.record-list.ranked {
  grid-template-columns: var(--list-tracks-5);
}

/* The rung that was missing, and it is not a NARROW width: measured 2026-09-30, the booking periods
   drew all fourteen columns at 69 rem in tracks of 22 px and overflowed by 18 px, while the run list
   gave the set name that names the run 112 px for 157 px of text. Both are the ordinary width of a
   maximised window on this machine. A list that declares no rank 5 is untouched by it. */
@container record-list (max-width: 80rem) {
  .record-list.ranked {
    grid-template-columns: var(--list-tracks-4);
  }

  .record-list.ranked .record-bands > span {
    grid-column: span var(--s4);
  }

  .record-list.ranked :deep([data-rank="5"]) {
    display: none;
  }
}

@container record-list (max-width: 62rem) {
  .record-list.ranked {
    grid-template-columns: var(--list-tracks-3);
  }

  /* the bands with them: a span fixed at the widest tier reaches past the end of a narrowed grid */
  .record-list.ranked .record-bands > span {
    grid-column: span var(--s3);
  }

  .record-list.ranked :deep([data-rank="4"]) {
    display: none;
  }
}

@container record-list (max-width: 48rem) {
  .record-list.ranked {
    grid-template-columns: var(--list-tracks-2);
  }

  /* the bands with them: a span fixed at the widest tier reaches past the end of a narrowed grid */
  .record-list.ranked .record-bands > span {
    grid-column: span var(--s2);
  }

  .record-list.ranked :deep([data-rank="3"]) {
    display: none;
  }
}

@container record-list (max-width: 34rem) {
  .record-list.ranked {
    grid-template-columns: var(--list-tracks-1);
  }

  /* the bands with them: a span fixed at the widest tier reaches past the end of a narrowed grid */
  .record-list.ranked .record-bands > span {
    grid-column: span var(--s1);
  }

  .record-list.ranked :deep([data-rank="2"]) {
    display: none;
  }
}

/* the row and the heading are grid ITEMS of the list, so the `<li>` must not be a box */
.record-list > li {
  display: contents;
}

/* the bands sit ABOVE the headings, so the headings stick below them rather than at zero */
.record-bands > span {
  /* the span of the WIDEST tier, which is the only one an unranked list ever uses. The four
     container queries above swap it for the tier in force — one rule for every band, since the
     count each band keeps rides on the band itself. */
  grid-column: span var(--s5);
  position: sticky;
  top: 0;
  z-index: var(--z-list-head);
  padding: var(--space-xs) var(--space-sm) 0;
  background-color: var(--color-bg-surface);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-align: center;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.record-head > span {
  /* CLIPPED, and that is a correctness floor rather than tidiness: `nowrap` with no overflow rule
     let a heading wider than its column spill over the one beside it and the two words overprinted.
     Measured 2026-10-01 at 620 px — `Final equity` wanted 98 px of 90. A heading that truncates
     keeps its whole word in the title, exactly as a cell does; a column that must stay legible at
     every width says so with a floor in its own track. */
  overflow: hidden;
  text-overflow: ellipsis;
  position: sticky;
  /* below the bands where there are bands, at the top where there are none: both rows stick, and
     at the same offset the headings would have covered the bands they belong to */
  top: var(--list-head-top, 0);
  z-index: var(--z-list-head);
  padding: var(--space-xs) var(--space-sm);
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* a figure column is read downwards and right-aligned, so its heading sits over its digits */
.record-head > .head-figure {
  text-align: right;
}

.record-row,
.record-group {
  /* the LIST's tracks, not its own */
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  /* CENTRE, not baseline. A row must be the SAME height whatever its cells carry, or changing the
     sort or the filter changes the rhythm of the list and the reader sees it move rather than the
     data change. Baseline alignment lets a cell with a different inline box shift the row by a
     pixel or two — measured 2026-09-30 on the run list, 27 px against 29. The corollary is on the
     cells: a decoration inside one fits the text line rather than standing on it. */
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
  border: none;
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--color-border);
  background: none;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
}

/* the four states, the same two channels every control in this app uses */
.record-row:hover,
.record-group:hover {
  background-color: var(--color-bg-hover);
}

.record-row:active,
.record-group:active {
  background-color: var(--color-bg-active);
}

.record-row:focus-visible,
.record-group:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* the chosen row is marked WHERE the click happened, not only where it takes effect */
.record-row.picked {
  border-left-color: var(--color-annotation);
  background-color: var(--color-bg-elevated);
}

/* the group heading is a boundary in the list, so it is raised rather than coloured */
.record-group {
  background-color: var(--color-bg-elevated);
}

/* a read-only row claims nothing: no pointer, and no hover that suggests one */
.record-row.inert {
  cursor: default;
}

.record-row.inert:hover {
  background-color: transparent;
}

/* Only the FIRST cell is indented, never the row: padding on the row would shift every column out
   of the alignment the whole component exists to produce. */
.record-row.grouped > :first-child {
  padding-left: var(--space-lg);
}

/* A boundary in the list, in the annotation role and DASHED — it marks that the thing changed
   here, which is exactly what that role is for, and the dash is the second channel so it does not
   rest on hue alone. Above the row, because it is about the gap and not about the row. */
.record-lead {
  grid-column: 1 / -1;
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border-top: 1px dashed var(--color-annotation);
  color: var(--color-annotation);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/* prose spanning every track: a sentence in a column would set the column's width */
.record-detail {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0 var(--space-sm) var(--space-xs) var(--space-lg);
  border-bottom: 1px solid var(--color-border);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-error);
}

/* records of ANOTHER kind, with their own columns — so they get their own box rather than tracks */
.record-children {
  grid-column: 1 / -1;
  padding: 0 var(--space-sm) var(--space-xs) var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

@media (prefers-reduced-motion: reduce) {
  .record-row {
    transition: none;
  }
}
</style>
