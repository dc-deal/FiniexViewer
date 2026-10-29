import { deploymentSections } from '@/deployment_sections'
import { allPanels } from '@/panel_registry'
import { BUNDLE_IDS } from '@/types/panel_types'
import type { BundleId, PanelDescriptor } from '@/types/panel_types'

/**
 * The members of every bundle, and the one id scheme their panels take (viewer#43). Its own module,
 * so the panel kinds and the layout store both read it and neither imports the other.
 *
 * A member's kind id is its bundle's prefix and its own id: `report-` for the run report — the
 * prefix it always had, so a stored arrangement keeps its sections open where they stood — and
 * `deployment-` for a deployment's.
 */
const PREFIX: Record<BundleId, string> = {
  run: 'report-',
  deployment: 'deployment-',
}

const MEMBERS: Record<BundleId, () => PanelDescriptor[]> = {
  run: allPanels,
  deployment: deploymentSections,
}

/** A bundle's members, in their own order — what its column holds before a reader arranges it. */
export function bundleMembers(bundle: BundleId): PanelDescriptor[] {
  return MEMBERS[bundle]()
}

/** A member's kind id — one scheme, so the column, the Panels menu and the dock agree on it. */
export function memberKindId(bundle: BundleId, memberId: string): string {
  return `${PREFIX[bundle]}${memberId}`
}

/** The bundle and the member a kind shows, or null for a kind that is no member of a bundle. */
export function memberOfKind(kindId: string): { bundle: BundleId, member: string } | null {
  for (const bundle of BUNDLE_IDS) {
    if (kindId.startsWith(PREFIX[bundle])) return { bundle, member: kindId.slice(PREFIX[bundle].length) }
  }
  return null
}
