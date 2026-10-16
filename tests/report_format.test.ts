import { describe, it, expect } from 'vitest'
import { bytes, shortHash, sortInstant, spreadFigure, utcInstant } from '@/components/runs/report_format'

/**
 * The formatters are exercised through the panels that use them, and that is where the
 * unit-and-meaning cases belong. These three are here on their own because they are pure, because
 * two of them are new, and because the third carried a crash that no panel test could reach until
 * a card asked it to render a damaged field.
 */
describe('report_format', () => {
  describe('utcInstant', () => {
    it('renders an ISO instant as the canonical UTC clock', () => {
      expect(utcInstant('2026-09-25T09:52:27+00:00')).toBe('2026-09-25 09:52:27Z')
    })

    /** A field nobody recorded is a hole, and a hole renders as nothing. */
    it('gives nothing for an absent stamp', () => {
      expect(utcInstant(null)).toBe('')
    })

    /**
     * The same hole, and it used to be a RangeError: Intl throws on an invalid date rather than
     * returning anything, so ONE damaged stamp in one row took down the whole list it was in.
     */
    it('gives nothing for a stamp that is not a date, rather than throwing', () => {
      expect(utcInstant('not-a-date')).toBe('')
      expect(utcInstant('')).toBe('')
    })
  })

  describe('sortInstant', () => {
    /** Compared as text, `+02:00` would sort after a `Z` stamp that is an hour LATER. */
    it('orders by the instant, not by the text of the offset', () => {
      expect(sortInstant('2026-10-12T09:30:00+02:00')).toBeLessThan(sortInstant('2026-10-12T08:00:00Z'))
    })

    it('gives 0 for a stamp that is not a date, so it sorts last under newest', () => {
      expect(sortInstant('not-a-date')).toBe(0)
    })
  })

  describe('bytes', () => {
    it('steps through the units a reader holds', () => {
      expect(bytes(512)).toBe('512 B')
      expect(bytes(2048)).toBe('2.0 kB')
      expect(bytes(23878038)).toBe('23.9 MB')
      expect(bytes(4_500_000_000)).toBe('4.50 GB')
    })

    /** Decimal steps AND decimal names: kB at 1024 is the wrong name for the number. */
    it('names the step it actually divided by', () => {
      expect(bytes(1000)).toBe('1.0 kB')
      expect(bytes(999)).toBe('999 B')
    })
  })

  /** null is data without a quote: no spread was measured, which is not a spread of zero. */
  describe('spreadFigure', () => {
    it('formats a measured spread, a zero one included, and names one never measured', () => {
      const format = (value: number) => `${value} EUR`
      expect(spreadFigure(2.955, format)).toBe('2.955 EUR')
      expect(spreadFigure(0, format)).toBe('0 EUR')
      expect(spreadFigure(null, format)).toBe('not recorded')
    })
  })

  describe('shortHash', () => {
    it('keeps the part that distinguishes one hash from another', () => {
      const sha = 'a'.repeat(64)
      expect(shortHash(sha)).toBe(`${'a'.repeat(12)}…`)
    })

    /** A short id is already readable, so nothing is taken off it. */
    it('leaves a value that is short enough alone', () => {
      expect(shortHash('abc123')).toBe('abc123')
    })
  })
})
