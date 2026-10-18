import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { tabCard } from '@/components/dock/tab_card'
import { RUN_BUNDLE, panelKind, reportKindId } from '@/panel_kinds'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'
import type { FigureCard } from '@/types/figure_types'
import type { PanelKind } from '@/types/panel_types'

/** The card of a kind as its tab would build it, with the members standing in its column. */
function cardOf(kindId: string, members: string[] = []): FigureCard {
  const memberKinds = members.map(id => panelKind(reportKindId(id))).filter((kind): kind is PanelKind => kind !== null)
  return tabCard(panelKind(kindId), 'stored title', memberKinds)
}

function row(card: FigureCard, label: string): string | undefined {
  return card.details.find(entry => entry.label === label)?.value
}

describe('tabCard', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('says what a section follows and chooses, and the bundle it is part of', () => {
    const card = cardOf(reportKindId('trade-history'))
    expect(row(card, 'Part of')).toBe('Run bundle')
    expect(row(card, 'Follows')).toBe('the chosen run and the scenario in focus')
    expect(row(card, 'Chooses')).toBe('the position')
  })

  /** A section's tab has no room for the run; its card's heading names the whole of it. */
  it('heads the card of a section with the run its bundle shows', () => {
    useRunsStore().runs = [{ run_id: '20261012_205715_c3b41fff' } as RunInfo]
    useContextStore().selectRun('20261012_205715_c3b41fff')
    expect(cardOf(reportKindId('broker')).title).toBe('Broker · 20261012_205715_c3b41fff')
    expect(cardOf(RUN_BUNDLE).title).toBe('Run bundle · 20261012_205715_c3b41fff')
  })

  /** A list does not follow the pick it shows: the run list only chooses the run. */
  it('says nothing about following where a panel only chooses', () => {
    const card = cardOf('runs')
    expect(row(card, 'Follows')).toBeUndefined()
    expect(row(card, 'Chooses')).toBe('the run')
  })

  /**
   * A key nobody else chooses is the panel's own pick: the free chart's broker and symbol, the
   * deployment chosen in its own list. *Follows* would send the reader looking for a panel that sets it.
   */
  it('names as followed only what another panel can choose', () => {
    expect(row(cardOf('chart'), 'Follows')).toBeUndefined()
    expect(row(cardOf('chart'), 'Chooses')).toBe('the broker and symbol')
    expect(row(cardOf('deployments'), 'Follows')).toBeUndefined()
    // in the link's order, the run before the deployment, whatever the kind declared first
    expect(row(cardOf('deployments'), 'Chooses')).toBe('the run and the deployment')
  })

  /** What a bundle follows and chooses is what its members do while they stand in it. */
  it('says for the bundle what the members standing in its column follow and choose', () => {
    const alone = cardOf(RUN_BUNDLE)
    expect(row(alone, 'Follows')).toBe('the chosen run')
    expect(row(alone, 'Chooses')).toBeUndefined()

    const full = cardOf(RUN_BUNDLE, ['scenario-roster', 'trade-history', 'executive'])
    expect(row(full, 'Follows')).toBe('the chosen run and the scenario in focus')
    expect(row(full, 'Chooses')).toBe('the scenario in focus and the position')
  })

  it('lists the keys in the order of the link, whatever order they were declared in', () => {
    expect(row(cardOf('run-chart'), 'Follows')).toBe('the chosen run, the scenario in focus and the chosen position')
  })

  it('carries no part-of line for a panel that is no member', () => {
    expect(row(cardOf('run-chart'), 'Part of')).toBeUndefined()
  })

  it('goes by the stored title, with nothing to say, for a kind this version does not know', () => {
    expect(cardOf('a-retired-kind')).toEqual({ title: 'stored title', details: [] })
  })
})
