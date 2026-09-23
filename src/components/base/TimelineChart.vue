<script setup lang="ts">
import { computed } from 'vue'
import HoverCard from '@/components/base/HoverCard.vue'
import type { TimelineLane } from '@/types/timeline_types'

/**
 * Spans on a shared horizontal scale, one lane per row, with the axis on top.
 *
 * Deliberately knows nothing about runs, periods or time: it places numbers on a scale and labels
 * the scale with a formatter the caller supplies. Every domain decision — what a lane is, which
 * clock the numbers are on, how a span is coloured — belongs to the caller, so the same chart
 * draws one run's ledger and a whole deployment without either meaning leaking in here.
 */
const props = withDefaults(defineProps<{
  lanes: TimelineLane[]
  /** The scale. Positions outside it are clamped rather than drawn off the edge. */
  from: number
  to: number
  /** Turns a position into an axis label — the caller owns what the scale means. */
  format: (value: number) => string
  /** Said out loud under the axis, because a scale whose meaning is implicit gets misread. */
  scaleNote?: string
  /** Positions on the same scale to rule across every lane — a boundary all lanes share. */
  markers?: number[]
  /**
   * Remove a stretch where NOTHING is drawn once it exceeds this length, and mark the removal.
   *
   * This breaks the axis, which is only honest because of what is removed: a time axis encodes
   * duration through length, and cutting an EMPTY stretch leaves every drawn length and every
   * ratio between them exactly as it was. Compressing the gap instead of removing it would not —
   * that would claim a proportion the data does not have. Zero or absent keeps the axis linear.
   */
  collapseGapsLongerThan?: number
  /** Renders the length of a removed stretch — the caller owns what the scale's units mean. */
  formatGap?: (length: number) => string
  /**
   * Renders a kept piece as ONE label spanning it. A piece's two edges can sit closer together
   * than a single label is wide, and two labels then overprint into a smear; one range says the
   * same thing in the space that is actually there. Falls back to two formatted ends.
   */
  formatRange?: (from: number, to: number) => string
  ticks?: number
  /** Width of the lane-label column, in rem. */
  labelWidth?: number
}>(), {
  ticks: 5,
  labelWidth: 15,
  scaleNote: '',
  markers: () => [],
  collapseGapsLongerThan: 0,
  formatGap: (length: number) => String(length),
  formatRange: undefined,
})

interface Segment {
  from: number
  to: number
  /** Share of the plot width this segment occupies. */
  width: number
  /** Where it starts, in plot percent. */
  at: number
}

/** A removed stretch, drawn as a fixed-width break rather than to scale. */
interface Break {
  at: number
  length: number
}

/** Each break costs this share of the plot; the data shares what is left. */
const BREAK_WIDTH = 5

const length = computed(() => props.to - props.from)

/** Every drawn stretch, merged — what the axis has to keep. */
const occupied = computed(() => {
  const all = props.lanes
    .flatMap(lane => lane.spans)
    .map(span => ({ from: Math.min(span.from, span.to), to: Math.max(span.from, span.to) }))
    .sort((a, b) => a.from - b.from)
  const merged: { from: number, to: number }[] = []
  for (const piece of all) {
    const last = merged[merged.length - 1]
    if (last && piece.from <= last.to) last.to = Math.max(last.to, piece.to)
    else merged.push({ ...piece })
  }
  return merged
})

/**
 * The axis as kept pieces plus removed stretches. Without collapsing this is one piece spanning
 * the whole scale, so every caller reads the same shape.
 */
const axis = computed(() => {
  const threshold = props.collapseGapsLongerThan
  const pieces = occupied.value
  if (threshold <= 0 || pieces.length < 2 || length.value <= 0) {
    return {
      segments: [{ from: props.from, to: props.to, at: 0, width: 100 }] as Segment[],
      breaks: [] as Break[],
    }
  }

  // group the kept stretches, absorbing any gap that is not worth removing
  const kept: { from: number, to: number }[] = [{ from: props.from, to: pieces[0]!.to }]
  const removed: number[] = []
  for (let i = 1; i < pieces.length; i += 1) {
    const gap = pieces[i]!.from - pieces[i - 1]!.to
    if (gap > threshold) {
      kept.push({ from: pieces[i]!.from, to: pieces[i]!.to })
      removed.push(gap)
    } else {
      kept[kept.length - 1]!.to = pieces[i]!.to
    }
  }
  kept[kept.length - 1]!.to = Math.max(kept[kept.length - 1]!.to, props.to)

  const dataWidth = 100 - removed.length * BREAK_WIDTH
  const total = kept.reduce((sum, piece) => sum + (piece.to - piece.from), 0)
  const segments: Segment[] = []
  const breaks: Break[] = []
  let cursor = 0
  kept.forEach((piece, index) => {
    if (index > 0) {
      breaks.push({ at: cursor, length: removed[index - 1]! })
      cursor += BREAK_WIDTH
    }
    const width = total > 0 ? ((piece.to - piece.from) / total) * dataWidth : dataWidth
    segments.push({ from: piece.from, to: piece.to, at: cursor, width })
    cursor += width
  })
  return { segments, breaks }
})

