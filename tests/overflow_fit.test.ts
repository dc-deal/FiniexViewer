import { describe, it, expect } from 'vitest'
import { fittingCount } from '@/components/base/overflow_fit'

describe('fittingCount', () => {
  /** Where everything fits, the control costs nothing — it is not there. */
  it('keeps every item where the whole row fits, without room for the control', () => {
    // 3 × 100 + 2 gaps of 4 = 308, and the control would need 40 more
    expect(fittingCount([100, 100, 100], 4, 308, 40)).toBe(3)
  })

  it('stops at the first item that no longer fits beside the control', () => {
    // control 40, then 4 + 100 per item: 144, 248, 352 > 350
    expect(fittingCount([100, 100, 100, 100], 4, 350, 40)).toBe(2)
  })

  /** In order, never by size: a short item further on does not jump the queue. */
  it('keeps the order and never skips ahead to a smaller item', () => {
    expect(fittingCount([100, 300, 20], 0, 200, 40)).toBe(1)
  })

  it('leaves nothing in the row where not even the first item fits beside the control', () => {
    expect(fittingCount([100, 100], 0, 120, 40)).toBe(0)
  })

  it('has nothing to fit in an empty row', () => {
    expect(fittingCount([], 4, 0, 40)).toBe(0)
  })
})
