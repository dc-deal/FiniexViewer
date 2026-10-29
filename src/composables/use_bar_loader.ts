import { computed, ref, shallowRef } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { getBars } from '@/api/api_client'
import type { ApiBar } from '@/types/api/bar_types'

/** How many bars one ask brings, at the first look and at the right edge (decided 2026-10-29, 252.a). */
export const BARS_PER_BATCH = 2000

/**
 * The route's own maximum for `limit`: above it the request is refused, never cut (their
 * `market-data` document). A piece asked for to the LEFT is at most this many periods long.
 */
const ROUTE_LIMIT = 10_000

export type BarEdge = 'left' | 'right'

/** What a chart loads from: one market in one timeframe, inside an outer span. */
export interface BarSource {
  broker: string
  symbol: string
  timeframe: string
  /**
   * The timeframe's length in milliseconds. A piece of N periods holds at most N bars — the route
   * renders one bar a period, and a period without ticks none — so a left piece is never cut.
   */
  period: number
  /** The outer span in UTC milliseconds: nothing is asked for before `from` or after `to`. */
  from: number
  to: number
  /** Where the first ask begins, in UTC milliseconds — clamped into the span. */
  start: number
}

export interface BarLoader {
  /** The bars loaded, oldest first, as served. */
  served: Readonly<ShallowRef<ApiBar[]>>
  /** `X-Bar-Price-Basis` of the last answer — '' before one. */
  priceBasis: Readonly<Ref<string>>
  /** Every bar that opens from here on to `loadedTo` is loaded, in UTC milliseconds; null before a load. */
  loadedFrom: Readonly<Ref<number | null>>
  loadedTo: Readonly<Ref<number | null>>
  /** Whether the span holds more beyond each edge of what is loaded. */
  more: ComputedRef<{ left: boolean, right: boolean }>
  /** The first ask on its way — the chart is not drawn yet. */
  loading: Readonly<Ref<boolean>>
  /** The edges a batch is on its way to — the chart stays drawn. */
  loadingEdges: ComputedRef<BarEdge[]>
  error: Readonly<Ref<string | null>>
  /** A batch at an edge that failed: the bars loaded stay, and the next move toward it asks again. */
  edgeError: Readonly<Ref<{ edge: BarEdge, message: string } | null>>
  open: (source: BarSource) => Promise<void>
  extend: (edge: BarEdge) => Promise<void>
  clear: () => void
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function message(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure)
}

/**
 * Bars loaded as the view moves (viewer#9): a first batch, then more at an edge the reader comes
 * near — one loader per chart, so several charts load apart.
 *
 * Shaped by how the route answers (measured 2026-10-29): it serves the bars that OPEN in the range,
 * both bounds included, and where the range holds more than `limit` it keeps the OLDEST. So a batch
 * to the right asks from the seam to the outer edge with `limit`, and gets the next bars whatever
 * gaps lie between. To the left there is no "the N bars before": a capped answer would leave a hole
 * at the seam, so the left is asked in pieces of N periods, which the cap never reaches. An empty
 * piece is a gap, not an edge — the next one is asked at once, twice as long.
 *
 * The seams fall a millisecond apart: what is loaded is every bar opening from `loadedFrom` to
 * `loadedTo`, and the next ask starts one millisecond past either.
 */