/** Position as a percentage of the plot, piecewise where the axis is broken. Clamped. */
function offset(value: number): number {
  const segments = axis.value.segments
  for (const segment of segments) {
    if (value <= segment.to) {
      const span = segment.to - segment.from
      const inside = span > 0 ? Math.max(0, (value - segment.from) / span) : 0
      return Math.min(100, segment.at + Math.min(1, inside) * segment.width)
    }
  }
  const last = segments[segments.length - 1]!
  return Math.min(100, last.at + last.width)
}

/**
 * A tick at each kept piece's edges rather than at even intervals: once the axis is broken, an
 * evenly spaced tick can fall inside a stretch that was removed and would name a moment the chart
 * does not show.
 */
interface Tick {
  at: number
  label: string
  /** Where the label hangs: 'start' right of its mark, 'end' left of it, 'mid' centred. */
  edge: string
}

const axisTicks = computed<Tick[]>(() => {
  if (!axis.value.breaks.length) {
    const count = Math.max(2, props.ticks)
    return Array.from({ length: count }, (_, i) => {
      const value = props.from + (length.value * i) / (count - 1)
      return { at: (i / (count - 1)) * 100, label: props.format(value), edge: 'mid' }
    })
  }
  // one label per kept piece, centred on it: its two edges are what a reader wants, and they fit
  // in the width the piece actually has only when they share a label
  return axis.value.segments.map(segment => ({
    at: segment.at + segment.width / 2,
    label: props.formatRange
      ? props.formatRange(segment.from, segment.to)
      : `${props.format(segment.from)} → ${props.format(segment.to)}`,
    edge: 'mid',
  }))
})

/**
 * Where a label hangs relative to its position. On a broken axis the two labels around a break sit
 * only BREAK_WIDTH apart, and they are the two the reader needs most — so instead of dropping one,
 * a piece's opening label hangs to the right of its mark and its closing label to the left. They
 * then sit back to back across the break rather than on top of each other.
 *
 * A piece too narrow to hold both loses its CLOSING label: the break's own caption follows
 * immediately after it and says the same thing in different words.
 */
const MIN_TICK_GAP = 14

/**
 * Labels are STAGGERED onto a second line rather than dropped or shrunk. A timestamp is wide and
 * the marks it belongs to can be close: shrinking the text makes the axis unreadable, dropping a
 * label loses a moment the reader needs. Two rows double the room, and a pointer under each label
 * says which mark it belongs to — which is the thing a staggered axis otherwise leaves ambiguous.
 */
const placedTicks = computed(() => {
  const all = axis.value.breaks.length
    ? axisTicks.value.filter((tick, index) => {
        if (tick.edge !== 'end' || index === axisTicks.value.length - 1) return true
        const opening = axisTicks.value[index - 1]
        return !opening || tick.at - opening.at >= MIN_TICK_GAP
      })
    : axisTicks.value

  const lastOnRow = [-Infinity, -Infinity]
  return all.map(tick => {
    // the top row unless its neighbour there is too close, in which case the row below
    const row = tick.at - lastOnRow[0]! >= MIN_TICK_GAP ? 0 : 1
    lastOnRow[row] = tick.at
    return { ...tick, row }
  })
})

const ruled = computed(() => props.markers.map(value => ({ value, at: offset(value) })))

const drawn = computed(() =>
  props.lanes.map(lane => ({
    ...lane,
    bars: lane.spans.map(span => {
      const left = offset(span.from)
      // a span shorter than a pixel still has to be findable, so width has a floor in CSS
      return { ...span, left, width: Math.max(0, offset(span.to) - left) }
    }),
  }))
)
</script>

<template>
  <div v-if="drawn.length" class="timeline" :style="{ '--label-width': `${labelWidth}rem` }">
    <div class="axis-row">
      <span class="axis-spacer" />
      <div class="axis" :title="scaleNote">
        <span
          v-for="tick in placedTicks"
          :key="`tick-${tick.at}`"
          class="tick"
          :class="[tick.edge, `row-${tick.row}`]"
          :style="{ left: `${tick.at}%` }"
        >{{ tick.label }}</span>
        <!-- the pointer belongs to the MARK, not to the label, so it is placed and centred
             independently — a staggered label otherwise leaves the reader guessing which one -->
        <span
          v-for="tick in placedTicks"
          :key="`stem-${tick.at}`"
          class="stem"
          :class="`row-${tick.row}`"
          :style="{ left: `${tick.at}%` }"
        />
        <!-- the removal is NAMED, which is the only thing that makes a broken axis honest -->
        <span
          v-for="gap in axis.breaks"
          :key="`gaplabel-${gap.at}`"
          class="gap-label"
          :style="{ left: `${gap.at + BREAK_WIDTH / 2}%` }"
        >{{ formatGap(gap.length) }}</span>
      </div>
    </div>

    <div v-for="lane in drawn" :key="lane.id" class="lane-row">
      <RouterLink
        v-if="lane.to"
        class="lane-label lane-link"
        :to="lane.to"
        :title="lane.label"
      >{{ lane.label }} ↗</RouterLink>
      <span v-else class="lane-label" :title="lane.label">{{ lane.label }}</span>
      <div class="lane">
        <span
          v-for="gap in axis.breaks"
          :key="`gap-${gap.at}`"
          class="gap"
          :style="{ left: `${gap.at}%`, width: `${BREAK_WIDTH}%` }"
          :title="formatGap(gap.length)"
        />
        <!-- drawn ABOVE the spans: a boundary falls exactly on a span edge, where the 2px surface
             gap is the only place it could be seen at all -->
        <span
          v-for="rule in ruled"
          :key="`rule-${rule.value}`"
          class="rule"
          :style="{ left: `${rule.at}%` }"
        />
        <HoverCard
          v-for="bar in lane.bars"
          :key="bar.id"
          :title="bar.title"
          :details="bar.details"
        >
          <div
            class="span"
            :class="bar.tone"
            :style="{ left: `${bar.left}%`, width: `${bar.width}%` }"
            tabindex="0"
          >
            <span class="span-label">{{ bar.label }}</span>
          </div>
        </HoverCard>
      </div>
    </div>

  </div>
