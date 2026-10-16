import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MachineStatus from '@/components/MachineStatus.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { useMachineStore } from '@/stores/machine_store'
import type { MachineResources } from '@/types/api/machine_types'
import type { Figure } from '@/types/figure_types'
import captured from './fixtures/machine_resources.json'

const READING: MachineResources = captured

function mountWith(reading: MachineResources | null, failed = false) {
  const machine = useMachineStore()
  machine.reading = reading
  machine.failed = failed
  return mount(MachineStatus)
}

function cardOf(wrapper: ReturnType<typeof mountWith>): { title: string, details: Figure[] } {
  const card = wrapper.findComponent(HoverCard)
  return { title: card.props('title') as string, details: (card.props('details') ?? []) as Figure[] }
}

function detail(wrapper: ReturnType<typeof mountWith>, label: string): Figure | undefined {
  return cardOf(wrapper).details.find(row => row.label === label)
}

describe('MachineStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** Three digits wide whatever the figure, so a share going from 9 to 10 moves nothing beside it. */
  it('shows both shares in slots of one width', () => {
    const wrapper = mountWith(READING)
    const slots = wrapper.findAll('.machine-value').map(node => node.element.textContent ?? '')
    expect(slots).toHaveLength(2)
    for (const slot of slots) expect(slot).toHaveLength(3)
    expect(slots[0]!.trim()).toBe(String(Math.round(READING.cpu.used_pct!)))
    expect(wrapper.text()).toContain('CPU')
    expect(wrapper.text()).toContain('Memory')
  })

  /** Where everything is fine nothing is printed: the grade speaks only when it is not ok. */
  it('says nothing about the grade at ok', () => {
    const wrapper = mountWith({ ...READING, pressure_level: 'ok', pressure_reasons: [] })
    expect(wrapper.find('.machine-mark').exists()).toBe(false)
  })

  it.each([
    ['warn', 'warning', 'status-warning'],
    ['critical', 'error', 'status-error'],
    // a grade this version does not know is shown as itself, beside the warning mark
    ['strained', 'warning', 'status-warning'],
  ] as const)('names the grade %s with its mark and its word', (level, role, icon) => {
    const wrapper = mountWith({ ...READING, pressure_level: level, pressure_reasons: ['Memory is high.'] })
    const mark = wrapper.find(`.machine-mark[data-status="${level}"]`)
    expect(mark.classes()).toContain(role)
    expect(mark.text()).toContain(level)
    expect(mark.find(`[data-icon="${icon}"]`).exists()).toBe(true)
  })

  it('passes the reasons on as they come', () => {
    const wrapper = mountWith({ ...READING, pressure_level: 'warn', pressure_reasons: ['Memory is high.'] })
    expect(cardOf(wrapper).details.filter(row => row.label === 'Reason').map(row => row.value))
      .toEqual(['Memory is high.'])
  })

  /** Held, not dropped — and said to be old, with the time it was measured. */
  it('says since when, where the readings stopped arriving', () => {
    const wrapper = mountWith(READING, true)
    const mark = wrapper.find('.machine-mark')
    expect(mark.classes()).toContain('warning')
    expect(mark.text()).toContain('as of')
    expect(detail(wrapper, 'Note')?.tone).toBe('warning')
  })

  it('shows dashes before the first reading, and says so once a read has failed', () => {
    const waiting = mountWith(null)
    expect(waiting.findAll('.machine-value').map(node => node.element.textContent!.trim())).toEqual(['—', '—'])
    expect(waiting.find('.machine-mark').exists()).toBe(false)
    expect(cardOf(waiting).title).toBe('Asking the server how full the machine is')
    const failed = mountWith(null, true)
    expect(failed.find('.machine-mark').text()).toContain('no reading')
    expect(cardOf(failed).title).toBe('The machine could not be read')
  })

  /** The details are the answer's own: the limit, where it was read, the thresholds, the window. */
  it('carries the limit, where it was read, the thresholds and the window on its card', () => {
    const wrapper = mountWith(READING)
    expect(detail(wrapper, 'Limit read from')?.value).toBe(READING.memory.limit_source)
    expect(detail(wrapper, 'Thresholds')?.value).toContain('warn')
    expect(detail(wrapper, 'Thresholds')?.value).toContain('critical')
    expect(detail(wrapper, 'Memory pressure')?.value).toBe(READING.pressure_level)
    // a reading says it all in its rows: no heading above them
    expect(cardOf(wrapper).title).toBeUndefined()
    expect(detail(wrapper, 'Busy')?.value).toContain(' s')
  })

  /** The very first reading after a restart of the server has no window yet: both are null. */
  it('says there is no window yet, rather than a share of nothing', () => {
    const wrapper = mountWith({ ...READING, cpu: { ...READING.cpu, used_pct: null, window_s: null } })
    expect(detail(wrapper, 'Busy')?.value).toBe('no window yet')
    expect(wrapper.find('.machine-value').element.textContent!.trim()).toBe('—')
  })
})
