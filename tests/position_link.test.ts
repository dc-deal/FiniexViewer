import { describe, it, expect } from 'vitest'
import {
  formatPositionRef,
  marksPosition,
  parsePositionRef,
} from '@/composables/use_position_link'

/**
 * The position a reader jumped to, as it travels in a URL and as it is compared.
 *
 * Tested apart from the panels because both halves are load-bearing and neither is obvious: the
 * param must survive a reload (that is what makes a shared link mean anything), and the comparison
 * must never match on the position id alone. Their own warning, 2026-10-02: every scenario counts
 * from `pos_<symbol>_1`, so two scenarios of one symbol both have a `pos_gbpusd_1`.
 */
describe('a position in a link', () => {
  it('survives the round trip', () => {
    const ref = { scenario: 'GBPUSD_window_01', position: 'pos_gbpusd_2' }
    expect(parsePositionRef(formatPositionRef(ref))).toEqual(ref)
  })

  /** A scenario name is a configured unit name — this one has the separator in it. */
  it('keeps a scenario name that contains the separator', () => {
    const ref = { scenario: 'odd~name', position: 'pos_1' }
    expect(parsePositionRef(formatPositionRef(ref))).toEqual(ref)
  })

  it('needs no percent-encoding, so a shared link stays readable', () => {
    const value = formatPositionRef({ scenario: 'GBPUSD_2026-01-29', position: 'pos_gbpusd_1' })
    expect(encodeURIComponent(value)).toBe(value)
  })

  describe('a param that is not both halves marks nothing', () => {
    it.each([
      ['absent', undefined],
      ['empty', ''],
      ['one half only', 'GBPUSD_window_01'],
      ['no scenario', '~pos_1'],
      ['no position', 'GBPUSD_window_01~'],
    ])('%s', (_name, value) => {
      expect(parsePositionRef(value)).toBeNull()
    })
  })

  describe('what it matches', () => {
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
})
