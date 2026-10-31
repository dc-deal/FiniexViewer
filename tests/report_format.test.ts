import { describe, it, expect } from 'vitest'
import {
  bytes, drawdownFigure, largerFirst, modelledSpreadFigures, orDash, polarity, priceAt, priceDistance, shortHash, signClass, sortInstant,
  spreadFigure, utcInstant, utcSpan,
} from '@/components/runs/report_format'

/**
 * The formatters are exercised through the panels that use them, and that is where the
 * unit-and-meaning cases belong. These three are here on their own because they are pure, because
 * two of them are new, and because the third carried a crash that no panel test could reach until
 * a card asked it to render a damaged field.
 */
describe('report_format', () => {
  /** A price the backend computed is ours to round for display, to the instrument's tick size (their `prices` document). */
  describe('priceAt', () => {
    it('prints a computed price on the tick, and one the venue wrote as it wrote it', () => {
      expect(priceAt(1.1677499513751617, 0.00001)).toBe('1.16775')
      // a run recorded before contract 34 keeps what it read, widened from a 32-bit float
      expect(priceAt(1.1625800132751465, 0.00001)).toBe('1.16258')
      expect(priceAt(0.87957, 0.00001)).toBe('0.87957')
    })

    it('prints as many decimals as the step has, ungrouped, as the chart axis does', () => {
      expect(priceAt(1.1677, 0.00001)).toBe('1.16770')
      expect(priceAt(64123.44, 0.1)).toBe('64123.4')
      expect(priceAt(2345.678, 0.01)).toBe('2345.68')
      expect(priceAt(101.4, 1)).toBe('101')
    })

    it('rounds to a multiple of a step that is no power of ten', () => {
      expect(priceAt(100.37, 0.25)).toBe('100.25')
      expect(priceAt(100.4, 0.25)).toBe('100.50')
    })

    /** A run still running has written no broker report yet. */
    it('goes no further than the eighth decimal where no tick size is known, and guesses nothing', () => {
      expect(priceAt(1.1654013009624113, null)).toBe('1.1654013')
      expect(priceAt(64123.4, null)).toBe('64123.4')
      expect(priceAt(0.00000995, null)).toBe('0.00000995')
      expect(priceAt(1.5, 0)).toBe('1.5')
    })
  })

  /** A slippage is a distance, and off the tick where a fill is measured against a level a strategy computed. */
  describe('priceDistance', () => {
    it('shows a distance below the tick, to the eighth decimal', () => {
      expect(priceDistance(-0.000009951375161687537)).toBe('-0.00000995')
      expect(priceDistance(0.0012)).toBe('0.0012')
    })

    it('reads float noise around zero as zero, with no sign', () => {
      expect(priceDistance(-2.220446049250313e-16)).toBe('0')
      expect(priceDistance(0)).toBe('0')
    })
  })

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

  describe('utcSpan', () => {
    it('says the date once where both ends fall on the same UTC day', () => {
      expect(utcSpan('2026-10-12T20:57:34+00:00', '2026-10-12T20:59:06+00:00'))
        .toBe('2026-10-12 20:57:34Z → 20:59:06Z')
    })

    /** The same day on the reader's clock is not the same day on UTC: the date comes back. */
    it('says both dates where the stretch crosses midnight UTC', () => {
      expect(utcSpan('2026-10-12T23:59:00+00:00', '2026-10-13T00:01:00+00:00'))
        .toBe('2026-10-12 23:59:00Z → 2026-10-13 00:01:00Z')
      expect(utcSpan('2026-10-13T01:30:00+02:00', '2026-10-13T00:10:00+00:00'))
        .toBe('2026-10-12 23:30:00Z → 2026-10-13 00:10:00Z')
    })

    it('leaves a hole for an end that is not a date, rather than borrowing the other one', () => {
      expect(utcSpan('2026-10-12T20:57:34+00:00', null)).toBe('2026-10-12 20:57:34Z → ')
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

  describe('largerFirst', () => {
    /** A size that could not be read is no figure, and certainly not the smallest. */
    it('sorts the larger first, and one that could not be read after every figure, a zero included', () => {
      expect([0, null, 3_100_000_000, 7_100_000_000].sort(largerFirst)).toEqual([7_100_000_000, 3_100_000_000, 0, null])
    })
  })

  /**
   * One rule for every colour that says gain or loss — a list cell, a timeline span, a mark on the
   * run chart. It was written three times, and zero is where three copies can come to disagree.
   */
  describe('polarity', () => {
    it('reads a figure by its sign, and zero as flat', () => {
      expect([12.5, -0.01, 0].map(polarity)).toEqual(['positive', 'negative', 'flat'])
    })

    it('leaves a flat cell without a colour class', () => {
      expect([12.5, -0.01, 0].map(signClass)).toEqual(['positive', 'negative', ''])
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

  /**
   * The modelled spread stands only where one was charged: 0 on every run over recorded quotes and
   * null on a period recorded before contract 33 would put a line of noise on all of them.
   */
  describe('modelledSpreadFigures', () => {
    it('gives one figure with its reason where a spread was modelled, and none where not', () => {
      const format = (value: number) => `${value} USD`
      expect(modelledSpreadFigures(0, format)).toEqual([])
      expect(modelledSpreadFigures(null, format)).toEqual([])
      const [modelled, ...rest] = modelledSpreadFigures(1.75, format)
      expect(rest).toEqual([])
      expect(modelled?.label).toBe('Modelled spread')
      expect(modelled?.value).toBe('1.75 USD')
      expect(modelled?.title).toContain('modelled')
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

  /**
   * Since contract 40 a drawdown and an equity band are null where nothing could value the account.
   * Absence is shown as absence — a zero would assert a measurement nobody took.
   */
  describe('a figure that may not have been measured', () => {
    it('says a figure nobody measured as a dash, and formats one that was', () => {
      expect(orDash(null, value => `${value} USD`)).toBe('—')
      expect(orDash(0, value => `${value} USD`)).toBe('0 USD')
    })

    it('puts a drawdown beside its share where one is stated, and a dash where none was measured', () => {
      expect(drawdownFigure(-12.5, 3.47, 'USD')).toBe('12.50 USD (3.47%)')
      expect(drawdownFigure(12.5, null, 'USD')).toBe('12.50 USD')
      expect(drawdownFigure(null, null, 'USD')).toBe('—')
    })
  })
})
