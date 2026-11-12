import { describe, it, expect } from 'vitest'
import { settleRanks } from '@/composables/use_ranked_bar'

/**
 * A bar of entries, each with a long and a short width, measured by plain numbers rather than a
 * layout: what `settleRanks` decides is the ORDER and the stop, which jsdom can check.
 */
function bar(entries: { rank: number, long: number, short: number }[], room: number) {
  const short = new Set<number>()
  const width = (): number => entries.reduce((sum, entry) => sum + (short.has(entry.rank) ? entry.short : entry.long), 0)
  const steps: string[] = []
  return {
    steps,
    shorten: (rank: number, isShort: boolean): void => {
      if (isShort) short.add(rank)
      else short.delete(rank)
      steps.push(`${rank}:${isShort ? 'short' : 'long'}`)
    },
    pressed: (): boolean => width() > room,
  }
}

const ENTRIES = [
  { rank: 1, long: 100, short: 20 },
  { rank: 2, long: 80, short: 20 },
  { rank: 3, long: 60, short: 20 },
]

describe('settleRanks', () => {
  it('leaves every entry long where the bar has the room', () => {
    const fits = bar(ENTRIES, 300)
    expect(settleRanks([1, 2, 3], fits.shorten, fits.pressed)).toEqual([])
  })

  it('shortens the lowest rank first, and stops the moment the rest fits', () => {
    const tight = bar(ENTRIES, 170)
    expect(settleRanks([1, 2, 3], tight.shorten, tight.pressed)).toEqual([1])
    const tighter = bar(ENTRIES, 110)
    expect(settleRanks([1, 2, 3], tighter.shorten, tighter.pressed)).toEqual([1, 2])
  })

  it('shortens every rank where even that does not fit, and starts from the long forms each time', () => {
    const never = bar(ENTRIES, 10)
    expect(settleRanks([1, 2, 3], never.shorten, never.pressed)).toEqual([1, 2, 3])
    // a bar grown again: everything long first, then only what the new room asks
    expect(never.steps.slice(0, 3)).toEqual(['1:long', '2:long', '3:long'])
  })
})
