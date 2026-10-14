import { describe, it, expect } from 'vitest'
import { marksPosition } from '@/composables/use_position_link'

/**
 * The position a reader jumped to, as it is compared.
 *
 * Tested apart from the panels because the comparison must never match on the position id alone.
 * Their own warning, 2026-10-02: every scenario counts from `pos_<symbol>_1`, so two scenarios of
 * one symbol both have a `pos_gbpusd_1`.
 */
describe('what a marked position matches', () => {
  const MARKED = { scenario: 'GBPUSD_window_01', position: 'pos_gbpusd_1' }

  it('matches both halves together', () => {
    expect(marksPosition(MARKED, 'GBPUSD_window_01', 'pos_gbpusd_1')).toBe(true)
  })

  /** The whole reason the pair travels: the same id in another scenario is another position. */
  it('does not match the same id in another scenario', () => {
    expect(marksPosition(MARKED, 'GBPUSD_window_02', 'pos_gbpusd_1')).toBe(false)
  })

  it('does not match another position in the same scenario', () => {
    expect(marksPosition(MARKED, 'GBPUSD_window_01', 'pos_gbpusd_2')).toBe(false)
  })

  /**
   * A row without a position has none to match. `position_id` is null on 45 % of order rows —
   * a submission, a refusal and an expiry never had one.
   */
  it('matches no row that has no position at all', () => {
    expect(marksPosition(MARKED, 'GBPUSD_window_01', null)).toBe(false)
  })

  it('matches nothing where nothing is marked', () => {
    expect(marksPosition(null, 'GBPUSD_window_01', 'pos_gbpusd_1')).toBe(false)
  })
})
