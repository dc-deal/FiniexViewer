import { flushPromises, type VueWrapper } from '@vue/test-utils'

/** Types into a facet bar's search, opening it first: it stands folded into ⌕ until asked for. */
export async function searchFor(wrapper: VueWrapper, text: string): Promise<void> {
  const toggle = wrapper.find('.facet-search-toggle')
  if (toggle.exists()) await toggle.trigger('click')
  await wrapper.find('.facet-search').setValue(text)
  await flushPromises()
}

/**
 * Chooses a sort from the bar's menu the way a keyboard does: the trigger opens it, the entry is
 * picked. The menu is portalled, so its entries are read off the document.
 */
export async function sortBy(wrapper: VueWrapper, label: string): Promise<void> {
  await wrapper.find('.facet-sort-trigger').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  const entry = [...document.querySelectorAll<HTMLElement>('.facet-sort')]
    .find(node => node.textContent?.includes(label))
  if (!entry) throw new Error(`the sort menu offers no '${label}'`)
  entry.click()
  await flushPromises()
}
