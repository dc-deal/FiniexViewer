import { describe, it, expect } from 'vitest'
import {
  clampWindow, offeredPresets, openingPreset, presetIn, presetOf, presetWindow,
} from '@/components/runs/booking_period_window'

const at = (iso: string) => Date.parse(iso)
const DAY = 24 * 60 * 60 * 1000

/** A year of daily periods, as the year-long run in the archive books them: one lane, one span a day. */
const YEAR = { from: at('2021-01-01T00:00:00Z'), to: at('2021-12-31T23:59:59Z') }
const daily = Array.from({ length: 365 }, (_, day) => ({ from: YEAR.from + day * DAY, to: YEAR.from + (day + 1) * DAY - 1000 }))

describe('booking_period_window', () => {
  it('names the calendar stretch an instant falls in: its year, quarter, month and week from Monday', () => {
    const may = at('2021-05-15T13:00:00Z')
    expect(presetWindow('year', may)).toEqual({ from: at('2021-01-01T00:00:00Z'), to: at('2022-01-01T00:00:00Z') })
    expect(presetWindow('quarter', may)).toEqual({ from: at('2021-04-01T00:00:00Z'), to: at('2021-07-01T00:00:00Z') })
    expect(presetWindow('month', may)).toEqual({ from: at('2021-05-01T00:00:00Z'), to: at('2021-06-01T00:00:00Z') })
    // 2021-05-15 is a Saturday: its week runs from Monday the 10th
    expect(presetWindow('week', may)).toEqual({ from: at('2021-05-10T00:00:00Z'), to: at('2021-05-17T00:00:00Z') })
    // a Sunday still belongs to the week that began on the Monday before it
    expect(presetWindow('week', at('2021-05-16T23:00:00Z')).from).toBe(at('2021-05-10T00:00:00Z'))
  })

  it('cuts a preset at the edges of the scale, and it stays that preset', () => {
    const scale = { from: at('2021-01-01T00:00:00Z'), to: at('2021-12-31T12:00:00Z') }
    const fourth = presetIn('quarter', at('2021-11-02T00:00:00Z'), scale)
    expect(fourth).toEqual({ from: at('2021-10-01T00:00:00Z'), to: scale.to })
    expect(presetOf(fourth, scale)).toBe('quarter')
  })

  it('slides a window back inside the scale without changing its length, and gives the scale for one longer', () => {
    const scale = { from: 0, to: 100 }
    expect(clampWindow({ from: -10, to: 20 }, scale)).toEqual({ from: 0, to: 30 })
    expect(clampWindow({ from: 90, to: 120 }, scale)).toEqual({ from: 70, to: 100 })
    expect(clampWindow({ from: 40, to: 60 }, scale)).toEqual({ from: 40, to: 60 })
    expect(clampWindow({ from: -50, to: 150 }, scale)).toEqual(scale)
  })

  it('says which preset a window is, and none for a window dragged free', () => {
    const month = presetIn('month', at('2021-03-10T00:00:00Z'), YEAR)
    expect(presetOf(month, YEAR)).toBe('month')
    expect(presetOf({ from: month.from + DAY, to: month.to + DAY }, YEAR)).toBeNull()
  })

  /** From October to the year's end the cut year IS the cut quarter: only what is offered is named. */
  it('names the offered preset where a longer one cut at the edges would be the same stretch', () => {
    const autumn = { from: at('2025-10-13T00:00:00Z'), to: at('2026-10-12T00:00:00Z') }
    const fourth = presetIn('quarter', autumn.from, autumn)
    expect(presetIn('year', autumn.from, autumn)).toEqual(fourth)
    expect(presetOf(fourth, autumn)).toBe('quarter')
  })

  it('offers only the presets shorter than the scale: a frame as long as the whole draws it twice', () => {
    // 364.8 days, the year-long run's span: a year is no shorter, a quarter is
    expect(offeredPresets(YEAR)).toEqual(['quarter', 'month', 'week'])
    expect(offeredPresets({ from: 0, to: 10 * DAY })).toEqual(['week'])
    expect(offeredPresets({ from: 0, to: 5 * DAY })).toEqual([])
  })

  it('opens on the longest preset whose busiest lane draws its periods apart at this width', () => {
    // 90 days at 8 px is 720 px: a quarter fits a plot of 800 px, a month one of 400 px
    expect(openingPreset([daily], YEAR, 800, 8)).toBe('quarter')
    expect(openingPreset([daily], YEAR, 400, 8)).toBe('month')
    // where not even a week fits, the shortest offered
    expect(openingPreset([daily], YEAR, 20, 8)).toBe('week')
    expect(openingPreset([daily], { from: 0, to: 5 * DAY }, 800, 8)).toBeNull()
  })
})
