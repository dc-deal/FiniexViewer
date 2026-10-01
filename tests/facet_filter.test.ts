import { describe, it, expect } from 'vitest'
import {
  applyFacets, facetOptions, isNarrowed, sortRows, toggleValue,
} from '@/components/base/facet_filter'
import type { FacetDefinition, SortDefinition } from '@/types/facet_types'

interface Row {
  name: string
  symbol: string
  market: string
  tags: string[]
  size: number
}

const ROWS: Row[] = [
  { name: 'alpha', symbol: 'ETHUSD', market: 'crypto', tags: ['a'], size: 3 },
  { name: 'beta', symbol: 'ETHUSD', market: 'crypto', tags: ['a', 'b'], size: 1 },
  { name: 'gamma', symbol: 'EURUSD', market: 'forex', tags: ['b'], size: 2 },
  // states no market — the field is empty on every run recorded before the backend added it
  { name: 'delta', symbol: 'EURUSD', market: '', tags: [], size: 4 },
]

function stated(value: string): string[] {
  return value ? [value] : []
}

const FACETS: FacetDefinition<Row>[] = [
  { id: 'symbol', label: 'Symbol', valuesOf: row => stated(row.symbol) },
  { id: 'market', label: 'Market', valuesOf: row => stated(row.market) },
  { id: 'tags', label: 'Tags', valuesOf: row => row.tags },
]

const SORTS: SortDefinition<Row>[] = [
  { id: 'name', label: 'name', compare: (a, b) => a.name.localeCompare(b.name) },
  { id: 'size', label: 'size', compare: (a, b) => b.size - a.size },
]

function names(rows: Row[]): string[] {
  return rows.map(row => row.name)
}

function filter(selection: Record<string, string[]>, search = '') {
  return applyFacets({
    rows: ROWS,
    definitions: FACETS,
    selection,
    search,
    searchOf: row => row.name,
  })
}

describe('applyFacets', () => {
  it('keeps every row while nothing is picked', () => {
    expect(filter({})).toHaveLength(4)
  })

  it('narrows to the picked value', () => {
    expect(names(filter({ market: ['crypto'] }))).toEqual(['alpha', 'beta'])
  })

  // two values of one facet are a wider question, not a narrower one
  it('reads several values of one facet as OR', () => {
    expect(names(filter({ market: ['crypto', 'forex'] })))
      .toEqual(['alpha', 'beta', 'gamma'])
  })

  it('reads different facets as AND', () => {
    expect(names(filter({ market: ['crypto'], tags: ['b'] }))).toEqual(['beta'])
  })

  /**
   * The rule that keeps this honest: a row that states no value cannot answer a question about
   * that value. It is shown while the facet is open and dropped as soon as one is picked — never
   * bundled into a value it never claimed.
   */
  it('drops a row that states no value once that facet is picked', () => {
    expect(names(filter({}))).toContain('delta')
    expect(names(filter({ market: ['crypto', 'forex'] }))).not.toContain('delta')
  })

  it('searches the field the caller names, case-insensitively', () => {
    expect(names(filter({}, 'AMM'))).toEqual(['gamma'])
  })

  it('ignores surrounding space in the search', () => {
    expect(names(filter({}, '  beta  '))).toEqual(['beta'])
  })

  it('applies the search and the facets together', () => {
    expect(names(filter({ market: ['crypto'] }, 'a'))).toEqual(['alpha', 'beta'])
  })

  it('leaves the caller order alone — it only removes', () => {
    expect(names(filter({ symbol: ['EURUSD'] }))).toEqual(['gamma', 'delta'])
  })
})

describe('facetOptions', () => {
  function options(selection: Record<string, string[]>, facetId: string) {
    return facetOptions(
      { rows: ROWS, definitions: FACETS, selection, searchOf: row => row.name },
      facetId
    )
  }

  it('offers every stated value with the rows behind it', () => {
    expect(options({}, 'market')).toEqual([
      { value: 'crypto', count: 2, active: false },
      { value: 'forex', count: 1, active: false },
    ])
  })

  it('does not offer a value no row states', () => {
    expect(options({}, 'market').map(o => o.value)).not.toContain('')
  })

  /**
   * A facet counts against the OTHER facets and not against itself. Counting against its own
   * selection would read 0 on every unpicked value the moment one is picked, which is the
   * behaviour that makes a filter feel broken — a reader could never widen without clearing.
   */
  it('counts its own values as if nothing in it were picked', () => {
    const before = options({}, 'market')
    const after = options({ market: ['crypto'] }, 'market')
    expect(after.map(o => o.count)).toEqual(before.map(o => o.count))
    expect(after.find(o => o.value === 'crypto')?.active).toBe(true)
  })

  it('counts against what the other facets left', () => {
    expect(options({ symbol: ['EURUSD'] }, 'market'))
      .toEqual([{ value: 'forex', count: 1, active: false }])
  })

  // otherwise a value picked into a dead end could never be taken back off
  it('keeps a picked value listed even where nothing is left behind it', () => {
    const shown = options({ symbol: ['EURUSD'], market: ['crypto'] }, 'market')
    const crypto = shown.find(o => o.value === 'crypto')
    expect(crypto).toEqual({ value: 'crypto', count: 0, active: true })
  })

  it('counts a row once per value it holds', () => {
    expect(options({}, 'tags')).toEqual([
      { value: 'a', count: 2, active: false },
      { value: 'b', count: 2, active: false },
    ])
  })

  it('offers nothing for a facet the caller does not define', () => {
    expect(options({}, 'nonsense')).toEqual([])
  })
})

describe('toggleValue', () => {
  it('adds a value that was not picked', () => {
    expect(toggleValue({}, 'market', 'crypto')).toEqual({ market: ['crypto'] })
  })

  it('removes one that was', () => {
    expect(toggleValue({ market: ['crypto'] }, 'market', 'crypto')).toEqual({})
  })

  it('keeps the other values of the same facet', () => {
    expect(toggleValue({ market: ['crypto', 'forex'] }, 'market', 'crypto'))
      .toEqual({ market: ['forex'] })
  })

  it('never mutates what it was given', () => {
    const before = { market: ['crypto'] }
    toggleValue(before, 'market', 'forex')
    expect(before).toEqual({ market: ['crypto'] })
  })

  // an empty array left behind would read as "this facet is narrowing" everywhere else
  it('drops the facet entirely when its last value goes', () => {
    expect(toggleValue({ market: ['crypto'], tags: ['a'] }, 'market', 'crypto'))
      .toEqual({ tags: ['a'] })
  })
})

describe('isNarrowed', () => {
  it.each([
    ['nothing at all', {}, '', false],
    ['a picked value', { market: ['crypto'] }, '', true],
    ['a search term', {}, 'alpha', true],
    ['only whitespace', {}, '   ', false],
    ['an empty facet array', { market: [] }, '', false],
  ])('reads %s as %s', (_label, selection, search, expected) => {
    expect(isNarrowed(selection as Record<string, string[]>, search as string)).toBe(expected)
  })
})

describe('sortRows', () => {
  it('orders by the named sort', () => {
    expect(names(sortRows(ROWS, SORTS, 'size'))).toEqual(['delta', 'alpha', 'gamma', 'beta'])
  })

  it('returns the rows untouched for a sort it does not know', () => {
    expect(sortRows(ROWS, SORTS, 'nonsense')).toBe(ROWS)
  })

  it('does not reorder the array it was given', () => {
    sortRows(ROWS, SORTS, 'size')
    expect(names(ROWS)).toEqual(['alpha', 'beta', 'gamma', 'delta'])
  })
})
