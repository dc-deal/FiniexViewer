import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import HelpInfo from '@/components/base/HelpInfo.vue'
import EmptyNote from '@/components/base/EmptyNote.vue'
import AccordionPanel from '@/components/panels/AccordionPanel.vue'
import QuickBar from '@/components/dock/QuickBar.vue'
import { firstSentence, hintById, hintIds } from '@/hint_registry'
import { helpedKinds, helpFor } from '@/panel_help'
import { panelKind } from '@/panel_kinds'

/**
 * The three forms an explanation takes (viewer#24; operator, 2026-11-19): a help card on an ⓘ, the
 * whole text at a click, and the fixed sentence of an empty area — nothing in the layout to put away.
 */
describe('explanations', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('names every explanation, under an id of its own', () => {
    const ids = hintIds()
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter(id => !hintById(id)!.name.trim())).toEqual([])
  })

  it('takes the first sentence of a text for the help card, and a text without a stop whole', () => {
    expect(firstSentence('Front layer first: drag a layer. The lever shows it.')).toBe('Front layer first: drag a layer.')
    expect(firstSentence('↑↓ a position opened · ● a trade closed')).toBe('↑↓ a position opened · ● a trade closed')
  })

  it('draws an ⓘ named for what it explains, and nothing for an id it does not know', () => {
    const wrapper = mount(HelpInfo, { props: { id: ['layers', 'layer-workers'] } })
    const mark = wrapper.find('[data-help]')
    expect(mark.find('[data-icon="action-info"]').exists()).toBe(true)
    expect(mark.attributes('aria-label')).toBe(`About: ${hintById('layers')!.name}`)
    expect(mark.attributes('data-help-ids')).toBe('layers layer-workers')
    expect(mount(HelpInfo, { props: { id: 'no-such-hint' } }).find('[data-help]').exists()).toBe(false)
  })

  it('opens the whole text of every explanation of the place at a click', async () => {
    const wrapper = mount(HelpInfo, { props: { id: ['layers', 'layer-workers'] }, attachTo: document.body })
    await wrapper.find('[data-help]').trigger('click')
    await flushPromises()
    const entries = [...document.querySelectorAll<HTMLElement>('[data-help-popover] [data-help-entry]')]
    expect(entries.map(entry => entry.dataset['helpEntry'])).toEqual(['layers', 'layer-workers'])
    expect(entries[0]!.textContent).toContain(hintById('layers')!.text)
    wrapper.unmount()
  })

  it('says why an area is empty in fixed sentences, one for each reason', () => {
    const wrapper = mount(EmptyNote, { props: { id: ['layer-empty-trades', 'no-such-hint', 'layer-empty-levels'] } })
    expect(wrapper.findAll('.empty-note').map(note => note.attributes('data-empty-note')))
      .toEqual(['layer-empty-trades', 'layer-empty-levels'])
    expect(wrapper.text()).toContain(hintById('layer-empty-trades')!.text)
  })

  it('offers only registered explanations, and only for panels that exist', () => {
    const unknown = helpedKinds().flatMap(kind => helpFor(kind).filter(id => !hintById(id)))
    expect(unknown).toEqual([])
    expect(helpedKinds().filter(kind => panelKind(kind) === null)).toEqual([])
    expect(helpFor('run')).toEqual(expect.arrayContaining(['open-as-panel', 'bundle-commands']))
    expect(helpFor(null)).toEqual([])
  })

  it('puts the ⓘ of the panel in front beside the tabs, and nothing for a panel without one', () => {
    expect(mount(QuickBar, { props: { kindId: 'activities' } }).find('[data-help]').attributes('data-help-ids')).toBe('activities')
    expect(mount(QuickBar, { props: { kindId: 'deployment-periods' } }).find('.quick-bar').exists()).toBe(false)
  })

  it('stands the ⓘ of a section in its header, always in view', () => {
    const header = mount(AccordionPanel, {
      props: { title: 'Trade History', icon: 'kind-trade-history', open: false, pinned: false, locked: false, help: helpFor('report-trade-history') },
    }).find('.panel-header')
    expect(header.find('[data-help]').attributes('data-help-ids')).toBe('trade-slippage position-link symbol-filter')
    expect(header.find('.panel-controls [data-help]').exists()).toBe(false)
  })
})