</template>

<style scoped>
.timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.axis-row,
.lane-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.axis-spacer,
.lane-label {
  flex: 0 0 var(--label-width);
}

.lane-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* the axis carries the scale and nothing else — recessive, never competing with the spans */
.axis {
  position: relative;
  flex: 1;
  /* three lines: two staggered rows of labels, then the removals, so none overprints another */
  height: 3.4rem;
  border-bottom: 1px solid var(--color-border);
}

.tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* By class, not by :first-child — the gap labels share this container, so a positional selector
   matched the wrong element. `start` hangs right of its mark, `end` hangs left of it, which is
   what keeps the two labels around a break from overprinting. */
.tick.start { transform: none; }
.tick.end { transform: translateX(-100%); }
.tick.mid { transform: translateX(-50%); }

.tick.row-1 { top: 1.05rem; }

/* the pointer from a label down to the mark it names */
.stem {
  position: absolute;
  width: 1px;
  background-color: var(--color-border);
}

.stem.row-0 { top: 0.95rem; height: 1.3rem; }
.stem.row-1 { top: 2rem; height: 0.25rem; }

.lane-link {
  color: var(--color-accent);
  text-decoration: none;
}

.lane-link:hover {
  text-decoration: underline;
}

.lane {
  position: relative;
  flex: 1;
  height: 1.25rem;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

/* the removed stretch: hatched and dashed, so it never reads as a span with no colour */
.gap {
  position: absolute;
  top: -1px;
  bottom: -1px;
  border-left: 1px dashed var(--color-annotation);
  border-right: 1px dashed var(--color-annotation);
  background-color: var(--color-bg-base);
  pointer-events: none;
}

.gap-label {
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
  text-align: center;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-annotation);
  white-space: nowrap;
  overflow: visible;
}

.rule {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 1px;
  z-index: 1;
  background-color: var(--color-text-primary);
  opacity: 0.55;
  pointer-events: none;
}

.span {
  position: absolute;
  top: 2px;
  bottom: 2px;
  min-width: 3px;
  border-radius: 4px;
  /* a 2px surface ring, so two adjacent spans never read as one */
  outline: 2px solid var(--color-bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.span.positive { background-color: var(--color-positive); }
.span.negative { background-color: var(--color-negative); }
.span.flat     { background-color: var(--color-text-secondary); }

/* the label wears ink, never the span colour */
.span-label {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-bg-base);
  padding: 0 var(--space-xs);
  white-space: nowrap;
}

.rule {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 1px;
  z-index: 1;
  background-color: var(--color-text-primary);
  opacity: 0.55;
  pointer-events: none;
}

.span {
  position: absolute;
  top: 2px;
  bottom: 2px;
  min-width: 3px;
  border-radius: 4px;
  /* a 2px surface ring, so two adjacent spans never read as one */
  outline: 2px solid var(--color-bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.span.positive { background-color: var(--color-positive); }
.span.negative { background-color: var(--color-negative); }
.span.flat     { background-color: var(--color-text-secondary); }

/* the label wears ink, never the span colour */
.span-label {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-bg-base);
  padding: 0 var(--space-xs);
  white-space: nowrap;
}

.tooltip {
  position: absolute;
  z-index: 5;
  transform: translateX(-50%);
  min-width: 15rem;
  padding: var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-bg-surface);
  box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
  pointer-events: none;
}

.tooltip-title {
  margin: 0 0 var(--space-xs);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.tooltip-rows {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0 var(--space-md);
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.tooltip-rows dt {
  color: var(--color-text-secondary);
}

.tooltip-rows dd {
  margin: 0;
  text-align: right;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.tooltip-rows dd.positive { color: var(--color-positive); }
.tooltip-rows dd.negative { color: var(--color-negative); }
</style>
