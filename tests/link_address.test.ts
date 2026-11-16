import { describe, it, expect } from 'vitest'
import { readLink, withoutLink, writeLink } from '@/link_address'
import type { AddressLink } from '@/link_address'

/**
 * A link to a selection (viewer#60), read and written: the server, the run, the scenarios in focus,
 * the position and the chart's timeframe and moment — and what does not read left out, never guessed.
 */
const LINK: AddressLink = {
  server: 'default',
  run: '20261007_152959_0275a107',
  units: ['spot_venue_field_study'],
  position: { scenario: 'spot_venue_field_study', position: 'pos_ethusd_1' },
  chart: { timeframe: 'M1', at: Date.parse('2026-10-07T15:30:00Z') / 1000 },
}

describe('link_address', () => {
  it('reads back what it writes', () => {
    const address = writeLink('http://localhost:5173/', LINK)
    expect(address.startsWith('http://localhost:5173/?server=default&run=20261007_152959_0275a107')).toBe(true)
    expect(readLink(new URL(address).search)).toEqual(LINK)
  })

  it('writes a moment in whole seconds, as a reader would type it', () => {
    expect(decodeURIComponent(writeLink('/', LINK))).toContain('chart=M1@2026-10-07T15:30:00Z')
  })

  it('names no link where the address names no run', () => {
    expect(readLink('')).toBeNull()
    expect(readLink('?server=default&units=a')).toBeNull()
    expect(readLink('?run=%20')).toBeNull()
  })

  it('leaves out what does not read, and keeps the rest of the link', () => {
    const link = readLink('?run=r&units=a&units=a&units=%20&position=no-join&chart=M1')
    expect(link).toEqual({ server: null, run: 'r', units: ['a'], position: null, chart: null })
    expect(readLink('?run=r&chart=m1@2026-10-07T15:30:00Z')!.chart).toBeNull()
    expect(readLink('?run=r&chart=M1@not-a-time')!.chart).toBeNull()
    expect(readLink('?run=r&position=~pos_1')!.position).toBeNull()
  })

  it('takes the link out of an address and keeps anything else it carries', () => {
    expect(withoutLink('?server=default&run=r&units=a&position=a~b&chart=M1@2026-10-07T15:30:00Z')).toBe('')
    expect(withoutLink('?run=r&debug=1')).toBe('?debug=1')
  })
})
