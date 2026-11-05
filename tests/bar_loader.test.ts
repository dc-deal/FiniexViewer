import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as apiClient from '@/api/api_client'
import { BARS_PER_BATCH, useBarLoader } from '@/composables/use_bar_loader'
import type { BarSource } from '@/composables/use_bar_loader'
import type { ApiBar, BarAnswer } from '@/types/api/bar_types'

vi.mock('@/api/api_client', () => ({
  getBars: vi.fn(),
}))

/**
 * Bars loaded as the view moves (viewer#9), against an archive that answers as the route does
 * (measured 2026-10-29): the bars that OPEN in the range, both bounds included, oldest first, and
 * where the range holds more than `limit`, the OLDEST of them, said in `truncated`.
 */

const MINUTE = 60_000
const T0 = Date.parse('2026-02-01T00:00:00Z')

function bar(ms: number): ApiBar {
  return { t: ms / 1000, o: 1, h: 1, l: 1, c: 1, v: 1, tc: 1 }
}

/** A bar a minute over each stretch given, in minutes after T0 — the gaps between them hold none. */
function archive(...stretches: [number, number][]): ApiBar[] {
  return stretches.flatMap(([from, to]) =>
    Array.from({ length: to - from + 1 }, (_, index) => bar(T0 + (from + index) * MINUTE)))
}

function serve(bars: ApiBar[]): void {
  vi.mocked(apiClient.getBars).mockImplementation(async (_b, _s, _tf, from, to, limit = 10_000): Promise<BarAnswer> => {
    const matched = bars.filter(row => row.t * 1000 >= Date.parse(from) && row.t * 1000 <= Date.parse(to))
    return { bars: matched.slice(0, limit), truncated: matched.length > limit, priceBasis: 'order_driven' }
  })
}

/** The span of the archive in minutes after T0, opened at `start`. */
function source(from: number, to: number, start: number): BarSource {
  return {
    broker: 'kraken_spot', symbol: 'BTCUSD', timeframe: 'M1', period: MINUTE,
    from: T0 + from * MINUTE, to: T0 + to * MINUTE, start: T0 + start * MINUTE,
  }
}

const minutes = (loaded: ApiBar[]) => loaded.map(row => (row.t * 1000 - T0) / MINUTE)

/** Every bar once, in order, with none missing between the first and the last. */
function whole(loaded: ApiBar[], expected: ApiBar[]): void {
  const times = loaded.map(row => row.t)
  expect(new Set(times).size).toBe(times.length)
  expect(times).toEqual([...times].sort((a, b) => a - b))
  const first = expected.findIndex(row => row.t === times[0])
  expect(times).toEqual(expected.slice(first, first + times.length).map(row => row.t))
}

