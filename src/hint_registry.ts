import type { HintDefinition } from '@/types/hint_types'
import { t } from '@/translate'

/**
 * Every hint the app can show, in ONE list.
 *
 * Central rather than a string inside each component, for two reasons. The texts are the only
 * place the app explains itself, and they are worth reading as a set — an explanation that
 * contradicts another is invisible while they sit in eight files. And a guided tour is the same
 * data in a sequence: a step is an element plus a sentence, which is exactly a row here.
 *
 * An id is stable across releases, because it is what a permanent dismissal is remembered by.
 * Renaming one silently un-bans it.
 */
const HINTS: HintDefinition[] = [
  {
    id: 'scenario-pick',
    text: t('Click a scenario to focus on it: the lists show only its trades and booking periods, and the run chart shows it. Click it again to show the whole run.'),
  },
  {
    id: 'quick-bar',
    text: t('The bar beside the tabs holds what the panel in front shows — for the chart, its broker, symbol and timeframe.'),
  },
  {
    id: 'open-as-panel',
    text: t('Hover the header of a section for the button that opens it as a panel of its own, beside the bundle. On the tab of that panel, ⇲ puts it back into the bundle and ✕ hides it — the Panels menu lists every section and shows a hidden one again.'),
  },
  {
    id: 'bundle-commands',
    text: t('⋯ on the tab of the bundle folds every section at once, or resets the bundle — its sections back in their first order, none of them hidden.'),
  },
  {
    id: 'dock-edges',
    text: t('Drag a tab to the outermost edge of the panels to dock it along that whole edge — a column over the full height, a row over the full width.'),
  },
  {
    id: 'facet-bar',
    text: t('⌕ opens the search. Where the panel is narrow, the filters that do not fit wait behind +N, each with its values and counts.'),
  },
  {
    id: 'position-link',
    text: t('A position id with an arrow goes to the other list — from an order to the trades it produced, and back; the chart mark beside it opens the run chart on that position. A partial close books several trades of one position, so all of them are marked.'),
  },
]

/** The hint with this id, or null where none is registered — an unknown id renders nothing. */
export function hintById(id: string): HintDefinition | null {
  return HINTS.find(hint => hint.id === id) ?? null
}

/** Every registered id, for reconciling a stored ban list against what still exists. */
export function hintIds(): string[] {
  return HINTS.map(hint => hint.id)
}
