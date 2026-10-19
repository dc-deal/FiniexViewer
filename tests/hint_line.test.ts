import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import HintLine from '@/components/base/HintLine.vue'
import { useHintsStore } from '@/stores/hints_store'
import { hintById } from '@/hint_registry'

/**
 * The hints of one place stand in ONE box with one pair of dismissals: three boxes stacked over the
 * bundle took nine lines and six clicks to clear. Each hint keeps its own id in the store, so one
 * banned on its own stays away here too, and a hint added to the place later shows by itself.
 */
describe('HintLine', () => {
  const BUNDLE = ['open-as-panel', 'bundle-commands', 'dock-edges']

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('shows one hint by its id, with its text from the registry', () => {
    const wrapper = mount(HintLine, { props: { id: 'bundle-commands' } })
    expect(wrapper.find('.hint-line').text()).toContain(hintById('bundle-commands')!.text)
  })

  it('shows the hints of one place in one box, each on a line of its own', () => {
    const wrapper = mount(HintLine, { props: { id: BUNDLE } })
    expect(wrapper.findAll('.hint-line')).toHaveLength(1)
    expect(wrapper.findAll('.hint-part').map(part => part.text())).toEqual(BUNDLE.map(id => hintById(id)!.text))
  })

  it('dismisses every hint of the box at once, for this visit', async () => {
    const wrapper = mount(HintLine, { props: { id: BUNDLE } })
    await wrapper.find('[aria-label="Dismiss these hints"]').trigger('click')
    expect(wrapper.find('.hint-line').exists()).toBe(false)
    const hints = useHintsStore()
    expect(BUNDLE.every(id => hints.dismissed.includes(id))).toBe(true)
    expect(hints.banned).toEqual([])
  })

  it('bans every hint of the box at once', async () => {
    const wrapper = mount(HintLine, { props: { id: BUNDLE } })
    await wrapper.findAll('.app-button').find(button => button.text() === 'Never again')!.trigger('click')
    expect(wrapper.find('.hint-line').exists()).toBe(false)
    expect([...useHintsStore().banned].sort()).toEqual([...BUNDLE].sort())
  })

  it('leaves out a hint banned on its own and keeps the rest in the box', () => {
    useHintsStore().ban('dock-edges')
    const wrapper = mount(HintLine, { props: { id: BUNDLE } })
    expect(wrapper.findAll('.hint-part')).toHaveLength(2)
    expect(wrapper.text()).not.toContain(hintById('dock-edges')!.text)
  })

  it('renders nothing for ids the registry does not know', () => {
    const wrapper = mount(HintLine, { props: { id: ['no-such-hint'] } })
    expect(wrapper.find('.hint-line').exists()).toBe(false)
  })
})
