import { describe, it, expect } from 'vitest'
import { t, plural } from '@/translate'

describe('t', () => {
  // the marking is the point, not a lookup — a changed return value would be a silent translation
  it('returns its input unchanged', () => {
    expect(t('Booking Periods')).toBe('Booking Periods')
  })
})

describe('plural', () => {
  it('agrees with the count', () => {
    expect(plural(1, t('trade'), t('trades'))).toBe('1 trade')
    expect(plural(2, t('trade'), t('trades'))).toBe('2 trades')
  })

  // zero is plural in English — "0 trades", never "0 trade"
  it('reads zero as plural', () => {
    expect(plural(0, t('trade'), t('trades'))).toBe('0 trades')
  })

  /**
   * The same separator the tick count already used, so a line carrying both figures does not show
   * one of them grouped and the other not.
   */
  it('groups a large count the way every other figure is grouped', () => {
    expect(plural(13584, t('tick'), t('ticks'))).toBe(`${(13584).toLocaleString()} ticks`)
  })
})
