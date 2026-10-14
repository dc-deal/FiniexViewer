import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useFacetState } from '@/composables/use_facet_state'
import type { FacetState, FacetStateOptions } from '@/composables/use_facet_state'
import { useArrangementStore } from '@/stores/arrangement_store'

const DEFAULT = { purpose: ['regular', 'certificate'] }

function mountBar(options: FacetStateOptions = {}): FacetState {
  let api!: FacetState
  mount(defineComponent({
    setup() {
      api = useFacetState('run-picker', 'newest', options)
      return () => null
    },
  }))
  return api
}

/** What a reload finds: the stored arrangement, read again by a fresh store. */
function reload(): void {
  setActivePinia(createPinia())
}

function store(entry: object): void {
  localStorage.setItem('arrangement.v1', JSON.stringify({
    version: 1, links: {}, bars: { 'run-picker': entry }, chart: { timeframe: null },
  }))
}

describe('useFacetState', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('opens an untouched bar on its defaults', () => {
    const bar = mountBar({ defaultSelection: DEFAULT })
    expect(bar.selection.value).toEqual(DEFAULT)
    expect(bar.search.value).toBe('')
    expect(bar.sort.value).toBe('newest')
  })

  it('brings back what the reader left — narrowing, search and sort', async () => {
    const bar = mountBar({ defaultSelection: DEFAULT })
    bar.selection.value = { group: ['simulation'] }
    bar.search.value = 'tunnel'
    bar.sort.value = 'oldest'
    await flushPromises()

    reload()
    const again = mountBar({ defaultSelection: DEFAULT })
    expect(again.selection.value).toEqual({ group: ['simulation'] })
    expect(again.search.value).toBe('tunnel')
    expect(again.sort.value).toBe('oldest')
  })

  /** Cleared is a choice: a reload must not hand the default back to a reader who removed it. */
  it('keeps a cleared bar cleared after a reload', async () => {
    const bar = mountBar({ defaultSelection: DEFAULT })
    bar.selection.value = {}
    await flushPromises()

    reload()
    expect(mountBar({ defaultSelection: DEFAULT }).selection.value).toEqual({})
  })

  it('stores nothing for a bar nobody touched', async () => {
    mountBar({ defaultSelection: DEFAULT })
    await flushPromises()
    expect(useArrangementStore().bars).toEqual({})
  })

  it('drops a narrowing stored for another scope and keeps its sort', () => {
    store({ selection: { status: ['failed'] }, search: 'EUR', sort: 'pnl', scope: 'run_a' })
    const bar = mountBar({ scope: () => 'run_b' })
    expect(bar.selection.value).toEqual({})
    expect(bar.search.value).toBe('')
    expect(bar.sort.value).toBe('pnl')
  })

  it('restores a narrowing stored for the same scope', () => {
    store({ selection: { status: ['failed'] }, search: 'EUR', sort: 'pnl', scope: 'run_a' })
    const bar = mountBar({ scope: () => 'run_a' })
    expect(bar.selection.value).toEqual({ status: ['failed'] })
    expect(bar.search.value).toBe('EUR')
  })

  it('drops the narrowing when the scope moves under a mounted bar, and stores the new scope', async () => {
    const run = ref('run_a')
    const bar = mountBar({ scope: () => run.value })
    bar.selection.value = { status: ['failed'] }
    bar.search.value = 'EUR'
    bar.sort.value = 'pnl'
    await flushPromises()

    run.value = 'run_b'
    await flushPromises()
    expect(bar.selection.value).toEqual({})
    expect(bar.search.value).toBe('')
    expect(bar.sort.value).toBe('pnl')
    expect(useArrangementStore().bars['run-picker']).toMatchObject({ scope: 'run_b', search: '' })
  })
})
