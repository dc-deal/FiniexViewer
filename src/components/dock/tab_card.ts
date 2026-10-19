import { allPanelKinds, panelKind } from '@/panel_kinds'
import type { LinkKey } from '@/types/context_types'
import type { Figure, FigureCard } from '@/types/figure_types'
import type { PanelKind, PanelRelations } from '@/types/panel_types'
import { listed, t } from '@/translate'

/**
 * What a tab's card says about its panel: what it shows, the bundle it belongs to, what it follows
 * and what it chooses, and its status. One builder from the kind's declared relations (viewer#42),
 * so no two tabs word a link differently and no kind can say a link it does not declare.
 */

/**
 * The link's keys in the link's own order, so two cards list the same keys alike. A record rather
 * than a list: a key added to `LinkKey` is a type error here until it has a place, where a list
 * left it off every card in silence.
 */
const LINK_RANK: Record<LinkKey, number> = { run: 0, units: 1, position: 2, deployment: 3, market: 4 }

/** What a panel follows, named as the thing it follows. */
const FOLLOWED: Record<LinkKey, string> = {
  run: t('the chosen run'),
  units: t('the scenario in focus'),
  position: t('the chosen position'),
  deployment: t('the chosen deployment'),
  // not "the market": on screen *Market* is a scenario's market type, and their glossary's
  // `market` is an order type; the chart's own selects say Broker and Symbol
  market: t('the broker and symbol'),
}

/** What a panel chooses — the screen already says *chosen* and *Choose*, so the verb is choose. */
const CHOSEN: Record<LinkKey, string> = {
  run: t('the run'),
  units: t('the scenario in focus'),
  position: t('the position'),
  deployment: t('the deployment'),
  market: t('the broker and symbol'),
}

function ordered(keys: LinkKey[]): LinkKey[] {
  return [...new Set(keys)].sort((a, b) => LINK_RANK[a] - LINK_RANK[b])
}

/**
 * A kind's relations together with those of the members standing in its column: what a bundle
 * follows and chooses is what its members do while they stand in it. A member open as a panel of
 * its own, hidden, or absent for the run takes its links with it.
 */
function relationsWith(kind: PanelKind, members: PanelKind[]): PanelRelations {
  return {
    memberOf: kind.relations.memberOf,
    follows: ordered([...kind.relations.follows, ...members.flatMap(member => member.relations.follows)]),
    chooses: ordered([...kind.relations.chooses, ...members.flatMap(member => member.relations.chooses)]),
  }
}

/**
 * The keys worth saying a panel follows: those another kind can choose. A key nobody else chooses is
 * the panel's own pick — the free chart's broker and symbol, a deployment chosen in its own list —
 * and *Follows* would send the reader looking for a panel that sets it.
 */
function followedFromElsewhere(kind: PanelKind, keys: LinkKey[]): LinkKey[] {
  const kinds = allPanelKinds()
  return keys.filter(key => kinds.some(other => other.id !== kind.id && other.relations.chooses.includes(key)))
}

/**
 * The card of a tab. Its heading is the title and what the tab adds to it; a member of a bundle adds
 * the bundle's — the whole run id of the run its bundle shows, which its own tab has no room for.
 *
 * @param kind The panel's kind, or null for a stored panel this version does not know.
 * @param fallbackTitle The title such an unknown panel goes by.
 * @param members The members standing in this kind's column, for a bundle; empty otherwise.
 */
export function tabCard(kind: PanelKind | null, fallbackTitle: string, members: PanelKind[] = []): FigureCard {
  if (!kind) return { title: fallbackTitle, details: [] }
  const bundle = kind.relations.memberOf ? panelKind(kind.relations.memberOf) : null
  const subtitle = kind.subtitle?.() ?? bundle?.subtitle?.() ?? null
  const relations = relationsWith(kind, members)
  const follows = [
    ...followedFromElsewhere(kind, relations.follows).map(key => FOLLOWED[key]),
    ...(kind.relations.chartInFront ? [t('the chart last in front')] : []),
  ]
  const status = kind.status?.() ?? null
  const details: Figure[] = [
    { label: t('Shows'), value: kind.description },
    ...(bundle ? [{ label: t('Part of'), value: bundle.title }] : []),
    ...(follows.length ? [{ label: t('Follows'), value: listed(follows) }] : []),
    ...(relations.chooses.length
      ? [{ label: t('Chooses'), value: listed(relations.chooses.map(key => CHOSEN[key])) }]
      : []),
    ...(status ? [{ label: t('Status'), value: status.word, tone: status.role }] : []),
  ]
  return { title: subtitle ? `${kind.title} · ${subtitle}` : kind.title, details }
}
