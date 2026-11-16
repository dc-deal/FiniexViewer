import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ref } from 'vue'
import { useSymbolFacet } from '@/composables/use_symbol_facet'

/**
 * The symbol filter of a report table: offered only where the rows trade two symbols or more, the
 * rows kept in the order served, the units it took rows of named — their served totals are then the
 * whole unit's — and a narrowing kept for its run alone.
 */
interface Row {
  scenario_name: string
  symbol: string
  id: number
}

const ROWS: Row[] = [
  { scenario_name: 'a', symbol: 'EURUSD', id: 1 },
  { scenario_name: 'a', symbol: 'GBPUSD', id: 2 },
  { scenario_name: 'b', symbol: 'EURUSD', id: 3 },
]

describe('useSymbolFacet', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('is offered where the rows trade two symbols or more, and only then', () => {
    expect(useSymbolFacet('two', () => ROWS, () => 'run').offered.value).toBe(true)
    expect(useSymbolFacet('one', () => ROWS.filter(row => row.symbol === 'EURUSD'), () => 'run').offered.value).toBe(false)
  })

  it('keeps the rows of the symbols picked in the order served, and names the units it took rows of', () => {
    const facet = useSymbolFacet('table', () => ROWS, () => 'run')
    expect(facet.kept.value.map(row => row.id)).toEqual([1, 2, 3])
    expect([...facet.cut.value]).toEqual([])
    facet.selection.value = { symbol: ['EURUSD'] }
    expect(facet.kept.value.map(row => row.id)).toEqual([1, 3])
    // unit a lost its GBPUSD row: its total is the whole unit's; unit b kept all of its own
    expect([...facet.cut.value]).toEqual(['a'])
    expect(facet.narrowing.value).toBe(true)
  })

  /** A narrowing standing over rows that now trade one symbol: the bar stays, so it can be cleared. */
  it('stays offered while a narrowing stands', () => {
    const rows = ref(ROWS)
    const facet = useSymbolFacet('table', () => rows.value, () => 'run')
    facet.selection.value = { symbol: ['EURUSD'] }
    rows.value = ROWS.filter(row => row.symbol === 'EURUSD')
    expect(facet.offered.value).toBe(true)
  })

  it('keeps a narrowing for its run, and drops one made for another', async () => {
    useSymbolFacet('table', () => ROWS, () => 'run_1').selection.value = { symbol: ['GBPUSD'] }
    await flushPromises()
    expect(useSymbolFacet('table', () => ROWS, () => 'run_1').kept.value.map(row => row.id)).toEqual([2])
    expect(useSymbolFacet('table', () => ROWS, () => 'run_2').kept.value.map(row => row.id)).toEqual([1, 2, 3])
  })
})
