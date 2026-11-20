/**
 * Which explanations of `hint_registry.ts` a panel offers behind its ⓘ (viewer#24): beside the tabs
 * while the panel is in front, and in the header of a section in its bundle. By the panel's kind id —
 * a member of a bundle by its member kind (`report-…`, `deployment-…`), so a section offers the same
 * as a panel of its own and in the bundle's column.
 *
 * What one control explains stands by that control instead, and why an area is empty in the area.
 */
const PANEL_HELP: Record<string, string[]> = {
  deployments: ['facet-bar'],
  deployment: ['bundle-places', 'open-as-panel', 'bundle-commands', 'dock-edges', 'panel-maximize'],
  'deployment-sessions': ['deployment-sessions'],
  sweeps: ['sweeps'],
  runs: ['facet-bar', 'run-families'],
  run: ['bundle-places', 'open-as-panel', 'bundle-commands', 'dock-edges', 'panel-maximize'],
  'report-scenario-roster': ['scenario-pick'],
  'report-trade-history': ['trade-slippage', 'position-link', 'symbol-filter'],
  'report-orders': ['symbol-filter', 'position-link'],
  'report-venue-account': ['venue-account'],
  'run-chart': ['quick-bar', 'chart-marks', 'chart-panes'],
  chart: ['quick-bar'],
  layers: ['layers', 'layer-workers'],
  activities: ['activities'],
}

/**
 * The explanations a panel of this kind offers, in the order its ⓘ shows them; none for another.
 *
 * @param kindId The panel's kind id, or null where no panel is in front.
 */
export function helpFor(kindId: string | null): string[] {
  return kindId ? PANEL_HELP[kindId] ?? [] : []
}

/** Every kind that offers explanations, for checking the list against the panels and the registry. */
export function helpedKinds(): string[] {
  return Object.keys(PANEL_HELP)
}