describe('useBarLoader', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getBars).mockReset()
  })

  it('loads a batch from the start on, the rest of the span marked as more on either side', async () => {
    const bars = archive([0, 9999])
    serve(bars)
    const loader = useBarLoader()
    await loader.open(source(0, 9999, 3000))
    const [, , , from, to, limit] = vi.mocked(apiClient.getBars).mock.calls[0]!
    expect([from, to, limit]).toEqual([new Date(T0 + 3000 * MINUTE).toISOString(), new Date(T0 + 9999 * MINUTE).toISOString(), BARS_PER_BATCH])
    expect(loader.served.value).toHaveLength(BARS_PER_BATCH)
    expect(minutes(loader.served.value)[0]).toBe(3000)
    expect(loader.more.value).toEqual({ left: true, right: true })
    expect(loader.priceBasis.value).toBe('order_driven')
    expect(loader.loading.value).toBe(false)
  })

  it('takes a span that fits one batch whole, with nothing more on either side', async () => {
    serve(archive([0, 119]))
    const loader = useBarLoader()
    await loader.open(source(0, 119, 0))
    expect(loader.served.value).toHaveLength(120)
    expect(loader.more.value).toEqual({ left: false, right: false })
    expect(apiClient.getBars).toHaveBeenCalledOnce()
  })

  /** To the right the limit keeps the oldest: the next batch, whatever gap lies between. */
  it('extends to the right across a gap in one ask, nothing twice and nothing lost at the seam', async () => {
    const bars = archive([0, 2499], [40_000, 42_000])
    serve(bars)
    const loader = useBarLoader()
    await loader.open(source(0, 42_000, 0))
    await loader.extend('right')
    expect(vi.mocked(apiClient.getBars).mock.calls).toHaveLength(2)
    // the next ask starts a millisecond past the last bar loaded
    expect(vi.mocked(apiClient.getBars).mock.calls[1]![3]).toBe(new Date(T0 + 1999 * MINUTE + 1).toISOString())
    expect(loader.served.value).toHaveLength(2 * BARS_PER_BATCH)
    whole(loader.served.value, bars)
    expect(minutes(loader.served.value).at(-1)).toBe(41_499)
  })

  /** To the left a capped answer would leave a hole: pieces of N periods, which hold at most N bars. */
  it('extends to the left in pieces the limit never reaches, nothing twice at the seam', async () => {
    const bars = archive([0, 9999])
    serve(bars)
    const loader = useBarLoader()
    await loader.open(source(0, 9999, 5000))
    await loader.extend('left')
    const [, , , from, to, limit] = vi.mocked(apiClient.getBars).mock.calls[1]!
    expect([from, to, limit]).toEqual([
      new Date(T0 + 3000 * MINUTE).toISOString(), new Date(T0 + 5000 * MINUTE - 1).toISOString(), 10_000,
    ])
    expect(minutes(loader.served.value)[0]).toBe(3000)
    whole(loader.served.value, bars)
  })

  /** A gap is not an edge: the loader asks on at once, each piece twice as long, up to the route's limit. */
  it('goes on across a gap to the left, doubling the piece after each empty one', async () => {
    const bars = archive([0, 99], [30_000, 30_999])
    serve(bars)
    const loader = useBarLoader()
    await loader.open(source(0, 30_999, 30_000))
    await loader.extend('left')
    const spans = vi.mocked(apiClient.getBars).mock.calls.slice(1)
      .map(([, , , from, to]) => Math.round((Date.parse(to) + 1 - Date.parse(from)) / MINUTE))
    // 2000, 4000, 8000, 10000, then the last piece to the edge
    expect(spans).toEqual([2000, 4000, 8000, 10_000, 6000])
    expect(minutes(loader.served.value)[0]).toBe(0)
    expect(loader.more.value.left).toBe(false)
    whole(loader.served.value.slice(0, 100), bars)
  })

  it('asks nothing past an edge it has reached', async () => {
    serve(archive([0, 119]))
    const loader = useBarLoader()
    await loader.open(source(0, 119, 0))
    await loader.extend('left')
    await loader.extend('right')
    expect(apiClient.getBars).toHaveBeenCalledOnce()
  })

  it('asks one batch at a time at an edge, however often the view comes near it', async () => {
    serve(archive([0, 9999]))
    const loader = useBarLoader()
    await loader.open(source(0, 9999, 0))
    const first = loader.extend('right')
    const second = loader.extend('right')
    expect(loader.loadingEdges.value).toEqual(['right'])
    await Promise.all([first, second])
    expect(apiClient.getBars).toHaveBeenCalledTimes(2)
    expect(loader.loadingEdges.value).toEqual([])
  })

  /** Where nothing lies from the start to the right edge, the bars before it are looked for. */
  it('goes on to the left where the first batch is empty, and is empty only where the span is', async () => {
    serve(archive([0, 99]))
    const loader = useBarLoader()
    await loader.open(source(0, 9000, 8000))
    expect(minutes(loader.served.value)).toHaveLength(100)
    serve([])
    const empty = useBarLoader()
    await empty.open(source(0, 9000, 8000))
    expect(empty.served.value).toEqual([])
    expect(empty.more.value).toEqual({ left: false, right: false })
  })

  it('writes nothing from an answer for a source no longer loaded', async () => {
    let late: (answer: BarAnswer) => void = () => {}
    vi.mocked(apiClient.getBars).mockImplementationOnce(() => new Promise(resolve => { late = resolve }))
    const loader = useBarLoader()
    const first = loader.open(source(0, 119, 0))
    serve(archive([0, 9]))
    await loader.open(source(0, 9, 0))
    late({ bars: archive([50, 60]), truncated: false, priceBasis: '' })
    await first
    expect(minutes(loader.served.value)).toEqual(Array.from({ length: 10 }, (_, index) => index))
  })

  it('keeps the bars loaded where a batch at an edge fails, and says at which edge', async () => {
    serve(archive([0, 9999]))
    const loader = useBarLoader()
    await loader.open(source(0, 9999, 5000))
    vi.mocked(apiClient.getBars).mockRejectedValueOnce(new Error('Network Error'))
    await loader.extend('left')
    expect(loader.edgeError.value).toEqual({ edge: 'left', message: 'Network Error' })
    expect(loader.served.value).toHaveLength(BARS_PER_BATCH)
    expect(loader.loadingEdges.value).toEqual([])
    // the next move toward it asks again
    await loader.extend('left')
    expect(loader.edgeError.value).toBeNull()
    expect(minutes(loader.served.value)[0]).toBe(3000)
  })

  it('says a first batch that failed, and extends nothing after it', async () => {
    vi.mocked(apiClient.getBars).mockRejectedValue(new Error('Request failed with status code 500'))
    const loader = useBarLoader()
    await loader.open(source(0, 9999, 5000))
    expect(loader.error.value).toBe('Request failed with status code 500')
    await loader.extend('right')
    expect(apiClient.getBars).toHaveBeenCalledOnce()
  })

  it('clears what was loaded, and an answer still on its way writes nothing', async () => {
    let late: (answer: BarAnswer) => void = () => {}
    vi.mocked(apiClient.getBars).mockImplementationOnce(() => new Promise(resolve => { late = resolve }))
    const loader = useBarLoader()
    const first = loader.open(source(0, 119, 0))
    loader.clear()
    late({ bars: archive([0, 9]), truncated: false, priceBasis: '' })
    await first
    await flushPromises()
    expect(loader.served.value).toEqual([])
    expect(loader.loading.value).toBe(false)
  })
})