export function useBarLoader(): BarLoader {
  const served = shallowRef<ApiBar[]>([])
  const priceBasis = ref('')
  const loadedFrom = ref<number | null>(null)
  const loadedTo = ref<number | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const edgeError = ref<{ edge: BarEdge, message: string } | null>(null)
  const asking = ref<Record<BarEdge, boolean>>({ left: false, right: false })
  let source: BarSource | null = null
  /** Raised for every new source; an answer for an earlier one writes nothing. */
  let generation = 0
  /** How many periods the next piece to the left spans: doubled after an empty one. */
  let leftSpan = BARS_PER_BATCH

  const more = computed(() => ({
    left: source !== null && loadedFrom.value !== null && loadedFrom.value > source.from,
    right: source !== null && loadedTo.value !== null && loadedTo.value < source.to,
  }))

  const loadingEdges = computed(() => (['left', 'right'] as const).filter(edge => asking.value[edge]))

  function reset(): void {
    served.value = []
    priceBasis.value = ''
    loadedFrom.value = null
    loadedTo.value = null
    loading.value = false
    error.value = null
    edgeError.value = null
    asking.value = { left: false, right: false }
    leftSpan = BARS_PER_BATCH
  }

  /** The next bars from `at` on, toward the right edge. False where a newer source took over. */
  async function forward(run: number, at: number): Promise<boolean> {
    const span = source!
    // a range whose start is not before its end is refused (`invalid_range`): at the edge, nothing is left
    if (at >= span.to) {
      loadedTo.value = span.to
      return true
    }
    const answer = await getBars(span.broker, span.symbol, span.timeframe, iso(at), iso(span.to), BARS_PER_BATCH)
    if (run !== generation) return false
    const last = served.value.at(-1)?.t ?? -Infinity
    served.value = [...served.value, ...answer.bars.filter(bar => bar.t > last)]
    if (answer.priceBasis) priceBasis.value = answer.priceBasis
    // cut by the limit: loaded to the last bar served, whose period the next batch starts past
    loadedTo.value = answer.truncated ? answer.bars.at(-1)!.t * 1000 : span.to
    return true
  }

  /** One piece to the left of what is loaded. The number of bars it brought, or null where a newer source took over. */
  async function backward(run: number): Promise<number | null> {
    const span = source!
    const before = loadedFrom.value!
    const from = Math.max(span.from, before - Math.min(leftSpan, ROUTE_LIMIT) * span.period)
    if (from >= before - 1) {
      loadedFrom.value = span.from
      return 0
    }
    const answer = await getBars(span.broker, span.symbol, span.timeframe, iso(from), iso(before - 1), ROUTE_LIMIT)
    if (run !== generation) return null
    // a piece of N periods holds at most N bars: a cut one would leave a hole at the seam unseen
    if (answer.truncated) throw new Error(`The archive served more bars than ${iso(from)} to ${iso(before)} holds periods`)
    const first = served.value[0]?.t ?? Infinity
    served.value = [...answer.bars.filter(bar => bar.t < first), ...served.value]
    if (answer.priceBasis && !priceBasis.value) priceBasis.value = answer.priceBasis
    loadedFrom.value = from
    leftSpan = answer.bars.length ? BARS_PER_BATCH : leftSpan * 2
    return answer.bars.length
  }

  /** To the left until a piece brings bars or the edge is reached. False where a newer source took over. */
  async function leftUntilBars(run: number): Promise<boolean> {
    while (loadedFrom.value! > source!.from) {
      const brought = await backward(run)
      if (brought === null) return false
      if (brought > 0) break
    }
    return true
  }

  /**
   * Loads a new source: the bars from its start on. Where none lie between the start and the right
   * edge, it goes on to the left until some do or the span is exhausted — only then is it empty.
   */
  async function open(next: BarSource): Promise<void> {
    const run = ++generation
    reset()
    source = { ...next, start: Math.min(next.to, Math.max(next.from, next.start)) }
    loading.value = true
    loadedFrom.value = source.start
    try {
      if (!await forward(run, source.start)) return
      if (!served.value.length && !await leftUntilBars(run)) return
    } catch (failure) {
      if (run === generation) error.value = message(failure)
    } finally {
      if (run === generation) loading.value = false
    }
  }

  /** More at an edge, where the span holds more there — one batch at a time per edge. */
  async function extend(edge: BarEdge): Promise<void> {
    if (!source || loading.value || error.value || asking.value[edge] || !more.value[edge]) return
    const run = generation
    asking.value = { ...asking.value, [edge]: true }
    if (edgeError.value?.edge === edge) edgeError.value = null
    try {
      if (edge === 'right') await forward(run, loadedTo.value! + 1)
      else await leftUntilBars(run)
    } catch (failure) {
      if (run === generation) edgeError.value = { edge, message: message(failure) }
    } finally {
      if (run === generation) asking.value = { ...asking.value, [edge]: false }
    }
  }

  /** Nothing to load: what was loaded goes, and an answer still on its way writes nothing. */
  function clear(): void {
    generation++
    source = null
    reset()
  }

  return { served, priceBasis, loadedFrom, loadedTo, more, loading, loadingEdges, error, edgeError, open, extend, clear }
}
