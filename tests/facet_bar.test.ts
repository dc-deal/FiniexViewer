import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import FacetBar from '@/components/base/FacetBar.vue'
import type { FacetDefinition, FacetSelection, SortDefinition } from '@/types/facet_types'
import { stubOverflowWidths } from './overflow_harness'
import { sortBy } from './facet_harness'

interface Row {
  id: string
  colour: string
  size: string
  shape: string
}

const ROWS: Row[] = [
  { id: 'a', colour: 'red', size: 'S', shape: 'round' },
  { id: 'b', colour: 'blue', size: 'L', shape: 'square' },
  { id: 'c', colour: 'red', size: 'L', shape: 'round' },
]

/** mount() reads a generic component's row type as unknown, so the definitions read each row back. */
const asRow = (row: unknown): Row => row as Row

const FACETS: FacetDefinition<unknown>[] = [
  { id: 'colour', label: 'Colour', valuesOf: row => [asRow(row).colour] },
  { id: 'size', label: 'Size', valuesOf: row => [asRow(row).size] },
  { id: 'shape', label: 'Shape', valuesOf: row => [asRow(row).shape] },
]

const SORTS: SortDefinition<unknown>[] = [
  { id: 'id', label: 'id', compare: (a, b) => asRow(a).id.localeCompare(asRow(b).id) },
  { id: 'longest-name', label: 'longest name', compare: (a, b) => asRow(b).id.length - asRow(a).id.length },
]

let mounted: VueWrapper | null = null

interface BarProps {
  facets?: FacetDefinition<unknown>[]
  selection?: FacetSelection
  search?: string
}

function mountBar(props: BarProps = {}): VueWrapper {
  mounted = mount(FacetBar, {
    props: {
      rows: ROWS,
      facets: FACETS,
      sorts: SORTS,
      selection: {},
      sort: 'id',
      search: '',
      searchOf: (row: unknown) => asRow(row).id,
      ...props,
    },
    attachTo: document.body,
  })
  return mounted
}

describe('FacetBar', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = null
    vi.restoreAllMocks()
  })

  /** Folded, the search costs one button's width; asked for, it opens where the button was. */
  it('folds the search into a button and opens it in place, ready to type', async () => {
    const wrapper = mountBar()
    expect(wrapper.find('.facet-search').exists()).toBe(false)

    await wrapper.find('.facet-search-toggle').trigger('click')
    await flushPromises()

    const field = wrapper.find('.facet-search')
    expect(field.exists()).toBe(true)
    expect(document.activeElement).toBe(field.element)
    expect(wrapper.find('.facet-search-toggle').exists()).toBe(false)
  })

  /** A term narrows the list, so a bar holding one never folds it out of sight. */
  it('keeps the search open while it holds a term, and folds an empty one when left', async () => {
    const holding = mountBar({ search: 'a' })
    await holding.find('.facet-search').trigger('blur')
    expect(holding.find('.facet-search').exists()).toBe(true)
    holding.unmount()

    const empty = mountBar()
    await empty.find('.facet-search-toggle').trigger('click')
    await empty.find('.facet-search').trigger('blur')
    expect(empty.find('.facet-search').exists()).toBe(false)
    expect(empty.find('.facet-search-toggle').exists()).toBe(true)
  })

  it('drops the term and folds the search on Escape', async () => {
    const wrapper = mountBar({ search: 'a' })
    await wrapper.find('.facet-search').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:search')?.at(-1)).toEqual([''])

    await wrapper.setProps({ search: '' })
    expect(wrapper.find('.facet-search').exists()).toBe(false)
  })

  /** In a narrow panel a facet waits behind `+N` — as the same facet, with its values and counts. */
  it('puts a facet that does not fit behind +N, with its values, its counts and its picks', async () => {
    // the control 40, then 100 a chip: 140, 240, 340 > 250 — the third facet waits
    stubOverflowWidths(250, 100, 40)
    const wrapper = mountBar({ selection: { shape: ['round'] } })
    await flushPromises()
    const gone = wrapper.findAll('.overflow-cell.overflow-gone')
    expect(gone).toHaveLength(1)
    expect(gone[0]!.text()).toContain('Shape')
    // the pick it holds is said on the control it went behind
    expect(wrapper.find('.overflow-more .overflow-badge').text()).toBe('1')
    expect(wrapper.find('.overflow-more').classes()).toContain('active')

    await wrapper.find('.overflow-more').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const facet = document.querySelector<HTMLElement>('.facet-menu-facet[data-facet="shape"]')!
    // its badge: one value picked, said where the facet now stands
    expect(facet.querySelector('.facet-badge')!.textContent).toBe('1')

    facet.focus()
    facet.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()
    const options = [...document.querySelectorAll<HTMLElement>('.facet-menu-option')]
    expect(options.map(node => [
      node.querySelector('.menu-label')!.textContent,
      node.querySelector('.facet-menu-count')!.textContent,
      node.dataset['state'],
    ])).toEqual([['round', '2', 'checked'], ['square', '1', 'unchecked']])

    options[1]!.click()
    await flushPromises()
    expect(wrapper.emitted('update:selection')?.at(-1)).toEqual([{ shape: ['round', 'square'] }])
    // a pick keeps the menu open, so several values can be picked in one visit
    expect(document.querySelector('.facet-menu-option')).not.toBeNull()
  })

  /** Behind `+N` a facet that cannot narrow is what its chip would be: there, and disabled. */
  it('offers a facet that cannot narrow behind +N as disabled', async () => {
    stubOverflowWidths(150, 100, 40)
    const wrapper = mountBar({
      facets: [FACETS[0]!, { id: 'kind', label: 'Kind', valuesOf: () => ['same'] }],
    })
    await flushPromises()
    await wrapper.find('.overflow-more').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const dead = document.querySelector<HTMLElement>('.facet-menu-facet[data-facet="kind"]')!
    expect(dead.hasAttribute('data-disabled')).toBe(true)
  })

  /**
   * Nothing a use changes may move the bar: what the facets are measured against keeps the room of
   * its widest state — `clear` while there is nothing to clear, the count at its most digits, the
   * sort at its longest name.
   */
  it('keeps the room of clear, of the widest count and of the longest sort name', async () => {
    const wrapper = mountBar()
    expect(wrapper.find('.facet-clear').classes()).toContain('facet-idle')
    expect(wrapper.find('.facet-clear').attributes('inert')).toBeDefined()
    // `3 of 3`, and `longest name`
    expect(wrapper.find('.facet-count-label').attributes('style')).toContain('min-width: 6ch')
    expect(wrapper.find('.facet-sort-value').attributes('style')).toContain('min-width: 12ch')

    await wrapper.setProps({ selection: { colour: ['red'] } })
    expect(wrapper.find('.facet-clear').classes()).not.toContain('facet-idle')
    expect(wrapper.find('.facet-clear').attributes('inert')).toBeUndefined()
  })

  it('names the sort in force and changes it from its menu', async () => {
    const wrapper = mountBar()
    expect(wrapper.find('.facet-sort-trigger').text()).toContain('Sort: id')

    await sortBy(wrapper, 'longest name')
    expect(wrapper.emitted('update:sort')?.at(-1)).toEqual(['longest-name'])
  })
})
