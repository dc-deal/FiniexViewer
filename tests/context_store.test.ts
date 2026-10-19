import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { MAIN_LINK, emptyLink, useContextStore } from '@/stores/context_store'

const MARK = { scenario: 'EURGBP_partial_close', position: 'pos_eurgbp_1' }

describe('useContextStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with the main link, empty', () => {
    expect(useContextStore().links).toEqual({ [MAIN_LINK]: emptyLink() })
  })

  /**
   * A position id is a counter per unit, so a mark carried into the next run marks a DIFFERENT
   * position under the same name — and a narrowing made for one roster means nothing in another.
   */
  it('takes the narrowing and the mark with it when a new run is chosen', () => {
    const store = useContextStore()
    store.selectRun('20261012_074826_88026ae2')
    store.setUnits(['EURGBP_partial_close'])
    store.mark(MARK)

    store.selectRun('20261012_074850_f1c9c04c')
    expect(store.main.run).toEqual({ id: '20261012_074850_f1c9c04c', units: [], position: null })
  })

  it('narrows without touching the mark, and without duplicates', () => {
    const store = useContextStore()
    store.selectRun('20261012_074826_88026ae2')
    store.mark(MARK)

    store.setUnits(['EURGBP_refusals_01', 'EURGBP_refusals_01'])
    expect(store.main.run.units).toEqual(['EURGBP_refusals_01'])
    expect(store.main.run.position).toEqual(MARK)
  })

  /** ONE scenario in focus (operator, 2026-10-16): a click moves it, a second on the same clears it. */
  it('puts one scenario in focus, moves it with the next click, and clears it on the same one', () => {
    const store = useContextStore()
    store.toggleUnit('EURGBP_refusals_01')
    store.toggleUnit('EURGBP_partial_close')
    expect(store.main.run.units).toEqual(['EURGBP_partial_close'])

    store.toggleUnit('EURGBP_partial_close')
    expect(store.main.run.units).toEqual([])

    store.toggleUnit('EURGBP_refusals_01')
    store.clearUnits()
    expect(store.main.run.units).toEqual([])
  })

  it('clears the symbol of the last broker when the broker changes', () => {
    const store = useContextStore()
    store.setBroker('mt5')
    store.setSymbol('EURUSD')
    store.setBroker('kraken_spot')
    expect(store.main.market).toEqual({ broker: 'kraken_spot', symbol: null })
  })

  /** A sweep is a family of runs, chosen apart from any one of them: choosing it leaves the run as it was. */
  it('chooses a sweep without touching the run', () => {
    const store = useContextStore()
    store.selectRun('20261012_210101_fcb871d7')
    store.selectSweep('sweep_20261012_210055')
    expect(store.main.sweep).toEqual({ id: 'sweep_20261012_210055' })
    expect(store.main.run.id).toBe('20261012_210101_fcb871d7')
  })

  /** A reload is not a new run: what was stored comes back as it was, mark and narrowing included. */
  it('restores stored links without cascading, and always keeps the main link', () => {
    const store = useContextStore()
    const stored = emptyLink()
    stored.run = { id: '20261012_074826_88026ae2', units: ['EURGBP_partial_close'], position: MARK }
    store.restore({ [MAIN_LINK]: stored })
    expect(store.main.run).toEqual(stored.run)

    store.restore({ B: emptyLink() })
    expect(store.links[MAIN_LINK]).toEqual(emptyLink())
    expect(store.links['B']).toEqual(emptyLink())
  })
})
